import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import { resolvePersonIds, resolvePersonIdsByName } from "./person.router";
import {
  findOrCreateProjectArea,
  findOrCreateProjectTheme,
  findOrCreateMainTool,
  findOrCreateMainToolCategory,
  findOrCreateProjectKind,
} from "./project-import-xml-helpers";
import type { FrontendProjectStatus } from "../mappers";
import {
  PROCESS_FREQUENCY_MULTIPLIERS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
} from "@/shared/constants/project-taxonomy";
import {
  computeQualitativeScore,
  computeComplexityScore,
  computeEconomiaScore,
  computeCombinedScore,
  type QualitativeWeights,
  type CombinedScoreWeights,
} from "@/shared/lib/scoring";
import { computeAnnualSavingBRL } from "@/shared/lib/savings";
import { toNullableFkId } from "@/shared/lib/nullable-fk";
import type { ProjectTargetSystemView, ProjectAutomationAccountView } from "@/shared/types";

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

const targetSystemInputSchema = z
  .object({
    targetSystemId: z.string().optional(),
    customName: z.string().optional(),
    accessPoint: z.string().optional(),
    accessNotes: z
      .string()
      .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH, "Máximo de 200 caracteres")
      .optional(),
  })
  .refine((s) => !!s.targetSystemId || !!s.customName?.trim(), {
    message: "Escolha um sistema do catálogo ou informe um nome",
  });

