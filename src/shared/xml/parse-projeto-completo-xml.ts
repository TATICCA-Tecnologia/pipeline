import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

export interface ParsedProjetoCompleto {
  projetoId?: string;
  title?: string;
  areaName?: string;
  themeName?: string;
  platform?: string;
  description?: string;
  targetAudience?: string;
  expectedUsers?: string;
  hasExistingSystem?: string;
  existingSystemDetails?: string;
  hasCurrentApplication?: string;
  currentApplicationDetails?: string;
  peopleInvolved?: number;
  taskDurationHours?: number;
  processFrequency?: string;
  projectNarrative?: string;
  features?: string[];
  benefits?: string[];
  benefitsDetails?: string;
  monthlyHoursSaved?: number;
  ratingErrorReduction?: number;
  ratingProcessCriticality?: number;
  ratingInternalImpact?: number;
  ratingExternalImpact?: number;
  ratingCompliance?: number;
  urgency?: string;
  estimatedDeadline?: string;
  additionalInfo?: string;
  mainToolName?: string;
  peopleOfInterestNames?: string[];
  complexity?: string;
  robotSchedule?: string;
  hourlyRateBRL?: number;
  estimatedAnnualSavingBRL?: number;
  executionStrategy?: string;
  solutionTypeNames?: string[];
  architectNotes?: string;
  implementationEffortDays?: number;
  implementationWave?: number;
  waveOrder?: number;
}

export type ParseProjetoCompletoResult =
  | { ok: true; data: ParsedProjetoCompleto; warnings: string[] }
  | { ok: false; error: string };

function getDirectChildText(parent: Element, tagName: string): string | undefined {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      const text = (child.textContent ?? "").trim();
      return text.length > 0 ? text : undefined;
    }
  }
  return undefined;
}

function getListItems(root: Element, groupTag: string, itemTag: string): string[] | undefined {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return undefined;
  return Array.from(group.children)
    .filter((c) => c.tagName === itemTag)
    .map((c) => (c.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

function matchValueByLabel(
  label: string,
  options: readonly { value: string; label: string }[]
): string | undefined {
  const normalized = label.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized)?.value;
}

function matchKeyByLabel(
  label: string,
  options: readonly { key: string; label: string }[]
): string | undefined {
  const normalized = label.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized)?.key;
}

function resolveEnum(
  raw: string | undefined,
  options: readonly { value: string; label: string }[],
  fieldLabel: string,
  warnings: string[]
): string | undefined {
  if (raw === undefined) return undefined;
  const matched = matchValueByLabel(raw, options);
  if (matched) return matched;
  warnings.push(`"${fieldLabel}" com valor "${raw}" não reconhecido — mantido como texto livre.`);
  return raw;
}

function parseNumber(raw: string | undefined, fieldLabel: string, warnings: string[]): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    warnings.push(`"${fieldLabel}" com valor "${raw}" não é um número válido — ignorado.`);
    return undefined;
  }
  return n;
}

