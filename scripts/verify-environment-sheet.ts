import { isExistingAutomation } from "../src/shared/lib/opportunity-classification";

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

function main(): void {
  checkPredicate();
  console.log("\nTodas as verificações da Ficha de ambiente passaram.");
}

try {
  main();
} catch (err) {
  console.error(`FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
