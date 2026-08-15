import { isExistingAutomation } from "../src/shared/lib/opportunity-classification";
import {
  buildEnvironmentSheet,
  type EnvironmentSheetSource,
} from "../src/shared/lib/existing-automation";

/**
 * Verificação da lógica pura da Ficha de ambiente. Não toca no banco e não
 * importa nada de React nem de pptxgenjs — roda em milissegundos com:
 *   pnpm verify:ambiente
 *
 * Existe porque o repositório não tem test runner: o idioma estabelecido para
 * travar regra de negócio aqui é um script tsx com asserções explícitas (ver
 * scripts/verify-automation-inventory.ts e scripts/verify-xml-roundtrip.ts).
 */

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: esperado ${e}, recebido ${a}`);
}

/**
 * A Ficha de ambiente reusa o predicado que já classifica oportunidade vs.
 * automação existente no badge do Kanban e no filtro da tela de Projetos. O que
 * esta verificação trava é o valor de status: `"completed"`, o que
 * `toFrontendStatus` (src/server/trpc/mappers.ts) entrega ao cliente — NUNCA
 * `"DONE"`, que é o enum cru do Prisma e só vale dentro do `where` do deck.
 * Trocar um pelo outro compila sem erro (os dois são `string`) e faz toda
 * automação entregue sem `hasCurrentApplication = "sim"` perder a página
 * técnica, em silêncio.
 */
function checkPredicate(): void {
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "sim", status: "in-progress" }),
    true,
    "hasCurrentApplication=sim é automação existente"
  );
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "nao", status: "completed" }),
    true,
    "status=completed é automação existente mesmo sem hasCurrentApplication"
  );
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "nao", status: "DONE" }),
    false,
    "DONE é o enum do Prisma e não chega ao cliente — não pode classificar sozinho"
  );
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "nao", status: "in-progress" }),
    false,
    "oportunidade em andamento não é automação existente"
  );
  console.log("OK: predicado isExistingAutomation");
}

/** Fonte vazia — todo caso parte daqui e liga só o que quer testar. */
function emptySource(): EnvironmentSheetSource {
  return {
    hosting: null,
    hostingCustom: null,
    assetId: null,
    robotSchedule: null,
    liveSince: null,
    dataInput: null,
    dataInputDetails: null,
    dataOutput: null,
    dataOutputDetails: null,
    author: null,
    owner: null,
    ownerRole: null,
    ownerArea: null,
    backupOwner: null,
    peopleOfInterest: [],
    accessLocation: null,
    accessReference: null,
    contingencyActions: null,
    contingencyDetails: null,
    handlesSensitiveData: null,
    sensitiveDataCategories: null,
    sensitiveDataDetails: null,
    systems: [],
    accounts: [],
  };
}

function checkEmptyIsNull(): void {
  assertEqual(
    buildEnvironmentSheet(emptySource()),
    null,
    "fonte sem nenhum dado não gera ficha"
  );
  console.log("OK: ficha vazia não é criada");
}

function checkOmission(): void {
  const sheet = buildEnvironmentSheet({
    ...emptySource(),
    owner: "Ana Souza",
    ownerRole: "Coordenadora",
  });
  if (!sheet) throw new Error("omissão: ficha não deveria ser null com responsável preenchido");

  assertEqual(
    sheet.people,
    [{ label: "Responsável hoje", value: "Ana Souza · Coordenadora" }],
    "responsável junta cargo na mesma linha e nenhuma outra linha de pessoa aparece"
  );
  assertEqual(sheet.access, [], "bloco de acessos vazio some inteiro");
  assertEqual(sheet.sensitive, [], "bloco de sigilo vazio some inteiro");
  assertEqual(sheet.flow.input, undefined, "caixa de entrada sem dado não existe");
  assertEqual(sheet.flow.runtime, undefined, "caixa de execução sem dado não existe");
  console.log("OK: campos e blocos vazios são omitidos");
}

function checkLabelsAndFlow(): void {
  const sheet = buildEnvironmentSheet({
    ...emptySource(),
    hosting: "vm-cliente",
    assetId: "SRV-RPA-02",
    robotSchedule: "Diário às 6h",
    liveSince: new Date(2024, 2, 15),
    dataInput: "planilha",
    dataInputDetails: "\\\\fs01\\financeiro\\extrato.xlsx",
    dataOutput: "banco-dados",
    accessLocation: "cofre-senhas",
    accessReference: "KeePass \\ TI \\ RPA",
    contingencyActions: ["reexecutar", "acionar-ti-interno"],
    handlesSensitiveData: "sim",
    sensitiveDataCategories: ["bancarios-financeiros"],
  });
  if (!sheet) throw new Error("labels: ficha não deveria ser null");

  assertEqual(
    sheet.flow.input,
    { title: "Entrada", lines: ["Planilha", "\\\\fs01\\financeiro\\extrato.xlsx"] },
    "entrada resolve o label da taxonomia e mantém o detalhe"
  );
  assertEqual(
    sheet.flow.runtime,
    {
      title: "Onde roda",
      lines: ["Máquina virtual da empresa", "SRV-RPA-02", "Diário às 6h", "Em produção desde 15/03/2024"],
    },
    "execução junta hospedagem, ativo, agendamento e data"
  );
  assertEqual(
    sheet.flow.output,
    { title: "Saída", lines: ["Banco de dados"] },
    "saída sem detalhe traz só o label"
  );
  assertEqual(
    sheet.access,
    [
      { label: "Onde ficam os acessos", value: "Cofre de senhas corporativo" },
      { label: "Referência", value: "KeePass \\ TI \\ RPA" },
      {
        label: "Se parar",
        value: "Reexecutar ou reiniciar a automação, Acionar o TI interno",
      },
    ],
    "acessos resolvem labels de taxonomia e a contingência vira lista"
  );
  assertEqual(
    sheet.sensitive,
    [
      { label: "Dados sigilosos", value: "Sim" },
      { label: "Categorias", value: "Dados bancários e financeiros" },
    ],
    "sigilo resolve resposta e categorias"
  );
  console.log("OK: labels de taxonomia e faixa de fluxo");
}

/**
 * As três coleções são o único caminho até `itemCount`, que decide o tier de
 * densidade (Task 3) e é uma das condições de `isEmpty`. Sem esta verificação,
 * uma regressão em qualquer um dos dois passaria batida.
 */
function checkCollections(): void {
  const sheet = buildEnvironmentSheet({
    ...emptySource(),
    systems: [
      { name: "SAP", category: "ERP", accessPoint: "https://sap.exemplo", accessNotes: null },
      // Nome vazio é dado inconsistente — tem que ser descartado, não desenhado.
      { name: "   ", category: null, accessPoint: null, accessNotes: null },
    ],
    accounts: [
      { username: "svc_rpa", type: "servico", system: "SAP", owner: "TI", notes: null },
      { username: "", type: "email", system: null, owner: null, notes: null },
    ],
    peopleOfInterest: [
      { name: "Carla Menezes", role: "Gerente" },
      { name: "", role: "Sem nome" },
    ],
  });
  if (!sheet) throw new Error("coleções: ficha com sistemas/contas/pessoas não pode ser null");

  assertEqual(sheet.systems.length, 1, "sistema sem nome é descartado");
  assertEqual(sheet.accounts.length, 1, "conta sem login é descartada");
  assertEqual(sheet.peopleOfInterest.length, 1, "pessoa sem nome é descartada");
  assertEqual(sheet.itemCount, 3, "itemCount soma sistemas + contas + pessoas válidos");
  assertEqual(
    sheet.accounts[0].typeLabel,
    "Usuário de serviço",
    "a saída carrega o label resolvido, nunca o slug"
  );
  console.log("OK: coleções alimentam itemCount e descartam entradas inconsistentes");
}

function main(): void {
  checkPredicate();
  checkEmptyIsNull();
  checkOmission();
  checkLabelsAndFlow();
  checkCollections();
  console.log("\nTodas as verificações da Ficha de ambiente passaram.");
}

try {
  main();
} catch (err) {
  console.error(`FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
