import {
  buildProjetoCompletoXml,
  type ProjetoCompletoXmlData,
} from "@/shared/xml/build-projeto-completo-xml";
import {
  parseProjetoCompletoXml,
  toAutomationInventoryInput,
} from "@/shared/xml/parse-projeto-completo-xml";
import { automationInventoryInputSchema } from "@/server/trpc/routers/project.router";
import { installMiniDomParserPolyfill } from "./lib/mini-dom-parser";

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
 *  - O objeto `{ systems, accounts }` que o CONSUMIDOR de verdade
 *    (project-xml-import-export.tsx, via toAutomationInventoryInput) monta a
 *    partir do parse bate com `automationInventoryInputSchema` — o schema Zod
 *    REAL de project.router.ts, importado daqui, não uma cópia. Isto existe
 *    porque a primeira versão desta task passava neste script inteiro e
 *    ainda assim perdia os 13 campos e as duas listas na importação de
 *    verdade: `parse` funcionava, mas o consumidor (`project.importXml`)
 *    tinha um input Zod separado de `create`/`update` que nunca foi
 *    estendido, e `z.object` descarta chave desconhecida sem erro. Round-trip
 *    build→parse não bastava — precisava exercitar o formato que o terceiro
 *    elo da corrente (o schema do servidor) realmente aceita.
 *  - `automationInventory` nunca é enviado como apagamento explícito
 *    ({ systems: [], accounts: [] }) a partir de um XML sem <sistemas>/
 *    <contas> — ver toAutomationInventoryInput.
 *
 * Funções puras — build/parse não tocam banco nem rede — então este script
 * roda de verdade nesta máquina, sem DATABASE_URL. Roda com:
 *   npm run verify:xml
 *
 * Node não tem `DOMParser` global (é uma Web API só de browser/DOM;
 * parse-projeto-completo-xml.ts é escrito para rodar no browser, de onde é
 * chamado hoje via project-xml-import-export.tsx). Para exercitar o parser de
 * verdade aqui, este script instala `installMiniDomParserPolyfill()`
 * (scripts/lib/mini-dom-parser.ts, compartilhado com
 * scripts/verify-solicitacao-xml.ts) antes de chamar parseProjetoCompletoXml.
 *
 * ATENÇÃO — limite desta abordagem: o polyfill é um parser XML escrito à mão
 * para estes scripts, e ele NÃO é o DOMParser que roda em produção (o do
 * browser, chamado de dentro de project-xml-import-export.tsx). "Round-trip
 * passou" aqui é evidência forte de que build/parse/consumidor estão
 * consistentes ENTRE SI — não é prova de que a importação funciona no
 * navegador. Ver o cabeçalho de scripts/lib/mini-dom-parser.ts para o
 * detalhe completo desse limite.
 */

installMiniDomParserPolyfill();

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

// Reutilizado pelos cenários 2 (legado importa sem erro) e 6 (legado não gera
// apagamento de inventário) — é o mesmo XML nos dois, então uma string só.
const LEGACY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<projetoCompleto>
  <projetoId>proj-legado-1</projetoId>
  <titulo>Projeto Legado</titulo>
  <descricao>Exportado antes da Task 11 — nenhuma tag nova presente.</descricao>
  <plataforma>Desktop (Windows / macOS)</plataforma>
</projetoCompleto>`;

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
  const result = parseProjetoCompletoXml(LEGACY_XML, URGENCY_LEVELS);
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

// ---------------------------------------------------------------------------
// Cenário 5: o formato que o CONSUMIDOR de verdade monta (toAutomationInventoryInput,
// chamado por project-xml-import-export.tsx) bate com automationInventoryInputSchema —
// o schema Zod real de project.router.ts (project.create/update/importXml),
// importado daqui, não uma cópia. É este cenário que teria pego a lacuna
// original: parse→build passava, mas o consumidor mandava um formato que o
// servidor descartava em silêncio.
// ---------------------------------------------------------------------------

function scenario5ConsumerShapeMatchesServerSchema(): void {
  const project = buildFixtureProject();
  const xml = buildProjetoCompletoXml(project, URGENCY_LEVELS);
  const result = parseProjetoCompletoXml(xml, URGENCY_LEVELS);
  if (!result.ok) throw new Error(`Cenário 5: falhou ao importar: ${result.error}`);

  const inventory = toAutomationInventoryInput(result.data);
  assertTrue(
    inventory !== undefined,
    "Cenário 5: XML com sistemas/contas deveria gerar um automationInventory"
  );

  const parsedBySchema = automationInventoryInputSchema.safeParse(inventory);
  if (!parsedBySchema.success) {
    throw new Error(
      `Cenário 5: o objeto que o consumidor monta NÃO bate com automationInventoryInputSchema (o schema real do servidor): ${JSON.stringify(parsedBySchema.error.issues)}`
    );
  }
  assertEqual(parsedBySchema.data.systems.length, 2, "Cenário 5: 2 sistemas aceitos pelo schema do servidor");
  assertEqual(parsedBySchema.data.accounts.length, 2, "Cenário 5: 2 contas aceitas pelo schema do servidor");
  assertEqual(
    parsedBySchema.data.accounts[1]?.systemIndex,
    1,
    "Cenário 5: systemIndex da segunda conta sobrevive à validação do schema do servidor"
  );

  console.log(
    "OK: cenário 5 — o objeto {systems, accounts} que o consumidor monta a partir do parse é aceito por automationInventoryInputSchema (o schema Zod real do servidor, não uma cópia)"
  );
}

// ---------------------------------------------------------------------------
// Cenário 6: XML legado (sem <sistemas>/<contas>) nunca vira um apagamento
// explícito — toAutomationInventoryInput devolve `undefined`, que o
// consumidor usa para OMITIR `automationInventory` do payload. Omitir
// preserva o inventário já salvo no projeto; um XML sem as tags novas jamais
// pode apagar sistemas/contas que o projeto já tinha.
// ---------------------------------------------------------------------------

function scenario6LegacyXmlNeverProducesAnExplicitWipe(): void {
  const result = parseProjetoCompletoXml(LEGACY_XML, URGENCY_LEVELS);
  if (!result.ok) throw new Error(`Cenário 6: falhou ao importar: ${result.error}`);

  const inventory = toAutomationInventoryInput(result.data);
  assertEqual(
    inventory,
    undefined,
    "Cenário 6: XML sem <sistemas>/<contas> deveria gerar automationInventory=undefined (nunca { systems: [], accounts: [] })"
  );

  console.log(
    "OK: cenário 6 — XML legado gera automationInventory=undefined; o consumidor OMITE a chave do payload, preservando o inventário já existente no projeto (nunca um apagamento explícito)"
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
  scenario5ConsumerShapeMatchesServerSchema();
  scenario6LegacyXmlNeverProducesAnExplicitWipe();
  console.log("\nTodos os cenários do round-trip de XML de catálogo passaram.");
}

try {
  main();
} catch (err) {
  console.error(`FALHOU: ${describeError(err)}`);
  process.exit(1);
}
