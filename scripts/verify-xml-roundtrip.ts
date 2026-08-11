import {
  buildProjetoCompletoXml,
  type ProjetoCompletoXmlData,
} from "@/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "@/shared/xml/parse-projeto-completo-xml";

/**
 * Verificação de round-trip dos campos de catálogo (Task 11) no XML de
 * "projeto completo": monta um projeto fictício com os 13 escalares novos e
 * as duas listas (targetSystems/automationAccounts) preenchidos, serializa
 * com buildProjetoCompletoXml, reimporta com parseProjetoCompletoXml e
 * compara o resultado contra o original.
 *
 * Cobre também:
 *  - XML antigo (sem nenhuma tag nova) importa sem erro, com os campos novos
 *    e as duas listas ausentes (undefined), não vazios-por-acidente.
 *  - Vínculo conta→sistema é resolvido por NOME, comparando sem diferenciar
 *    maiúsculas/minúsculas ("sap" bate com "SAP").
 *  - Linha de sistema sem <nome> e conta sem <usuario> são descartadas com
 *    aviso, sem derrubar a importação; <comoAcessar> e <usuario> longos
 *    demais são truncados com aviso; conta cujo <sistema> não bate com
 *    nenhum <sistema> da lista entra com systemIndex AUSENTE (nunca
 *    descartada, nunca um índice chutado — replaceAutomationInventory, em
 *    project.router.ts, estoura BAD_REQUEST para índice fora do intervalo).
 *
 * Funções puras — build/parse não tocam banco nem rede — então este script
 * roda de verdade nesta máquina, sem DATABASE_URL. Roda com:
 *   npm run verify:xml
 *
 * Node não tem `DOMParser` global (é uma Web API só de browser/DOM;
 * parse-projeto-completo-xml.ts é escrito para rodar no browser, de onde é
 * chamado hoje via project-xml-import-export.tsx). Para exercitar o parser
 * de verdade aqui, este script registra um polyfill mínimo de
 * DOMParser/Document/Element em globalThis antes de chamar
 * parseProjetoCompletoXml — cobre só o subconjunto do DOM que o parser usa
 * (tagName, children, textContent, querySelector), suficiente para os XMLs
 * bem-formados e sem namespace/CDATA/comentário que este projeto gera.
 */

// ---------------------------------------------------------------------------
// Polyfill mínimo de DOMParser para Node (ver comentário acima).
// ---------------------------------------------------------------------------

class MiniElement {
  tagName: string;
  children: MiniElement[] = [];
  private textChunks: string[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  addText(text: string): void {
    if (text.length > 0) this.textChunks.push(text);
  }

  get textContent(): string {
    const own = this.textChunks.join("");
    const nested = this.children.map((c) => c.textContent).join("");
    return own + nested;
  }
}

class MiniDocument {
  documentElement: MiniElement | null = null;
  // Nunca usado pelos cenários deste script (todos os XMLs de entrada são
  // bem-formados) — presente só para satisfazer a chamada
  // `doc.querySelector("parsererror")` do parser.
  querySelector(_selector: string): MiniElement | null {
    return null;
  }
}

function unescapeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

class MiniDOMParser {
  parseFromString(xmlText: string): MiniDocument {
    const doc = new MiniDocument();
    let s = xmlText.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/, "");
    let i = 0;

    function skipWhitespace(): void {
      while (i < s.length && /\s/.test(s[i])) i++;
    }

    function parseElement(): MiniElement {
      // Assume s[i] === '<' ao entrar.
      i++; // skip '<'
      const tagStart = i;
      while (i < s.length && s[i] !== ">") i++;
      let rawTag = s.slice(tagStart, i);
      i++; // skip '>'
      const selfClosing = rawTag.endsWith("/");
      if (selfClosing) rawTag = rawTag.slice(0, -1).trimEnd();
      const el = new MiniElement(rawTag);
      if (selfClosing) return el;

      while (true) {
        if (i >= s.length) {
          throw new Error(`XML malformado: tag <${rawTag}> nunca foi fechada.`);
        }
        if (s[i] === "<") {
          if (s[i + 1] === "/") {
            const closeStart = i + 2;
            let j = closeStart;
            while (j < s.length && s[j] !== ">") j++;
            const closeName = s.slice(closeStart, j);
            i = j + 1;
            if (closeName !== rawTag) {
              throw new Error(
                `XML malformado: esperava fechar <${rawTag}>, encontrou </${closeName}>.`
              );
            }
            break;
          }
          el.children.push(parseElement());
        } else {
          const textStart = i;
          while (i < s.length && s[i] !== "<") i++;
          el.addText(unescapeXmlEntities(s.slice(textStart, i)));
        }
      }
      return el;
    }