const automationAccountInputSchema = z.object({
  username: z
    .string()
    .min(1, "Informe o usuário")
    .max(AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH, "Máximo de 120 caracteres"),
  /**
   * POSIÇÃO na lista `systems` do mesmo payload, não um id: a gravação
   * substitui as linhas por inteiro e destrói os ids anteriores.
   */
  systemIndex: z.number().int().min(0).optional(),
  accountType: z.string().optional(),
  ownerName: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Sistemas e contas viajam juntos de propósito. As contas apontam para linhas
 * de ProjectTargetSystem por índice, então gravar um sem o outro deixaria todo
 * vínculo nulo — em silêncio, sem erro.
 *
 * Semântica omitir-vs-vazio, não óbvia e fácil de errar do lado do cliente:
 * OMITIR `automationInventory` inteiro em project.update PRESERVA as listas
 * existentes do projeto; mandar `{ systems: [], accounts: [] }` APAGA as duas.
 * Um formulário que sempre serialize `systems: []` mesmo quando o usuário não
 * abriu a seção de sistemas/contas apagaria dados sem querer — o campo
 * precisa ficar de fora do payload quando a intenção é "não mexer nisso".
 */
// Exportado para que scripts/verify-xml-roundtrip.ts possa validar, com
// `.safeParse()`, que o objeto `{ systems, accounts }` montado a partir do
// XML (toAutomationInventoryInput, em shared/xml/parse-projeto-completo-xml.ts)
// bate de fato com o schema que este router aceita — sem essa checagem os
// dois formatos podem divergir em silêncio, exatamente como aconteceu com
// `importXml` na Task 11 original.
export const automationInventoryInputSchema = z.object({
  systems: z.array(targetSystemInputSchema),
  accounts: z.array(automationAccountInputSchema),
});

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
  "solutionTypeIds",
  "mainToolId",
  "mainToolCategoryId",
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
  currentApplicationHosting: "Onde a automação roda",
  currentApplicationHostingCustom: "Onde a automação roda (outro)",
  currentApplicationAuthor: "Quem desenvolveu",
  currentApplicationOwner: "Responsável pela automação hoje",
  currentApplicationAccessLocation: "Onde ficam os acessos",
  currentApplicationAccessReference: "Referência dos acessos",
  currentApplicationLiveSince: "Em produção desde",
  currentApplicationAssetId: "Identificação do ativo",
  currentApplicationOwnerRole: "Cargo do responsável",
  currentApplicationOwnerAreaId: "Setor do responsável",
  currentApplicationDataInput: "Origem dos dados de entrada",
  currentApplicationDataInputDetails: "Detalhes da entrada de dados",
  currentApplicationDataOutput: "Destino dos dados de saída",
  currentApplicationDataOutputDetails: "Detalhes da saída de dados",
  currentApplicationContingencyActions: "O que fazer se a automação parar",
  currentApplicationContingencyDetails: "Detalhes da contingência",
  currentApplicationBackupOwner: "Responsável substituto",
  handlesSensitiveData: "Mexe em dados sigilosos",
  sensitiveDataCategories: "Categorias de dados sigilosos",
  sensitiveDataDetails: "Detalhes dos dados sigilosos",
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

type AutomationInventoryInput = z.infer<typeof automationInventoryInputSchema>;

/**
 * Substituição integral, dentro de uma transação. A ORDEM é obrigatória:
 * apagar contas → apagar sistemas → recriar sistemas → recriar contas.
 * Recriar as contas antes dos sistemas, ou referenciar sistema por id em vez de
 * índice, zeraria todo projectTargetSystemId a cada save sem levantar erro.
 */
async function replaceAutomationInventory(
  tx: Prisma.TransactionClient,
  projectId: string,
  inventory: AutomationInventoryInput
): Promise<void> {
  await tx.projectAutomationAccount.deleteMany({ where: { projectId } });
  await tx.projectTargetSystem.deleteMany({ where: { projectId } });

  const createdSystemIds: string[] = [];
  // Um create por linha, sequencial — não createMany. createMany não devolve
  // os ids gerados, e é justamente o id de cada linha que a tradução
  // índice→id das contas (abaixo) precisa.
  for (const [index, system] of inventory.systems.entries()) {
    const row = await tx.projectTargetSystem.create({
      data: {
        projectId,
        targetSystemId: system.targetSystemId || null,
        customName: system.customName?.trim() || null,
        accessPoint: system.accessPoint?.trim() || null,
        accessNotes: system.accessNotes?.trim() || null,
        order: index,
      },
      select: { id: true },
    });
    createdSystemIds.push(row.id);
  }

  // Valida TODOS os índices antes de criar qualquer conta — falhar cedo, com
  // uma mensagem que aponta a conta e o índice culpados, em vez de deixar
  // metade das contas gravadas (o rollback da transação cobre a consistência
  // do banco de qualquer forma, mas a mensagem de erro fica pior). Índice fora
  // de [0, systems.length) só acontece por payload malformado — nunca por uso
  // legítimo do formulário — mas é justamente o caminho que a Task 12 (import
  // de XML) vai exercitar, e lá um índice inválido é sintoma de XML mal
  // gerado que precisa aparecer, não virar conta órfã em silêncio.
  for (const account of inventory.accounts) {
    if (account.systemIndex != null && !(account.systemIndex in createdSystemIds)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Conta "${account.username}" aponta para o sistema de índice ${account.systemIndex}, que não existe na lista enviada (${createdSystemIds.length} sistemas).`,
      });
    }
  }

  for (const [index, account] of inventory.accounts.entries()) {
    await tx.projectAutomationAccount.create({
      data: {
        projectId,
        username: account.username.trim(),
        projectTargetSystemId:
          account.systemIndex != null ? createdSystemIds[account.systemIndex] : null,
        accountType: account.accountType || null,
        ownerName: account.ownerName?.trim() || null,
        notes: account.notes?.trim() || null,
        order: index,
      },
    });
  }
}

// Formato cru devolvido pelo `select`/`include` de targetSystems em list/byId
// (ver Step 1 dos dois procedures abaixo).
type TargetSystemRow = {
  id: string;
  targetSystemId: string | null;
  customName: string | null;
  accessPoint: string | null;
  accessNotes: string | null;
  order: number;
  targetSystem: { name: string; category: { name: string } | null } | null;
};

// Achata ProjectTargetSystem para o formato de leitura do front. Descarta
// linhas sem nome resolvível (nem sistema do catálogo, nem customName) —
// dado inconsistente que só entraria por caminho fora do Zod de escrita
// (ver targetSystemInputSchema), nunca deve acontecer via formulário. Uma
// linha só com customName (sistema fora do catálogo) É válida e fica.
function mapTargetSystemsForView(systems: TargetSystemRow[]): ProjectTargetSystemView[] {
  return systems.flatMap((s) => {
    const name = s.targetSystem?.name || s.customName;
    // Sem nome resolvível (nem catálogo, nem customName): descarta. Não
    // acontece por uso legítimo do formulário, só por dado inconsistente.
    if (!name) return [];
    return [
      {
        id: s.id,
        targetSystemId: s.targetSystemId,
        name,
        categoryName: s.targetSystem?.category?.name ?? null,
        accessPoint: s.accessPoint,
        accessNotes: s.accessNotes,
        order: s.order,
      },
    ];
  });
}

// Formato cru devolvido pelo `select`/`include` de automationAccounts.
type AutomationAccountRow = {
  id: string;
  username: string;
  projectTargetSystemId: string | null;
  accountType: string | null;
  ownerName: string | null;
  notes: string | null;
  order: number;
  projectTargetSystem: {
    customName: string | null;
    targetSystem: { name: string } | null;
  } | null;
};

// Achata ProjectAutomationAccount para o formato de leitura do front.
function mapAutomationAccountsForView(
  accounts: AutomationAccountRow[]
): ProjectAutomationAccountView[] {
  return accounts.map((a) => ({
    id: a.id,
    username: a.username,
    projectTargetSystemId: a.projectTargetSystemId,
    systemName:
      a.projectTargetSystem?.targetSystem?.name ?? a.projectTargetSystem?.customName ?? null,
    accountType: a.accountType,
    ownerName: a.ownerName,
    notes: a.notes,
    order: a.order,
  }));
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
          solutionTypes: { select: { id: true, name: true, slug: true } },
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
        solutionTypes: p.solutionTypes,
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
        currentApplicationHosting: p.currentApplicationHosting ?? undefined,
        currentApplicationHostingCustom: p.currentApplicationHostingCustom ?? undefined,
        currentApplicationAuthor: p.currentApplicationAuthor ?? undefined,
        currentApplicationOwner: p.currentApplicationOwner ?? undefined,
        currentApplicationAccessLocation: p.currentApplicationAccessLocation ?? undefined,
        currentApplicationAccessReference: p.currentApplicationAccessReference ?? undefined,
        currentApplicationLiveSince: p.currentApplicationLiveSince ?? undefined,
        currentApplicationAssetId: p.currentApplicationAssetId ?? undefined,
        currentApplicationOwnerRole: p.currentApplicationOwnerRole ?? undefined,
        currentApplicationOwnerAreaId: p.currentApplicationOwnerAreaId ?? undefined,
        currentApplicationDataInput: p.currentApplicationDataInput ?? undefined,
        currentApplicationDataInputDetails: p.currentApplicationDataInputDetails ?? undefined,
        currentApplicationDataOutput: p.currentApplicationDataOutput ?? undefined,
        currentApplicationDataOutputDetails: p.currentApplicationDataOutputDetails ?? undefined,
        currentApplicationContingencyActions:
          (p.currentApplicationContingencyActions as string[] | null) ?? undefined,
        currentApplicationContingencyDetails:
          p.currentApplicationContingencyDetails ?? undefined,
        currentApplicationBackupOwner: p.currentApplicationBackupOwner ?? undefined,
        handlesSensitiveData: p.handlesSensitiveData ?? undefined,
        sensitiveDataCategories: (p.sensitiveDataCategories as string[] | null) ?? undefined,
        sensitiveDataDetails: p.sensitiveDataDetails ?? undefined,
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
          mainToolCategory: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
          peopleOfInterest: { include: { person: true } },
          ownerArea: { select: { id: true, name: true } },
          targetSystems: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              targetSystemId: true,
              customName: true,
              accessPoint: true,
              accessNotes: true,
              order: true,
              targetSystem: { select: { name: true, category: { select: { name: true } } } },
            },
          },
          automationAccounts: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              username: true,
              projectTargetSystemId: true,
              accountType: true,
              ownerName: true,
              notes: true,
              order: true,
              projectTargetSystem: {
                select: { customName: true, targetSystem: { select: { name: true } } },
              },
            },
          },
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
        currentApplicationHosting: project.currentApplicationHosting ?? undefined,
        currentApplicationHostingCustom: project.currentApplicationHostingCustom ?? undefined,
        currentApplicationAuthor: project.currentApplicationAuthor ?? undefined,
        currentApplicationOwner: project.currentApplicationOwner ?? undefined,
        currentApplicationAccessLocation: project.currentApplicationAccessLocation ?? undefined,
        currentApplicationAccessReference: project.currentApplicationAccessReference ?? undefined,
        currentApplicationLiveSince: project.currentApplicationLiveSince ?? undefined,
        currentApplicationAssetId: project.currentApplicationAssetId ?? undefined,
        currentApplicationOwnerRole: project.currentApplicationOwnerRole ?? undefined,
        currentApplicationOwnerAreaId: project.currentApplicationOwnerAreaId ?? undefined,
        currentApplicationOwnerAreaName: project.ownerArea?.name ?? undefined,
        currentApplicationDataInput: project.currentApplicationDataInput ?? undefined,
        currentApplicationDataInputDetails:
          project.currentApplicationDataInputDetails ?? undefined,
        currentApplicationDataOutput: project.currentApplicationDataOutput ?? undefined,
        currentApplicationDataOutputDetails:
          project.currentApplicationDataOutputDetails ?? undefined,
        currentApplicationContingencyActions:
          (project.currentApplicationContingencyActions as string[] | null) ?? undefined,
        currentApplicationContingencyDetails:
          project.currentApplicationContingencyDetails ?? undefined,
        currentApplicationBackupOwner: project.currentApplicationBackupOwner ?? undefined,
        handlesSensitiveData: project.handlesSensitiveData ?? undefined,
        sensitiveDataCategories:
          (project.sensitiveDataCategories as string[] | null) ?? undefined,
        sensitiveDataDetails: project.sensitiveDataDetails ?? undefined,
        targetSystems: mapTargetSystemsForView(project.targetSystems),
        automationAccounts: mapAutomationAccountsForView(project.automationAccounts),
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
        solutionTypes: project.solutionTypes,
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        mainToolCategory: project.mainToolCategory ?? undefined,
        mainToolCategoryId: project.mainToolCategoryId ?? undefined,
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
        // Ficha de sustentação da automação existente
        currentApplicationHosting: z.string().optional(),
        currentApplicationHostingCustom: z.string().optional(),
        currentApplicationAuthor: z.string().optional(),
        currentApplicationOwner: z.string().optional(),
        currentApplicationAccessLocation: z.string().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .optional(),
        currentApplicationLiveSince: z.date().optional(),
        currentApplicationAssetId: z.string().optional(),
        currentApplicationOwnerRole: z.string().optional(),
        currentApplicationOwnerAreaId: z.string().optional(),
        currentApplicationDataInput: z.string().optional(),
        currentApplicationDataInputDetails: z.string().optional(),
        currentApplicationDataOutput: z.string().optional(),
        currentApplicationDataOutputDetails: z.string().optional(),
        currentApplicationContingencyActions: z.array(z.string()).optional(),
        currentApplicationContingencyDetails: z.string().optional(),
        currentApplicationBackupOwner: z.string().optional(),
        handlesSensitiveData: z.string().optional(),
        sensitiveDataCategories: z.array(z.string()).optional(),
        sensitiveDataDetails: z.string().optional(),
        automationInventory: automationInventoryInputSchema.optional(),
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

      const project = await ctx.db.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            title: input.title,
            description: input.description ?? null,
            type: "OUTRO",
            category: "OUTRO",
            status: toPrismaStatus(input.status as FrontendProjectStatus),
            priority: input.priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
            clientId: input.clientId,
            developerId: toNullableFkId(input.developerId),
            companyId: toNullableFkId(input.companyId),
            areaId: toNullableFkId(input.areaId),
            themeId: toNullableFkId(input.themeId),
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
            currentApplicationHosting: input.currentApplicationHosting ?? null,
            currentApplicationHostingCustom: input.currentApplicationHostingCustom ?? null,
            currentApplicationAuthor: input.currentApplicationAuthor ?? null,
            currentApplicationOwner: input.currentApplicationOwner ?? null,
            currentApplicationAccessLocation: input.currentApplicationAccessLocation ?? null,
            currentApplicationAccessReference: input.currentApplicationAccessReference ?? null,
            currentApplicationLiveSince: input.currentApplicationLiveSince ?? null,
            currentApplicationAssetId: input.currentApplicationAssetId ?? null,
            currentApplicationOwnerRole: input.currentApplicationOwnerRole ?? null,
            currentApplicationOwnerAreaId: toNullableFkId(input.currentApplicationOwnerAreaId),
            currentApplicationDataInput: input.currentApplicationDataInput ?? null,
            currentApplicationDataInputDetails: input.currentApplicationDataInputDetails ?? null,
            currentApplicationDataOutput: input.currentApplicationDataOutput ?? null,
            currentApplicationDataOutputDetails: input.currentApplicationDataOutputDetails ?? null,
            currentApplicationContingencyActions: input.currentApplicationContingencyActions ?? undefined,
            currentApplicationContingencyDetails: input.currentApplicationContingencyDetails ?? null,
            currentApplicationBackupOwner: input.currentApplicationBackupOwner ?? null,
            handlesSensitiveData: input.handlesSensitiveData ?? null,
            sensitiveDataCategories: input.sensitiveDataCategories ?? undefined,
            sensitiveDataDetails: input.sensitiveDataDetails ?? null,
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
        if (input.automationInventory) {
          await replaceAutomationInventory(tx, created.id, input.automationInventory);
        }
        return created;
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
        solutionTypeIds: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        mainToolCategoryId: z.string().nullable().optional(),
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
        // null = volta a herdar SystemSettings.defaultMaintenanceHoursPerWeek.
        // Aceita fração (0.5h/semana é uma estimativa legítima), por isso não é int.
        maintenanceHoursPerWeek: z.number().min(0).nullable().optional(),
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
        currentApplicationHosting: z.string().nullable().optional(),
        currentApplicationHostingCustom: z.string().nullable().optional(),
        currentApplicationAuthor: z.string().nullable().optional(),
        currentApplicationOwner: z.string().nullable().optional(),
        currentApplicationAccessLocation: z.string().nullable().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .nullable()
          .optional(),
        currentApplicationLiveSince: z.date().nullable().optional(),
        currentApplicationAssetId: z.string().optional(),
        currentApplicationOwnerRole: z.string().optional(),
        currentApplicationOwnerAreaId: z.string().optional(),
        currentApplicationDataInput: z.string().optional(),
        currentApplicationDataInputDetails: z.string().optional(),
        currentApplicationDataOutput: z.string().optional(),
        currentApplicationDataOutputDetails: z.string().optional(),
        currentApplicationContingencyActions: z.array(z.string()).optional(),
        currentApplicationContingencyDetails: z.string().optional(),
        currentApplicationBackupOwner: z.string().optional(),
        handlesSensitiveData: z.string().optional(),
        sensitiveDataCategories: z.array(z.string()).optional(),
        sensitiveDataDetails: z.string().optional(),
        automationInventory: automationInventoryInputSchema.optional(),
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
      // Todo id de FK passa por toNullableFkId: os Selects mandam "" quando
      // nada foi escolhido, e "" numa coluna FK viola a constraint no Postgres.
      if (rest.developerId !== undefined) data.developerId = toNullableFkId(rest.developerId);
      if (rest.companyId !== undefined) data.companyId = toNullableFkId(rest.companyId);
      if (rest.areaId !== undefined) data.areaId = toNullableFkId(rest.areaId);
      if (rest.themeId !== undefined) data.themeId = toNullableFkId(rest.themeId);
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypeIds !== undefined) {
        data.solutionTypes = { set: rest.solutionTypeIds.map((id) => ({ id })) };
      }
      if (rest.mainToolId !== undefined) data.mainToolId = toNullableFkId(rest.mainToolId);
      if (rest.mainToolCategoryId !== undefined)
        data.mainToolCategoryId = toNullableFkId(rest.mainToolCategoryId);
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
      if (rest.maintenanceHoursPerWeek !== undefined)
        data.maintenanceHoursPerWeek = rest.maintenanceHoursPerWeek;
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
      if (rest.currentApplicationHosting !== undefined)
        data.currentApplicationHosting = rest.currentApplicationHosting;
      if (rest.currentApplicationHostingCustom !== undefined)
        data.currentApplicationHostingCustom = rest.currentApplicationHostingCustom;
      if (rest.currentApplicationAuthor !== undefined)
        data.currentApplicationAuthor = rest.currentApplicationAuthor;
      if (rest.currentApplicationOwner !== undefined)
        data.currentApplicationOwner = rest.currentApplicationOwner;
      if (rest.currentApplicationAccessLocation !== undefined)
        data.currentApplicationAccessLocation = rest.currentApplicationAccessLocation;
      if (rest.currentApplicationAccessReference !== undefined)
        data.currentApplicationAccessReference = rest.currentApplicationAccessReference;
      if (rest.currentApplicationLiveSince !== undefined)
        data.currentApplicationLiveSince = rest.currentApplicationLiveSince;
      if (rest.currentApplicationAssetId !== undefined)
        data.currentApplicationAssetId = rest.currentApplicationAssetId;
      if (rest.currentApplicationOwnerRole !== undefined)
        data.currentApplicationOwnerRole = rest.currentApplicationOwnerRole;
      if (rest.currentApplicationOwnerAreaId !== undefined)
        data.currentApplicationOwnerAreaId = toNullableFkId(rest.currentApplicationOwnerAreaId);
      if (rest.currentApplicationDataInput !== undefined)
        data.currentApplicationDataInput = rest.currentApplicationDataInput;
      if (rest.currentApplicationDataInputDetails !== undefined)
        data.currentApplicationDataInputDetails = rest.currentApplicationDataInputDetails;
      if (rest.currentApplicationDataOutput !== undefined)
        data.currentApplicationDataOutput = rest.currentApplicationDataOutput;
      if (rest.currentApplicationDataOutputDetails !== undefined)
        data.currentApplicationDataOutputDetails = rest.currentApplicationDataOutputDetails;
      if (rest.currentApplicationContingencyActions !== undefined)
        data.currentApplicationContingencyActions = rest.currentApplicationContingencyActions;
      if (rest.currentApplicationContingencyDetails !== undefined)
        data.currentApplicationContingencyDetails = rest.currentApplicationContingencyDetails;
      if (rest.currentApplicationBackupOwner !== undefined)
        data.currentApplicationBackupOwner = rest.currentApplicationBackupOwner;
      if (rest.handlesSensitiveData !== undefined)
        data.handlesSensitiveData = rest.handlesSensitiveData;
      if (rest.sensitiveDataCategories !== undefined)
        data.sensitiveDataCategories = rest.sensitiveDataCategories;
      if (rest.sensitiveDataDetails !== undefined)
        data.sensitiveDataDetails = rest.sensitiveDataDetails;
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

      const project = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.project.update({
          where: { id },
          data,
        });
        if (rest.automationInventory) {
          await replaceAutomationInventory(tx, updated.id, rest.automationInventory);
        }
        return updated;
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

  // Agregação de projetos por categoria de ferramenta (contagem), mesmo
  // padrão de getAreaSummary mas agrupado por mainToolCategoryId — usado pela
  // aba "Resumo Executivo" da Priorização. adminProcedure pelo mesmo motivo
  // de segurança (contagem por ferramenta é dado interno do diagnóstico).
  // Agrupa por CATEGORIA, não pelo produto específico (mainToolId), porque a
  // categoria é o campo "principal" agora — muitos projetos vão ter só ela
  // preenchida, sem produto específico.
  getToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolCategoryId"],
        _count: true,
        where: {
          mainToolCategoryId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const categoryIds = grouped
        .map((g) => g.mainToolCategoryId)
        .filter((id): id is string => id != null);

      const categories = await ctx.db.mainToolCategory.findMany({
        where: { id: { in: categoryIds } },
      });
      const categoryById = new Map(categories.map((c) => [c.id, c]));

      return grouped
        .filter((g) => g.mainToolCategoryId != null && categoryById.has(g.mainToolCategoryId))
        .map((g) => {
          const category = categoryById.get(g.mainToolCategoryId as string)!;
          return {
            toolId: category.id,
            toolName: category.name,
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
            maintenanceHoursPerWeek: true,
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
          maintenanceHoursPerWeek: p.maintenanceHoursPerWeek,
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
            currentApplicationHosting: true,
            currentApplicationHostingCustom: true,
            currentApplicationOwner: true,
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
          currentApplicationHosting: p.currentApplicationHosting,
          currentApplicationHostingCustom: p.currentApplicationHostingCustom,
          currentApplicationOwner: p.currentApplicationOwner,
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

  // Resumo por categoria de ferramenta das automações já existentes/entregues
  // — mesmo padrão de getToolSummary, com o filtro invertido (igual
  // getExistingAutomationsAreaSummary faz para área).
  getExistingAutomationsToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolCategoryId"],
        _count: true,
        where: {
          mainToolCategoryId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const categoryIds = grouped
        .map((g) => g.mainToolCategoryId)
        .filter((id): id is string => id != null);

      const categories = await ctx.db.mainToolCategory.findMany({
        where: { id: { in: categoryIds } },
      });
      const categoryById = new Map(categories.map((c) => [c.id, c]));

      return grouped
        .filter((g) => g.mainToolCategoryId != null && categoryById.has(g.mainToolCategoryId))
        .map((g) => {
          const category = categoryById.get(g.mainToolCategoryId as string)!;
          return {
            toolId: category.id,
            toolName: category.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Contagem de projetos de uma empresa sem área/ferramenta definida,
  // separados em pipeline/entregues — usado pela aba "Resumo por Área" (só os
  // dois campos de área) e pela aba "Resumo Executivo" (os quatro campos) da
  // Priorização, pra avisar que esses projetos ficam fora dos resumos
  // correspondentes (que filtram areaId/mainToolId: { not: null }). Mesmos
  // filtros exatos de getPrioritizedRanking/getExistingAutomationsRanking, só
  // invertendo a condição de areaId/mainToolId.
  getAreaSummaryGaps: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool] =
        await Promise.all([
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
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolCategoryId: null,
              hasCurrentApplication: { not: "sim" },
              status: { notIn: ["DONE", "CANCELLED"] },
            },
          }),
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolCategoryId: null,
              OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
            },
          }),
        ]);
      return { pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool };
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
        currentApplicationHosting: z.string().optional(),
        currentApplicationHostingCustom: z.string().optional(),
        currentApplicationAuthor: z.string().optional(),
        currentApplicationOwner: z.string().optional(),
        currentApplicationAccessLocation: z.string().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .optional(),
        currentApplicationLiveSince: z.coerce.date().optional(),
        currentApplicationAssetId: z.string().optional(),
        currentApplicationOwnerRole: z.string().optional(),
        // Nome, não id: igual a areaName/themeName logo abaixo, resolvido via
        // findOrCreateProjectArea (mesma tabela ProjectArea de `area`, relação
        // diferente). O id não sobrevive a um XML gerado por outra base.
        currentApplicationOwnerAreaName: z.string().optional(),
        currentApplicationDataInput: z.string().optional(),
        currentApplicationDataInputDetails: z.string().optional(),
        currentApplicationDataOutput: z.string().optional(),
        currentApplicationDataOutputDetails: z.string().optional(),
        currentApplicationContingencyActions: z.array(z.string()).optional(),
        currentApplicationContingencyDetails: z.string().optional(),
        currentApplicationBackupOwner: z.string().optional(),
        handlesSensitiveData: z.string().optional(),
        sensitiveDataCategories: z.array(z.string()).optional(),
        sensitiveDataDetails: z.string().optional(),
        automationInventory: automationInventoryInputSchema.optional(),
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
        mainToolCategoryName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
        complexity: z.string().optional(),
        robotSchedule: z.string().optional(),
        hourlyRateBRL: z.number().optional(),
        estimatedAnnualSavingBRL: z.number().optional(),
        executionStrategy: z.string().optional(),
        solutionTypeNames: z.array(z.string()).optional(),
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
      if (input.currentApplicationHosting !== undefined)
        data.currentApplicationHosting = input.currentApplicationHosting;
      if (input.currentApplicationHostingCustom !== undefined)
        data.currentApplicationHostingCustom = input.currentApplicationHostingCustom;
      if (input.currentApplicationAuthor !== undefined)
        data.currentApplicationAuthor = input.currentApplicationAuthor;
      if (input.currentApplicationOwner !== undefined)
        data.currentApplicationOwner = input.currentApplicationOwner;
      if (input.currentApplicationAccessLocation !== undefined)
        data.currentApplicationAccessLocation = input.currentApplicationAccessLocation;
      if (input.currentApplicationAccessReference !== undefined)
        data.currentApplicationAccessReference = input.currentApplicationAccessReference;
      if (input.currentApplicationLiveSince !== undefined)
        data.currentApplicationLiveSince = input.currentApplicationLiveSince;
      if (input.currentApplicationAssetId !== undefined)
        data.currentApplicationAssetId = input.currentApplicationAssetId;
      if (input.currentApplicationOwnerRole !== undefined)
        data.currentApplicationOwnerRole = input.currentApplicationOwnerRole;
      if (input.currentApplicationDataInput !== undefined)
        data.currentApplicationDataInput = input.currentApplicationDataInput;
      if (input.currentApplicationDataInputDetails !== undefined)
        data.currentApplicationDataInputDetails = input.currentApplicationDataInputDetails;
      if (input.currentApplicationDataOutput !== undefined)
        data.currentApplicationDataOutput = input.currentApplicationDataOutput;
      if (input.currentApplicationDataOutputDetails !== undefined)
        data.currentApplicationDataOutputDetails = input.currentApplicationDataOutputDetails;
      if (input.currentApplicationContingencyActions !== undefined)
        data.currentApplicationContingencyActions = input.currentApplicationContingencyActions;
      if (input.currentApplicationContingencyDetails !== undefined)
        data.currentApplicationContingencyDetails = input.currentApplicationContingencyDetails;
      if (input.currentApplicationBackupOwner !== undefined)
        data.currentApplicationBackupOwner = input.currentApplicationBackupOwner;
      if (input.handlesSensitiveData !== undefined)
        data.handlesSensitiveData = input.handlesSensitiveData;
      if (input.sensitiveDataCategories !== undefined)
        data.sensitiveDataCategories = input.sensitiveDataCategories;
      if (input.sensitiveDataDetails !== undefined)
        data.sensitiveDataDetails = input.sensitiveDataDetails;
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
      if (input.mainToolCategoryName !== undefined) {
        const category = await findOrCreateMainToolCategory(ctx.db, input.mainToolCategoryName, warnings);
        if (category) data.mainToolCategoryId = category.id;
      }
      if (input.solutionTypeNames !== undefined) {
        const resolvedKinds = [];
        for (const name of input.solutionTypeNames) {
          const kind = await findOrCreateProjectKind(ctx.db, name, warnings);
          if (kind) resolvedKinds.push(kind);
        }
        data.solutionTypes = { set: resolvedKinds.map((k) => ({ id: k.id })) };
      }
      // Mesma tabela ProjectArea de `area`/`areaName` acima, relação diferente
      // (currentApplicationOwnerAreaId = "setor do responsável", não a área do
      // processo) — reaproveita o mesmo find-or-create por nome.
      if (input.currentApplicationOwnerAreaName !== undefined) {
        const ownerArea = await findOrCreateProjectArea(
          ctx.db,
          input.currentApplicationOwnerAreaName,
          warnings
        );
        if (ownerArea) data.currentApplicationOwnerAreaId = ownerArea.id;
      }

      // Mesmo padrão de create/update: sistemas/contas viajam com o projeto
      // dentro da MESMA transação. `input.automationInventory` só existe
      // quando o consumidor (project-xml-import-export.tsx, via
      // toAutomationInventoryInput) decidiu enviá-lo — omitido, PRESERVA o
      // inventário atual; ver a regra omitir-vs-apagar documentada ali.
      await ctx.db.$transaction(async (tx) => {
        await tx.project.update({ where: { id: input.projectId }, data });
        if (input.automationInventory) {
          await replaceAutomationInventory(tx, input.projectId, input.automationInventory);
        }
      });

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
