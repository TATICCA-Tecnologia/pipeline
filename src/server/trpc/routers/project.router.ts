import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import { resolvePersonIds, resolvePersonIdsByName } from "./person.router";
import {
  findOrCreateProjectArea,
  findOrCreateProjectTheme,
  findOrCreateMainTool,
  findOrCreateProjectKind,
} from "./project-import-xml-helpers";
import type { FrontendProjectStatus } from "../mappers";
import { PROCESS_FREQUENCY_MULTIPLIERS } from "@/shared/constants/project-taxonomy";
import {
  computeQualitativeScore,
  computeComplexityScore,
  computeEconomiaScore,
  computeCombinedScore,
  type QualitativeWeights,
  type CombinedScoreWeights,
} from "@/shared/lib/scoring";
import { computeAnnualSavingBRL } from "@/shared/lib/savings";

// Fallback dos pesos default do SystemSettings (schema.prisma), usado apenas se
// a linha "default" ainda não existir por algum motivo (nunca deveria acontecer
// em produção, já que settings.router.ts faz upsert, mas evitamos depender disso).
const DEFAULT_QUALITATIVE_WEIGHTS: QualitativeWeights = {
  qualWeightErrorReduction: 0.24,
  qualWeightProcessCriticality: 0.28,
  qualWeightInternalImpact: 0.1,
  qualWeightExternalImpact: 0.23,
  qualWeightCompliance: 0.15,
};

const DEFAULT_COMBINED_WEIGHTS: CombinedScoreWeights = {
  scoreWeightEconomia: 0.4,
  scoreWeightQualitativo: 0.4,
  scoreWeightComplexidade: 0.2,
};

const projectStatusSchema = z.enum([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
  "cancelled",
]);

const complexitySchema = z.enum(["baixa", "media", "alta"]);

// TTL do lock de presença "sendo editado por" (soft lock — ver acquireLock/
// releaseLock/activeLocks abaixo). O modal manda heartbeat a cada 20s
// enquanto estiver aberto, então 45s dá margem segura contra latência de
// rede antes do lock ser considerado expirado.
const LOCK_TTL_MS = 45_000;

// Campos que só admin/super_admin (o "arquiteto" do sistema — não existe role
// separado) pode alterar via project.update. Um cliente que tentar enviar
// qualquer uma dessas chaves recebe FORBIDDEN.
const ARCHITECT_ONLY_FIELDS = new Set([
  "status",
  "priority",
  "developerId",
  "companyId",
  "solutionTypes",
  "mainToolId",
  "projectKindId",
  "executionStrategy",
  "architectNotes",
  "complexity",
  "robotSchedule",
  "hourlyRateBRL",
  "estimatedAnnualSavingBRL",
  "implementationEffortDays",
  "implementationWave",
  "waveOrder",
  "operationalStatus",
  "accumulatedSavingBRL",
]);

// Rótulos em pt-BR dos campos "de solicitação" editáveis por cliente-dono e
// arquiteto, usados para descrever no ActivityLog quais campos mudaram.
const SOLICITATION_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  description: "Descrição",
  estimatedDeadline: "Prazo limite",
  areaId: "Área",
  themeId: "Tema",
  targetAudience: "Público-alvo",
  expectedUsers: "Usuários esperados",
  urgency: "Urgência",
  additionalInfo: "Informações adicionais",
  hasExistingSystem: "Processo/sistema existente",
  existingSystemDetails: "Detalhes do processo atual",
  hasCurrentApplication: "Aplicação existente hoje",
  currentApplicationDetails: "Detalhes da aplicação existente",
  projectNarrative: "Narrativa do processo",
  benefits: "Benefícios esperados",
  benefitsDetails: "Detalhes dos benefícios",
  monthlyHoursSaved: "Horas economizadas por mês",
  ratingErrorReduction: "Avaliação: redução de erros",
  ratingProcessCriticality: "Avaliação: criticidade do processo",
  ratingInternalImpact: "Avaliação: impacto interno",
  ratingExternalImpact: "Avaliação: impacto externo",
  ratingCompliance: "Avaliação: atendimento a políticas",
  peopleInvolved: "Colaboradores envolvidos",
  peopleInvolvedDetails: "Detalhes dos colaboradores",
  taskDurationHours: "Duração por execução",
  processFrequency: "Periodicidade",
  operationalStatus: "Status operacional",
  accumulatedSavingBRL: "Economia acumulada",
};

// Compara os valores enviados (rest) contra o estado atual do projeto (current,
// linha crua do Prisma) e devolve os rótulos dos campos que de fato mudaram —
// usado só para descrever a entrada do ActivityLog, não afeta o que é salvo.
function describeChangedFields(
  rest: Record<string, unknown>,
  current: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  for (const [key, label] of Object.entries(SOLICITATION_FIELD_LABELS)) {
    if (!(key in rest) || rest[key] === undefined) continue;
    const currentKey = key === "estimatedDeadline" ? "deadline" : key;
    const before = current[currentKey];
    const after = rest[key];
    const beforeStr =
      before instanceof Date ? before.toISOString() : JSON.stringify(before ?? null);
    const afterStr =
      after instanceof Date ? after.toISOString() : JSON.stringify(after ?? null);
    if (beforeStr !== afterStr) changed.push(label);
  }
  return changed;
}