    skipWhitespace();
    if (s[i] === "<") {
      doc.documentElement = parseElement();
    }
    return doc;
  }
}

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
  MiniDOMParser as unknown as typeof DOMParser;

// ---------------------------------------------------------------------------
// Helpers de asserção (mesmo padrão de scripts/verify-automation-inventory.ts)
// ---------------------------------------------------------------------------

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${label}: esperado ${expectedStr}, recebido ${actualStr}`);
  }
}

function assertTrue(condition: boolean, label: string): void {
  if (!condition) throw new Error(`${label}: condição falhou`);
}

const URGENCY_LEVELS = [{ value: "alta", label: "Alta — próximo mês" }];

// ---------------------------------------------------------------------------
// Cenário 1: round-trip completo — todos os 13 escalares novos + as duas
// listas preenchidos.
// ---------------------------------------------------------------------------

function buildFixtureProject(): ProjetoCompletoXmlData {
  return {
    id: "proj-fixture-1",
    companyName: "Empresa Fixture LTDA",
    title: "Robô de conciliação bancária",
    area: { id: "area-1", name: "RPA", slug: "rpa" },
    theme: { id: "theme-1", name: "Automação de processos", slug: "rpa-automacao" },
    platform: "desktop",
    description: "Descrição do projeto fixture para o round-trip.",
    targetAudience: "interno",
    expectedUsers: "12",
    hasExistingSystem: "sim-melhorar",
    existingSystemDetails: "Processo manual em planilha.",
    hasCurrentApplication: "sim",
    currentApplicationDetails: "Robô já roda em produção.",
    currentApplicationHosting: "vm-cliente",
    currentApplicationHostingCustom: undefined,
    currentApplicationAuthor: "Fulano de Tal",
    currentApplicationOwner: "Ciclana Souza",
    currentApplicationAccessLocation: "cofre-senhas",
    // ">" testa escaping/unescaping de verdade, não só campos "seguros".
    currentApplicationAccessReference: "Cofre TI > Robôs > Financeiro",
    currentApplicationLiveSince: new Date("2023-05-10T00:00:00Z"),
    currentApplicationAssetId: "srv-rpa-03 (10.0.4.22)",
    currentApplicationOwnerRole: "Analista de TI Sênior",
    currentApplicationOwnerAreaName: "Tecnologia da Informação",
    currentApplicationDataInput: "sistema",
    currentApplicationDataInputDetails: "Lê lançamentos do ERP via consulta SQL.",
    currentApplicationDataOutput: "planilha",
    currentApplicationDataOutputDetails: "Grava relatório de conciliação em Excel.",
    currentApplicationContingencyActions: ["reexecutar", "acionar-ti-interno"],
    currentApplicationContingencyDetails: "Reexecutar o job; se persistir, abrir chamado no TI.",
    currentApplicationBackupOwner: "Beltrano Lima",
    handlesSensitiveData: "sim",
    sensitiveDataCategories: ["bancarios-financeiros", "fiscais-contabeis"],
    sensitiveDataDetails: "Movimentações bancárias da empresa.",
    targetSystems: [
      {
        id: "sys-1",
        targetSystemId: "cat-sap",
        name: "SAP",
        categoryName: "ERP",
        accessPoint: "srv-sap.empresa.local",
        accessNotes: "Cofre de senhas do TI",
        order: 0,
      },
      {
        id: "sys-2",
        targetSystemId: null,
        name: "Portal do Banco X",
        categoryName: null,
        accessPoint: "https://portal.bancox.com.br",
        accessNotes: "Certificado A1 instalado na VM",
        order: 1,
      },
    ],
    automationAccounts: [
      {
        id: "acc-1",
        username: "rpa_sap",
        projectTargetSystemId: "sys-1",
        systemName: "SAP",
        accountType: "servico",
        ownerName: "Ana Souza",
        // "&" testa escaping/unescaping junto com o ">" acima.
        notes: "Conta de serviço dedicada (financeiro & contábil)",
        order: 0,
      },
      {
        id: "acc-2",
        username: "rpa_bancox",
        projectTargetSystemId: "sys-2",
        systemName: "Portal do Banco X",
        accountType: "certificado",
        ownerName: null,
        notes: null,
        order: 1,
      },
    ],
    peopleInvolved: 3,
    taskDurationHours: 2.5,
    processFrequency: "diario",
    projectNarrative: "Narrativa do processo fixture.",
    features: ["Conciliação automática", "Alertas de divergência"],
    benefits: ["reducao-trabalho-operacional", "melhoria-qualidade-trabalho"],
    benefitsDetails: "Reduz retrabalho manual da equipe financeira.",
    monthlyHoursSaved: 40,
    ratingErrorReduction: 4,
    ratingProcessCriticality: 5,
    ratingInternalImpact: 4,
    ratingExternalImpact: 2,
    ratingCompliance: 5,
    urgency: "alta",
    estimatedDeadline: new Date("2026-12-01T00:00:00Z"),
    additionalInfo: "Informações adicionais fixture.",
    mainToolCategory: { id: "cat-1", name: "RPA", slug: "rpa" },
    mainTool: { id: "tool-1", name: "UiPath", slug: "uipath" },
    peopleOfInterest: [{ id: "poi-1", name: "Fulano Interessado" }],
    complexity: "media",
    robotSchedule: "Hora fixa, uma vez por dia",
    hourlyRateBRL: 85,
    estimatedAnnualSavingBRL: 30000,
    executionStrategy: "agendada",
    solutionTypes: [{ id: "st-1", name: "RPA", slug: "rpa" }],
    architectNotes: "Notas do arquiteto fixture.",
    implementationEffortDays: 12,
    implementationWave: 1,
    waveOrder: 2,
  };
}

function scenario1FullRoundTrip(): void {
  const project = buildFixtureProject();
  const xml = buildProjetoCompletoXml(project, URGENCY_LEVELS);
  const result = parseProjetoCompletoXml(xml, URGENCY_LEVELS);
  if (!result.ok) {
    throw new Error(`Cenário 1: XML deveria ter sido importado com sucesso, falhou: ${result.error}`);
  }
  const { data, warnings } = result;
  assertEqual(warnings, [], "Cenário 1: não deveria haver avisos com dados válidos");

  // Sanidade básica de campos já existentes (a serialização/leitura desses
  // não é o foco da Task 11, mas confirma que nada quebrou ao redor).
  assertEqual(data.title, project.title, "Cenário 1: título");
  assertEqual(data.areaName, project.area?.name, "Cenário 1: área");

  // Os 13 escalares novos.
  assertEqual(
    data.currentApplicationAssetId,
    project.currentApplicationAssetId,
    "Cenário 1: ativoAplicacaoExistente"
  );
  assertEqual(
    data.currentApplicationOwnerRole,
    project.currentApplicationOwnerRole,
    "Cenário 1: cargoResponsavelAplicacaoExistente"
  );
  assertEqual(
    data.currentApplicationOwnerAreaName,
    project.currentApplicationOwnerAreaName,
    "Cenário 1: setorResponsavelAplicacaoExistente"
  );
  assertEqual(
    data.currentApplicationDataInput,
    project.currentApplicationDataInput,
    "Cenário 1: origemDadosEntrada"
  );
  assertEqual(
    data.currentApplicationDataInputDetails,
    project.currentApplicationDataInputDetails,
    "Cenário 1: detalhesDadosEntrada"
  );
  assertEqual(
    data.currentApplicationDataOutput,
    project.currentApplicationDataOutput,
    "Cenário 1: destinoDadosSaida"
  );
  assertEqual(
    data.currentApplicationDataOutputDetails,
    project.currentApplicationDataOutputDetails,
    "Cenário 1: detalhesDadosSaida"
  );
  assertEqual(
    data.currentApplicationContingencyActions,
    project.currentApplicationContingencyActions,
    "Cenário 1: acoesContingencia"
  );
  assertEqual(
    data.currentApplicationContingencyDetails,
    project.currentApplicationContingencyDetails,
    "Cenário 1: detalhesContingencia"
  );
  assertEqual(
    data.currentApplicationBackupOwner,
    project.currentApplicationBackupOwner,
    "Cenário 1: responsavelSubstitutoAplicacaoExistente"
  );
  assertEqual(data.handlesSensitiveData, project.handlesSensitiveData, "Cenário 1: dadosSigilosos");
  assertEqual(
    data.sensitiveDataCategories,
    project.sensitiveDataCategories,
    "Cenário 1: categoriasDadosSigilosos"
  );
  assertEqual(data.sensitiveDataDetails, project.sensitiveDataDetails, "Cenário 1: detalhesDadosSigilosos");

  // As duas listas.
  assertEqual(
    data.targetSystems,
    [
      { customName: "SAP", accessPoint: "srv-sap.empresa.local", accessNotes: "Cofre de senhas do TI" },
      {
        customName: "Portal do Banco X",
        accessPoint: "https://portal.bancox.com.br",
        accessNotes: "Certificado A1 instalado na VM",
      },
    ],
    "Cenário 1: sistemas"
  );
  assertEqual(
    data.automationAccounts,
    [
      {
        username: "rpa_sap",
        systemIndex: 0,
        accountType: "servico",
        ownerName: "Ana Souza",
        notes: "Conta de serviço dedicada (financeiro & contábil)",
      },
      {
        username: "rpa_bancox",
        systemIndex: 1,
        accountType: "certificado",
        ownerName: undefined,
        notes: undefined,
      },
    ],
    "Cenário 1: contas"
  );

  console.log(
    "OK: cenário 1 — round-trip completo (13 escalares novos + sistemas + contas) preserva todos os valores"
  );
}

// ---------------------------------------------------------------------------
// Cenário 2: XML antigo, sem nenhuma tag nova — importa sem erro, campos e
// listas novos vêm undefined (não [] "vazio por acidente").
// ---------------------------------------------------------------------------

function scenario2LegacyXmlWithoutNewTags(): void {
  const legacyXml = `<?xml version="1.0" encoding="UTF-8"?>
