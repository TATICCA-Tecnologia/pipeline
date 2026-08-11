import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";

/**
 * Verificação de regressão do inventário de automação (Tasks 1-6):
 * ProjectTargetSystem e ProjectAutomationAccount são gravados por
 * substituição integral a cada save (deleteMany + recreate), então os ids de
 * ProjectTargetSystem mudam a cada `project.update`. As contas apontam para
 * sistemas por ÍNDICE dentro do mesmo payload (`systemIndex`), e é
 * `replaceAutomationInventory` (em src/server/trpc/routers/project.router.ts)
 * quem traduz índice → id recém-criado, na ordem obrigatória: apagar contas →
 * apagar sistemas → criar sistemas → criar contas.
 *
 * Se essa ordem for invertida, ou o loop de `create` virar `createMany` (que
 * não devolve ids), TODO `projectTargetSystemId` vira null a cada save, em
 * silêncio — sem erro, sem log. Este script salva um projeto duas vezes
 * seguidas com o mesmo payload e confirma que o vínculo conta → sistema
 * continua de pé depois do segundo save.
 *
 * Deliberadamente chama `project.create`/`project.update` via createCaller
 * (o mesmo padrão de src/server/deck/build-existing-automations-deck.ts), não
 * uma cópia da transação — só assim o script exercita o código de produção
 * de verdade, em vez de uma reimplementação que passaria verde com o bug
 * presente.
 *
 * Requer DATABASE_URL configurado (conecta em banco de verdade). Roda com:
 *   npm run verify:inventory
 */

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${label}: esperado ${expectedStr}, recebido ${actualStr}`);
  }
}

function assertNotEqual<T>(actual: T, notExpected: T, label: string): void {
  if (JSON.stringify(actual) === JSON.stringify(notExpected)) {
    throw new Error(
      `${label}: esperado um valor DIFERENTE de ${JSON.stringify(notExpected)}, mas recebeu o mesmo`
    );
  }
}

function describeError(err: unknown): string {
  if (err instanceof TRPCError) return `TRPCError(${err.code}): ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

// Payload de inventário reutilizado *pela mesma referência* nos cenários 1 e
// 2 — é o coração do teste: reenviar o payload de verdade numa segunda
// chamada de update, não só reler o banco, que não exercitaria nada.
const INVENTORY_PAYLOAD = {
  systems: [
    { customName: "Sistema A [verify]", accessPoint: "https://sistema-a.example" },
    { customName: "Sistema B [verify]", accessPoint: "https://sistema-b.example" },
  ],
  accounts: [
    { username: "conta-a", systemIndex: 0 },
    // A conta que importa: aponta para o SEGUNDO sistema. Se a ordem
    // apagar/recriar for invertida, este vínculo é o primeiro a virar null.
    { username: "conta-b", systemIndex: 1 },
  ],
};

