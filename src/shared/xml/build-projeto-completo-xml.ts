import type { Project } from "@/shared/types";
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : escapeXml(String(value));
  return `  <${name}>${text}</${name}>`;
}

function listTag(groupName: string, itemName: string, items: string[]): string {
  const inner = items.map((item) => `    <${itemName}>${escapeXml(item)}</${itemName}>`).join("\n");
  return `  <${groupName}>\n${inner}\n  </${groupName}>`;
}

function labelForBenefit(key: string): string {
  return BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key;
}

function formatDeadline(date: Date | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildProjetoCompletoXml(project: Project): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<projetoCompleto>");
  lines.push(tag("projetoId", project.id));
  lines.push(tag("empresa", project.companyName));
  lines.push(tag("titulo", project.title));
  lines.push(tag("area", project.area?.name));
  lines.push(tag("tema", project.theme?.name));
  lines.push(tag("plataforma", resolveLabel(project.platform, PLATFORMS)));
  lines.push(tag("descricao", project.description));
  lines.push(tag("publicoAlvo", project.targetAudience));
  lines.push(tag("numeroUsuarios", project.expectedUsers));
  lines.push(
    tag("processoExistente", resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS))
  );
  lines.push(tag("detalhesProcessoAtual", project.existingSystemDetails));
  lines.push(
    tag(
      "aplicacaoExistenteHoje",
      resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)
    )
  );
  lines.push(tag("detalhesAplicacaoExistente", project.currentApplicationDetails));
  lines.push(tag("colaboradoresEnvolvidos", project.peopleInvolved));
  lines.push(tag("duracaoPorExecucao", project.taskDurationHours));
  lines.push(tag("periodicidade", resolveLabel(project.processFrequency, PROCESS_FREQUENCIES)));
  lines.push(tag("narrativaDoProcesso", project.projectNarrative));
  lines.push(listTag("funcionalidades", "funcionalidade", project.features ?? []));
  lines.push(
    listTag("beneficios", "beneficio", (project.benefits ?? []).map((key) => labelForBenefit(key)))
  );
  lines.push(tag("detalhesBeneficios", project.benefitsDetails));
  lines.push(tag("horasEconomizadasPorMes", project.monthlyHoursSaved));
  lines.push(tag("avaliacaoReducaoErros", project.ratingErrorReduction));
  lines.push(tag("avaliacaoCriticidadeProcesso", project.ratingProcessCriticality));
  lines.push(tag("avaliacaoImpactoInterno", project.ratingInternalImpact));
  lines.push(tag("avaliacaoImpactoExterno", project.ratingExternalImpact));
  lines.push(tag("avaliacaoAtendimentoPoliticas", project.ratingCompliance));
  lines.push(tag("urgencia", resolveLabel(project.urgency, URGENCY_LEVELS)));
  lines.push(tag("prazoLimite", formatDeadline(project.estimatedDeadline)));
  lines.push(tag("informacoesAdicionais", project.additionalInfo));
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
  lines.push(tag("tipoDeProjeto", project.projectKind?.name));
  lines.push(
    listTag(
      "pessoasDeInteresse",
      "pessoa",
      (project.peopleOfInterest ?? []).map((p) => p.name)
    )
  );
  lines.push(tag("complexidade", resolveLabel(project.complexity, COMPLEXITY_LEVELS)));
  lines.push(tag("agendaDoRobo", project.robotSchedule));
  lines.push(tag("taxaHorariaBRL", project.hourlyRateBRL));
  lines.push(tag("economiaAnualEstimadaBRL", project.estimatedAnnualSavingBRL));
  lines.push(
    tag("estrategiaDeExecucao", resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES))
  );
  lines.push(
    listTag(
      "tiposDeSolucao",
      "tipo",
      (project.solutionTypes ?? []).map((v) => resolveLabel(v, SOLUTION_TYPES) ?? v)
    )
  );
  lines.push(tag("notasDoArquiteto", project.architectNotes));
  lines.push(tag("esforcoDeImplementacaoDias", project.implementationEffortDays));
  lines.push(tag("ondaDeImplementacao", project.implementationWave));
  lines.push(tag("ordemNaOnda", project.waveOrder));
  lines.push("</projetoCompleto>");
  return lines.join("\n");
}