function computeCurrentAnnualHours(
  duration: number | null | undefined,
  frequency: string | null | undefined
): number | null {
  if (duration == null || frequency == null) return null;
  const multiplier = PROCESS_FREQUENCY_MULTIPLIERS[frequency];
  if (!multiplier) return null;
  return duration * multiplier;
}

export const projectRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          clientId: z.string().optional(),
          developerId: z.string().optional(),
          status: projectStatusSchema.optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {};
      if (input?.clientId) where.clientId = input.clientId;
      if (input?.developerId) where.developerId = input.developerId;
      if (input?.status) where.status = toPrismaStatus(input.status as FrontendProjectStatus);

      const projects = await ctx.db.project.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: {
          client: {
            select: { id: true, name: true, email: true, role: true },
          },
          developer: {
            select: { id: true, name: true, email: true },
          },
          company: {
            select: { id: true, name: true },
          },
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: toFrontendStatus(p.status),
        priority: p.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: p.clientId,
        developerId: p.developerId ?? undefined,
        companyId: p.companyId ?? undefined,
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        platform: p.platform ?? undefined,
        area: p.area ?? undefined,
        theme: p.theme ?? undefined,
        projectKind: p.projectKind ?? undefined,
        projectKindId: p.projectKindId ?? undefined,
        estimatedDeadline: p.deadline ?? undefined,
        targetAudience: p.targetAudience ?? undefined,
        expectedUsers: p.expectedUsers ?? undefined,
        urgency: p.urgency ?? undefined,
        features: p.features?.map((f) => f.name) ?? [],
        peopleOfInterest: p.peopleOfInterest.map((link) => ({
          id: link.person.id,
          name: link.person.name,
          role: link.person.role ?? undefined,
          userId: link.person.userId ?? undefined,
        })),
        hasExistingSystem: p.hasExistingSystem ?? undefined,
        existingSystemDetails: p.existingSystemDetails ?? undefined,
        hasCurrentApplication: p.hasCurrentApplication ?? undefined,
        currentApplicationDetails: p.currentApplicationDetails ?? undefined,
        additionalInfo: p.additionalInfo ?? undefined,
        projectNarrative: p.projectNarrative ?? undefined,
        benefits: (p.benefits as string[] | null) ?? undefined,
        benefitsDetails: p.benefitsDetails ?? undefined,
        monthlyHoursSaved: p.monthlyHoursSaved ?? undefined,
        ratingErrorReduction: p.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: p.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: p.ratingInternalImpact ?? undefined,
        ratingExternalImpact: p.ratingExternalImpact ?? undefined,
        ratingCompliance: p.ratingCompliance ?? undefined,
        peopleInvolved: p.peopleInvolved ?? undefined,
        peopleInvolvedDetails: p.peopleInvolvedDetails ?? undefined,
        taskDurationHours: p.taskDurationHours ?? undefined,
        processFrequency: p.processFrequency ?? undefined,
        currentAnnualHours: p.currentAnnualHours ?? undefined,
        complexity: p.complexity ?? undefined,
        robotSchedule: p.robotSchedule ?? undefined,
        estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
        operationalStatus: p.operationalStatus ?? undefined,
        accumulatedSavingBRL: p.accumulatedSavingBRL ?? undefined,
        operationalStatusUpdatedAt: p.operationalStatusUpdatedAt ?? undefined,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        client: p.client
          ? {
              id: p.client.id,
              name: p.client.name,
              email: p.client.email,
              role: p.client.role,
            }
          : undefined,
        developer: p.developer
          ? { id: p.developer.id, name: p.developer.name, email: p.developer.email }
          : undefined,
      }));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
      });
      if (!project)
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        companyId: project.companyId ?? undefined,
        companyName: project.company?.name,
        areaId: project.areaId ?? undefined,
        themeId: project.themeId ?? undefined,
        area: project.area ?? undefined,
        theme: project.theme ?? undefined,
        platform: project.platform ?? undefined,
        projectType: project.platform ?? project.type,
        estimatedDeadline: project.deadline ?? undefined,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        additionalInfo: project.additionalInfo ?? undefined,
        hasExistingSystem: project.hasExistingSystem ?? undefined,
        existingSystemDetails: project.existingSystemDetails ?? undefined,
        hasCurrentApplication: project.hasCurrentApplication ?? undefined,
        currentApplicationDetails: project.currentApplicationDetails ?? undefined,
        projectNarrative: project.projectNarrative ?? undefined,
        benefits: (project.benefits as string[] | null) ?? undefined,
        benefitsDetails: project.benefitsDetails ?? undefined,
        monthlyHoursSaved: project.monthlyHoursSaved ?? undefined,
        ratingErrorReduction: project.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: project.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: project.ratingInternalImpact ?? undefined,
        ratingExternalImpact: project.ratingExternalImpact ?? undefined,
        ratingCompliance: project.ratingCompliance ?? undefined,
        peopleInvolved: project.peopleInvolved ?? undefined,
        peopleInvolvedDetails: project.peopleInvolvedDetails ?? undefined,
        taskDurationHours: project.taskDurationHours ?? undefined,
        processFrequency: project.processFrequency ?? undefined,
        currentAnnualHours: project.currentAnnualHours ?? undefined,
        complexity: project.complexity ?? undefined,
        robotSchedule: project.robotSchedule ?? undefined,
        hourlyRateBRL: project.hourlyRateBRL ?? undefined,
        estimatedAnnualSavingBRL: project.estimatedAnnualSavingBRL ?? undefined,
        operationalStatus: project.operationalStatus ?? undefined,
        accumulatedSavingBRL: project.accumulatedSavingBRL ?? undefined,
        operationalStatusUpdatedAt: project.operationalStatusUpdatedAt ?? undefined,
        implementationEffortDays: project.implementationEffortDays ?? undefined,
        implementationWave: project.implementationWave ?? undefined,
        waveOrder: project.waveOrder ?? undefined,
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        projectKind: project.projectKind ?? undefined,
        projectKindId: project.projectKindId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
        architectNotes: project.architectNotes ?? undefined,
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        peopleOfInterest: project.peopleOfInterest.map((link) => ({
          id: link.person.id,
          name: link.person.name,
          role: link.person.role ?? undefined,
          userId: link.person.userId ?? undefined,
        })),
        tasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
        client: project.client,
        developer: project.developer,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: projectStatusSchema.default("backlog"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        clientId: z.string(),
        developerId: z.string().optional(),
        companyId: z.string().optional(),
        areaId: z.string().optional(),
        themeId: z.string().optional(),
        projectType: z.string(),
        estimatedDeadline: z.date().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        urgency: z.string().optional(),
        features: z.array(z.string()).optional(),
        // Campos novos do formulário de solicitação
        additionalInfo: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        hasCurrentApplication: z.string().optional(),
        currentApplicationDetails: z.string().optional(),
        projectNarrative: z.string().optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
        // Diagnostico de processo - operacional
        peopleInvolved: z.number().int().min(0).optional(),
        peopleInvolvedDetails: z.string().optional(),
        taskDurationHours: z.number().min(0).optional(),
        // string livre: pode ser um dos valores conhecidos ou o texto de "Outro"
        processFrequency: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.user.findUnique({ where: { id: input.clientId } });
      if (!client) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cliente inválido (clientId não existe). Em ambiente local, rode o seed do Prisma ou selecione um cliente válido.",
        });
      }

      if (input.developerId) {
        const developer = await ctx.db.user.findUnique({ where: { id: input.developerId } });
        if (!developer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Desenvolvedor inválido (developerId não existe). Selecione um desenvolvedor válido.",
          });
        }
      }

      // Taxa horária padrão para calcular a economia anual estimada já na
      // criação (nenhum campo de taxa/economia existe no formulário de
      // criação — o projeto ainda não passou pelo arquiteto).
      const settingsForCreate = await ctx.db.systemSettings.findUnique({
        where: { id: "default" },
      });
      const defaultHourlyRateBRLForCreate = settingsForCreate?.defaultHourlyRateBRL ?? 90;

      const project = await ctx.db.project.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          type: "OUTRO",
          category: "OUTRO",
          status: toPrismaStatus(input.status as FrontendProjectStatus),
          priority: input.priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          clientId: input.clientId,
          developerId: input.developerId ?? null,
          companyId: input.companyId ?? null,
          areaId: input.areaId ?? null,
          themeId: input.themeId ?? null,
          platform: input.projectType,
          deadline: input.estimatedDeadline ?? null,
          targetAudience: input.targetAudience ?? null,
          expectedUsers: input.expectedUsers ?? null,
          urgency: input.urgency ?? null,
          additionalInfo: input.additionalInfo ?? null,
          hasExistingSystem: input.hasExistingSystem ?? null,
          existingSystemDetails: input.existingSystemDetails ?? null,
          hasCurrentApplication: input.hasCurrentApplication ?? null,
          currentApplicationDetails: input.currentApplicationDetails ?? null,
          projectNarrative: input.projectNarrative ?? null,
          benefits: input.benefits ?? undefined,
          benefitsDetails: input.benefitsDetails ?? null,
          monthlyHoursSaved: input.monthlyHoursSaved ?? null,
          ratingErrorReduction: input.ratingErrorReduction ?? null,
          ratingProcessCriticality: input.ratingProcessCriticality ?? null,
          ratingInternalImpact: input.ratingInternalImpact ?? null,
          ratingExternalImpact: input.ratingExternalImpact ?? null,
          ratingCompliance: input.ratingCompliance ?? null,
          peopleInvolved: input.peopleInvolved ?? null,
          peopleInvolvedDetails: input.peopleInvolvedDetails ?? null,
          taskDurationHours: input.taskDurationHours ?? null,
          processFrequency: input.processFrequency ?? null,
          currentAnnualHours: computeCurrentAnnualHours(
            input.taskDurationHours,
            input.processFrequency
          ),
          estimatedAnnualSavingBRL: computeAnnualSavingBRL(
            input.monthlyHoursSaved ?? null,
            defaultHourlyRateBRLForCreate
          ),
          features:
            input.features && input.features.length
              ? {
                  create: input.features.map((name) => ({ name })),
                }
              : undefined,
        },
        include: {
          client: { select: { id: true, name: true, email: true } },
          developer: { select: { id: true, name: true, email: true } },
          features: true,
        },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: "Projeto criado",
        },
      });
      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase(),
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        projectType: project.platform ?? "",
        estimatedDeadline: project.deadline ?? undefined,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        features: project.features?.map((f) => f.name) ?? [],
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatusSchema.optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        developerId: z.string().nullable().optional(),
        companyId: z.string().nullable().optional(),
        areaId: z.string().nullable().optional(),
        themeId: z.string().nullable().optional(),
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        projectKindId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
        peopleInvolved: z.number().int().min(0).nullable().optional(),
        peopleInvolvedDetails: z.string().nullable().optional(),
        taskDurationHours: z.number().min(0).nullable().optional(),
        processFrequency: z.string().nullable().optional(),
        complexity: complexitySchema.nullable().optional(),
        robotSchedule: z.string().nullable().optional(),
        hourlyRateBRL: z.number().min(0).nullable().optional(),
        estimatedAnnualSavingBRL: z.number().nullable().optional(),
        implementationEffortDays: z.number().int().min(0).nullable().optional(),
        implementationWave: z.number().int().min(0).nullable().optional(),
        waveOrder: z.number().int().min(0).nullable().optional(),
        hasCurrentApplication: z.string().nullable().optional(),
        targetAudience: z.string().nullable().optional(),
        expectedUsers: z.string().nullable().optional(),
        urgency: z.string().nullable().optional(),
        additionalInfo: z.string().nullable().optional(),
        hasExistingSystem: z.string().nullable().optional(),
        existingSystemDetails: z.string().nullable().optional(),
        currentApplicationDetails: z.string().nullable().optional(),
        projectNarrative: z.string().nullable().optional(),
        benefits: z.array(z.string()).nullable().optional(),
        benefitsDetails: z.string().nullable().optional(),
        monthlyHoursSaved: z.number().nullable().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).nullable().optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).nullable().optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).nullable().optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).nullable().optional(),
        ratingCompliance: z.number().int().min(1).max(5).nullable().optional(),
        operationalStatus: z.enum(["ACTIVE", "PAUSED", "ISSUE"]).nullable().optional(),
        accumulatedSavingBRL: z.number().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;

      const current = await ctx.db.project.findUnique({ where: { id } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }

      const caller = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      const isArchitect = caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN";
      const isOwner = current.clientId === ctx.userId;

      if (!isArchitect) {
        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para editar este projeto.",
          });
        }
        if (current.status === "DONE" || current.status === "CANCELLED") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Este projeto já foi concluído ou cancelado. Peça a um administrador para reabrir a edição.",
          });
        }
        const forbiddenKey = Object.keys(rest).find(
          (key) =>
            ARCHITECT_ONLY_FIELDS.has(key) &&
            (rest as Record<string, unknown>)[key] !== undefined
        );
        if (forbiddenKey) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Este campo só pode ser alterado por um administrador.",
          });
        }
      }

      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.companyId !== undefined) data.companyId = rest.companyId;
      if (rest.areaId !== undefined) data.areaId = rest.areaId;
      if (rest.themeId !== undefined) data.themeId = rest.themeId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.projectKindId !== undefined) data.projectKindId = rest.projectKindId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;
      if (rest.complexity !== undefined) data.complexity = rest.complexity;
      if (rest.robotSchedule !== undefined) data.robotSchedule = rest.robotSchedule;
      if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
      if (rest.estimatedAnnualSavingBRL !== undefined) {
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
      } else if (rest.monthlyHoursSaved !== undefined || rest.hourlyRateBRL !== undefined) {
        // Recalcula automaticamente sempre que horas ou taxa mudam sem um
        // valor manual explícito nesta mesma chamada — mesmo padrão de
        // currentAnnualHours (sempre derivado) alguns blocos abaixo, mas
        // aqui o campo final continua editável manualmente quando o
        // arquiteto manda um valor (ramo acima, `handleSaveArchitecture`
        // sempre envia um).
        const nextMonthlyHoursSaved =
          rest.monthlyHoursSaved !== undefined ? rest.monthlyHoursSaved : current.monthlyHoursSaved;
        const nextHourlyRateBRL =
          rest.hourlyRateBRL !== undefined ? rest.hourlyRateBRL : current.hourlyRateBRL;
        const settings = await ctx.db.systemSettings.findUnique({ where: { id: "default" } });
        const effectiveRate = nextHourlyRateBRL ?? settings?.defaultHourlyRateBRL ?? 90;
        data.estimatedAnnualSavingBRL = computeAnnualSavingBRL(nextMonthlyHoursSaved, effectiveRate);
      }
      if (rest.implementationEffortDays !== undefined)
        data.implementationEffortDays = rest.implementationEffortDays;
      if (rest.implementationWave !== undefined) data.implementationWave = rest.implementationWave;
      if (rest.waveOrder !== undefined) data.waveOrder = rest.waveOrder;
      if (rest.hasCurrentApplication !== undefined)
        data.hasCurrentApplication = rest.hasCurrentApplication;
      if (rest.targetAudience !== undefined) data.targetAudience = rest.targetAudience;
      if (rest.expectedUsers !== undefined) data.expectedUsers = rest.expectedUsers;
      if (rest.urgency !== undefined) data.urgency = rest.urgency;
      if (rest.additionalInfo !== undefined) data.additionalInfo = rest.additionalInfo;
      if (rest.hasExistingSystem !== undefined) data.hasExistingSystem = rest.hasExistingSystem;
      if (rest.existingSystemDetails !== undefined)
        data.existingSystemDetails = rest.existingSystemDetails;
      if (rest.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = rest.currentApplicationDetails;
      if (rest.projectNarrative !== undefined) data.projectNarrative = rest.projectNarrative;
      if (rest.benefits !== undefined) data.benefits = rest.benefits;
      if (rest.benefitsDetails !== undefined) data.benefitsDetails = rest.benefitsDetails;
      if (rest.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = rest.monthlyHoursSaved;
      if (rest.ratingErrorReduction !== undefined)
        data.ratingErrorReduction = rest.ratingErrorReduction;
      if (rest.ratingProcessCriticality !== undefined)
        data.ratingProcessCriticality = rest.ratingProcessCriticality;
      if (rest.ratingInternalImpact !== undefined)
        data.ratingInternalImpact = rest.ratingInternalImpact;
      if (rest.ratingExternalImpact !== undefined)
        data.ratingExternalImpact = rest.ratingExternalImpact;
      if (rest.ratingCompliance !== undefined) data.ratingCompliance = rest.ratingCompliance;
      if (rest.peopleInvolved !== undefined) data.peopleInvolved = rest.peopleInvolved;
      if (rest.peopleInvolvedDetails !== undefined)
        data.peopleInvolvedDetails = rest.peopleInvolvedDetails;
      if (rest.taskDurationHours !== undefined || rest.processFrequency !== undefined) {
        const nextDuration =
          rest.taskDurationHours !== undefined ? rest.taskDurationHours : current.taskDurationHours;
        const nextFrequency =
          rest.processFrequency !== undefined ? rest.processFrequency : current.processFrequency;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }
      if (rest.operationalStatus !== undefined || rest.accumulatedSavingBRL !== undefined) {
        if (rest.operationalStatus !== undefined) data.operationalStatus = rest.operationalStatus;
        if (rest.accumulatedSavingBRL !== undefined)
          data.accumulatedSavingBRL = rest.accumulatedSavingBRL;
        data.operationalStatusUpdatedAt = new Date();
      }

      const changedFieldLabels = describeChangedFields(
        rest as Record<string, unknown>,
        current as unknown as Record<string, unknown>
      );

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: changedFieldLabels.length > 0 ? "Solicitação editada" : "Projeto atualizado",
          details: changedFieldLabels.length > 0 ? changedFieldLabels.join(", ") : undefined,
        },
      });
      return {
        ...project,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase(),
        developerId: project.developerId ?? undefined,
        estimatedDeadline: project.deadline ?? undefined,
      };
    }),

  move: protectedProcedure
    .input(z.object({ id: z.string(), status: projectStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.update({
        where: { id: input.id },
        data: { status: toPrismaStatus(input.status as FrontendProjectStatus) },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: `Status alterado para ${input.status}`,
        },
      });
      return { ...project, status: toFrontendStatus(project.status) };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      await ctx.db.project.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Lock de presença "sendo editado por" (soft, só aviso). Chamado ao abrir o
  // modal de detalhes e depois a cada heartbeat (20s no client) enquanto o
  // modal continuar aberto.
  acquireLock: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [existing, caller] = await Promise.all([
        ctx.db.projectLock.findUnique({ where: { projectId: input.projectId } }),
        ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
      ]);

      const isExpired = !existing || Date.now() - existing.lockedAt.getTime() > LOCK_TTL_MS;
      const isOwnLock = existing?.userId === ctx.userId;

      // Só grava/atualiza o lock se estiver livre, expirado, ou já for do
      // próprio usuário (heartbeat) — nunca sobrescreve o lock de outra
      // pessoa ainda ativa, senão o "dono" ficaria trocando a cada heartbeat
      // enquanto dois usuários tivessem o mesmo card aberto.
      if (isExpired || isOwnLock) {
        const lock = await ctx.db.projectLock.upsert({
          where: { projectId: input.projectId },
          create: {
            projectId: input.projectId,
            userId: ctx.userId,
            userName: caller?.name ?? "Usuário",
          },
          update: {
            userId: ctx.userId,
            userName: caller?.name ?? "Usuário",
          },
        });
        return {
          projectId: lock.projectId,
          userId: lock.userId,
          userName: lock.userName,
          lockedAt: lock.lockedAt,
        };
      }

      return {
        projectId: existing!.projectId,
        userId: existing!.userId,
        userName: existing!.userName,
        lockedAt: existing!.lockedAt,
      };
    }),

  releaseLock: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // deleteMany (não delete) porque é um no-op silencioso e seguro quando
      // quem chama não é o dono atual do lock (ex.: um segundo usuário que
      // nunca chegou a "ganhar" o lock fechando o próprio modal).
      await ctx.db.projectLock.deleteMany({
        where: { projectId: input.projectId, userId: ctx.userId },
      });
      return { success: true };
    }),

  activeLocks: protectedProcedure.query(async ({ ctx }) => {
    const locks = await ctx.db.projectLock.findMany({
      where: { lockedAt: { gte: new Date(Date.now() - LOCK_TTL_MS) } },
    });
    return locks.map((l) => ({
      projectId: l.projectId,
      userId: l.userId,
      userName: l.userName,
      lockedAt: l.lockedAt,
    }));
  }),

  // Agregação de projetos por área (contagem, saving estimado e horas atuais).
  // adminProcedure: soma de saving por área é um dado sensível, não deve vazar
  // para roles não-admin (mesma lógica de segurança do Passo 1 / settings).
  // Reutilizada pelo dashboard admin (Passo 2) e futuramente pelo deck consolidado (Passo 8a).
  getAreaSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["areaId"],
        _count: true,
        _sum: { estimatedAnnualSavingBRL: true, currentAnnualHours: true },
        where: {
          areaId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const areaIds = grouped
        .map((g) => g.areaId)
        .filter((id): id is string => id != null);

      const areas = await ctx.db.projectArea.findMany({
        where: { id: { in: areaIds } },
      });
      const areaById = new Map(areas.map((a) => [a.id, a]));

      return grouped
        .filter((g) => g.areaId != null && areaById.has(g.areaId))
        .map((g) => {
          const area = areaById.get(g.areaId as string)!;
          return {
            areaId: area.id,
            areaName: area.name,
            projectCount: g._count,
            totalEstimatedSavingBRL: g._sum.estimatedAnnualSavingBRL ?? 0,
            totalCurrentAnnualHours: g._sum.currentAnnualHours ?? 0,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Agregação de projetos por ferramenta principal (contagem), mesmo padrão de
  // getAreaSummary mas agrupado por mainToolId — usado pela aba "Resumo
  // Executivo" da Priorização. adminProcedure pelo mesmo motivo de segurança
  // (contagem por ferramenta é dado interno do diagnóstico).
  getToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolId"],
        _count: true,
        where: {
          mainToolId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Ranking priorizado dos projetos de uma empresa, reordenável por economia,
  // qualitativo ou score combinado (Passo 4 do blueprint de diagnóstico de
  // robotização). adminProcedure: expõe rating/complexidade/saving, dados
  // sensíveis que nunca devem vazar para o cliente.
  getPrioritizedRanking: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        sortBy: z.enum(["economia", "qualitativo", "combinado"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const [projects, settings] = await Promise.all([
        ctx.db.project.findMany({
          where: {
            companyId: input.companyId,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
          select: {
            id: true,
            title: true,
            areaId: true,
            area: { select: { name: true } },
            ratingErrorReduction: true,
            ratingProcessCriticality: true,
            ratingInternalImpact: true,
            ratingExternalImpact: true,
            ratingCompliance: true,
            complexity: true,
            estimatedAnnualSavingBRL: true,
            implementationWave: true,
            waveOrder: true,
            implementationEffortDays: true,
          },
        }),
        ctx.db.systemSettings.findUnique({ where: { id: "default" } }),
      ]);

      const qualWeights: QualitativeWeights = settings
        ? {
            qualWeightErrorReduction: settings.qualWeightErrorReduction,
            qualWeightProcessCriticality: settings.qualWeightProcessCriticality,
            qualWeightInternalImpact: settings.qualWeightInternalImpact,
            qualWeightExternalImpact: settings.qualWeightExternalImpact,
            qualWeightCompliance: settings.qualWeightCompliance,
          }
        : DEFAULT_QUALITATIVE_WEIGHTS;

      const combinedWeights: CombinedScoreWeights = settings
        ? {
            scoreWeightEconomia: settings.scoreWeightEconomia,
            scoreWeightQualitativo: settings.scoreWeightQualitativo,
            scoreWeightComplexidade: settings.scoreWeightComplexidade,
          }
        : DEFAULT_COMBINED_WEIGHTS;

      const maxSavingInSet = projects.reduce(
        (max, p) => Math.max(max, p.estimatedAnnualSavingBRL ?? 0),
        0
      );

      const ranked = projects.map((p) => {
        const qualitativeScorePercent = computeQualitativeScore(p, qualWeights);
        const complexityScoreValue = computeComplexityScore(p.complexity);
        const economiaScore = computeEconomiaScore(p.estimatedAnnualSavingBRL, maxSavingInSet);
        const combinedScore = computeCombinedScore(
          economiaScore,
          qualitativeScorePercent,
          complexityScoreValue,
          combinedWeights
        );

        return {
          id: p.id,
          title: p.title,
          areaName: p.area?.name ?? null,
          qualitativeScorePercent,
          complexity: p.complexity,
          estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL,
          economiaScore,
          combinedScore,
          implementationWave: p.implementationWave,
          waveOrder: p.waveOrder,
          implementationEffortDays: p.implementationEffortDays,
        };
      });

      const sortKey =
        input.sortBy === "economia"
          ? ("economiaScore" as const)
          : input.sortBy === "qualitativo"
            ? ("qualitativeScorePercent" as const)
            : ("combinedScore" as const);

      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),

  // Ranking de automações já existentes/entregues (hasCurrentApplication="sim"
  // ou status DONE) — o inverso exato do filtro de getPrioritizedRanking.
  // Reaproveita o motor de scoring de @/shared/lib/scoring, alimentado por
  // accumulatedSavingBRL (economia acumulada real) em vez de
  // estimatedAnnualSavingBRL — sem score de complexidade/combinado, que não
  // faz sentido para algo que já foi entregue.
  getExistingAutomationsRanking: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        sortBy: z.enum(["economia", "qualitativo"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const [projects, settings] = await Promise.all([
        ctx.db.project.findMany({
          where: {
            companyId: input.companyId,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
          select: {
            id: true,
            title: true,
            areaId: true,
            area: { select: { name: true } },
            ratingErrorReduction: true,
            ratingProcessCriticality: true,
            ratingInternalImpact: true,
            ratingExternalImpact: true,
            ratingCompliance: true,
            accumulatedSavingBRL: true,
            operationalStatus: true,
          },
        }),
        ctx.db.systemSettings.findUnique({ where: { id: "default" } }),
      ]);

      const qualWeights: QualitativeWeights = settings
        ? {
            qualWeightErrorReduction: settings.qualWeightErrorReduction,
            qualWeightProcessCriticality: settings.qualWeightProcessCriticality,
            qualWeightInternalImpact: settings.qualWeightInternalImpact,
            qualWeightExternalImpact: settings.qualWeightExternalImpact,
            qualWeightCompliance: settings.qualWeightCompliance,
          }
        : DEFAULT_QUALITATIVE_WEIGHTS;

      const maxSavingInSet = projects.reduce(
        (max, p) => Math.max(max, p.accumulatedSavingBRL ?? 0),
        0
      );

      const ranked = projects.map((p) => {
        const qualitativeScorePercent = computeQualitativeScore(p, qualWeights);
        const economiaScore = computeEconomiaScore(p.accumulatedSavingBRL, maxSavingInSet);

        return {
          id: p.id,
          title: p.title,
          areaName: p.area?.name ?? null,
          qualitativeScorePercent,
          accumulatedSavingBRL: p.accumulatedSavingBRL,
          economiaScore,
          operationalStatus: p.operationalStatus,
        };
      });

      const sortKey =
        input.sortBy === "economia" ? ("economiaScore" as const) : ("qualitativeScorePercent" as const);

      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),

  // Resumo por área das automações já existentes/entregues — mesmo padrão de
  // getAreaSummary, com o filtro invertido e somando accumulatedSavingBRL
  // (economia acumulada real) em vez de estimatedAnnualSavingBRL/currentAnnualHours.
  getExistingAutomationsAreaSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["areaId"],
        _count: true,
        _sum: { accumulatedSavingBRL: true },
        where: {
          areaId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const areaIds = grouped
        .map((g) => g.areaId)
        .filter((id): id is string => id != null);

      const areas = await ctx.db.projectArea.findMany({
        where: { id: { in: areaIds } },
      });
      const areaById = new Map(areas.map((a) => [a.id, a]));

      return grouped
        .filter((g) => g.areaId != null && areaById.has(g.areaId))
        .map((g) => {
          const area = areaById.get(g.areaId as string)!;
          return {
            areaId: area.id,
            areaName: area.name,
            projectCount: g._count,
            totalAccumulatedSavingBRL: g._sum.accumulatedSavingBRL ?? 0,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Resumo por ferramenta das automações já existentes/entregues — mesmo
  // padrão de getToolSummary, com o filtro invertido (igual
  // getExistingAutomationsAreaSummary faz para área).
  getExistingAutomationsToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolId"],
        _count: true,
        where: {
          mainToolId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Contagem de projetos de uma empresa sem área definida (areaId null),
  // separados em pipeline/entregues — usado pela aba "Resumo por Área" da
  // Priorização pra avisar que esses projetos ficam fora dos dois resumos
  // acima (que filtram areaId: { not: null }). Mesmos filtros exatos de
  // getPrioritizedRanking/getExistingAutomationsRanking, só invertendo a
  // condição de areaId.
  getAreaSummaryGaps: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pipelineWithoutArea, deliveredWithoutArea] = await Promise.all([
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
        }),
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
        }),
      ]);
      return { pipelineWithoutArea, deliveredWithoutArea };
    }),

  updatePeopleOfInterest: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        personIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }
      if (!current.companyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Projeto sem empresa vinculada não pode ter pessoas de interesse.",
        });
      }

      const caller = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      const isArchitect = caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN";
      const isOwner = current.clientId === ctx.userId;
      if (!isArchitect) {
        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para editar este projeto.",
          });
        }
        if (current.status === "DONE" || current.status === "CANCELLED") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Este projeto já foi concluído ou cancelado. Peça a um administrador para reabrir a edição.",
          });
        }
      }

      const resolvedIds = Array.from(
        new Set(await resolvePersonIds(ctx.db, current.companyId, input.personIds))
      );
      await ctx.db.projectPersonOfInterest.deleteMany({ where: { projectId: input.projectId } });
      await ctx.db.projectPersonOfInterest.createMany({
        data: resolvedIds.map((personId) => ({ projectId: input.projectId, personId })),
      });

      return { success: true };
    }),

  importXml: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).optional(),
        areaName: z.string().optional(),
        themeName: z.string().optional(),
        platform: z.string().optional(),
        description: z.string().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        hasCurrentApplication: z.string().optional(),
        currentApplicationDetails: z.string().optional(),
        peopleInvolved: z.number().int().optional(),
        taskDurationHours: z.number().optional(),
        processFrequency: z.string().optional(),
        projectNarrative: z.string().optional(),
        features: z.array(z.string()).optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
        urgency: z.string().optional(),
        estimatedDeadline: z.coerce.date().optional(),
        additionalInfo: z.string().optional(),
        mainToolName: z.string().optional(),
        projectKindName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
        complexity: z.string().optional(),
        robotSchedule: z.string().optional(),
        hourlyRateBRL: z.number().optional(),
        estimatedAnnualSavingBRL: z.number().optional(),
        executionStrategy: z.string().optional(),
        solutionTypes: z.array(z.string()).optional(),
        architectNotes: z.string().optional(),
        implementationEffortDays: z.number().int().optional(),
        implementationWave: z.number().int().optional(),
        waveOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const caller = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      const canImport =
        caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN" || caller?.role === "DEVELOPER";
      if (!canImport) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas admin ou developer podem importar XML de projeto.",
        });
      }

      const current = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }

      const warnings: string[] = [];
      const data: Record<string, unknown> = {};

      if (input.title !== undefined) data.title = input.title;
      if (input.platform !== undefined) data.platform = input.platform;
      if (input.description !== undefined) data.description = input.description;
      if (input.targetAudience !== undefined) data.targetAudience = input.targetAudience;
      if (input.expectedUsers !== undefined) data.expectedUsers = input.expectedUsers;
      if (input.hasExistingSystem !== undefined) data.hasExistingSystem = input.hasExistingSystem;
      if (input.existingSystemDetails !== undefined)
        data.existingSystemDetails = input.existingSystemDetails;
      if (input.hasCurrentApplication !== undefined)
        data.hasCurrentApplication = input.hasCurrentApplication;
      if (input.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = input.currentApplicationDetails;
      if (input.peopleInvolved !== undefined) data.peopleInvolved = input.peopleInvolved;
      if (input.taskDurationHours !== undefined || input.processFrequency !== undefined) {
        const nextDuration = input.taskDurationHours ?? current.taskDurationHours;
        const nextFrequency = input.processFrequency ?? current.processFrequency;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }
      if (input.projectNarrative !== undefined) data.projectNarrative = input.projectNarrative;
      if (input.benefits !== undefined) data.benefits = input.benefits;
      if (input.benefitsDetails !== undefined) data.benefitsDetails = input.benefitsDetails;
      if (input.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = input.monthlyHoursSaved;
      if (input.ratingErrorReduction !== undefined)
        data.ratingErrorReduction = input.ratingErrorReduction;
      if (input.ratingProcessCriticality !== undefined)
        data.ratingProcessCriticality = input.ratingProcessCriticality;
      if (input.ratingInternalImpact !== undefined)
        data.ratingInternalImpact = input.ratingInternalImpact;
      if (input.ratingExternalImpact !== undefined)
        data.ratingExternalImpact = input.ratingExternalImpact;
      if (input.ratingCompliance !== undefined) data.ratingCompliance = input.ratingCompliance;
      if (input.urgency !== undefined) data.urgency = input.urgency;
      if (input.estimatedDeadline !== undefined) data.deadline = input.estimatedDeadline;
      if (input.additionalInfo !== undefined) data.additionalInfo = input.additionalInfo;
      if (input.complexity !== undefined) data.complexity = input.complexity;
      if (input.robotSchedule !== undefined) data.robotSchedule = input.robotSchedule;
      if (input.hourlyRateBRL !== undefined) data.hourlyRateBRL = input.hourlyRateBRL;
      if (input.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = input.estimatedAnnualSavingBRL;
      if (input.executionStrategy !== undefined) data.executionStrategy = input.executionStrategy;
      if (input.solutionTypes !== undefined) data.solutionTypes = input.solutionTypes;
      if (input.architectNotes !== undefined) data.architectNotes = input.architectNotes;
      if (input.implementationEffortDays !== undefined)
        data.implementationEffortDays = input.implementationEffortDays;
      if (input.implementationWave !== undefined) data.implementationWave = input.implementationWave;
      if (input.waveOrder !== undefined) data.waveOrder = input.waveOrder;

      let resolvedAreaId: string | undefined;
      if (input.areaName !== undefined) {
        const area = await findOrCreateProjectArea(ctx.db, input.areaName, warnings);
        if (area) {
          resolvedAreaId = area.id;
          data.areaId = area.id;
        }
      }
      if (input.themeName !== undefined) {
        const areaIdForTheme = resolvedAreaId ?? current.areaId ?? undefined;
        if (areaIdForTheme) {
          const theme = await findOrCreateProjectTheme(ctx.db, areaIdForTheme, input.themeName, warnings);
          if (theme) data.themeId = theme.id;
        } else {
          warnings.push(`Tema "${input.themeName}" ignorado — nenhuma área definida para o projeto.`);
        }
      }
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
      if (input.projectKindName !== undefined) {
        const kind = await findOrCreateProjectKind(ctx.db, input.projectKindName, warnings);
        if (kind) data.projectKindId = kind.id;
      }

      await ctx.db.project.update({ where: { id: input.projectId }, data });

      if (input.features !== undefined) {
        const existingFeatures = await ctx.db.projectFeature.findMany({
          where: { projectId: input.projectId },
        });
        const keep = new Set(input.features);
        const toDelete = existingFeatures.filter((f) => !keep.has(f.name));
        const existingNames = new Set(existingFeatures.map((f) => f.name));
        const toCreate = input.features.filter((name) => !existingNames.has(name));
        if (toDelete.length > 0) {
          await ctx.db.projectFeature.deleteMany({
            where: { id: { in: toDelete.map((f) => f.id) } },
          });
        }
        if (toCreate.length > 0) {
          await ctx.db.projectFeature.createMany({
            data: toCreate.map((name) => ({ projectId: input.projectId, name })),
          });
        }
      }

      if (input.peopleOfInterestNames !== undefined && current.companyId) {
        const personIds = await resolvePersonIdsByName(
          ctx.db,
          current.companyId,
          input.peopleOfInterestNames
        );
        await ctx.db.projectPersonOfInterest.deleteMany({ where: { projectId: input.projectId } });
        await ctx.db.projectPersonOfInterest.createMany({
          data: personIds.map((personId) => ({ projectId: input.projectId, personId })),
        });
      }

      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Projeto importado via XML",
          details: warnings.length > 0 ? warnings.join(" | ") : undefined,
        },
      });

      return { warnings };
    }),
});
