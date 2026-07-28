"use client";

import { trpc } from "@/shared/trpc/client";
import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { formatDate, formatCurrency } from "@/shared/utils";
import { DetailSection, FieldRow } from "@/shared/components/detail-section";
import { useState } from "react";
import { Button } from "@/src/shared/components/ui/button";
import { Pencil } from "lucide-react";
import { ProjectRequestEditForm } from "@/shared/components/project-request-edit-form";
import { ProjectPeopleOfInterestCard } from "@/shared/components/project-people-of-interest-card";
import { ProjectXmlImportExport } from "@/shared/components/project-xml-import-export";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveCurrentApplicationHostingLabel,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

function formatRating(value: number | null | undefined): string | undefined {
  return value != null ? `${value}/5` : undefined;
}

export function ProjectDetailSections({
  project,
  viewerRole,
  currentUserId,
  allowEdit = false,
}: {
  project: Project;
  viewerRole: UserRole | undefined;
  currentUserId?: string;
  allowEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const urgencyLevelOptions = dbUrgencyLevels.map((u) => ({ value: u.slug, label: u.name }));
  const statusConfig = STATUS_CONFIG[project.status] ?? {
    label: project.status,
    color: "bg-muted",
  };
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";
  const isArchitect = viewerRole === "admin" || viewerRole === "super_admin";
  const isOwner = !!currentUserId && project.clientId === currentUserId;
  // `ProjectStatus` (shared/types) doesn't include "cancelled" yet, even though the
  // backend (server/trpc/mappers.ts FrontendProjectStatus) already supports it — widen
  // to string here rather than expanding the shared union as part of this task.
  const projectStatus = project.status as string;
  const canEdit =
    allowEdit &&
    (isArchitect || (isOwner && projectStatus !== "completed" && projectStatus !== "cancelled"));

  if (isEditing) {
    return (
      <ProjectRequestEditForm
        project={project}
        viewerRole={viewerRole}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    );
  }

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );
  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);
  // A seção só aparece quando há algo preenchido — projetos que não são
  // automações existentes não ganham um card vazio de "Não informado".
  const hasSustentacaoData = Boolean(
    project.currentApplicationHosting ||
      project.currentApplicationHostingCustom ||
      project.currentApplicationAuthor ||
      project.currentApplicationOwner ||
      project.currentApplicationAccessLocation ||
      project.currentApplicationAccessReference ||
      project.currentApplicationLiveSince
  );

  return (
    <div className="space-y-6">
      {(canEdit || canSeeTechnical) && (
        <div className="flex justify-end gap-2">
          {canSeeTechnical && <ProjectXmlImportExport project={project} />}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </div>
      )}

      <DetailSection title="Básico">
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Título" value={maskFreeText(project.title)} />
        <FieldRow label="Descrição" value={maskFreeText(project.description)} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={maskCompanyName(project.companyId, project.companyName)} />
        <FieldRow label="Cliente (ID)" value={project.clientId} />
        <FieldRow label="Desenvolvedor (ID)" value={project.developerId} />
        <FieldRow label="Criado em" value={formatDate(project.createdAt)} />
        <FieldRow label="Última atualização" value={formatDate(project.updatedAt)} />
      </DetailSection>

      <DetailSection title="Envolvidos & contexto atual">
        <FieldRow label="Público-alvo" value={maskFreeText(project.targetAudience)} />
        <FieldRow label="Usuários esperados" value={project.expectedUsers} />
        <FieldRow
          label="Processo/sistema existente"
          value={resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS)}
        />
        <FieldRow label="Detalhes do processo atual" value={maskFreeText(project.existingSystemDetails)} />
        <FieldRow
          label="Aplicação existente hoje"
          value={resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)}
        />
        <FieldRow
          label="Detalhes da aplicação existente"
          value={maskFreeText(project.currentApplicationDetails)}
        />
      </DetailSection>

      {hasSustentacaoData && (
        <DetailSection title="Sustentação & acessos">
          <FieldRow
            label="Onde a automação roda"
            value={resolveCurrentApplicationHostingLabel(
              project.currentApplicationHosting,
              maskFreeText(project.currentApplicationHostingCustom)
            )}
          />
          <FieldRow
            label="Quem desenvolveu"
            value={maskFreeText(project.currentApplicationAuthor)}
          />
          <FieldRow
            label="Responsável hoje"
            value={maskFreeText(project.currentApplicationOwner)}
          />
          <FieldRow
            label="Onde ficam os acessos"
            value={resolveLabel(
              project.currentApplicationAccessLocation,
              CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS
            )}
          />
          <FieldRow
            label="Onde encontrar"
            value={maskFreeText(project.currentApplicationAccessReference)}
          />
          <FieldRow
            label="Em produção desde"
            value={
              project.currentApplicationLiveSince
                ? formatDate(new Date(project.currentApplicationLiveSince))
                : undefined
            }
          />
        </DetailSection>
      )}

      <DetailSection title="Diagnóstico operacional">
        <FieldRow label="Colaboradores envolvidos" value={project.peopleInvolved} />
        <FieldRow label="Detalhes dos colaboradores" value={maskFreeText(project.peopleInvolvedDetails)} />
        <FieldRow label="Duração por execução (horas)" value={project.taskDurationHours} />
        <FieldRow
          label="Periodicidade"
          value={resolveLabel(project.processFrequency, PROCESS_FREQUENCIES)}
        />
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <ProjectPeopleOfInterestCard project={project} canEdit={canEdit} />

      <DetailSection title="Funcionalidades & benefícios">
        <FieldRow label="Funcionalidades" value={project.features} />
        <FieldRow label="Benefícios esperados" value={benefitLabels} />
        <FieldRow label="Detalhes dos benefícios" value={maskFreeText(project.benefitsDetails)} />
        <FieldRow label="Horas economizadas por mês" value={project.monthlyHoursSaved} />
      </DetailSection>

      <DetailSection title="Avaliações">
        <FieldRow label="Redução de erros" value={formatRating(project.ratingErrorReduction)} />
        <FieldRow
          label="Criticidade do processo"
          value={formatRating(project.ratingProcessCriticality)}
        />
        <FieldRow label="Impacto interno" value={formatRating(project.ratingInternalImpact)} />
        <FieldRow label="Impacto externo" value={formatRating(project.ratingExternalImpact)} />
        <FieldRow
          label="Atendimento a políticas"
          value={formatRating(project.ratingCompliance)}
        />
      </DetailSection>

      <DetailSection title="Narrativa & prazo">
        <FieldRow label="Narrativa do processo" value={maskFreeText(project.projectNarrative)} />
        <FieldRow label="Urgência" value={resolveLabel(project.urgency, urgencyLevelOptions)} />
        <FieldRow
          label="Prazo limite"
          value={project.estimatedDeadline ? formatDate(project.estimatedDeadline) : undefined}
        />
        <FieldRow label="Informações adicionais" value={maskFreeText(project.additionalInfo)} />
      </DetailSection>

      {canSeeTechnical && (
        <DetailSection title="Diagnóstico técnico">
          <FieldRow
            label="Complexidade"
            value={resolveLabel(project.complexity, COMPLEXITY_LEVELS)}
          />
          <FieldRow
            label="Ferramenta principal"
            value={
              [project.mainToolCategory?.name, project.mainTool?.name].filter(Boolean).join(" — ") ||
              undefined
            }
          />
          <FieldRow
            label="Estratégia de execução"
            value={resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES)}
          />
          <FieldRow label="Notas do arquiteto" value={maskFreeText(project.architectNotes)} />
          <FieldRow label="Tipos de solução" value={solutionTypeLabels} />
          <FieldRow
            label="Economia anual estimada"
            value={
              project.estimatedAnnualSavingBRL != null
                ? formatCurrency(project.estimatedAnnualSavingBRL)
                : undefined
            }
          />
        </DetailSection>
      )}
    </div>
  );
}