<projetoCompleto>
  <projetoId>proj-legado-1</projetoId>
  <titulo>Projeto Legado</titulo>
  <descricao>Exportado antes da Task 11 — nenhuma tag nova presente.</descricao>
  <plataforma>Desktop (Windows / macOS)</plataforma>
</projetoCompleto>`;

  const result = parseProjetoCompletoXml(legacyXml, URGENCY_LEVELS);
  if (!result.ok) {
    throw new Error(`Cenário 2: XML antigo deveria importar sem erro, falhou: ${result.error}`);
  }
  assertEqual(result.warnings, [], "Cenário 2: XML antigo não deveria gerar avisos");
  assertEqual(result.data.title, "Projeto Legado", "Cenário 2: título ainda lido normalmente");
  assertEqual(result.data.targetSystems, undefined, "Cenário 2: sistemas ausentes, não lista vazia");
  assertEqual(result.data.automationAccounts, undefined, "Cenário 2: contas ausentes, não lista vazia");
  assertEqual(
    result.data.currentApplicationAssetId,
    undefined,
    "Cenário 2: ativoAplicacaoExistente ausente"
  );
  assertEqual(
    result.data.currentApplicationContingencyActions,
    undefined,
    "Cenário 2: acoesContingencia ausente"
  );
  assertEqual(result.data.sensitiveDataCategories, undefined, "Cenário 2: categoriasDadosSigilosos ausente");
  console.log("OK: cenário 2 — XML antigo (sem tags novas) importa sem erro e com listas/campos ausentes");
}

// ---------------------------------------------------------------------------
// Cenário 3: vínculo conta→sistema é resolvido por nome, sem diferenciar
// maiúsculas/minúsculas ("sap" na conta bate com "SAP" no sistema).
// ---------------------------------------------------------------------------

function scenario3CaseInsensitiveSystemLink(): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<projetoCompleto>
  <titulo>Teste de casing</titulo>
  <sistemas>
    <sistema>
      <nome>SAP</nome>
      <categoria>ERP</categoria>
      <pontoAcesso>srv-sap.empresa.local</pontoAcesso>
      <comoAcessar>Cofre de senhas do TI</comoAcessar>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <usuario>rpa_sap</usuario>
      <tipo>Usuário de serviço</tipo>
      <sistema>sap</sistema>
      <responsavel>Ana Souza</responsavel>
      <observacoes></observacoes>
    </conta>
  </contas>
</projetoCompleto>`;

  const result = parseProjetoCompletoXml(xml, URGENCY_LEVELS);
  if (!result.ok) throw new Error(`Cenário 3: falhou ao importar: ${result.error}`);
  assertEqual(result.data.targetSystems?.length, 1, "Cenário 3: 1 sistema");
  assertEqual(result.data.automationAccounts?.length, 1, "Cenário 3: 1 conta");
  assertEqual(
    result.data.automationAccounts?.[0]?.systemIndex,
    0,
    'Cenário 3: <sistema>sap</sistema> (minúsculo) deveria casar com o sistema "SAP" e resolver systemIndex 0'
  );
  console.log(
    'OK: cenário 3 — conta com <sistema>sap</sistema> (minúsculo) casa com o sistema "SAP" (maiúsculo) — vínculo sobrevive'
  );
}

