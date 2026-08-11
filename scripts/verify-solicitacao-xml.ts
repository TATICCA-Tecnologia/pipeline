import {
  parseSolicitacaoXml,
  type XmlImportContext,
} from "@/src/app/(private)/cliente/solicitar/utils/xml-import";
import { installMiniDomParserPolyfill } from "./lib/mini-dom-parser";

/**
 * Verificação do parser do XML de "solicitação" (`<solicitacaoDeProjeto>`,
 * `parseSolicitacaoXml` em xml-import.ts) — o caminho MAIS usado dos dois
 * formatos de XML deste projeto: é por onde entra tanto o import manual em
 * `/cliente/solicitar` quanto o XML que uma IA externa gera a partir de
 * transcrição de reunião (ver docs/prompt-geracao-xml.md e
 * src/server/ai/xml-generation-prompt.ts). Até este script existir, esse
 * caminho não tinha nenhuma verificação repetível — `verify:xml` cobre só o
 * XML de "projeto completo" (`<projetoCompleto>`), formato e parser
 * diferentes.
 *
 * Cobre os campos de catálogo adicionados na Task 12 (13 escalares novos +
 * as duas listas `targetSystems`/`automationAccounts`):
 *  - Round-trip completo com todos os campos preenchidos e valores restritos
 *    válidos.
 *  - XML antigo (sem nenhuma tag nova) importa sem erro — os campos novos
 *    voltam nos valores-padrão do formulário ("" / []), não undefined: ao
 *    contrário do parser de projeto completo (que distingue "ausente" de
 *    "vazio" com undefined), `SolicitarProjetoFormData` é a forma de um
 *    formulário React Hook Form, e todo campo dele tem um default do Zod.
 *  - Vínculo conta→sistema é resolvido por NOME, sem diferenciar
 *    maiúsculas/minúsculas ("sap" bate com "SAP").
 *  - Linha de sistema sem <nome> e conta sem <usuario> são descartadas com
 *    aviso; <comoAcessar> e <usuario> longos demais são truncados com aviso.
 *  - Conta cujo <sistema> não bate com nenhum <sistema> da lista entra com
 *    systemIndex AUSENTE (null) — nunca descartada, nunca um índice chutado
 *    (o servidor estoura BAD_REQUEST para índice fora do intervalo).
 *  - Valor não reconhecido em campo restrito: cai em "outro" quando a lista
 *    tem essa opção (origemDadosEntrada, destinoDadosSaida, tipo da conta),
 *    ou fica vazio com aviso quando não tem (dadosSigilosos,
 *    setorResponsavelAplicacaoExistente).
 *  - Item não reconhecido dentro de uma lista sem opção "outro"
 *    (acoesContingencia, categoriasDadosSigilosos) não entra no array, mas o
 *    texto original é preservado no campo de detalhes correspondente — nunca
 *    silenciosamente descartado.
 *
 * Função pura — parseSolicitacaoXml não toca banco nem rede — então este
 * script roda de verdade nesta máquina, sem DATABASE_URL. Roda com:
 *   npm run verify:solicitacao-xml
 *
 * Node não tem `DOMParser` global (é uma Web API só de browser/DOM;
 * xml-import.ts é escrito para rodar no browser, de onde é chamado hoje por
 * `/cliente/solicitar` e pela geração de oportunidades por IA em
 * `/admin/oportunidades/gerar-ia`, via use-xml-opportunity-importer.ts). Para
 * exercitar o parser de verdade aqui, este script instala
 * `installMiniDomParserPolyfill()` (scripts/lib/mini-dom-parser.ts,
 * compartilhado com scripts/verify-xml-roundtrip.ts) antes de chamar
 * parseSolicitacaoXml.
 *
 * ATENÇÃO — limite desta abordagem: o polyfill é um parser XML escrito à mão
 * para estes scripts, e ele NÃO é o DOMParser que roda em produção (o do
 * browser). "Parse passou" aqui é evidência forte de que a lógica de
 * parseSolicitacaoXml está correta e consistente — não é prova de que a
 * importação funciona no navegador. Ver o cabeçalho de
 * scripts/lib/mini-dom-parser.ts para o detalhe completo desse limite.
 */

installMiniDomParserPolyfill();

// ---------------------------------------------------------------------------
// Helpers de asserção (mesmo padrão de scripts/verify-xml-roundtrip.ts)
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

