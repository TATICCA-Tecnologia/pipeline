import { toNullableFkId } from "@/src/shared/lib/nullable-fk";

/**
 * Verificação da regressão de FK vazia no `project.update`.
 *
 * Bug original (relatado em 2026-08-12, um dia depois da migration
 * 20260811120000_catalogo_qualidade_automacoes): salvar um projeto pela
 * plataforma — tanto pela ficha (project-request-edit-form.tsx) quanto pela
 * aba Especificação (architecture-tab.tsx) — estourava
 *
 *   Foreign key constraint violated on the constraint:
 *   projects_currentApplicationOwnerAreaId_fkey
 *
 * sempre que o Select "Setor do responsável" estava vazio. Os dois formulários
 * guardam esse campo em `useState<string>("")` e mandam o `""` no payload; o
 * router gravava esse `""` direto na coluna FK, e o Postgres só dispensa a
 * verificação de FK para NULL. A criação (wizard e import de XML) nunca
 * quebrou porque build-project-payload.ts já mandava `undefined` no lugar
 * de `""` — daí o sintoma "pela plataforma dá erro, por XML funciona".
 *
 * O que este script trava: `toNullableFkId` é o ponto único por onde passam
 * TODOS os ids de FK do create e do update (`developerId`, `companyId`,
 * `areaId`, `themeId`, `mainToolId`, `mainToolCategoryId` e
 * `currentApplicationOwnerAreaId`). Se alguém trocar essa chamada por
 * `?? null` de novo — que devolve `""` intacto — o cenário 1 falha.
 *
 * Função pura, não toca banco nem rede: roda sem DATABASE_URL, com
 *   npm run verify:nullable-fk
 */

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`
    );
  }
}

function main(): void {
  // Cenário 1 — o bug relatado: Select vazio manda "", que NÃO pode chegar
  // na coluna FK. É a única asserção que falha com o código antigo.
  assertEqual(toNullableFkId(""), null, "Cenário 1: string vazia vira null");

  // Cenário 2 — variação do mesmo caso: valor só com espaços (vem de campo
  // de texto colado / XML mal formatado) também não é um id.
  assertEqual(toNullableFkId("   "), null, "Cenário 2: só espaços vira null");

  // Cenário 3 — id de verdade escolhido no Select passa intacto. Sem isto o
  // "fix" poderia zerar o setor de todo mundo e ainda assim passar verde.
  assertEqual(
    toNullableFkId("cmf0area000000000000000000"),
    "cmf0area000000000000000000",
    "Cenário 3: id válido é preservado"
  );

  // Cenário 4 — espaço acidental em volta de um id válido não deve virar
  // null (isso apagaria o vínculo em silêncio), e sim ser aparado.
  assertEqual(
    toNullableFkId("  cmf0area000000000000000000  "),
    "cmf0area000000000000000000",
    "Cenário 4: id válido com espaços é aparado, não descartado"
  );

  // Cenário 5 — `null` explícito (o payload do architecture-tab manda
  // `mainToolId: mainToolId || null`) continua limpando o vínculo.
  assertEqual(toNullableFkId(null), null, "Cenário 5: null continua null");

  // Cenário 6 — `undefined` só chega aqui se alguém remover o gate
  // `!== undefined` do router; ainda assim o resultado seguro é null, nunca
  // a string "undefined" ou um throw.
  assertEqual(toNullableFkId(undefined), null, "Cenário 6: undefined vira null");

  console.log("OK: 6 cenários de normalização de FK passaram.");
}

main();
