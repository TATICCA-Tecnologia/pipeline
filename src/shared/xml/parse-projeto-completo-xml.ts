import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  COMPLEXITY_LEVELS,
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
} from "@/shared/constants/project-taxonomy";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

// Formato pronto para alimentar `automationInventoryInputSchema` (ver
// project.router.ts): `customName` porque um nome vindo de XML nunca casa com
// um `targetSystemId` do catálogo local — id não sobrevive entre bases.
export interface ParsedTargetSystem {
  customName: string;
  accessPoint?: string;
  accessNotes?: string;
}

// `systemIndex` já é a POSIÇÃO dentro do array `targetSystems` irmão deste
// objeto, igual ao que `automationAccountInputSchema.systemIndex` espera —
// resolvido por nome (ver resolução logo abaixo, seção "sistema"). Ausente
// quando o `<sistema>` da conta não bate com nenhum `<sistema>` de
// `<sistemas>`: NUNCA um índice chutado, porque o servidor rejeita índice
// fora do intervalo com BAD_REQUEST (replaceAutomationInventory).
export interface ParsedAutomationAccount {
  username: string;
  systemIndex?: number;
  accountType?: string;
  ownerName?: string;
  notes?: string;
}

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
  currentApplicationHosting?: string;
  currentApplicationHostingCustom?: string;
  currentApplicationAuthor?: string;
  currentApplicationOwner?: string;
  currentApplicationAccessLocation?: string;
  currentApplicationAccessReference?: string;
  // String "AAAA-MM-DD", igual a estimatedDeadline — convertida para Date pelo
  // caller (project-xml-import-export.tsx).
  currentApplicationLiveSince?: string;
  currentApplicationAssetId?: string;
  currentApplicationOwnerRole?: string;
  currentApplicationOwnerAreaName?: string;
  currentApplicationDataInput?: string;
  currentApplicationDataInputDetails?: string;
  currentApplicationDataOutput?: string;
  currentApplicationDataOutputDetails?: string;
  currentApplicationContingencyActions?: string[];
  currentApplicationContingencyDetails?: string;
  currentApplicationBackupOwner?: string;
  handlesSensitiveData?: string;
  sensitiveDataCategories?: string[];
  sensitiveDataDetails?: string;
  targetSystems?: ParsedTargetSystem[];
  automationAccounts?: ParsedAutomationAccount[];
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
  mainToolCategoryName?: string;
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