// Contexto mínimo de import — mesma forma que /cliente/solicitar e a geração
// de oportunidades por IA passam de verdade (áreas com id real, pra exercitar
// a resolução de <setorResponsavelAplicacaoExistente> por label).
const CONTEXT: XmlImportContext = {
  areas: [
    { value: "financeiro", label: "Financeiro", id: "area-financeiro-1" },
    { value: "rpa", label: "RPA", id: "area-rpa-1" },
  ],
  themesByArea: {
    rpa: [{ value: "rpa-automacao", label: "Automação de processos", id: "theme-automacao-1" }],
  },
  urgencyLevels: [{ value: "alta", label: "Alta — próximo mês" }],
  companies: [{ id: "empresa-1", name: "Empresa Teste LTDA" }],
};

function baseXmlFields(extra: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <empresa>Empresa Teste LTDA</empresa>
  <titulo>Robô de conciliação bancária</titulo>
  <area>RPA</area>
  <tema>Automação de processos</tema>
  <descricao>Descrição do processo fixture.</descricao>
${extra}
</solicitacaoDeProjeto>`;
}

// ---------------------------------------------------------------------------
// Cenário 1: round-trip completo — os 13 escalares novos + as duas listas,
// todos com valores restritos válidos.
// ---------------------------------------------------------------------------

function scenario1FullImport(): void {
  const xml = baseXmlFields(`
  <ativoAplicacaoExistente>SRV-RPA-01</ativoAplicacaoExistente>
  <cargoResponsavelAplicacaoExistente>Analista de Processos</cargoResponsavelAplicacaoExistente>
  <setorResponsavelAplicacaoExistente>Financeiro</setorResponsavelAplicacaoExistente>
  <responsavelSubstitutoAplicacaoExistente>Ciclana Souza</responsavelSubstitutoAplicacaoExistente>
  <acoesContingencia>
    <acao>Acionar o TI interno</acao>
    <acao>Verificar log ou relatório de erro</acao>
  </acoesContingencia>
  <detalhesContingencia>Abrir chamado no TI se persistir.</detalhesContingencia>
  <origemDadosEntrada>Sistema (ERP, CRM, portal)</origemDadosEntrada>
  <detalhesDadosEntrada>Lê lançamentos do SAP.</detalhesDadosEntrada>
  <destinoDadosSaida>Planilha</destinoDadosSaida>
  <detalhesDadosSaida>Grava relatório em Excel.</detalhesDadosSaida>
  <dadosSigilosos>Sim</dadosSigilosos>
  <categoriasDadosSigilosos>
    <categoria>Dados bancários e financeiros</categoria>
    <categoria>Dados fiscais e contábeis</categoria>
  </categoriasDadosSigilosos>
  <detalhesDadosSigilosos>Movimentações bancárias da empresa.</detalhesDadosSigilosos>
  <sistemas>
    <sistema>
      <nome>SAP</nome>
      <pontoAcesso>srv-sap.empresa.local</pontoAcesso>
      <comoAcessar>Cofre de senhas do TI</comoAcessar>
    </sistema>
    <sistema>
      <nome>Portal do Banco X</nome>
      <pontoAcesso>https://portal.bancox.com.br</pontoAcesso>
      <comoAcessar>Certificado A1 instalado na VM</comoAcessar>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <usuario>rpa_sap</usuario>
      <tipo>Usuário de serviço</tipo>
      <sistema>SAP</sistema>
      <responsavel>Ana Souza</responsavel>
      <observacoes>Conta de serviço dedicada</observacoes>
    </conta>
    <conta>
      <usuario>rpa_bancox</usuario>
      <tipo>Certificado digital</tipo>
      <sistema>Portal do Banco X</sistema>
      <responsavel></responsavel>
      <observacoes></observacoes>
    </conta>
  </contas>`);

  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 1: XML deveria ter sido importado com sucesso, falhou: ${result.error}`);
  const { formData, warnings } = result;
  assertEqual(warnings, [], "Cenário 1: não deveria haver avisos com dados válidos");

  assertEqual(formData.currentApplicationAssetId, "SRV-RPA-01", "Cenário 1: ativoAplicacaoExistente");
  assertEqual(
    formData.currentApplicationOwnerRole,
    "Analista de Processos",
    "Cenário 1: cargoResponsavelAplicacaoExistente"
  );
  assertEqual(
    formData.currentApplicationOwnerAreaId,
    "area-financeiro-1",
    "Cenário 1: setorResponsavelAplicacaoExistente resolvido para o id real da área"
  );
  assertEqual(
    formData.currentApplicationBackupOwner,
    "Ciclana Souza",
    "Cenário 1: responsavelSubstitutoAplicacaoExistente"
  );
  assertEqual(
    formData.currentApplicationContingencyActions,
    ["acionar-ti-interno", "verificar-log"],
    "Cenário 1: acoesContingencia"
  );
  assertEqual(
    formData.currentApplicationContingencyDetails,
    "Abrir chamado no TI se persistir.",
    "Cenário 1: detalhesContingencia"
  );
  assertEqual(formData.currentApplicationDataInput, "sistema", "Cenário 1: origemDadosEntrada");
  assertEqual(
    formData.currentApplicationDataInputDetails,
    "Lê lançamentos do SAP.",
    "Cenário 1: detalhesDadosEntrada"
  );
  assertEqual(formData.currentApplicationDataOutput, "planilha", "Cenário 1: destinoDadosSaida");
  assertEqual(
    formData.currentApplicationDataOutputDetails,
    "Grava relatório em Excel.",
    "Cenário 1: detalhesDadosSaida"
  );
  assertEqual(formData.handlesSensitiveData, "sim", "Cenário 1: dadosSigilosos");
  assertEqual(
    formData.sensitiveDataCategories,
    ["bancarios-financeiros", "fiscais-contabeis"],
    "Cenário 1: categoriasDadosSigilosos"
  );
  assertEqual(
    formData.sensitiveDataDetails,
    "Movimentações bancárias da empresa.",
    "Cenário 1: detalhesDadosSigilosos"
  );

  assertEqual(
    formData.targetSystems,
    [
      {
        targetSystemId: "",
        customName: "SAP",
        accessPoint: "srv-sap.empresa.local",
        accessNotes: "Cofre de senhas do TI",
      },
      {
        targetSystemId: "",
        customName: "Portal do Banco X",
        accessPoint: "https://portal.bancox.com.br",
        accessNotes: "Certificado A1 instalado na VM",
      },
    ],
    "Cenário 1: sistemas"
  );
  assertEqual(
    formData.automationAccounts,
    [
      {
        username: "rpa_sap",
        systemIndex: 0,
        accountType: "servico",
        ownerName: "Ana Souza",
        notes: "Conta de serviço dedicada",
      },
      {
        username: "rpa_bancox",
        systemIndex: 1,
        accountType: "certificado",
        ownerName: "",
        notes: "",
      },
    ],
    "Cenário 1: contas"
  );

  console.log(
    "OK: cenário 1 — round-trip completo (13 escalares novos + sistemas + contas) com valores restritos válidos"
  );
}

