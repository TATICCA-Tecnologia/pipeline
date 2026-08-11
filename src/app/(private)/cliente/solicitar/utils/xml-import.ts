import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  AUTOMATION_ACCOUNT_TYPE_OPTIONS,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
  SENSITIVE_DATA_ANSWER_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
} from "./solicitar.utils";

export interface XmlImportContext {
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  urgencyLevels: { value: string; label: string }[];
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
      /** id real da área quando <area> bateu direto com uma opção cadastrada (undefined se caiu em "outro" ou veio do fallback sem banco) */
      areaId: string | undefined;
      /** id real do tema quando <tema> bateu direto com uma opção cadastrada (undefined se caiu em "outro" ou veio do fallback sem banco) */
      themeId: string | undefined;
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

// Mesmo achado de <groupTag> que getListItems, mas devolve os elementos em vez
// do texto — usado por <sistemas>/<sistema> e <contas>/<conta>, cujos itens
// carregam vários campos (sub-tags) em vez de um texto único.
function getListElements(root: Element, groupTag: string, itemTag: string): Element[] {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return [];
  return Array.from(group.children).filter((c) => c.tagName === itemTag);
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

  // Ficha de sustentação da automação existente. Segue o padrão desta função:
  // valor não reconhecido vira "outro" + texto original preservado no campo
  // custom, com aviso — nunca bloqueia a importação.
  const hospedagemTag = getDirectChildText(root, "hospedagemAplicacaoExistente");
  let currentApplicationHosting = "";
  let currentApplicationHostingCustom =
    getDirectChildText(root, "hospedagemCustomAplicacaoExistente") ?? "";
  if (hospedagemTag) {
    const match = matchByLabel(hospedagemTag, CURRENT_APPLICATION_HOSTING_OPTIONS);
    currentApplicationHosting = match ? match.value : "outro";
    if (!match) {
      currentApplicationHostingCustom = hospedagemTag;
      warnings.push(
        `<hospedagemAplicacaoExistente> com valor '${hospedagemTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  const currentApplicationAuthor = getDirectChildText(root, "autorAplicacaoExistente") ?? "";
  const currentApplicationOwner = getDirectChildText(root, "responsavelAplicacaoExistente") ?? "";

  const localAcessosTag = getDirectChildText(root, "localAcessosAplicacaoExistente");
  let currentApplicationAccessLocation = "";
  if (localAcessosTag) {
    const match = matchByLabel(localAcessosTag, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS);
    currentApplicationAccessLocation = match ? match.value : "outro";
    if (!match) {
      warnings.push(
        `<localAcessosAplicacaoExistente> com valor '${localAcessosTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro".`
      );
    }
  }

  const referenciaAcessosTag =
    getDirectChildText(root, "referenciaAcessosAplicacaoExistente") ?? "";
  let currentApplicationAccessReference = referenciaAcessosTag;
  if (referenciaAcessosTag.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
    currentApplicationAccessReference = referenciaAcessosTag.slice(
      0,
      CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH
    );
    warnings.push(
      `<referenciaAcessosAplicacaoExistente> tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres e foi truncada.`
    );
  }

  const producaoDesdeTag = getDirectChildText(root, "producaoDesdeAplicacaoExistente");
  let currentApplicationLiveSince = "";
  if (producaoDesdeTag) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(producaoDesdeTag)) {
      currentApplicationLiveSince = producaoDesdeTag;
    } else {
      warnings.push(
        `<producaoDesdeAplicacaoExistente> deve estar no formato AAAA-MM-DD; valor '${producaoDesdeTag}' foi ignorado.`
      );
    }
  }

  // Critérios do catálogo (ativo, cargo/setor do responsável, substituto,
  // contingência, origem/destino de dados, dados sigilosos, sistemas e
  // contas). Mesmo padrão do resto da função: tudo opcional, nada bloqueia o
  // import, valor não reconhecido vira "outro" (quando a lista tiver essa
  // opção) ou é descartado com aviso (quando não tiver).
  const currentApplicationAssetId = getDirectChildText(root, "ativoAplicacaoExistente");
  const currentApplicationOwnerRole = getDirectChildText(
    root,
    "cargoResponsavelAplicacaoExistente"
  );

  // <setorResponsavelAplicacaoExistente> — mesma tabela ProjectArea de <area>,
  // mas SEM fallback "outro": a ficha só aceita área já cadastrada (ver
  // SustentacaoBlock), não há campo de texto livre pra guardar o nome cru.
  const setorResponsavelTag = getDirectChildText(root, "setorResponsavelAplicacaoExistente");
  let currentApplicationOwnerAreaId = "";
  if (setorResponsavelTag) {
    const setorMatch = matchByLabel(setorResponsavelTag, context.areas);
    if (setorMatch?.id) {
      currentApplicationOwnerAreaId = setorMatch.id;
    } else {
      warnings.push(
        `<setorResponsavelAplicacaoExistente> com valor '${setorResponsavelTag}' não corresponde a nenhuma área cadastrada e foi ignorado.`
      );
    }
  }

  const currentApplicationBackupOwner = getDirectChildText(
    root,
    "responsavelSubstitutoAplicacaoExistente"
  );

  // <acoesContingencia>/<acao> — item não reconhecido não bloqueia o import:
  // não entra na lista (a lista não tem opção "outro") e o texto original é
  // preservado em <detalhesContingencia>, mesmo padrão de <beneficios>.
  const contingencyItems = getListItems(root, "acoesContingencia", "acao");
  const currentApplicationContingencyActions: string[] = [];
  const unmatchedContingencyItems: string[] = [];
  for (const item of contingencyItems) {
    const match = matchByLabel(item, CURRENT_APPLICATION_CONTINGENCY_OPTIONS);
    if (match) {
      currentApplicationContingencyActions.push(match.key);
    } else {
      unmatchedContingencyItems.push(item);
      warnings.push(
        `O item '${item}' dentro de <acoesContingencia> não corresponde a nenhuma ação conhecida; foi removido da lista e o texto foi preservado nos detalhes de contingência.`
      );
    }
  }
  const detalhesContingenciaTag = getDirectChildText(root, "detalhesContingencia");
  const currentApplicationContingencyDetails = [detalhesContingenciaTag, ...unmatchedContingencyItems]
    .filter(Boolean)
    .join(" | ");

  // <origemDadosEntrada> / <destinoDadosSaida> — com fallback "Outro"
  const origemTag = getDirectChildText(root, "origemDadosEntrada");
  let currentApplicationDataInput = "";
  if (origemTag) {
    const match = matchByLabel(origemTag, CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS);
    currentApplicationDataInput = match ? match.value : "outro";
    if (!match) {
      warnings.push(
        `<origemDadosEntrada> com valor '${origemTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro".`
      );
    }
  }
  const currentApplicationDataInputDetails = getDirectChildText(root, "detalhesDadosEntrada");

  const destinoTag = getDirectChildText(root, "destinoDadosSaida");
  let currentApplicationDataOutput = "";
  if (destinoTag) {
    const match = matchByLabel(destinoTag, CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS);
    currentApplicationDataOutput = match ? match.value : "outro";
    if (!match) {
      warnings.push(
        `<destinoDadosSaida> com valor '${destinoTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro".`
      );
    }
  }
  const currentApplicationDataOutputDetails = getDirectChildText(root, "detalhesDadosSaida");

  // <dadosSigilosos> — CAMPO RESTRITO, sem fallback "Outro" (Sim/Não/Não sei).
  const dadosSigilososTag = getDirectChildText(root, "dadosSigilosos");
  let handlesSensitiveData = "";
  if (dadosSigilososTag) {
    const match = matchByLabel(dadosSigilososTag, SENSITIVE_DATA_ANSWER_OPTIONS);
    if (match) {
      handlesSensitiveData = match.value;
    } else {
      warnings.push(
        `<dadosSigilosos> com valor '${dadosSigilososTag}' não corresponde a nenhuma opção conhecida (Sim, Não ou Não sei) e foi ignorado.`
      );
    }
  }

  // <categoriasDadosSigilosos>/<categoria> — mesmo padrão de <acoesContingencia>:
  // item não reconhecido não entra na lista, texto preservado nos detalhes.
  const categoriaItems = getListItems(root, "categoriasDadosSigilosos", "categoria");
  const sensitiveDataCategories: string[] = [];
  const unmatchedCategoriaItems: string[] = [];
  for (const item of categoriaItems) {
    const match = matchByLabel(item, SENSITIVE_DATA_CATEGORY_OPTIONS);
    if (match) {
      sensitiveDataCategories.push(match.key);
    } else {
      unmatchedCategoriaItems.push(item);
      warnings.push(
        `O item '${item}' dentro de <categoriasDadosSigilosos> não corresponde a nenhuma categoria conhecida; foi removido da lista e o texto foi preservado nos detalhes de dados sigilosos.`
      );
    }
  }
  const detalhesDadosSigilososTag = getDirectChildText(root, "detalhesDadosSigilosos");
  const sensitiveDataDetails = [detalhesDadosSigilososTag, ...unmatchedCategoriaItems]
    .filter(Boolean)
    .join(" | ");

  // <sistemas>/<sistema> — linha sem <nome> é descartada (não há como
  // referenciar essa linha depois, nem em <contas>/<sistema>).
  const systemElements = getListElements(root, "sistemas", "sistema");
  const targetSystems: SolicitarProjetoFormData["targetSystems"] = [];
  for (const el of systemElements) {
    const nome = getDirectChildText(el, "nome");
    if (!nome) {
      warnings.push(`Uma linha dentro de <sistemas> não tinha <nome> e foi descartada.`);
      continue;
    }
    let accessNotes = getDirectChildText(el, "comoAcessar");
    if (accessNotes.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
      accessNotes = accessNotes.slice(0, CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH);
      warnings.push(
        `<comoAcessar> do sistema '${nome}' tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres e foi truncado.`
      );
    }
    targetSystems.push({
      targetSystemId: "",
      customName: nome,
      accessPoint: getDirectChildText(el, "pontoAcesso"),
      accessNotes,
    });
  }

  // <contas>/<conta> — processada DEPOIS de <sistemas> de propósito: o
  // <sistema> de cada conta casa por nome com as linhas já montadas acima.
  // Linha sem <usuario> é descartada. Conta cujo <sistema> não bate com
  // nenhuma linha de <sistemas> entra com systemIndex ausente (null) — nunca
  // chutado: o servidor estoura se o índice ficar fora do intervalo.
  const accountElements = getListElements(root, "contas", "conta");
  const automationAccounts: SolicitarProjetoFormData["automationAccounts"] = [];
  for (const el of accountElements) {
    let username = getDirectChildText(el, "usuario");
    if (!username) {
      warnings.push(`Uma linha dentro de <contas> não tinha <usuario> e foi descartada.`);
      continue;
    }
    if (username.length > AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH) {
      warnings.push(
        `<usuario> '${username}' tinha mais de ${AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH} caracteres e foi truncado.`
      );
      username = username.slice(0, AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH);
    }

    const tipoTag = getDirectChildText(el, "tipo");
    let accountType = "";
    if (tipoTag) {
      const match = matchByLabel(tipoTag, AUTOMATION_ACCOUNT_TYPE_OPTIONS);
      accountType = match ? match.value : "outro";
      if (!match) {
        warnings.push(
          `<tipo> da conta '${username}' com valor '${tipoTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro".`
        );
      }
    }

    const sistemaTag = getDirectChildText(el, "sistema");
    let systemIndex: number | null = null;
    if (sistemaTag) {
      const idx = targetSystems.findIndex(
        (s) => s.customName.trim().toLowerCase() === sistemaTag.trim().toLowerCase()
      );
      if (idx >= 0) {
        systemIndex = idx;
      } else {
        warnings.push(
          `A conta '${username}' referencia o sistema '${sistemaTag}', que não corresponde a nenhum item de <sistemas>; entrou sem sistema vinculado.`
        );
      }
    }

    automationAccounts.push({
      username,
      systemIndex,
      accountType,
      ownerName: getDirectChildText(el, "responsavel"),
      notes: getDirectChildText(el, "observacoes"),
    });
  }

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

  // <urgencia>
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, context.urgencyLevels);
    if (match) {
      urgency = match.value;
    } else {
      warnings.push(
        `<urgencia> com valor '${urgenciaTag}' não corresponde a nenhuma opção cadastrada e foi ignorado.`
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
    currentApplicationHosting,
    currentApplicationHostingCustom,
    currentApplicationAuthor,
    currentApplicationOwner,
    currentApplicationAccessLocation,
    currentApplicationAccessReference,
    currentApplicationLiveSince,
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
    deadline,
    additionalInfo,
    currentApplicationAssetId,
    currentApplicationOwnerRole,
    currentApplicationOwnerAreaId,
    currentApplicationDataInput,
    currentApplicationDataInputDetails,
    currentApplicationDataOutput,
    currentApplicationDataOutputDetails,
    currentApplicationContingencyActions,
    currentApplicationContingencyDetails,
    currentApplicationBackupOwner,
    handlesSensitiveData,
    sensitiveDataCategories,
    sensitiveDataDetails,
    targetSystems,
    automationAccounts,
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
    areaId: areaMatch?.id,
    themeId: temaMatch?.id,
  };
}
