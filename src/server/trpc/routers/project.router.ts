import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
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
          features: true,
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
        estimatedDeadline: p.deadline ?? undefined,
        targetAudience: p.targetAudience ?? undefined,
        expectedUsers: p.expectedUsers ?? undefined,
        urgency: p.urgency ?? undefined,
        features: p.features?.map((f) => f.name) ?? [],
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
          tasks: true,
          features: true,
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
        implementationEffortDays: project.implementationEffortDays ?? undefined,
        implementationWave: project.implementationWave ?? undefined,
        waveOrder: project.waveOrder ?? undefined,
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
        architectNotes: project.architectNotes ?? undefined,
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
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
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
        peopleInvolved: z.number().int().min(0).nullable().optional(),
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.companyId !== undefined) data.companyId = rest.companyId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;
      if (rest.complexity !== undefined) data.complexity = rest.complexity;
      if (rest.robotSchedule !== undefined) data.robotSchedule = rest.robotSchedule;
      if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
      if (rest.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
      if (rest.implementationEffortDays !== undefined)
        data.implementationEffortDays = rest.implementationEffortDays;
      if (rest.implementationWave !== undefined)
        data.implementationWave = rest.implementationWave;
      if (rest.waveOrder !== undefined) data.waveOrder = rest.waveOrder;
      if (rest.hasCurrentApplication !== undefined)
        data.hasCurrentApplication = rest.hasCurrentApplication;
      if (rest.peopleInvolved !== undefined) data.peopleInvolved = rest.peopleInvolved;
      if (rest.taskDurationHours !== undefined || rest.processFrequency !== undefined) {
        const current = await ctx.db.project.findUnique({
          where: { id },
          select: { taskDurationHours: true, processFrequency: true },
        });
        const nextDuration =
          rest.taskDurationHours !== undefined
            ? rest.taskDurationHours
            : current?.taskDurationHours ?? null;
        const nextFrequency =
          rest.processFrequency !== undefined
            ? rest.processFrequency
            : current?.processFrequency ?? null;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: "Projeto atualizado",
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
          where: { companyId: input.companyId },
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
});
