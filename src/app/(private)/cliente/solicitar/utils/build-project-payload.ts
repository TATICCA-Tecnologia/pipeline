import type { Project } from "@/shared/types";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import { PLATFORMS } from "./solicitar.utils";

// `Project` (shared/types) só expõe `targetSystems`/`automationAccounts` como
// arrays de leitura já resolvidos pelo servidor; o payload de escrita usa o
// formato de entrada da mutation (`automationInventory`, contas por índice de
// sistema), por isso é preciso estender aqui em vez de reaproveitar o tipo de leitura.
// `targetSystems`/`automationAccounts` são removidos de propósito, não por
// descuido: eles existem em `Project` como visão de LEITURA (já resolvida, com
// id e sistema como objeto), e o input da mutation só conhece
// `automationInventory` (contas por índice). Se continuassem aqui, escrever
// `targetSystems: project.targetSystems` no payload compilaria — e o `z.object`
// do servidor descartaria o campo em silêncio, gravando nada. Removê-los
// transforma esse engano em erro de compilação.
export type ProjectPayload = Omit<
  Project,
  "id" | "createdAt" | "updatedAt" | "targetSystems" | "automationAccounts"
> & {
  automationInventory?: ReturnType<typeof buildAutomationInventory>;
};

export function buildProjectPayload(params: {
  data: SolicitarProjetoFormData;
  features: string[];
  benefits: string[];
  clientId: string;
  companyId: string | undefined;
  areaId?: string;
  themeId?: string;
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
}): ProjectPayload {
  const { data, features, benefits, clientId, companyId, areaId, themeId, areas, themesByArea, buildTypeLabel } =
    params;

  const areaLabel =
    data.projectArea === "outro"
      ? data.customProjectArea.trim()
      : areas.find((a) => a.value === data.projectArea)?.label ?? "";
  const themeLabel =
    data.projectTheme === "outro"
      ? data.customProjectTheme.trim()
      : (themesByArea[data.projectArea] ?? []).find((t) => t.value === data.projectTheme)
          ?.label ?? "";
  const typeLabel =
    data.projectArea === "outro" || data.projectTheme === "outro"
      ? [areaLabel, themeLabel].filter(Boolean).join(" - ") || "Outro"
      : buildTypeLabel(data.projectArea, data.projectTheme);

  const platformLabel =
    data.platform === "outro"
      ? data.customPlatform.trim()
      : PLATFORMS.find((p) => p.value === data.platform)?.label ?? data.platform;
  const projectTypeWithPlatform = `${typeLabel} · Plataforma: ${platformLabel}`;

  const targetAudienceValue =
    data.targetAudience === "outro" ? data.customTargetAudience.trim() : data.targetAudience;

  const hasExistingSystemValue =
    data.hasExistingSystem === "outro"
      ? data.customHasExistingSystem.trim()
      : data.hasExistingSystem;
  const hasCurrentApplicationValue =
    data.hasCurrentApplication === "outro"
      ? data.customHasCurrentApplication.trim()
      : data.hasCurrentApplication;
  const processFrequencyValue =
    data.processFrequency === "outro"
      ? data.customProcessFrequency.trim()
      : data.processFrequency;

  const monthlyHours = data.monthlyHoursSaved ? Number(data.monthlyHoursSaved) : undefined;
  const peopleInvolvedValue = data.peopleInvolved ? Number(data.peopleInvolved) : undefined;
  const taskDurationHoursValue = data.taskDurationHours
    ? Number(data.taskDurationHours)
    : undefined;

  return {
    title: data.title,
    description: data.description,
    clientId,
    companyId,
    areaId,
    themeId,
    status: "backlog",
    priority:
      data.urgency === "urgente"
        ? "urgent"
        : data.urgency === "alta"
          ? "high"
          : data.urgency === "baixa"
            ? "low"
            : "medium",
    projectType: projectTypeWithPlatform,
    targetAudience: targetAudienceValue,
    expectedUsers: data.expectedUsers,
    urgency: data.urgency,
    features,
    estimatedDeadline: data.deadline ? new Date(data.deadline) : undefined,
    additionalInfo: data.additionalInfo || undefined,
    hasExistingSystem: hasExistingSystemValue || undefined,
    existingSystemDetails: data.existingSystemDetails || undefined,
    hasCurrentApplication: hasCurrentApplicationValue || undefined,
    currentApplicationDetails: data.currentApplicationDetails || undefined,
    currentApplicationHosting: data.currentApplicationHosting || undefined,
    currentApplicationHostingCustom: data.currentApplicationHostingCustom || undefined,
    currentApplicationAuthor: data.currentApplicationAuthor || undefined,
    currentApplicationOwner: data.currentApplicationOwner || undefined,
    currentApplicationAccessLocation: data.currentApplicationAccessLocation || undefined,
    currentApplicationAccessReference: data.currentApplicationAccessReference || undefined,
    currentApplicationLiveSince: data.currentApplicationLiveSince
      ? new Date(data.currentApplicationLiveSince)
      : undefined,
    currentApplicationAssetId: data.currentApplicationAssetId || undefined,
    currentApplicationOwnerRole: data.currentApplicationOwnerRole || undefined,
    currentApplicationOwnerAreaId: data.currentApplicationOwnerAreaId || undefined,
    currentApplicationDataInput: data.currentApplicationDataInput || undefined,
    currentApplicationDataInputDetails: data.currentApplicationDataInputDetails || undefined,
    currentApplicationDataOutput: data.currentApplicationDataOutput || undefined,
    currentApplicationDataOutputDetails: data.currentApplicationDataOutputDetails || undefined,
    currentApplicationContingencyActions: data.currentApplicationContingencyActions?.length
      ? data.currentApplicationContingencyActions
      : undefined,
    currentApplicationContingencyDetails: data.currentApplicationContingencyDetails || undefined,
    currentApplicationBackupOwner: data.currentApplicationBackupOwner || undefined,
    handlesSensitiveData: data.handlesSensitiveData || undefined,
    sensitiveDataCategories: data.sensitiveDataCategories?.length
      ? data.sensitiveDataCategories
      : undefined,
    sensitiveDataDetails: data.sensitiveDataDetails || undefined,
    automationInventory: buildAutomationInventory(data),
    projectNarrative: data.projectNarrative || undefined,
    benefits: benefits.length ? benefits : undefined,
    benefitsDetails: data.benefitsDetails || undefined,
    monthlyHoursSaved: Number.isFinite(monthlyHours) ? monthlyHours : undefined,
    ratingErrorReduction: data.ratingErrorReduction ?? undefined,
    ratingProcessCriticality: data.ratingProcessCriticality ?? undefined,
    ratingInternalImpact: data.ratingInternalImpact ?? undefined,
    ratingExternalImpact: data.ratingExternalImpact ?? undefined,
    ratingCompliance: data.ratingCompliance ?? undefined,
    peopleInvolved:
      peopleInvolvedValue !== undefined && Number.isFinite(peopleInvolvedValue)
        ? peopleInvolvedValue
        : undefined,
    peopleInvolvedDetails: data.peopleInvolvedDetails || undefined,
    taskDurationHours:
      taskDurationHoursValue !== undefined && Number.isFinite(taskDurationHoursValue)
        ? taskDurationHoursValue
        : undefined,
    processFrequency: processFrequencyValue || undefined,
  };
}