async function main(): Promise<void> {
  const runId = Date.now();
  const testUser = await db.user.create({
    data: {
      name: "[verify] Automation Inventory Script",
      email: `verify-inventory-${runId}@example.invalid`,
      role: "ADMIN",
      isActive: true,
    },
  });

  const ctx: Context = { db, userId: testUser.id, realUserId: testUser.id };
  const caller = createCaller(ctx);

  let projectId: string | null = null;

  try {
    // ------------------------------------------------------------------
    // Cenário 1: criar um projeto com 2 sistemas e 2 contas, a segunda
    // conta apontando para o segundo sistema (systemIndex: 1).
    // ------------------------------------------------------------------
    const created = await caller.project.create({
      title: `[verify] Inventário de automação — ${runId}`,
      clientId: testUser.id,
      projectType: "Automação",
      automationInventory: INVENTORY_PAYLOAD,
    });
    projectId = created.id;

    let snapshot = await caller.project.byId({ id: projectId });
    assertEqual(snapshot.targetSystems.length, 2, "Cenário 1: quantidade de sistemas");
    assertEqual(snapshot.automationAccounts.length, 2, "Cenário 1: quantidade de contas");

    let sys0 = snapshot.targetSystems.find((s) => s.order === 0);
    let sys1 = snapshot.targetSystems.find((s) => s.order === 1);
    let acc0 = snapshot.automationAccounts.find((a) => a.order === 0);
    let acc1 = snapshot.automationAccounts.find((a) => a.order === 1);
    if (!sys0 || !sys1 || !acc0 || !acc1) {
      throw new Error(
        `Cenário 1: esperava sistemas/contas de order 0 e 1, recebeu ${JSON.stringify(snapshot.targetSystems)} / ${JSON.stringify(snapshot.automationAccounts)}`
      );
    }
    assertEqual(sys0.name, "Sistema A [verify]", "Cenário 1: nome do sistema 0");
    assertEqual(sys1.name, "Sistema B [verify]", "Cenário 1: nome do sistema 1");
    assertEqual(
      acc0.projectTargetSystemId,
      sys0.id,
      "Cenário 1: conta 'conta-a' (systemIndex: 0) deveria apontar para o sistema 0"
    );
    assertEqual(
      acc1.projectTargetSystemId,
      sys1.id,
      "Cenário 1: conta 'conta-b' (systemIndex: 1) deveria apontar para o sistema 1"
    );
    assertEqual(
      acc1.systemName,
      "Sistema B [verify]",
      "Cenário 1: systemName resolvido da conta 'conta-b'"
    );
    console.log(
      "OK: cenário 1 — criar projeto com 2 sistemas + 2 contas grava os vínculos corretos"
    );

    const idsAfterCreate = {
      sys0: sys0.id,
      sys1: sys1.id,
      acc0: acc0.id,
      acc1: acc1.id,
    };

    // ------------------------------------------------------------------
    // Cenário 2 (o coração deste script): atualizar com O MESMO payload de
    // inventário (mesma referência de objeto, reenviada de verdade via
    // project.update — não uma releitura). A substituição integral troca
    // os ids de ProjectTargetSystem; o vínculo conta → sistema precisa
    // continuar correto mesmo assim.
    // ------------------------------------------------------------------
    await caller.project.update({
      id: projectId,
      automationInventory: INVENTORY_PAYLOAD,
    });

    snapshot = await caller.project.byId({ id: projectId });
    assertEqual(snapshot.targetSystems.length, 2, "Cenário 2: quantidade de sistemas após 2º save");
    assertEqual(
      snapshot.automationAccounts.length,
      2,
      "Cenário 2: quantidade de contas após 2º save"
    );

    sys0 = snapshot.targetSystems.find((s) => s.order === 0);
    sys1 = snapshot.targetSystems.find((s) => s.order === 1);
    acc0 = snapshot.automationAccounts.find((a) => a.order === 0);
    acc1 = snapshot.automationAccounts.find((a) => a.order === 1);
    if (!sys0 || !sys1 || !acc0 || !acc1) {
      throw new Error(
        `Cenário 2: esperava sistemas/contas de order 0 e 1 após o 2º save, recebeu ${JSON.stringify(snapshot.targetSystems)} / ${JSON.stringify(snapshot.automationAccounts)}`
      );
    }
    // Prova de que a lista foi de fato recriada (não um no-op silencioso):
    // os ids de ProjectTargetSystem precisam ter mudado.
    assertNotEqual(
      sys0.id,
      idsAfterCreate.sys0,
      "Cenário 2: id do sistema 0 deveria ter mudado (recriado no 2º save)"
    );
    assertNotEqual(
      sys1.id,
      idsAfterCreate.sys1,
      "Cenário 2: id do sistema 1 deveria ter mudado (recriado no 2º save)"
    );
    // A verificação em si: o vínculo continua apontando para o sistema
    // certo, mesmo com o id novo — é exatamente isto que quebra em
    // silêncio se a ordem apagar→recriar for invertida ou createMany for
    // usado no lugar do loop de create.
    assertEqual(
      acc0.projectTargetSystemId,
      sys0.id,
      "Cenário 2 (REGRESSÃO): conta 'conta-a' deveria apontar para o NOVO id do sistema 0 após o 2º save"
    );
    assertEqual(
      acc1.projectTargetSystemId,
      sys1.id,
      "Cenário 2 (REGRESSÃO): conta 'conta-b' deveria apontar para o NOVO id do sistema 1 após o 2º save"
    );
    console.log(
      "OK: cenário 2 — salvar duas vezes seguidas com o mesmo payload preserva o vínculo conta → sistema (ids recriados, referência correta)"
    );

    const idsAfterSecondSave = {
      sys0: sys0.id,
      sys1: sys1.id,
      acc0: acc0.id,
      acc1: acc1.id,
    };

    // ------------------------------------------------------------------
    // Cenário 3: atualizar OMITINDO automationInventory por completo.
    // Semântica documentada em automationInventoryInputSchema: omitir a
    // chave preserva as listas existentes (não confundir com enviar
    // { systems: [], accounts: [] }, que apaga — cenário 4).
    // ------------------------------------------------------------------
    await caller.project.update({
      id: projectId,
      title: `[verify] Inventário de automação — ${runId}`,
      // automationInventory deliberadamente ausente do payload.
    });

    snapshot = await caller.project.byId({ id: projectId });
    const idsAfterOmit = {
      sys0: snapshot.targetSystems.find((s) => s.order === 0)?.id,
      sys1: snapshot.targetSystems.find((s) => s.order === 1)?.id,
      acc0: snapshot.automationAccounts.find((a) => a.order === 0)?.id,
      acc1: snapshot.automationAccounts.find((a) => a.order === 1)?.id,
    };
    assertEqual(
      idsAfterOmit,
      idsAfterSecondSave,
      "Cenário 3: omitir automationInventory em project.update deveria PRESERVAR as listas (mesmos ids)"
    );
    console.log(
      "OK: cenário 3 — atualizar sem enviar automationInventory preserva as listas existentes"
    );

    // ------------------------------------------------------------------
    // Cenário 4: atualizar com { systems: [], accounts: [] } explícito
    // apaga as duas listas.
    // ------------------------------------------------------------------
    await caller.project.update({
      id: projectId,
      automationInventory: { systems: [], accounts: [] },
    });

    snapshot = await caller.project.byId({ id: projectId });
    assertEqual(
      snapshot.targetSystems.length,
      0,
      "Cenário 4: { systems: [], accounts: [] } deveria apagar os sistemas"
    );
    assertEqual(
      snapshot.automationAccounts.length,
      0,
      "Cenário 4: { systems: [], accounts: [] } deveria apagar as contas"
    );
    console.log(
      "OK: cenário 4 — atualizar com listas vazias explícitas apaga sistemas e contas"
    );

    // ------------------------------------------------------------------
    // Cenário 5: índice inválido deve estourar erro, não gravar conta
    // órfã. Cria um projeto à parte (o caso positivo dos cenários 1-4 já
    // consumiu `projectId`); a criação inteira deve falhar dentro da
    // transação, então nenhuma linha deve sobrar em nenhuma tabela.
    // ------------------------------------------------------------------
    const invalidTitle = `[verify] Índice inválido — ${runId}`;
    let scenario5Threw = false;
    try {
      await caller.project.create({
        title: invalidTitle,
        clientId: testUser.id,
        projectType: "Automação",
        automationInventory: {
          systems: [{ customName: "Sistema único [verify]" }],
          accounts: [{ username: "conta-orfa", systemIndex: 5 }],
        },
      });
    } catch (err) {
      scenario5Threw = true;
      if (!(err instanceof TRPCError) || err.code !== "BAD_REQUEST") {
        throw new Error(
          `Cenário 5: esperava TRPCError(BAD_REQUEST) para systemIndex fora do intervalo, recebeu ${describeError(err)}`
        );
      }
    }
    if (!scenario5Threw) {
      throw new Error(
        "Cenário 5: esperava que project.create() estourasse erro para systemIndex fora do intervalo, mas ele retornou com sucesso — risco de conta órfã gravada em silêncio."
      );
    }
    // Segurança extra: confirma que a transação não deixou nada para trás
    // (o rollback do $transaction já deveria garantir isso).
    const leaked = await db.project.findMany({
      where: { title: invalidTitle },
      select: { id: true },
    });
    if (leaked.length > 0) {
      await db.project.deleteMany({ where: { id: { in: leaked.map((p) => p.id) } } });
      throw new Error(
        `Cenário 5: transação deveria ter feito rollback total, mas ${leaked.length} projeto(s) órfão(s) ficaram gravados`
      );
    }
    console.log(
      "OK: cenário 5 — systemIndex fora do intervalo estoura erro em vez de gravar conta órfã"
    );

    console.log("\nTodos os cenários do inventário de automação passaram.");
  } finally {
    // try/finally garante a limpeza mesmo se uma verificação acima falhar —
    // um projeto "[verify]" órfão sujando a base de alguém é o tipo de
    // efeito colateral que este script não deveria deixar para trás.
    if (projectId) {
      await db.project.delete({ where: { id: projectId } }).catch(() => {});
    }
    await db.user.delete({ where: { id: testUser.id } }).catch(() => {});
  }
}

main()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error(`FALHOU: ${describeError(err)}`);
    return db.$disconnect().finally(() => process.exit(1));
  });