// ---------------------------------------------------------------------------
// Cenário 4: linhas malformadas são descartadas com aviso (não derrubam a
// importação); campos longos demais são truncados com aviso; conta cujo
// <sistema> não bate com nenhum <sistema> da lista entra com systemIndex
// AUSENTE — nunca descartada, nunca um índice chutado.
// ---------------------------------------------------------------------------

function scenario4MalformedRowsAndTruncation(): void {
  const longAccessNotes = "A".repeat(250);
  const longUsername = "u".repeat(150);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<projetoCompleto>
  <titulo>Teste de casos-limite</titulo>
  <sistemas>
    <sistema>
      <categoria>Sem nome — deve ser ignorado</categoria>
    </sistema>
    <sistema>
      <nome>Sistema Válido</nome>
      <comoAcessar>${longAccessNotes}</comoAcessar>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <tipo>Sem usuário — deve ser ignorada</tipo>
    </conta>
    <conta>
      <usuario>${longUsername}</usuario>
      <sistema>Sistema Inexistente</sistema>
    </conta>
  </contas>
</projetoCompleto>`;

  const result = parseProjetoCompletoXml(xml, URGENCY_LEVELS);
  if (!result.ok) throw new Error(`Cenário 4: falhou ao importar: ${result.error}`);
  const { data, warnings } = result;

  assertEqual(data.targetSystems?.length, 1, "Cenário 4: sistema sem <nome> foi descartado");
  assertEqual(
    data.targetSystems?.[0]?.accessNotes?.length,
    200,
    "Cenário 4: comoAcessar > 200 caracteres foi truncado"
  );
  assertEqual(data.automationAccounts?.length, 1, "Cenário 4: conta sem <usuario> foi descartada");
  assertEqual(
    data.automationAccounts?.[0]?.username.length,
    120,
    "Cenário 4: usuario > 120 caracteres foi truncado"
  );
  assertEqual(
    data.automationAccounts?.[0]?.systemIndex,
    undefined,
    'Cenário 4: <sistema>Sistema Inexistente</sistema> não bate com nada — systemIndex AUSENTE, conta NÃO descartada'
  );

  assertTrue(
    warnings.some((w) => w.includes('sistema') && w.includes('nome')),
    "Cenário 4: deveria haver aviso sobre sistema sem nome"
  );
  assertTrue(
    warnings.some((w) => w.includes("<conta>") && w.includes("<usuario>")),
    "Cenário 4: deveria haver aviso sobre conta sem usuário"
  );
  assertTrue(
    warnings.some((w) => w.toLowerCase().includes("como acessar")),
    "Cenário 4: deveria haver aviso sobre comoAcessar truncado"
  );
  assertTrue(
    warnings.some((w) => w.toLowerCase().includes("usuário da conta")),
    "Cenário 4: deveria haver aviso sobre usuario truncado"
  );

  console.log(
    "OK: cenário 4 — sistema sem nome e conta sem usuário são descartados com aviso; comoAcessar/usuario longos são truncados com aviso; conta com <sistema> sem correspondência entra com systemIndex ausente (não descartada)"
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function main(): void {
  scenario1FullRoundTrip();
  scenario2LegacyXmlWithoutNewTags();
  scenario3CaseInsensitiveSystemLink();
  scenario4MalformedRowsAndTruncation();
  console.log("\nTodos os cenários do round-trip de XML de catálogo passaram.");
}

try {
  main();
} catch (err) {
  console.error(`FALHOU: ${describeError(err)}`);
  process.exit(1);
}
