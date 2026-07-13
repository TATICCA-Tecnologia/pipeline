"use client";

import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate, formatCurrency } from "@/shared/utils";
import { DetailSection, FieldRow } from "@/shared/components/detail-section";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

function formatRating(value: number | null | undefined): string | undefined {
  return value != null ? `${value}/5` : undefined;
}

export function ProjectDetailSections({
  project,
  viewerRole,
}: {
  project: Project;
  viewerRole: UserRole | undefined;
}) {
  const statusConfig = STATUS_CONFIG[project.status];
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (key) => SOLUTION_TYPES.find((s) => s.value === key)?.label ?? key
  );

  return (
    <div className="space-y-6">
      <DetailSection title="Básico">
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Título" value={project.title} />
        <FieldRow label="Descrição" value={project.description} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={project.companyName} />
        <FieldRow label="Cliente (ID)" value={project.clientId} />
        <FieldRow label="Desenvolvedor (ID)" value={project.developerId} />
        <FieldRow label="Criado em" value={formatDate(project.createdAt)} />
        <FieldRow label="Última atualização" value={formatDate(project.updatedAt)} />
      </DetailSection>

      <DetailSection title="Envolvidos & contexto atual">
        <FieldRow label="Público-alvo" value={project.targetAudience} />
        <FieldRow label="Usuários esperados" value={project.expectedUsers} />
        <FieldRow
          label="Processo/sistema existente"
          value={resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS)}
        />
        <FieldRow label="Detalhes do processo atual" value={project.existingSystemDetails} />
        <FieldRow
          label="Aplicação existente hoje"
          value={resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)}
        />
        <FieldRow
          label="Detalhes da aplicação existente"
          value={project.currentApplicationDetails}
        />
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
        <FieldRow label="Colaboradores envolvidos" value={project.peopleInvolved} />
        <FieldRow label="Detalhes dos colaboradores" value={project.peopleInvolvedDetails} />
        <FieldRow label="Duração por execução (horas)" value={project.taskDurationHours} />
        <FieldRow
          label="Periodicidade"
          value={resolveLabel(project.processFrequency, PROCESS_FREQUENCIES)}
        />
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <DetailSection title="Funcionalidades & benefícios">
        <FieldRow label="Funcionalidades" value={project.features} />
        <FieldRow label="Benefícios esperados" value={benefitLabels} />
        <FieldRow label="Detalhes dos benefícios" value={project.benefitsDetails} />
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
        <FieldRow label="Narrativa do processo" value={project.projectNarrative} />
        <FieldRow label="Urgência" value={resolveLabel(project.urgency, URGENCY_LEVELS)} />
        <FieldRow
          label="Prazo limite"
          value={project.estimatedDeadline ? formatDate(project.estimatedDeadline) : undefined}
        />
        <FieldRow label="Informações adicionais" value={project.additionalInfo} />
      </DetailSection>

      {canSeeTechnical && (
        <DetailSection title="Diagnóstico técnico">
          <FieldRow
            label="Complexidade"
            value={resolveLabel(project.complexity, COMPLEXITY_LEVELS)}
          />
          <FieldRow label="Ferramenta principal" value={resolveLabel(project.mainTool, MAIN_TOOLS)} />
          <FieldRow
            label="Estratégia de execução"
            value={resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES)}
          />
          <FieldRow label="Notas do arquiteto" value={project.architectNotes} />
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
