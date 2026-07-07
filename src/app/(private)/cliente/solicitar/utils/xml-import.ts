import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./solicitar.utils";

export interface XmlImportContext {
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  companies: { id: string; name: string }[];
}

export type XmlImportResult =
  | {
      ok: true;
      formData: SolicitarProjetoFormData;
      features: string[];
      benefits: string[];
      companyId: string | undefined;
      /** true quando <empresa> não bateu com nenhuma empresa disponível e precisa de escolha manual */
      companyUnresolved: boolean;
      /** valor bruto da tag <empresa>, pra exibir contexto quando companyUnresolved */
      rawCompanyName: string;
      /** avisos de campos que não puderam ser interpretados e foram ignorados/realocados, sem bloquear o import */
      warnings: string[];
    }
  | { ok: false; error: string };

function getDirectChildText(parent: Element, tagName: string): string {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      return (child.textContent ?? "").trim();
    }
  }
  return "";
}

function getListItems(root: Element, groupTag: string, itemTag: string): string[] {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return [];
  return Array.from(group.children)
    .filter((c) => c.tagName === itemTag)
    .map((c) => (c.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

function matchByLabel<T extends { label: string }>(
  value: string,
  options: T[]
): T | undefined {
  const normalized = value.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized);
}

export function parseSolicitacaoXml(
  xmlText: string,
  context: XmlImportContext
): XmlImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  if (doc.querySelector("parsererror")) {
    return {
      ok: false,
      error:
        "O arquivo não é um XML válido. Verifique se todas as tags estão fechadas corretamente.",
    };
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== "solicitacaoDeProjeto") {
    return { ok: false, error: "A tag raiz do arquivo deve ser <solicitacaoDeProjeto>." };
  }

  // Avisos de campos que não bloqueiam o import (valor ignorado e, quando possível, preservado em outro campo)
  const warnings: string[] = [];

  const titulo = getDirectChildText(root, "titulo");
  if (!titulo) {
    return { ok: false, error: "A tag <titulo> é obrigatória e não pode ficar vazia." };
  }

  const descricao = getDirectChildText(root, "descricao");
  if (!descricao) {
    return { ok: false, error: "A tag <descricao> é obrigatória e não pode ficar vazia." };
  }

  // <empresa> — se não bater com nenhuma opção, não bloqueia o import: fica marcado
  // como "companyUnresolved" pra quem chama decidir (ex.: pedir escolha manual).
  const empresaTag = getDirectChildText(root, "empresa");
  let companyId: string | undefined;
  let companyUnresolved = false;
  if (empresaTag) {
    const match = context.companies.find(
      (c) => c.name.trim().toLowerCase() === empresaTag.toLowerCase()
    );
    if (match) {
      companyId = match.id;
    } else {
      companyUnresolved = true;
    }
  } else if (context.companies.length === 1) {
    companyId = context.companies[0].id;
  } else {
    companyUnresolved = true;
  }

  // <area> / <tema> — com fallback "Outro". Diferente dos campos restritos
  // abaixo, "Outro" é um resultado normal e esperado aqui (mesmo no
  // formulário manual, sem XML) — não gera aviso, não há nada para revisar.
  const areaTag = getDirectChildText(root, "area");
  if (!areaTag) {
    return { ok: false, error: "A tag <area> é obrigatória e não pode ficar vazia." };
  }
  const areaMatch = matchByLabel(areaTag, context.areas);
  const projectArea = areaMatch ? areaMatch.value : "outro";
  const customProjectArea = areaMatch ? "" : areaTag;

  const temaTag = getDirectChildText(root, "tema");
  if (!temaTag) {
    return { ok: false, error: "A tag <tema> é obrigatória e não pode ficar vazia." };
  }
  const themesForArea = context.themesByArea[projectArea] ?? [];
  const temaMatch = matchByLabel(temaTag, themesForArea);
  const projectTheme = temaMatch ? temaMatch.value : "outro";
  const customProjectTheme = temaMatch ? "" : temaTag;

  // <plataforma> — com fallback "Outro"
  const plataformaTag = getDirectChildText(root, "plataforma");
  let platform = DEFAULT_PLATFORM_VALUE as string;
  let customPlatform = "";
  if (plataformaTag) {
    const platformMatch = matchByLabel(plataformaTag, PLATFORMS);
    platform = platformMatch ? platformMatch.value : "outro";
    customPlatform = platformMatch ? "" : plataformaTag;
    if (!platformMatch) {
      warnings.push(
        `<plataforma> com valor '${plataformaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  // <publicoAlvo> — com fallback "Outro" (mesmo caso de <area>/<tema>: normal
  // e esperado, sem aviso).
  const publicoTag = getDirectChildText(root, "publicoAlvo");
  let targetAudience = "";
  let customTargetAudience = "";
  if (publicoTag) {
    const audienceMatch = matchByLabel(publicoTag, TARGET_AUDIENCES);
    if (audienceMatch) {
      targetAudience = audienceMatch.value;
    } else {
      targetAudience = "outro";
      customTargetAudience = publicoTag;
    }
  }

  const numeroUsuarios = getDirectChildText(root, "numeroUsuarios");

  // <processoExistente> — com fallback "Outro"
  const processoExistenteTag = getDirectChildText(root, "processoExistente");
  let hasExistingSystem = "";
  let customHasExistingSystem = "";
  if (processoExistenteTag) {
    const match = matchByLabel(processoExistenteTag, HAS_EXISTING_SYSTEM_OPTIONS);
    hasExistingSystem = match ? match.value : "outro";
    customHasExistingSystem = match ? "" : processoExistenteTag;
    if (!match) {
      warnings.push(
        `<processoExistente> com valor '${processoExistenteTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  const existingSystemDetails = getDirectChildText(root, "detalhesProcessoAtual");

  // <aplicacaoExistenteHoje> — com fallback "Outro"
  const aplicacaoExistenteTag = getDirectChildText(root, "aplicacaoExistenteHoje");
  let hasCurrentApplication = "";
  let customHasCurrentApplication = "";
  if (aplicacaoExistenteTag) {
    const match = matchByLabel(aplicacaoExistenteTag, HAS_CURRENT_APPLICATION_OPTIONS);
    hasCurrentApplication = match ? match.value : "outro";
    customHasCurrentApplication = match ? "" : aplicacaoExistenteTag;
    if (!match) {
      warnings.push(
        `<aplicacaoExistenteHoje> com valor '${aplicacaoExistenteTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  const currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");

  // <colaboradoresEnvolvidos> — deve ser um número (contagem). Se vier texto (ex.: nomes),
  // não bloqueia o import: o número fica vazio e o texto é preservado em <detalhesColaboradores>.
  const colaboradoresTag = getDirectChildText(root, "colaboradoresEnvolvidos");
  const detalhesColaboradoresTag = getDirectChildText(root, "detalhesColaboradores");
  let peopleInvolved = "";
  let peopleInvolvedDetails = detalhesColaboradoresTag;
  if (colaboradoresTag) {
    const n = Number(colaboradoresTag);
    if (!Number.isInteger(n) || n < 0) {
      peopleInvolvedDetails = [detalhesColaboradoresTag, colaboradoresTag]
        .filter(Boolean)
        .join(" | ");
      warnings.push(
        `<colaboradoresEnvolvidos> esperava um número e recebeu '${colaboradoresTag}'; o texto foi movido para os detalhes dos colaboradores envolvidos.`
      );
    } else {
      peopleInvolved = String(n);
    }
  }

  // <duracaoPorExecucao>
  const duracaoTag = getDirectChildText(root, "duracaoPorExecucao");
  let taskDurationHours = "";
  if (duracaoTag) {
    const n = Number(duracaoTag);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(
        `<duracaoPorExecucao> deve ser um número maior ou igual a zero; valor '${duracaoTag}' foi ignorado.`
      );
    } else {
      taskDurationHours = String(n);
    }
  }

  // <periodicidade> — com fallback "Outro"
  const periodicidadeTag = getDirectChildText(root, "periodicidade");
  let processFrequency = "";
  let customProcessFrequency = "";
  if (periodicidadeTag) {
    const match = matchByLabel(periodicidadeTag, PROCESS_FREQUENCIES);
    processFrequency = match ? match.value : "outro";
    customProcessFrequency = match ? "" : periodicidadeTag;
    if (!match) {
      warnings.push(
        `<periodicidade> com valor '${periodicidadeTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro". O cálculo automático de horas gastas por ano NÃO será feito para este projeto — se a periodicidade real for uma das opções da lista, ajuste o valor antes de importar.`
      );
    }
  }

  const projectNarrative = getDirectChildText(root, "narrativaDoProcesso");
  const features = getListItems(root, "funcionalidades", "funcionalidade");

  // <beneficios> — item não reconhecido não bloqueia o import: é tratado como "Outro"
  // e o texto original é preservado em <detalhesBeneficios>.
  const beneficioItems = getListItems(root, "beneficios", "beneficio");
  const benefits: string[] = [];
  const unmatchedBenefitItems: string[] = [];
  for (const item of beneficioItems) {
    const match = matchByLabel(item, BENEFIT_OPTIONS);
    if (!match) {
      unmatchedBenefitItems.push(item);
      if (!benefits.includes("outro")) benefits.push("outro");
      warnings.push(
        `O item '${item}' dentro de <beneficios> não corresponde a nenhum benefício conhecido; foi tratado como "Outro" e o texto foi preservado nos detalhes dos benefícios.`
      );
    } else {
      benefits.push(match.key);
    }
  }

  const benefitsDetailsTag = getDirectChildText(root, "detalhesBeneficios");
  const benefitsDetails = [benefitsDetailsTag, ...unmatchedBenefitItems]
    .filter(Boolean)
    .join(" | ");

  // <horasEconomizadasPorMes>
  const horasTag = getDirectChildText(root, "horasEconomizadasPorMes");
  let monthlyHoursSaved = "";
  if (horasTag) {
    const n = Number(horasTag);
    if (!Number.isFinite(n) || n < 0) {
      warnings.push(
        `<horasEconomizadasPorMes> deve ser um número maior ou igual a zero; valor '${horasTag}' foi ignorado.`
      );
    } else {
      monthlyHoursSaved = String(n);
    }
  }

  // Avaliações 1-5 — se o valor não for um inteiro entre 1 e 5, o campo fica em branco
  // (não bloqueia o import) e um aviso é registrado.
  function parseRating(tag: string): number | null {
    const text = getDirectChildText(root, tag);
    if (!text) return null;
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      warnings.push(
        `<${tag}> deve ser um número inteiro entre 1 e 5; valor '${text}' foi ignorado.`
      );
      return null;
    }
    return n;
  }

  const ratingErrorReduction = parseRating("avaliacaoReducaoErros");
  const ratingProcessCriticality = parseRating("avaliacaoCriticidadeProcesso");
  const ratingInternalImpact = parseRating("avaliacaoImpactoInterno");
  const ratingExternalImpact = parseRating("avaliacaoImpactoExterno");
  const ratingCompliance = parseRating("avaliacaoAtendimentoPoliticas");

  // <urgencia> — com fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  let customUrgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    urgency = match ? match.value : "outro";
    customUrgency = match ? "" : urgenciaTag;
    if (!match) {
      warnings.push(
        `<urgencia> com valor '${urgenciaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  // <prazoLimite>
  const prazoTag = getDirectChildText(root, "prazoLimite");
  let deadline = "";
  if (prazoTag) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazoTag)) {
      warnings.push(
        `<prazoLimite> deve estar no formato AAAA-MM-DD; valor '${prazoTag}' foi ignorado.`
      );
    } else {
      deadline = prazoTag;
    }
  }

  const additionalInfoTag = getDirectChildText(root, "informacoesAdicionais");
  const additionalInfo =
    warnings.length > 0
      ? [
          additionalInfoTag,
          `Avisos da importação XML (revise se necessário):\n${warnings.map((w) => `- ${w}`).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n")
      : additionalInfoTag;

  const formData: SolicitarProjetoFormData = {
    title: titulo,
    projectArea,
    customProjectArea,
    projectTheme,
    customProjectTheme,
    platform,
    customPlatform,
    description: descricao,
    targetAudience,
    customTargetAudience,
    expectedUsers: numeroUsuarios,
    hasExistingSystem,
    customHasExistingSystem,
    existingSystemDetails,
    hasCurrentApplication,
    customHasCurrentApplication,
    currentApplicationDetails,
    peopleInvolved,
    peopleInvolvedDetails,
    taskDurationHours,
    processFrequency,
    customProcessFrequency,
    benefitsDetails,
    monthlyHoursSaved,
    ratingErrorReduction,
    ratingProcessCriticality,
    ratingInternalImpact,
    ratingExternalImpact,
    ratingCompliance,
    projectNarrative,
    urgency,
    customUrgency,
    deadline,
    additionalInfo,
  };

  return {
    ok: true,
    formData,
    features,
    benefits,
    companyId,
    companyUnresolved,
    rawCompanyName: empresaTag,
    warnings,
  };
}