// ---------------------------------------------------------------------------
// Cenário 2: XML antigo, sem nenhuma tag nova — importa sem erro; campos e
// listas novos vêm nos defaults do formulário ("" / []), nunca undefined
// (diferença de propósito frente ao parser de projeto completo, ver cabeçalho).
// ---------------------------------------------------------------------------

function scenario2LegacyXmlWithoutNewTags(): void {
  const xml = baseXmlFields("");
  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 2: XML antigo deveria importar sem erro, falhou: ${result.error}`);
  assertEqual(result.warnings, [], "Cenário 2: XML antigo não deveria gerar avisos");
  assertEqual(result.formData.title, "Robô de conciliação bancária", "Cenário 2: título ainda lido normalmente");
  assertEqual(result.formData.currentApplicationAssetId, "", "Cenário 2: ativoAplicacaoExistente vazio");
  assertEqual(result.formData.currentApplicationOwnerAreaId, "", "Cenário 2: setorResponsavelAplicacaoExistente vazio");
  assertEqual(result.formData.currentApplicationContingencyActions, [], "Cenário 2: acoesContingencia vazia");
  assertEqual(result.formData.sensitiveDataCategories, [], "Cenário 2: categoriasDadosSigilosos vazia");
  assertEqual(result.formData.handlesSensitiveData, "", "Cenário 2: dadosSigilosos vazio");
  assertEqual(result.formData.targetSystems, [], "Cenário 2: sistemas vazio");
  assertEqual(result.formData.automationAccounts, [], "Cenário 2: contas vazio");
  console.log("OK: cenário 2 — XML antigo (sem tags novas) importa sem erro, campos/listas novos nos defaults");
}

// ---------------------------------------------------------------------------
// Cenário 3: vínculo conta→sistema é resolvido por nome, sem diferenciar
// maiúsculas/minúsculas ("sap" na conta bate com "SAP" no sistema).
// ---------------------------------------------------------------------------

function scenario3CaseInsensitiveSystemLink(): void {
  const xml = baseXmlFields(`
  <sistemas>
    <sistema>
      <nome>SAP</nome>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <usuario>rpa_sap</usuario>
      <sistema>sap</sistema>
    </conta>
  </contas>`);

  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 3: falhou ao importar: ${result.error}`);
  assertEqual(result.formData.targetSystems.length, 1, "Cenário 3: 1 sistema");
  assertEqual(result.formData.automationAccounts.length, 1, "Cenário 3: 1 conta");
  assertEqual(
    result.formData.automationAccounts[0].systemIndex,
    0,
    'Cenário 3: <sistema>sap</sistema> (minúsculo) deveria casar com o sistema "SAP" e resolver systemIndex 0'
  );
  console.log(
    'OK: cenário 3 — conta com <sistema>sap</sistema> (minúsculo) casa com o sistema "SAP" (maiúsculo) — vínculo sobrevive'
  );
}

