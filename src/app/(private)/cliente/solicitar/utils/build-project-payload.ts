import type { Project } from "@/shared/types";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import { PLATFORMS } from "./solicitar.utils";

export type ProjectPayload = Omit<Project, "id" | "createdAt" | "updatedAt">;

export function buildProjectPayload(params: {
  data: SolicitarProjetoFormData;
  features: string[];
  benefits: string[];
  clientId: string;
  companyId: string | undefined;
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
}): ProjectPayload {
  const { data, features, benefits, clientId, companyId, areas, themesByArea, buildTypeLabel } =
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

  const platformLabel = PLATFORMS.find((p) => p.value === data.platform)?.label ?? data.platform;
  const projectTypeWithPlatform = `${typeLabel} · Plataforma: ${platformLabel}`;

  const targetAudienceValue =
    data.targetAudience === "outro" ? data.customTargetAudience.trim() : data.targetAudience;

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
    hasExistingSystem: data.hasExistingSystem || undefined,
    existingSystemDetails: data.existingSystemDetails || undefined,
    hasCurrentApplication: data.hasCurrentApplication || undefined,
    currentApplicationDetails: data.currentApplicationDetails || undefined,
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
    taskDurationHours:
      taskDurationHoursValue !== undefined && Number.isFinite(taskDurationHoursValue)
        ? taskDurationHoursValue
        : undefined,
    processFrequency: data.processFrequency || undefined,
  };
}
