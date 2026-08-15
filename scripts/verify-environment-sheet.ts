import { isExistingAutomation } from "../src/shared/lib/existing-automation";

/**
 * Verificação da lógica pura da Ficha de ambiente
 * (src/shared/lib/existing-automation.ts). Não toca no banco e não importa
 * nada de React nem de pptxgenjs — roda em milissegundos com:
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

function checkPredicate(): void {
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "sim", status: "IN_PROGRESS" }),
    true,
    "hasCurrentApplication=sim é automação existente"
  );
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "nao", status: "DONE" }),
    true,
    "status=DONE é automação existente mesmo sem hasCurrentApplication"
  );
  assertEqual(
    isExistingAutomation({ hasCurrentApplication: "nao", status: "IN_PROGRESS" }),
    false,
    "oportunidade em andamento não é automação existente"
  );
  assertEqual(
    isExistingAutomation({}),
    false,
    "projeto sem nenhum dos dois campos não é automação existente"
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