function buildAutomationInventory(data: SolicitarProjetoFormData) {
  const systems = (data.targetSystems ?? []).filter(
    (s) => s.targetSystemId || s.customName.trim()
  );
  // O índice precisa apontar para a lista JÁ FILTRADA: descartar uma linha vazia
  // no meio desloca todas as seguintes, e as contas passariam a apontar para o
  // sistema errado — em silêncio, sem erro.
  const indexMap = new Map<number, number>();
  (data.targetSystems ?? []).forEach((s, original) => {
    if (s.targetSystemId || s.customName.trim()) indexMap.set(original, indexMap.size);
  });

  const accounts = (data.automationAccounts ?? [])
    .filter((a) => a.username.trim())
    .map((a) => ({
      username: a.username.trim(),
      systemIndex: a.systemIndex != null ? indexMap.get(a.systemIndex) : undefined,
      accountType: a.accountType || undefined,
      ownerName: a.ownerName || undefined,
      notes: a.notes || undefined,
    }));

  if (systems.length === 0 && accounts.length === 0) return undefined;
  return {
    systems: systems.map((s) => ({
      targetSystemId: s.targetSystemId || undefined,
      customName: s.customName.trim() || undefined,
      accessPoint: s.accessPoint || undefined,
      accessNotes: s.accessNotes || undefined,
    })),
    accounts,
  };
}