// ---------------------------------------------------------------------------
// Cenário 4: linhas malformadas são descartadas com aviso (não derrubam a
// importação); campos longos demais são truncados com aviso.
// ---------------------------------------------------------------------------

function scenario4MalformedRowsAndTruncation(): void {
  const longAccessNotes = "A".repeat(250);
  const longUsername = "u".repeat(150);
  const xml = baseXmlFields(`
  <sistemas>
    <sistema>
      <pontoAcesso>Sem nome — deve ser ignorado</pontoAcesso>
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
    </conta>
  </contas>`);

  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 4: falhou ao importar: ${result.error}`);
  const { formData, warnings } = result;

  assertEqual(formData.targetSystems.length, 1, "Cenário 4: sistema sem <nome> foi descartado");
  assertEqual(
    formData.targetSystems[0].accessNotes.length,
    200,
    "Cenário 4: comoAcessar > 200 caracteres foi truncado"
  );
  assertEqual(formData.automationAccounts.length, 1, "Cenário 4: conta sem <usuario> foi descartada");
  assertEqual(
    formData.automationAccounts[0].username.length,
    120,
    "Cenário 4: usuario > 120 caracteres foi truncado"
  );

  assertTrue(
    warnings.some((w) => w.includes("<sistemas>") && w.includes("<nome>")),
    "Cenário 4: deveria haver aviso sobre sistema sem nome"
  );
  assertTrue(
    warnings.some((w) => w.includes("<contas>") && w.includes("<usuario>")),
    "Cenário 4: deveria haver aviso sobre conta sem usuário"
  );
  assertTrue(
    warnings.some((w) => w.includes("<comoAcessar>") && w.includes("truncado")),
    "Cenário 4: deveria haver aviso sobre comoAcessar truncado"
  );
  assertTrue(
    warnings.some((w) => w.includes("<usuario>") && w.includes("truncado")),
    "Cenário 4: deveria haver aviso sobre usuario truncado"
  );

  console.log(
    "OK: cenário 4 — sistema sem <nome> e conta sem <usuario> são descartados com aviso; comoAcessar/usuario longos são truncados com aviso"
  );
}

// ---------------------------------------------------------------------------
// Cenário 5: conta cujo <sistema> não bate com nenhum <sistema> da lista
// entra com systemIndex AUSENTE (null) — nunca descartada, nunca um índice
// chutado.
// ---------------------------------------------------------------------------

function scenario5AccountWithUnmatchedSystem(): void {
  const xml = baseXmlFields(`
  <sistemas>
    <sistema>
      <nome>SAP</nome>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <usuario>rpa_orfa</usuario>
      <sistema>Sistema Inexistente</sistema>
    </conta>
  </contas>`);

  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 5: falhou ao importar: ${result.error}`);
  assertEqual(result.formData.automationAccounts.length, 1, "Cenário 5: conta NÃO descartada");
  assertEqual(
    result.formData.automationAccounts[0].systemIndex,
    null,
    "Cenário 5: <sistema>Sistema Inexistente</sistema> não bate com nada — systemIndex AUSENTE (null)"
  );
  assertTrue(
    result.warnings.some((w) => w.includes("Sistema Inexistente")),
    "Cenário 5: deveria haver aviso sobre o <sistema> sem correspondência"
  );
  console.log(
    "OK: cenário 5 — conta com <sistema> sem correspondência em <sistemas> entra com systemIndex ausente (null), não descartada"
  );
}