// Mesma navegação de getListItems, mas devolve os elementos <itemTag> em vez
// do texto — usado por <sistemas>/<sistema> e <contas>/<conta>, cujos itens
// carregam vários campos filhos em vez de um único texto.
function getGroupElements(root: Element, groupTag: string, itemTag: string): Element[] {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return [];
  return Array.from(group.children).filter((c) => c.tagName === itemTag);
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

export function parseProjetoCompletoXml(
  xmlText: string,
  urgencyLevels: { value: string; label: string }[]
): ParseProjetoCompletoResult {
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
  data.currentApplicationHosting = resolveEnum(
    getDirectChildText(root, "hospedagemAplicacaoExistente"),
    CURRENT_APPLICATION_HOSTING_OPTIONS,
    "Onde a automação roda",
    warnings
  );
  data.currentApplicationHostingCustom = getDirectChildText(
    root,
    "hospedagemCustomAplicacaoExistente"
  );
  data.currentApplicationAuthor = getDirectChildText(root, "autorAplicacaoExistente");
  data.currentApplicationOwner = getDirectChildText(root, "responsavelAplicacaoExistente");
  data.currentApplicationAccessLocation = resolveEnum(
    getDirectChildText(root, "localAcessosAplicacaoExistente"),
    CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
    "Onde ficam os acessos",
    warnings
  );
  const rawAccessReference = getDirectChildText(root, "referenciaAcessosAplicacaoExistente");
  if (rawAccessReference) {
    if (rawAccessReference.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
      // Trunca em vez de falhar a importação inteira por causa de um campo
      // auxiliar — ver "Tratamento de erros" na spec.
      data.currentApplicationAccessReference = rawAccessReference.slice(
        0,
        CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH
      );
      warnings.push(
        `"Referência dos acessos" tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres — foi truncada.`
      );
    } else {
      data.currentApplicationAccessReference = rawAccessReference;
    }
  }
  const rawLiveSince = getDirectChildText(root, "producaoDesdeAplicacaoExistente");
  if (rawLiveSince) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawLiveSince)) {
      data.currentApplicationLiveSince = rawLiveSince;
    } else {
      warnings.push(
        `"Em produção desde" com valor "${rawLiveSince}" não está no formato AAAA-MM-DD — ignorado.`
      );
    }
  }
  data.currentApplicationAssetId = getDirectChildText(root, "ativoAplicacaoExistente");
  data.currentApplicationOwnerRole = getDirectChildText(root, "cargoResponsavelAplicacaoExistente");
  data.currentApplicationOwnerAreaName = getDirectChildText(
    root,
    "setorResponsavelAplicacaoExistente"
  );
  data.currentApplicationBackupOwner = getDirectChildText(
    root,
    "responsavelSubstitutoAplicacaoExistente"
  );
  const rawContingencyActions = getListItems(root, "acoesContingencia", "acao");
  data.currentApplicationContingencyActions = rawContingencyActions?.map(
    (label) => matchKeyByLabel(label, CURRENT_APPLICATION_CONTINGENCY_OPTIONS) ?? label
  );
  data.currentApplicationContingencyDetails = getDirectChildText(root, "detalhesContingencia");
  data.currentApplicationDataInput = resolveEnum(
    getDirectChildText(root, "origemDadosEntrada"),
    CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
    "Origem dos dados de entrada",
    warnings
  );
  data.currentApplicationDataInputDetails = getDirectChildText(root, "detalhesDadosEntrada");
  data.currentApplicationDataOutput = resolveEnum(
    getDirectChildText(root, "destinoDadosSaida"),
    CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
    "Destino dos dados de saída",
    warnings
  );
  data.currentApplicationDataOutputDetails = getDirectChildText(root, "detalhesDadosSaida");
  data.handlesSensitiveData = resolveEnum(
    getDirectChildText(root, "dadosSigilosos"),
    SENSITIVE_DATA_ANSWER_OPTIONS,
    "Lida com dados sigilosos",
    warnings
  );
  const rawSensitiveDataCategories = getListItems(root, "categoriasDadosSigilosos", "categoria");
  data.sensitiveDataCategories = rawSensitiveDataCategories?.map(
    (label) => matchKeyByLabel(label, SENSITIVE_DATA_CATEGORY_OPTIONS) ?? label
  );
  data.sensitiveDataDetails = getDirectChildText(root, "detalhesDadosSigilosos");

  // Sistemas PRIMEIRO — as contas (logo abaixo) resolvem o vínculo por nome
  // contra esta lista, então precisam da lista já pronta.
  const targetSystems: ParsedTargetSystem[] = [];
  for (const systemEl of getGroupElements(root, "sistemas", "sistema")) {
    const nome = getDirectChildText(systemEl, "nome");
    if (!nome) {
      warnings.push('Um "<sistema>" sem "<nome>" foi ignorado.');
      continue;
    }
    let comoAcessar = getDirectChildText(systemEl, "comoAcessar");
    if (comoAcessar && comoAcessar.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
      comoAcessar = comoAcessar.slice(0, CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH);
      warnings.push(
        `"Como acessar" do sistema "${nome}" tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres — foi truncado.`
      );
    }
    targetSystems.push({
      customName: nome,
      accessPoint: getDirectChildText(systemEl, "pontoAcesso"),
      accessNotes: comoAcessar,
    });
  }
  data.targetSystems = targetSystems.length > 0 ? targetSystems : undefined;

  // <conta><sistema> carrega o NOME do sistema, não um id: id não sobrevive
  // entre bases (ver comentário em ParsedAutomationAccount). Sem
  // correspondência, a conta entra com vínculo nulo (systemIndex ausente) —
  // NUNCA é descartada por isso, e NUNCA vira um índice chutado (o servidor
  // estoura BAD_REQUEST para índice fora do intervalo).
  const systemIndexByName = new Map(
    targetSystems.map((s, i) => [s.customName.trim().toLowerCase(), i])
  );
  const automationAccounts: ParsedAutomationAccount[] = [];
  for (const accountEl of getGroupElements(root, "contas", "conta")) {
    let usuario = getDirectChildText(accountEl, "usuario");
    if (!usuario) {
      warnings.push('Uma "<conta>" sem "<usuario>" foi ignorada.');
      continue;
    }
    if (usuario.length > AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH) {
      const original = usuario;
      usuario = usuario.slice(0, AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH);
      warnings.push(
        `Usuário da conta "${original}" tinha mais de ${AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH} caracteres — foi truncado.`
      );
    }
    const tipoLabel = getDirectChildText(accountEl, "tipo");
    const accountType = tipoLabel
      ? matchValueByLabel(tipoLabel, AUTOMATION_ACCOUNT_TYPE_OPTIONS) ?? tipoLabel
      : undefined;
    const sistemaNome = getDirectChildText(accountEl, "sistema");
    const systemIndex = sistemaNome
      ? systemIndexByName.get(sistemaNome.trim().toLowerCase())
      : undefined;
    automationAccounts.push({
      username: usuario,
      systemIndex,
      accountType,
      ownerName: getDirectChildText(accountEl, "responsavel"),
      notes: getDirectChildText(accountEl, "observacoes"),
    });
  }
  data.automationAccounts = automationAccounts.length > 0 ? automationAccounts : undefined;

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
  data.urgency = resolveEnum(getDirectChildText(root, "urgencia"), urgencyLevels, "Urgência", warnings);
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
  data.mainToolCategoryName = getDirectChildText(root, "categoriaDaFerramenta");
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