export function parseProjetoCompletoXml(xmlText: string): ParseProjetoCompletoResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) {
    return { ok: false, error: "XML inválido — verifique se o arquivo não foi corrompido." };
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "projetoCompleto") {
    return { ok: false, error: 'Tag raiz inválida — esperado "<projetoCompleto>".' };
  }

  const warnings: string[] = [];
  const data: ParsedProjetoCompleto = {};

  data.projetoId = getDirectChildText(root, "projetoId");
  data.title = getDirectChildText(root, "titulo");
  data.areaName = getDirectChildText(root, "area");
  data.themeName = getDirectChildText(root, "tema");
  data.platform = resolveEnum(getDirectChildText(root, "plataforma"), PLATFORMS, "Plataforma", warnings);
  data.description = getDirectChildText(root, "descricao");
  data.targetAudience = getDirectChildText(root, "publicoAlvo");
  data.expectedUsers = getDirectChildText(root, "numeroUsuarios");
  data.hasExistingSystem = resolveEnum(
    getDirectChildText(root, "processoExistente"),
    HAS_EXISTING_SYSTEM_OPTIONS,
    "Processo existente",
    warnings
  );
  data.existingSystemDetails = getDirectChildText(root, "detalhesProcessoAtual");
  data.hasCurrentApplication = resolveEnum(
    getDirectChildText(root, "aplicacaoExistenteHoje"),
    HAS_CURRENT_APPLICATION_OPTIONS,
    "Aplicação existente hoje",
    warnings
  );
  data.currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");
  data.peopleInvolved = parseNumber(
    getDirectChildText(root, "colaboradoresEnvolvidos"),
    "Colaboradores envolvidos",
    warnings
  );
  data.taskDurationHours = parseNumber(
    getDirectChildText(root, "duracaoPorExecucao"),
    "Duração por execução",
    warnings
  );
  data.processFrequency = resolveEnum(
    getDirectChildText(root, "periodicidade"),
    PROCESS_FREQUENCIES,
    "Periodicidade",
    warnings
  );
  data.projectNarrative = getDirectChildText(root, "narrativaDoProcesso");
  data.features = getListItems(root, "funcionalidades", "funcionalidade");
  const rawBenefits = getListItems(root, "beneficios", "beneficio");
  data.benefits = rawBenefits?.map((label) => matchKeyByLabel(label, BENEFIT_OPTIONS) ?? label);
  data.benefitsDetails = getDirectChildText(root, "detalhesBeneficios");
  data.monthlyHoursSaved = parseNumber(
    getDirectChildText(root, "horasEconomizadasPorMes"),
    "Horas economizadas por mês",
    warnings
  );
  data.ratingErrorReduction = parseNumber(
    getDirectChildText(root, "avaliacaoReducaoErros"),
    "Avaliação de redução de erros",
    warnings
  );
  data.ratingProcessCriticality = parseNumber(
    getDirectChildText(root, "avaliacaoCriticidadeProcesso"),
    "Avaliação de criticidade do processo",
    warnings
  );
  data.ratingInternalImpact = parseNumber(
    getDirectChildText(root, "avaliacaoImpactoInterno"),
    "Avaliação de impacto interno",
    warnings
  );
  data.ratingExternalImpact = parseNumber(
    getDirectChildText(root, "avaliacaoImpactoExterno"),
    "Avaliação de impacto externo",
    warnings
  );
  data.ratingCompliance = parseNumber(
    getDirectChildText(root, "avaliacaoAtendimentoPoliticas"),
    "Avaliação de atendimento a políticas",
    warnings
  );
  data.urgency = resolveEnum(getDirectChildText(root, "urgencia"), URGENCY_LEVELS, "Urgência", warnings);
  const rawDeadline = getDirectChildText(root, "prazoLimite");
  if (rawDeadline) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)) {
      data.estimatedDeadline = rawDeadline;
    } else {
      warnings.push(`"Prazo limite" com valor "${rawDeadline}" não está no formato AAAA-MM-DD — ignorado.`);
    }
  }
  data.additionalInfo = getDirectChildText(root, "informacoesAdicionais");
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
  data.complexity = resolveEnum(
    getDirectChildText(root, "complexidade"),
    COMPLEXITY_LEVELS,
    "Complexidade",
    warnings
  );
  data.robotSchedule = getDirectChildText(root, "agendaDoRobo");
  data.hourlyRateBRL = parseNumber(getDirectChildText(root, "taxaHorariaBRL"), "Taxa horária", warnings);
  data.estimatedAnnualSavingBRL = parseNumber(
    getDirectChildText(root, "economiaAnualEstimadaBRL"),
    "Economia anual estimada",
    warnings
  );
  data.executionStrategy = resolveEnum(
    getDirectChildText(root, "estrategiaDeExecucao"),
    EXECUTION_STRATEGIES,
    "Estratégia de execução",
    warnings
  );
  const rawSolutionTypes = getListItems(root, "tiposDeSolucao", "tipo") ?? [];
  // Compatibilidade com XMLs exportados antes desta mudança, que ainda podem
  // ter a tag antiga <tipoDeProjeto> (um valor único) em vez da lista.
  const legacyProjectKindName = getDirectChildText(root, "tipoDeProjeto");
  data.solutionTypeNames =
    rawSolutionTypes.length > 0 || legacyProjectKindName
      ? [...rawSolutionTypes, ...(legacyProjectKindName ? [legacyProjectKindName] : [])]
      : undefined;
  data.architectNotes = getDirectChildText(root, "notasDoArquiteto");
  data.implementationEffortDays = parseNumber(
    getDirectChildText(root, "esforcoDeImplementacaoDias"),
    "Esforço de implementação (dias)",
    warnings
  );
  data.implementationWave = parseNumber(
    getDirectChildText(root, "ondaDeImplementacao"),
    "Onda de implementação",
    warnings
  );
  data.waveOrder = parseNumber(getDirectChildText(root, "ordemNaOnda"), "Ordem na onda", warnings);

  return { ok: true, data, warnings };
}
