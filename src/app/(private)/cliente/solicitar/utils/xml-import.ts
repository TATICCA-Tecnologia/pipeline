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

  // <area> / <tema> — com fallback "Outro"
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
  }

  // <publicoAlvo> — com fallback "Outro"
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
  }

  const currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");

  // <colaboradoresEnvolvidos>
  const colaboradoresTag = getDirectChildText(root, "colaboradoresEnvolvidos");
  let peopleInvolved = "";
  if (colaboradoresTag) {
    const n = Number(colaboradoresTag);
    if (!Number.isInteger(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <colaboradoresEnvolvidos> deve ser um número inteiro maior ou igual a zero. Valor recebido: '${colaboradoresTag}'.`,
      };
    }
    peopleInvolved = String(n);
  }

  // <duracaoPorExecucao>
  const duracaoTag = getDirectChildText(root, "duracaoPorExecucao");
  let taskDurationHours = "";
  if (duracaoTag) {
    const n = Number(duracaoTag);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <duracaoPorExecucao> deve ser um número maior ou igual a zero. Valor recebido: '${duracaoTag}'.`,
      };
    }
    taskDurationHours = String(n);
  }

  // <periodicidade> — com fallback "Outro"
  const periodicidadeTag = getDirectChildText(root, "periodicidade");
  let processFrequency = "";
  let customProcessFrequency = "";
  if (periodicidadeTag) {
    const match = matchByLabel(periodicidadeTag, PROCESS_FREQUENCIES);
    processFrequency = match ? match.value : "outro";
    customProcessFrequency = match ? "" : periodicidadeTag;
  }

  const projectNarrative = getDirectChildText(root, "narrativaDoProcesso");
  const features = getListItems(root, "funcionalidades", "funcionalidade");

  // <beneficios>
  const beneficioItems = getListItems(root, "beneficios", "beneficio");
  const benefits: string[] = [];
  for (const item of beneficioItems) {
    const match = matchByLabel(item, BENEFIT_OPTIONS);
    if (!match) {
      return {
        ok: false,
        error: `O item '${item}' dentro de <beneficios> não corresponde a nenhum benefício conhecido. Valores aceitos: ${BENEFIT_OPTIONS.map((b) => b.label).join(", ")}.`,
      };
    }
    benefits.push(match.key);
  }

  const benefitsDetails = getDirectChildText(root, "detalhesBeneficios");

  // <horasEconomizadasPorMes>
  const horasTag = getDirectChildText(root, "horasEconomizadasPorMes");
  let monthlyHoursSaved = "";
  if (horasTag) {
    const n = Number(horasTag);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <horasEconomizadasPorMes> deve ser um número maior ou igual a zero. Valor recebido: '${horasTag}'.`,
      };
    }
    monthlyHoursSaved = String(n);
  }

  // Avaliações 1-5
  function parseRating(tag: string): { value: number | null } | { error: string } {
    const text = getDirectChildText(root, tag);
    if (!text) return { value: null };
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return {
        error: `A tag <${tag}> deve ser um número inteiro entre 1 e 5. Valor recebido: '${text}'.`,
      };
    }
    return { value: n };
  }

  const ratingErrorReductionResult = parseRating("avaliacaoReducaoErros");
  if ("error" in ratingErrorReductionResult) {
    return { ok: false, error: ratingErrorReductionResult.error };
  }
  const ratingProcessCriticalityResult = parseRating("avaliacaoCriticidadeProcesso");
  if ("error" in ratingProcessCriticalityResult) {
    return { ok: false, error: ratingProcessCriticalityResult.error };
  }
  const ratingInternalImpactResult = parseRating("avaliacaoImpactoInterno");
  if ("error" in ratingInternalImpactResult) {
    return { ok: false, error: ratingInternalImpactResult.error };
  }
  const ratingExternalImpactResult = parseRating("avaliacaoImpactoExterno");
  if ("error" in ratingExternalImpactResult) {
    return { ok: false, error: ratingExternalImpactResult.error };
  }
  const ratingComplianceResult = parseRating("avaliacaoAtendimentoPoliticas");
  if ("error" in ratingComplianceResult) {
    return { ok: false, error: ratingComplianceResult.error };
  }

  // <urgencia> — com fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  let customUrgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    urgency = match ? match.value : "outro";
    customUrgency = match ? "" : urgenciaTag;
  }

  // <prazoLimite>
  const prazoTag = getDirectChildText(root, "prazoLimite");
  let deadline = "";
  if (prazoTag) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazoTag)) {
      return {
        ok: false,
        error: `A tag <prazoLimite> deve estar no formato AAAA-MM-DD. Valor recebido: '${prazoTag}'.`,
      };
    }
    deadline = prazoTag;
  }

  const additionalInfo = getDirectChildText(root, "informacoesAdicionais");

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
    taskDurationHours,
    processFrequency,
    customProcessFrequency,
    benefitsDetails,
    monthlyHoursSaved,
    ratingErrorReduction: ratingErrorReductionResult.value,
    ratingProcessCriticality: ratingProcessCriticalityResult.value,
    ratingInternalImpact: ratingInternalImpactResult.value,
    ratingExternalImpact: ratingExternalImpactResult.value,
    ratingCompliance: ratingComplianceResult.value,
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
  };
}