// Formato aceito por `automationInventoryInputSchema` (project.router.ts —
// systems/accounts de project.create, project.update E project.importXml).
export interface AutomationInventoryInput {
  systems: { targetSystemId?: string; customName?: string; accessPoint?: string; accessNotes?: string }[];
  accounts: {
    username: string;
    systemIndex?: number;
    accountType?: string;
    ownerName?: string;
    notes?: string;
  }[];
}

/**
 * Converte as duas listas soltas de ParsedProjetoCompleto (targetSystems/
 * automationAccounts) para o formato `{ systems, accounts }` que
 * `automationInventoryInputSchema` espera. É a ÚNICA função que deve fazer
 * essa conversão — o consumidor (project-xml-import-export.tsx) e o
 * verify-xml-roundtrip.ts chamam esta mesma função, em vez de cada um
 * reimplementar o mapeamento, para que os dois nunca divirjam em silêncio
 * (foi exatamente essa divergência, entre o que o parser produzia e o que
 * `project.importXml` aceitava, que fez a Task 11 original perder os 13
 * campos novos e as duas listas na importação de verdade, mesmo com o
 * round-trip build→parse passando).
 *
 * Regra omitir-vs-apagar: devolve `undefined` quando o XML não tem NENHUM
 * `<sistema>` nem `<conta>`. `automationInventory` é uma chave opcional no
 * payload de update/importXml — OMITI-LA preserva o inventário já salvo no
 * projeto; enviar `{ systems: [], accounts: [] }` APAGA as duas listas (ver
 * o comentário em automationInventoryInputSchema, em project.router.ts). Um
 * XML antigo (sem as tags novas) ou um XML que genuinamente não fala de
 * sistemas/contas NUNCA deve apagar o que o projeto já tinha — por isso o
 * `undefined` aqui, e nunca `{ systems: [], accounts: [] }`. Isso também
 * cobre "grupo `<sistemas>` presente mas vazio": parseProjetoCompletoXml já
 * colapsa esse caso no mesmo `undefined` em `targetSystems`/
 * `automationAccounts` (mesmo critério de `features`/`benefícios` etc. no
 * resto deste arquivo), então esta função nunca tem como distinguir os dois
 * e, por segurança, trata ambos como "XML não fala disso".
 */
export function toAutomationInventoryInput(
  parsed: Pick<ParsedProjetoCompleto, "targetSystems" | "automationAccounts">
): AutomationInventoryInput | undefined {
  if (!parsed.targetSystems && !parsed.automationAccounts) return undefined;
  return {
    systems: (parsed.targetSystems ?? []).map((s) => ({
      customName: s.customName,
      accessPoint: s.accessPoint,
      accessNotes: s.accessNotes,
    })),
    accounts: (parsed.automationAccounts ?? []).map((a) => ({
      username: a.username,
      systemIndex: a.systemIndex,
      accountType: a.accountType,
      ownerName: a.ownerName,
      notes: a.notes,
    })),
  };
}