// ---------------------------------------------------------------------------
// Cenário 6: valor não reconhecido em campo restrito — comportamento depende
// de a lista ter ou não uma opção "Outro". Item de lista sem opção "outro"
// (acoesContingencia/categoriasDadosSigilosos) é removido do array, mas o
// texto original é preservado no campo de detalhes, nunca descartado sem
// rastro.
// ---------------------------------------------------------------------------

function scenario6UnmatchedRestrictedValues(): void {
  const xml = baseXmlFields(`
  <setorResponsavelAplicacaoExistente>Setor Que Não Existe</setorResponsavelAplicacaoExistente>
  <acoesContingencia>
    <acao>Acionar o TI interno</acao>
    <acao>Ação Inventada Pela IA</acao>
  </acoesContingencia>
  <origemDadosEntrada>Formato Que Não Existe</origemDadosEntrada>
  <dadosSigilosos>Talvez</dadosSigilosos>
  <categoriasDadosSigilosos>
    <categoria>Categoria Inventada Pela IA</categoria>
  </categoriasDadosSigilosos>
  <sistemas>
    <sistema>
      <nome>SAP</nome>
    </sistema>
  </sistemas>
  <contas>
    <conta>
      <usuario>rpa_sap</usuario>
      <tipo>Tipo Que Não Existe</tipo>
    </conta>
  </contas>`);

  const result = parseSolicitacaoXml(xml, CONTEXT);
  if (!result.ok) throw new Error(`Cenário 6: falhou ao importar: ${result.error}`);
  const { formData, warnings } = result;

  // <setorResponsavelAplicacaoExistente> não tem opção "outro" nem irmão de
  // texto livre no schema — sem match, fica vazio.
  assertEqual(
    formData.currentApplicationOwnerAreaId,
    "",
    "Cenário 6: setor sem correspondência fica vazio"
  );
  // <acoesContingencia> não tem opção "outro" — item não reconhecido some do
  // array, mas o texto sobrevive nos detalhes.
  assertEqual(
    formData.currentApplicationContingencyActions,
    ["acionar-ti-interno"],
    "Cenário 6: só a ação reconhecida entra no array"
  );
  assertTrue(
    formData.currentApplicationContingencyDetails.includes("Ação Inventada Pela IA"),
    "Cenário 6: texto da ação não reconhecida preservado nos detalhes de contingência"
  );
  // <origemDadosEntrada> TEM opção "outro" — valor não reconhecido cai nela.
  assertEqual(formData.currentApplicationDataInput, "outro", "Cenário 6: origemDadosEntrada cai em outro");
  // <dadosSigilosos> não tem opção "outro" — sem match, fica vazio.
  assertEqual(formData.handlesSensitiveData, "", "Cenário 6: dadosSigilosos sem match fica vazio");
  // <categoriasDadosSigilosos> não tem opção "outro" — mesmo padrão de
  // acoesContingencia.
  assertEqual(
    formData.sensitiveDataCategories,
    [],
    "Cenário 6: categoria não reconhecida não entra no array"
  );
  assertTrue(
    formData.sensitiveDataDetails.includes("Categoria Inventada Pela IA"),
    "Cenário 6: texto da categoria não reconhecida preservado nos detalhes de dados sigilosos"
  );
  // <tipo> da conta TEM opção "outro".
  assertEqual(
    formData.automationAccounts[0].accountType,
    "outro",
    "Cenário 6: tipo da conta não reconhecido cai em outro"
  );

  assertTrue(warnings.length >= 6, "Cenário 6: cada valor não reconhecido deveria gerar um aviso");

  console.log(
    "OK: cenário 6 — valor não reconhecido cai em \"outro\" quando a lista tem essa opção, ou fica vazio/some do array com aviso quando não tem — nunca chutado, nunca descartado sem rastro"
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function main(): void {
  scenario1FullImport();
  scenario2LegacyXmlWithoutNewTags();
  scenario3CaseInsensitiveSystemLink();
  scenario4MalformedRowsAndTruncation();
  scenario5AccountWithUnmatchedSystem();
  scenario6UnmatchedRestrictedValues();
  console.log("\nTodos os cenários do parser de XML de solicitação passaram.");
}

try {
  main();
} catch (err) {
  console.error(`FALHOU: ${describeError(err)}`);
  process.exit(1);
}
