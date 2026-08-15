# Slide de ambiente das automações existentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao slide executivo de automações já em produção uma segunda página técnica ("Ficha de ambiente") com pessoas, sistemas, contas, fluxo de dados, acessos, contingência e sigilo, espelhada no deck `.pptx`.

**Architecture:** Um módulo puro (`src/shared/lib/existing-automation.ts`) decide *o que* aparece — predicado de automação existente, regra de omissão, tier de densidade, reflow de colunas — a partir de um tipo normalizado `EnvironmentSheetSource`. As duas superfícies (React e pptx) só mapeiam sua própria fonte de dados para esse tipo e desenham o resultado. A página 16:9 do React vira primitiva reutilizável (`SlidePage`) com piso de shrink parametrizável.

**Tech Stack:** Next.js 16 / React 19, TypeScript 5.7, Tailwind 4, pptxgenjs 4, tsx para scripts. **Não existe test runner no repositório** — a verificação segue o idioma já estabelecido: scripts `tsx` (`scripts/verify-*.ts`, expostos como `pnpm verify:*`) para lógica pura e scripts de preview `.pptx` (`scripts/preview-*.ts`) para o deck. Cada task escreve a verificação antes da implementação e a roda para vê-la falhar.

**Spec:** `docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `src/shared/lib/existing-automation.ts` | **Criar.** Tipo `EnvironmentSheetSource`, `buildEnvironmentSheet`, `densityTierFor`, `splitIntoColumns`. Sem JSX, sem Prisma, sem React. O predicado **não** mora aqui: já existe em `src/shared/lib/opportunity-classification.ts` e é reusado. | 2–3 |
| `scripts/verify-environment-sheet.ts` | **Criar.** Verificação da lógica pura acima. Sem banco. | 1–3 |
| `src/shared/components/slide/slide-page.tsx` | **Criar.** Primitiva da página 16:9 (tarjas, `useFitToSlide` com piso parametrizável). Extraída do componente atual. | 4 |
| `src/shared/components/slide/rating-radar-chart.tsx` | **Criar.** Radar, hoje inline no componente atual. | 4 |
| `src/shared/components/slide/project-to-environment-source.ts` | **Criar.** Adapta `Project` → `EnvironmentSheetSource` aplicando a máscara do modo demonstração. | 5 |
| `src/shared/components/slide/environment-sheet-page.tsx` | **Criar.** Desenha a Ficha de ambiente. | 6 |
| `src/shared/components/project-executive-slide.tsx` | **Modificar.** Vira orquestrador; página 1 perde as 5 linhas técnicas e ganha 2 linhas quantitativas. | 4, 7 |
| `src/app/globals.css` | **Modificar.** Quebra de página na impressão. | 8 |
| `src/server/deck/build-existing-automations-deck.ts` | **Modificar.** `select` maior, tipos maiores, `hasFichaTecnicaData`, `addFichaTecnicaSlide` reescrito, `extraLines` enxutas. | 9–11 |
| `scripts/preview-ficha-tecnica-slide.ts` | **Modificar.** Casos cobrindo os três tiers e a omissão de blocos. | 12 |
| `package.json` | **Modificar.** Script `verify:ambiente`. | 1 |

---

### Task 1: Travar a semântica do predicado existente

> **Correção aplicada durante a execução.** A primeira versão desta task mandava criar
> `isExistingAutomation` em `existing-automation.ts` comparando com `"DONE"`. Isso estava
> errado duas vezes: a função **já existe** em
> `src/shared/lib/opportunity-classification.ts:7`, e o valor de status que chega ao
> componente é `"completed"` (mapeado por `toFrontendStatus`), nunca `"DONE"`. As duas
> comparam `string` contra `string`, então o TypeScript não pegaria o erro — uma automação
> entregue sem `hasCurrentApplication = "sim"` deixaria de ganhar a página técnica, em
> silêncio. Esta task passa a apenas travar a semântica da função que existe.

**Files:**
- Create: `scripts/verify-environment-sheet.ts`
- Modify: `package.json` (bloco `scripts`)

- [ ] **Step 1: Adicionar o script npm de verificação**

Em `package.json`, dentro de `"scripts"`, logo abaixo da linha `"verify:inventory"`:

```json
    "verify:ambiente": "tsx scripts/verify-environment-sheet.ts",
```

- [ ] **Step 2: Escrever a verificação que falha**

Criar `scripts/verify-environment-sheet.ts`:

```ts
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
```

- [ ] **Step 3: Rodar e confirmar que passa**

Run: `pnpm verify:ambiente`
Expected: `OK: predicado isExistingAutomation` e `Todas as verificações da Ficha de ambiente passaram.`

Não há passo de "rodar para falhar" aqui: o predicado já existe e está correto. O que esta
task acrescenta é a trava contra a regressão descrita no aviso acima. Para confirmar que a
verificação tem dente, trocar temporariamente `"completed"` por `"DONE"` na segunda
asserção, rodar e ver falhar, e desfazer.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/verify-environment-sheet.ts
git commit -m "test: trava a semantica do predicado de automacao existente"
```

---

### Task 2: Montagem da ficha com omissão de vazios

**Files:**
- Create: `src/shared/lib/existing-automation.ts`
- Modify: `scripts/verify-environment-sheet.ts`

- [ ] **Step 1: Escrever a verificação que falha**

Em `scripts/verify-environment-sheet.ts`, acrescentar um segundo `import` abaixo do que já
existe (o de `opportunity-classification`, que continua como está):

```ts
import {
  buildEnvironmentSheet,
  type EnvironmentSheetSource,
} from "../src/shared/lib/existing-automation";
```

E acrescentar, antes de `function main()`:

```ts
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
```

E trocar o corpo de `main()` por:

```ts
function main(): void {
  checkPredicate();
  checkEmptyIsNull();
  checkOmission();
  checkLabelsAndFlow();
  checkCollections();
  console.log("\nTodas as verificações da Ficha de ambiente passaram.");
}
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm verify:ambiente`
Expected: FALHA de tipo/execução — `buildEnvironmentSheet` não é exportado por `existing-automation.ts`.

- [ ] **Step 3: Implementar `buildEnvironmentSheet`**

Criar `src/shared/lib/existing-automation.ts` com o cabeçalho abaixo seguido de todo o
conteúdo deste passo:

```ts
/**
 * Regras da Ficha de ambiente — a página técnica do slide de automações que
 * já rodam em produção. Módulo puro de propósito: sem React, sem Prisma, sem
 * pptxgenjs. As duas superfícies que desenham a ficha (o componente React em
 * src/shared/components/slide/environment-sheet-page.tsx e o slide .pptx em
 * src/server/deck/build-existing-automations-deck.ts) mapeiam sua própria
 * fonte para `EnvironmentSheetSource` e consomem o mesmo resultado — é isso
 * que impede as duas de divergirem na regra de omissão.
 *
 * Quem decide SE a ficha existe é `isExistingAutomation`, em
 * src/shared/lib/opportunity-classification.ts — este módulo só monta o
 * conteúdo dela.
 *
 * Ver docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md
 */
import {
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
  resolveLabel,
  resolveCurrentApplicationHostingLabel,
  resolveDataEndpointLabel,
  resolveAccountTypeLabel,
  resolveSensitiveDataAnswerLabel,
  resolveKeyLabels,
} from "@/shared/constants/project-taxonomy";
import { formatDate } from "@/shared/utils";

/** Sistema-alvo já normalizado (nome do catálogo ou customName resolvido). */
export type EnvironmentSystem = {
  name: string;
  category: string | null;
  accessPoint: string | null;
  accessNotes: string | null;
};

/**
 * Conta como ela CHEGA — `type` é slug de AUTOMATION_ACCOUNT_TYPE_OPTIONS.
 * A saída é `SheetAccount`, com o label já resolvido: os dois formatos têm
 * nomes de tipo e de campo diferentes de propósito. Reusar o mesmo tipo nos
 * dois lados deixaria `type` significando slug na entrada e label na saída, e
 * quem resolvesse de novo no consumidor não veria erro nenhum —
 * `resolveLabel` devolve o próprio valor quando não acha a opção.
 */
export type EnvironmentAccount = {
  username: string;
  type: string | null;
  system: string | null;
  owner: string | null;
  notes: string | null;
};

/** Conta pronta para desenhar: `typeLabel` já é texto de exibição. */
export type SheetAccount = {
  username: string;
  typeLabel: string | null;
  system: string | null;
  owner: string | null;
  notes: string | null;
};

export type EnvironmentPerson = { name: string; role: string | null };

/**
 * Formato normalizado que as duas superfícies produzem. Achatado de propósito
 * (sem objetos aninhados de Prisma nem do tipo Project do cliente): é o que
 * permite o React mascarar os textos livres DURANTE o mapeamento, sem que este
 * módulo precise saber que modo demonstração existe.
 */
export type EnvironmentSheetSource = {
  hosting: string | null;
  hostingCustom: string | null;
  assetId: string | null;
  robotSchedule: string | null;
  liveSince: Date | null;
  dataInput: string | null;
  dataInputDetails: string | null;
  dataOutput: string | null;
  dataOutputDetails: string | null;
  author: string | null;
  owner: string | null;
  ownerRole: string | null;
  ownerArea: string | null;
  backupOwner: string | null;
  peopleOfInterest: EnvironmentPerson[];
  accessLocation: string | null;
  accessReference: string | null;
  contingencyActions: unknown;
  contingencyDetails: string | null;
  handlesSensitiveData: string | null;
  sensitiveDataCategories: unknown;
  sensitiveDataDetails: string | null;
  systems: EnvironmentSystem[];
  accounts: EnvironmentAccount[];
};

export type SheetLine = { label: string; value: string };
export type FlowBox = { title: string; lines: string[] };

export type EnvironmentSheet = {
  flow: { input?: FlowBox; runtime?: FlowBox; output?: FlowBox };
  people: SheetLine[];
  peopleOfInterest: EnvironmentPerson[];
  access: SheetLine[];
  systems: EnvironmentSystem[];
  accounts: SheetAccount[];
  sensitive: SheetLine[];
  /** systems + accounts + peopleOfInterest — entrada do tier de densidade. */
  itemCount: number;
};

/** Texto livre só conta como preenchido se sobrar algo depois do trim. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Descarta as entradas sem valor — o coração da regra de omissão. */
function lines(entries: { label: string; value: string | null }[]): SheetLine[] {
  return entries.filter((e): e is SheetLine => e.value !== null);
}

/** Junta partes não vazias com separador; tudo vazio vira null. */
function join(parts: (string | null)[], separator: string): string | null {
  const kept = parts.filter((p): p is string => p !== null && p !== "");
  return kept.length > 0 ? kept.join(separator) : null;
}

function flowBox(title: string, boxLines: (string | null)[]): FlowBox | undefined {
  const kept = boxLines.filter((l): l is string => l !== null && l !== "");
  return kept.length > 0 ? { title, lines: kept } : undefined;
}

/**
 * Monta a ficha aplicando a regra de omissão em todos os níveis: campo vazio
 * não vira linha, bloco sem linha vira array vazio (quem desenha não o
 * desenha), e ficha sem nada devolve `null` — nesse caso a página/slide não
 * chega a existir.
 */
export function buildEnvironmentSheet(source: EnvironmentSheetSource): EnvironmentSheet | null {
  const hosting = resolveCurrentApplicationHostingLabel(
    source.hosting,
    clean(source.hostingCustom) ?? undefined
  );

  const flow = {
    input: flowBox("Entrada", [
      resolveDataEndpointLabel(source.dataInput) ?? null,
      clean(source.dataInputDetails),
    ]),
    runtime: flowBox("Onde roda", [
      hosting ?? null,
      clean(source.assetId),
      clean(source.robotSchedule),
      source.liveSince ? `Em produção desde ${formatDate(source.liveSince)}` : null,
    ]),
    output: flowBox("Saída", [
      resolveDataEndpointLabel(source.dataOutput) ?? null,
      clean(source.dataOutputDetails),
    ]),
  };

  const people = lines([
    { label: "Quem desenvolveu", value: clean(source.author) },
    {
      label: "Responsável hoje",
      value: join(
        [clean(source.owner), clean(source.ownerRole), clean(source.ownerArea)],
        " · "
      ),
    },
    { label: "Substituto", value: clean(source.backupOwner) },
  ]);

  const contingency = resolveKeyLabels(
    source.contingencyActions,
    CURRENT_APPLICATION_CONTINGENCY_OPTIONS
  );
  const access = lines([
    {
      label: "Onde ficam os acessos",
      value:
        resolveLabel(source.accessLocation, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS) ?? null,
    },
    { label: "Referência", value: clean(source.accessReference) },
    {
      label: "Se parar",
      value: join(
        [contingency.length > 0 ? contingency.join(", ") : null, clean(source.contingencyDetails)],
        " — "
      ),
    },
  ]);

  const categories = resolveKeyLabels(source.sensitiveDataCategories, SENSITIVE_DATA_CATEGORY_OPTIONS);
  const sensitive = lines([
    {
      label: "Dados sigilosos",
      value: resolveSensitiveDataAnswerLabel(source.handlesSensitiveData) ?? null,
    },
    { label: "Categorias", value: categories.length > 0 ? categories.join(", ") : null },
    { label: "Detalhes", value: clean(source.sensitiveDataDetails) },
  ]);

  // Conta com username vazio é dado inconsistente (o formulário não permite) —
  // descartada aqui em vez de renderizar uma linha em branco.
  const accounts: SheetAccount[] = source.accounts
    .filter((a) => clean(a.username) !== null)
    .map((a) => ({
      username: a.username.trim(),
      typeLabel: resolveAccountTypeLabel(a.type) ?? null,
      system: clean(a.system),
      owner: clean(a.owner),
      notes: clean(a.notes),
    }));

  const systems = source.systems
    .filter((s) => clean(s.name) !== null)
    .map((s) => ({
      name: s.name.trim(),
      category: clean(s.category),
      accessPoint: clean(s.accessPoint),
      accessNotes: clean(s.accessNotes),
    }));

  const peopleOfInterest = source.peopleOfInterest
    .filter((p) => clean(p.name) !== null)
    .map((p) => ({ name: p.name.trim(), role: clean(p.role) }));

  const itemCount = systems.length + accounts.length + peopleOfInterest.length;

  const isEmpty =
    !flow.input &&
    !flow.runtime &&
    !flow.output &&
    people.length === 0 &&
    access.length === 0 &&
    sensitive.length === 0 &&
    itemCount === 0;

  if (isEmpty) return null;

  return { flow, people, peopleOfInterest, access, systems, accounts, sensitive, itemCount };
}
```

> Nota para quem implementa: a entrada (`EnvironmentAccount.type`) carrega o slug e a
> saída (`SheetAccount.typeLabel`) carrega o label já resolvido. Tipos e nomes de campo
> diferentes de propósito — quem desenha nunca precisa da taxonomia, e nunca deve
> conseguir confundir os dois lados.

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm verify:ambiente`
Expected: as quatro linhas `OK:` e a mensagem final de sucesso.

- [ ] **Step 5: Confirmar que os tipos batem**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-environment-sheet.ts src/shared/lib/existing-automation.ts
git commit -m "feat: montagem da ficha de ambiente com omissao de vazios"
```

---

### Task 3: Tier de densidade e reflow de colunas

**Files:**
- Modify: `src/shared/lib/existing-automation.ts`
- Modify: `scripts/verify-environment-sheet.ts`

- [ ] **Step 1: Escrever a verificação que falha**

No `import` do topo de `scripts/verify-environment-sheet.ts`, acrescentar `densityTierFor` e `splitIntoColumns`:

```ts
import {
  buildEnvironmentSheet,
  densityTierFor,
  splitIntoColumns,
  type EnvironmentSheetSource,
} from "../src/shared/lib/existing-automation";
```

(o `import` de `isExistingAutomation`, que vem de `opportunity-classification`, fica
inalterado no topo do arquivo)

Acrescentar antes de `function main()`:

```ts
function checkDensity(): void {
  assertEqual(densityTierFor(0), "comfortable", "ficha vazia é confortável");
  assertEqual(densityTierFor(12), "comfortable", "12 itens ainda é confortável");
  assertEqual(densityTierFor(13), "dense", "13 itens já é denso");
  assertEqual(densityTierFor(24), "dense", "24 itens ainda é denso");
  assertEqual(densityTierFor(25), "compact", "25 itens é compacto");
  console.log("OK: tier de densidade");
}

function checkColumnSplit(): void {
  assertEqual(splitIntoColumns([1, 2, 3]), [[1, 2, 3]], "lista curta fica em uma coluna");
  assertEqual(
    splitIntoColumns([1, 2, 3, 4, 5, 6]),
    [[1, 2, 3, 4, 5, 6]],
    "6 itens ainda é uma coluna (limite inclusivo)"
  );
  assertEqual(
    splitIntoColumns([1, 2, 3, 4, 5, 6, 7]),
    [
      [1, 2, 3, 4],
      [5, 6, 7],
    ],
    "7 itens quebram em duas colunas, sobra na primeira"
  );
  assertEqual(splitIntoColumns([]), [[]], "lista vazia devolve uma coluna vazia");
  console.log("OK: reflow de colunas");
}
```

E acrescentar as duas chamadas em `main()`, antes do `console.log` final:

```ts
  checkDensity();
  checkColumnSplit();
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm verify:ambiente`
Expected: FALHA — `densityTierFor` não é exportado.

- [ ] **Step 3: Implementar**

Acrescentar no fim de `src/shared/lib/existing-automation.ts`:

```ts
/**
 * Nível de compactação da ficha. Sistemas, contas e pessoas de interesse são
 * listas sem teto no banco, e a exigência é que TUDO caiba na página — nada de
 * "+N adicionais". O tier baixa fonte e altura de linha juntas conforme o
 * volume; abaixo dele ainda existem o reflow de colunas (splitIntoColumns) e,
 * só no React, o auto-shrink da própria página.
 */
export type DensityTier = "comfortable" | "dense" | "compact";

export function densityTierFor(itemCount: number): DensityTier {
  if (itemCount <= 12) return "comfortable";
  if (itemCount <= 24) return "dense";
  return "compact";
}

/** Acima deste número de itens a lista passa a ocupar duas sub-colunas. */
export const COLUMN_SPLIT_THRESHOLD = 6;

/**
 * Devolve sempre pelo menos uma coluna (mesmo vazia), para quem desenha poder
 * iterar sem checar tamanho. A primeira coluna fica com a sobra em lista
 * ímpar — ler de cima para baixo, esquerda para direita, exige isso.
 */
export function splitIntoColumns<T>(items: T[], threshold = COLUMN_SPLIT_THRESHOLD): T[][] {
  if (items.length <= threshold) return [items];
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm verify:ambiente`
Expected: seis linhas `OK:` e a mensagem final.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-environment-sheet.ts src/shared/lib/existing-automation.ts
git commit -m "feat: tier de densidade e reflow de colunas da ficha"
```

---

### Task 4: Extrair a primitiva de página e o radar

Refatoração pura, sem mudança de comportamento: o slide renderizado tem que ficar idêntico.

**Files:**
- Create: `src/shared/components/slide/slide-page.tsx`
- Create: `src/shared/components/slide/rating-radar-chart.tsx`
- Modify: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Criar a primitiva de página**

Criar `src/shared/components/slide/slide-page.tsx` movendo `SLIDE_WIDTH`, `SLIDE_HEIGHT`, `MIN_SLIDE_SCALE` e `useFitToSlide` de `project-executive-slide.tsx:21-63` (copiar o comentário longo de `useFitToSlide` junto — ele explica por que a medição usa largura fixa):

```tsx
"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

// Página de tamanho fixo (16:9, mesma proporção de um slide de verdade) — o conteúdo
// NUNCA muda o tamanho da página; em vez disso, encolhe (useFitToSlide abaixo) até caber.
export const SLIDE_WIDTH = 1100;
export const SLIDE_HEIGHT = Math.round((SLIDE_WIDTH * 9) / 16);

/** Piso da página executiva, cujo conteúdo tem teto conhecido. */
export const DEFAULT_MIN_SLIDE_SCALE = 0.5;

// O conteúdo é medido SEMPRE na largura fixa SLIDE_WIDTH (nunca varia) — isso evita um
// problema real de uma versão anterior desta função, que recalculava a largura junto com
// a escala (pra não sobrar espaço lateral) e podia oscilar sem nunca convergir num valor
// que realmente coubesse, resultando em conteúdo cortado silenciosamente pelo
// overflow:hidden da página. Aqui a conta é direta e sempre garantida: mede a altura
// natural (scrollHeight, que ignora o transform) numa largura fixa, e a escala final é
// sempre >= à necessária pra essa altura caber em SLIDE_HEIGHT — nunca corta conteúdo.
// Um ResizeObserver reage a mudanças tardias de altura (fonte/imagem carregando depois).
//
// A garantia "nunca corta" só vale enquanto a escala necessária for >= minScale: abaixo
// disso o overflow:hidden volta a cortar em silêncio. Por isso o piso é parâmetro, e não
// constante — a página técnica, cujas listas não têm teto, usa um piso menor.
function useFitToSlide(
  contentRef: React.RefObject<HTMLDivElement | null>,
  resetKey: string,
  minScale: number
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    setScale(1);
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      const naturalHeight = el.scrollHeight;
      const next =
        naturalHeight > SLIDE_HEIGHT ? Math.max(minScale, SLIDE_HEIGHT / naturalHeight) : 1;
      setScale((current) => (Math.abs(next - current) > 0.002 ? next : current));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentRef, resetKey, minScale]);

  return scale;
}

/**
 * Uma página do slide: moldura 16:9 fixa, as duas tarjas diagonais da marca e o
 * auto-shrink do conteúdo. Não sabe nada sobre o que está dentro.
 */
export function SlidePage({
  resetKey,
  minScale = DEFAULT_MIN_SLIDE_SCALE,
  children,
}: {
  resetKey: string;
  minScale?: number;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scale = useFitToSlide(contentRef, resetKey, minScale);

  return (
    <div
      className="executive-slide-print-root relative mx-auto overflow-hidden bg-white shadow-md"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      <div
        ref={contentRef}
        className="relative text-[#1a1a2e]"
        style={{
          width: SLIDE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // transform não muda a posição de layout do elemento, só o visual — centraliza
          // manualmente o espaço que sobra na largura quando scale < 1 (encolheu).
          marginLeft: (SLIDE_WIDTH * (1 - scale)) / 2,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-16"
          style={{ background: "#1a2b4a", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />
        <div
          className="absolute inset-y-0 left-[18px] w-[46px]"
          style={{ background: "#14b8a6", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar o componente do radar**

Criar `src/shared/components/slide/rating-radar-chart.tsx` movendo, sem alteração, `RatingKey`, `RATING_AXES`, `DEFAULT_RATING`, `RADAR_CENTER`, `RADAR_UNIT`, `pointAt`, `CATEGORY_LABEL_POS` e `RatingRadarChart` de `project-executive-slide.tsx:65-184`. Exportar `RATING_AXES`, `DEFAULT_RATING` e `RatingRadarChart` (o componente atual usa `RATING_AXES`/`DEFAULT_RATING` para calcular o percentual em `project-executive-slide.tsx:317-320`).

Manter o comentário de `RATING_AXES` intacto — `build-diagnostic-deck.ts:98` referencia este arquivo pelo nome antigo; atualizar aquela referência para `src/shared/components/slide/rating-radar-chart.tsx` no mesmo commit.

- [ ] **Step 3: Reescrever o componente para usar as duas peças**

Em `src/shared/components/project-executive-slide.tsx`:
- remover os blocos movidos (linhas 21-184 do arquivo atual);
- importar `SlidePage` e `RatingRadarChart`/`RATING_AXES`/`DEFAULT_RATING`;
- remover `contentRef`/`scale`/`useFitToSlide` do corpo do componente;
- substituir o `return` — as duas `<div>` externas e as duas tarjas (linhas 322-352) viram `<SlidePage resetKey={project.id}>`, e o conteúdo (a partir de `<div className="relative flex flex-col p-10 pl-[100px]">`) fica como filho. Fechar com `</SlidePage>` no lugar das três `</div>` finais.

- [ ] **Step 4: Verificar que nada quebrou**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `pnpm dev`, abrir um projeto qualquer em `/admin/projetos`, clicar em ver slide executivo.
Expected: slide visualmente idêntico ao de antes — mesmas seções, mesmo radar, mesmo encolhimento.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/slide/ src/shared/components/project-executive-slide.tsx src/server/deck/build-diagnostic-deck.ts
git commit -m "refactor: extrai primitiva de pagina e radar do slide executivo"
```

---

### Task 5: Adaptador Project → EnvironmentSheetSource com máscara

**Files:**
- Create: `src/shared/components/slide/project-to-environment-source.ts`
- Modify: `scripts/verify-environment-sheet.ts`

- [ ] **Step 1: Escrever a verificação que falha**

Acrescentar em `scripts/verify-environment-sheet.ts` — importar no topo:

```ts
import { projectToEnvironmentSource } from "../src/shared/components/slide/project-to-environment-source";
import type { Project } from "../src/shared/types";
```

E acrescentar antes de `main()`:

```ts
function checkMasking(): void {
  const project = {
    id: "p1",
    currentApplicationAssetId: "SRV-RPA-02",
    currentApplicationOwner: "Ana Souza",
    currentApplicationAccessReference: "KeePass \\ TI \\ RPA",
    targetSystems: [
      {
        id: "s1",
        targetSystemId: null,
        name: "SAP",
        categoryName: "ERP",
        accessPoint: "https://sap.empresa.com.br",
        accessNotes: "Chamado para o time de Basis",
        order: 0,
      },
    ],
    automationAccounts: [
      {
        id: "a1",
        username: "svc_rpa_fin",
        projectTargetSystemId: "s1",
        systemName: "SAP",
        accountType: "servico",
        ownerName: "TI",
        notes: null,
        order: 0,
      },
    ],
  } as unknown as Project;

  const masked = projectToEnvironmentSource(project, () => "•••");
  assertEqual(masked.assetId, "•••", "hostname é mascarado");
  assertEqual(masked.owner, "•••", "nome do responsável é mascarado");
  assertEqual(masked.accessReference, "•••", "referência de acesso é mascarada");
  assertEqual(masked.systems[0].accessPoint, "•••", "ponto de acesso do sistema é mascarado");
  assertEqual(masked.systems[0].accessNotes, "•••", "como acessar é mascarado");
  assertEqual(masked.accounts[0].username, "•••", "login é mascarado");

  const plain = projectToEnvironmentSource(project, (v) => v ?? null);
  assertEqual(plain.assetId, "SRV-RPA-02", "sem máscara o hostname passa inteiro");
  assertEqual(plain.accounts[0].type, "servico", "slug do tipo de conta chega cru ao builder");
  console.log("OK: adaptador aplica a máscara nos campos sensíveis");
}
```

E a chamada `checkMasking();` dentro de `main()`.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `pnpm verify:ambiente`
Expected: FALHA — módulo `project-to-environment-source` não existe.

- [ ] **Step 3: Implementar o adaptador**

Criar `src/shared/components/slide/project-to-environment-source.ts`:

```ts
import type { Project } from "@/shared/types";
import type { EnvironmentSheetSource } from "@/shared/lib/existing-automation";

/**
 * Assinatura exata de `maskFreeText` do useDemoMode (ver
 * src/shared/context/demo-mode-context.tsx:37) — ela devolve `undefined` quando
 * recebe `undefined`, então o tipo de retorno precisa incluí-lo. Recebida como
 * parâmetro, e não importada do contexto, para este módulo continuar puro e
 * verificável pelo script tsx, que não roda dentro de um provider React.
 */
export type MaskFn = (value: string | null | undefined) => string | null | undefined;

/**
 * Traduz o projeto vindo de `project.byId` para o formato normalizado da ficha,
 * aplicando a máscara do modo demonstração DURANTE o mapeamento.
 *
 * Quatro dos campos aqui são exatamente os que não podem vazar numa demo para
 * outro cliente: `currentApplicationAssetId` (hostname/IP), `username` (login
 * real), `accessPoint` (URL do servidor) e `accessReference`/`accessNotes`
 * (onde a credencial mora). Se um campo novo de texto livre entrar na ficha, ele
 * passa por `mask` aqui — não existe segunda barreira depois deste ponto.
 *
 * Slugs de taxonomia (hosting, dataInput, accountType, accessLocation,
 * handlesSensitiveData) NÃO são mascarados: são valores de lista fechada, não
 * revelam nada do cliente, e mascará-los quebraria a resolução do label.
 */
export function projectToEnvironmentSource(project: Project, mask: MaskFn): EnvironmentSheetSource {
  // `?? null` em todo retorno de `mask`: os campos de EnvironmentSheetSource são
  // `string | null`, e maskFreeText devolve `undefined` quando recebe `undefined`.
  const m = (value: string | null | undefined): string | null => mask(value) ?? null;

  return {
    hosting: project.currentApplicationHosting ?? null,
    hostingCustom: m(project.currentApplicationHostingCustom),
    assetId: m(project.currentApplicationAssetId),
    robotSchedule: m(project.robotSchedule),
    liveSince: project.currentApplicationLiveSince
      ? new Date(project.currentApplicationLiveSince)
      : null,
    dataInput: project.currentApplicationDataInput ?? null,
    dataInputDetails: m(project.currentApplicationDataInputDetails),
    dataOutput: project.currentApplicationDataOutput ?? null,
    dataOutputDetails: m(project.currentApplicationDataOutputDetails),
    author: m(project.currentApplicationAuthor),
    owner: m(project.currentApplicationOwner),
    ownerRole: m(project.currentApplicationOwnerRole),
    ownerArea: project.currentApplicationOwnerAreaName ?? null,
    backupOwner: m(project.currentApplicationBackupOwner),
    peopleOfInterest: (project.peopleOfInterest ?? []).map((p) => ({
      name: m(p.name) ?? "",
      role: m(p.role),
    })),
    accessLocation: project.currentApplicationAccessLocation ?? null,
    accessReference: m(project.currentApplicationAccessReference),
    contingencyActions: project.currentApplicationContingencyActions ?? null,
    contingencyDetails: m(project.currentApplicationContingencyDetails),
    handlesSensitiveData: project.handlesSensitiveData ?? null,
    sensitiveDataCategories: project.sensitiveDataCategories ?? null,
    sensitiveDataDetails: m(project.sensitiveDataDetails),
    systems: (project.targetSystems ?? []).map((s) => ({
      name: m(s.name) ?? "",
      category: s.categoryName,
      accessPoint: m(s.accessPoint),
      accessNotes: m(s.accessNotes),
    })),
    accounts: (project.automationAccounts ?? []).map((a) => ({
      username: m(a.username) ?? "",
      type: a.accountType,
      system: m(a.systemName),
      owner: m(a.ownerName),
      notes: m(a.notes),
    })),
  };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `pnpm verify:ambiente`
Expected: todas as linhas `OK:`, incluindo a do adaptador.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-environment-sheet.ts src/shared/components/slide/project-to-environment-source.ts
git commit -m "feat: adaptador do projeto para a ficha de ambiente com mascara de demo"
```

---

### Task 6: Página da Ficha de ambiente

**Files:**
- Create: `src/shared/components/slide/environment-sheet-page.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Project } from "@/shared/types";
import {
  buildEnvironmentSheet,
  densityTierFor,
  splitIntoColumns,
  type DensityTier,
  type EnvironmentSystem,
  type SheetAccount,
  type SheetLine,
} from "@/shared/lib/existing-automation";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { SlidePage } from "./slide-page";
import { projectToEnvironmentSource } from "./project-to-environment-source";

/**
 * Segunda página do slide executivo, só para automações que já rodam: o que
 * existe no ambiente hoje, para um TI focado em segurança. Ver
 * docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md
 *
 * Devolve `null` quando a ficha não tem nenhum dado — automação existente cuja
 * ficha nunca foi preenchida continua com uma página só.
 */

/**
 * Piso de shrink desta página. Menor que o da página executiva porque as listas
 * de sistemas e contas não têm teto no banco: com o piso padrão de 0.5 o
 * overflow:hidden da página voltaria a cortar em silêncio numa automação com
 * dezenas de itens.
 */
const ENVIRONMENT_MIN_SLIDE_SCALE = 0.35;

/** Fonte e altura de linha por tier — descem juntas, nunca isoladas. */
const TIER_STYLE: Record<DensityTier, { text: string; row: string }> = {
  comfortable: { text: "text-[13px]", row: "py-1.5" },
  dense: { text: "text-[11px]", row: "py-1" },
  compact: { text: "text-[9.5px]", row: "py-0.5" },
};

function BlockLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 inline-block border-b-2 border-teal-500 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground">
      {children}
    </div>
  );
}

function LineList({ lines, tier }: { lines: SheetLine[]; tier: DensityTier }) {
  return (
    <div className="space-y-1">
      {lines.map((line) => (
        <p key={line.label} className={`${TIER_STYLE[tier].text} leading-snug text-foreground/90`}>
          <span className="font-medium">{line.label}:</span> {line.value}
        </p>
      ))}
    </div>
  );
}

function SystemsTable({ systems, tier }: { systems: EnvironmentSystem[]; tier: DensityTier }) {
  const columns = splitIntoColumns(systems);
  return (
    <div className="flex gap-3">
      {columns.map((column, index) => (
        <table key={index} className={`flex-1 border-collapse ${TIER_STYLE[tier].text}`}>
          <tbody>
            {column.map((system) => (
              <tr key={system.name + system.accessPoint} className="border-b border-slate-100">
                <td className={`${TIER_STYLE[tier].row} pr-2 align-top font-medium`}>
                  {system.name}
                  {system.category && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {system.category}
                    </span>
                  )}
                </td>
                <td className={`${TIER_STYLE[tier].row} align-top text-foreground/80`}>
                  {system.accessPoint}
                  {system.accessNotes && (
                    <span className="block text-muted-foreground">{system.accessNotes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function AccountsTable({ accounts, tier }: { accounts: SheetAccount[]; tier: DensityTier }) {
  const columns = splitIntoColumns(accounts);
  return (
    <div className="flex gap-3">
      {columns.map((column, index) => (
        <table key={index} className={`flex-1 border-collapse ${TIER_STYLE[tier].text}`}>
          <tbody>
            {column.map((account) => (
              <tr key={account.username} className="border-b border-slate-100">
                <td className={`${TIER_STYLE[tier].row} pr-2 align-top font-medium`}>
                  {account.username}
                </td>
                <td className={`${TIER_STYLE[tier].row} align-top text-foreground/80`}>
                  {[account.typeLabel, account.system, account.owner].filter(Boolean).join(" · ")}
                  {account.notes && (
                    <span className="block text-muted-foreground">{account.notes}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export function EnvironmentSheetPage({ project }: { project: Project }) {
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const sheet = buildEnvironmentSheet(projectToEnvironmentSource(project, maskFreeText));
  if (!sheet) return null;

  const tier = densityTierFor(sheet.itemCount);
  const flowBoxes = [sheet.flow.input, sheet.flow.runtime, sheet.flow.output].filter(
    (box) => box !== undefined
  );

  return (
    <SlidePage resetKey={`${project.id}-ambiente`} minScale={ENVIRONMENT_MIN_SLIDE_SCALE}>
      <div className="relative flex flex-col p-10 pl-[100px]">
        <div className="mb-4 flex items-start justify-between">
          <div>
            {project.companyName && (
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {maskCompanyName(project.companyId, project.companyName)}
              </div>
            )}
            <h1 className="max-w-[85%] text-2xl font-extrabold leading-tight tracking-tight">
              {maskFreeText(project.title)}
            </h1>
            <p className="mt-1 text-sm font-semibold text-teal-600">
              Ficha de ambiente — o que existe hoje
            </p>
          </div>
          <Image
            src="/taticca-logo-horizontal.png"
            alt="TATICCA"
            width={163}
            height={64}
            className="h-12 w-auto flex-shrink-0 object-contain"
          />
        </div>

        {flowBoxes.length > 0 && (
          <div className="mb-5 flex items-stretch gap-2">
            {flowBoxes.map((box, index) => (
              <div key={box.title} className="flex flex-1 items-stretch gap-2">
                <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-teal-600">
                    {box.title}
                  </div>
                  {box.lines.map((line, lineIndex) => (
                    <p
                      key={line}
                      className={
                        lineIndex === 0
                          ? "text-[12px] font-semibold leading-snug text-foreground"
                          : "text-[11px] leading-snug text-muted-foreground"
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
                {index < flowBoxes.length - 1 && (
                  <div className="flex items-center text-lg text-teal-500">→</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-8">
          <div className="flex flex-1 flex-col gap-4">
            {(sheet.people.length > 0 || sheet.peopleOfInterest.length > 0) && (
              <div>
                <BlockLabel>Pessoas</BlockLabel>
                <LineList lines={sheet.people} tier={tier} />
                {sheet.peopleOfInterest.length > 0 && (
                  <p className={`mt-1 ${TIER_STYLE[tier].text} leading-snug text-foreground/90`}>
                    <span className="font-medium">Pessoas de interesse:</span>{" "}
                    {sheet.peopleOfInterest
                      .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
                      .join(", ")}
                  </p>
                )}
              </div>
            )}
            {sheet.access.length > 0 && (
              <div>
                <BlockLabel>Acessos e contingência</BlockLabel>
                <LineList lines={sheet.access} tier={tier} />
              </div>
            )}
          </div>

          <div className="flex flex-[1.4] flex-col gap-4">
            {sheet.systems.length > 0 && (
              <div>
                <BlockLabel>Sistemas em que atua</BlockLabel>
                <SystemsTable systems={sheet.systems} tier={tier} />
              </div>
            )}
            {sheet.accounts.length > 0 && (
              <div>
                <BlockLabel>Contas utilizadas</BlockLabel>
                <AccountsTable accounts={sheet.accounts} tier={tier} />
              </div>
            )}
            {sheet.sensitive.length > 0 && (
              <div>
                <BlockLabel>Dados sigilosos</BlockLabel>
                <LineList lines={sheet.sensitive} tier={tier} />
              </div>
            )}
          </div>
        </div>
      </div>
    </SlidePage>
  );
}
```

- [ ] **Step 2: Confirmar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/slide/environment-sheet-page.tsx
git commit -m "feat: pagina de ficha de ambiente do slide executivo"
```

---

### Task 7: Repartir o conteúdo entre as duas páginas

**Files:**
- Modify: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Enxugar `situacaoAtualLines`**

Substituir a montagem atual (linhas 225-265 do arquivo original, agora deslocadas pela Task 4) por:

```tsx
  const situacaoAtualLines = buildLabeledLinesWithDetail([
    {
      label: "Abordagem",
      value: resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
      detail: maskFreeText(project.existingSystemDetails) ?? undefined,
    },
    {
      label: "Aplicação existente hoje",
      value: resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
      detail: maskFreeText(project.currentApplicationDetails) ?? undefined,
    },
    { label: "Público-alvo", value: maskFreeText(project.targetAudience) ?? undefined },
  ]);
```

As cinco linhas removidas (*Onde roda*, *Quem desenvolveu*, *Responsável hoje*, *Onde ficam os acessos*, *Em produção desde*) passam a viver na Ficha de ambiente. Remover os imports que ficarem sem uso: `CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS`, `resolveCurrentApplicationHostingLabel` e `formatDate`.

- [ ] **Step 2: Acrescentar status operacional e economia acumulada**

Logo antes de `const monthlyHoursSavedLabel = ...`, acrescentar:

```tsx
  // Rótulos vindos do enum RobotOperationalStatus — mesma tradução que
  // build-existing-automations-deck.ts usa no deck.
  const OPERATIONAL_STATUS_LABEL: Record<string, string> = {
    ACTIVE: "Ativo",
    PAUSED: "Pausado",
    ISSUE: "Com problema",
  };
```

E, no fim do array `quantitativeLines`, depois do `...buildLabeledLines([...])` existente, acrescentar:

```tsx
    ...buildLabeledLines([
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : undefined,
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
            : undefined,
      },
    ]),
```

Importar `formatCurrency` de `@/shared/utils`.

- [ ] **Step 3: Renderizar a segunda página**

Importar no topo:

```tsx
import { isExistingAutomation } from "@/shared/lib/opportunity-classification";
import { EnvironmentSheetPage } from "./slide/environment-sheet-page";
```

O predicado vem de `opportunity-classification`, e **não** de `existing-automation`: ele já
existe lá e compara com `"completed"` — o status que `toFrontendStatus` entrega ao
componente. Ver o aviso no topo da Task 1.

Envolver o `return` do componente: a `<SlidePage>` da Task 4 vira o primeiro filho de um fragmento com as duas páginas empilhadas.

```tsx
  return (
    <div className="flex flex-col items-center gap-6 print:gap-0">
      <SlidePage resetKey={project.id}>
        {/* conteúdo da página executiva, inalterado */}
      </SlidePage>
      {isExistingAutomation(project) && <EnvironmentSheetPage project={project} />}
    </div>
  );
```

`print:gap-0` importa: o gap de 24px entre as páginas empurraria a segunda para uma terceira folha na impressão.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `pnpm dev`. Verificar os três casos:
1. Automação existente com ficha preenchida → duas páginas, a segunda com a faixa de fluxo e os blocos.
2. Automação existente sem nenhum campo de ficha → **uma** página só.
3. Projeto de oportunidade (`hasCurrentApplication` diferente de `"sim"` e status diferente de `DONE`) → uma página, sem as 5 linhas técnicas em "Situação atual", com as 2 linhas novas na tabela quantitativa quando houver valor.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/project-executive-slide.tsx
git commit -m "feat: slide executivo de automacao existente ganha pagina de ambiente"
```

---

### Task 8: Quebra de página na impressão

**Files:**
- Modify: `src/app/globals.css:242-248`

- [ ] **Step 1: Substituir a regra atual**

Trocar o bloco:

```css
  .executive-slide-print-root {
    /* Página de tamanho fixo (16:9, ver useFitToSlide no componente) — o
       conteúdo sempre cabe numa página só, não precisa mais do ajuste de
       fluxo variável que era necessário quando a altura crescia com o texto. */
    margin: 0 auto;
    box-shadow: none;
  }
```

por:

```css
  .executive-slide-print-root {
    /* Página de tamanho fixo (16:9, ver SlidePage em
       src/shared/components/slide/slide-page.tsx) — o conteúdo sempre cabe na
       página, encolhendo se preciso, então não há ajuste de fluxo variável. */
    margin: 0 auto;
    box-shadow: none;
  }
  /* Automação existente imprime DUAS páginas (executiva + ficha de ambiente).
     Sem esta quebra as duas disputam a mesma folha de 11in x 6.1875in e a
     segunda sai cortada. O seletor de irmão adjacente não afeta o slide de
     página única, que nunca tem um irmão. */
  .executive-slide-print-root + .executive-slide-print-root {
    break-before: page;
  }
```

- [ ] **Step 2: Verificar**

Run: `pnpm dev`, abrir o slide de uma automação existente com ficha preenchida, clicar em "Imprimir / Exportar PDF".
Expected: pré-visualização com 2 páginas, cada uma 16:9 inteira, sem corte e sem folha em branco entre elas.

Abrir o slide de um projeto de oportunidade e imprimir.
Expected: 1 página, idêntica ao comportamento anterior.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix: impressao do slide quebra pagina entre executivo e ficha"
```

---

### Task 9: Ampliar a consulta e os tipos do deck

**Files:**
- Modify: `src/server/deck/build-existing-automations-deck.ts`

- [ ] **Step 1: Ampliar os tipos de linha**

Em `FichaTargetSystemRow` (linha ~66), acrescentar `accessNotes`:

```ts
export type FichaTargetSystemRow = {
  customName: string | null;
  accessPoint: string | null;
  // Entra na ficha a partir da spec de 2026-08-14: o público do deck de
  // automações existentes é o TI de segurança, e "como chegar no acesso" é
  // parte do que ele precisa auditar. Continua sendo ponteiro, nunca credencial.
  accessNotes: string | null;
  targetSystem: { name: string; category: { name: string } | null } | null;
};
```

Em `FichaAutomationAccountRow`, acrescentar `ownerName` e `notes`:

```ts
export type FichaAutomationAccountRow = {
  username: string;
  accountType: string | null;
  ownerName: string | null;
  notes: string | null;
  projectTargetSystem: {
    customName: string | null;
    targetSystem: { name: string } | null;
  } | null;
};
```

Em `ExistingAutomationProject`, acrescentar:

```ts
  currentApplicationAccessReference: string | null;
  robotSchedule: string | null;
  peopleOfInterest: { person: { name: string; role: string | null } }[];
```

- [ ] **Step 2: Ampliar o `select` do `findMany`**

Dentro do `db.project.findMany` (bloco `select`, linhas ~216-277), acrescentar:

```ts
          currentApplicationAccessReference: true,
          peopleOfInterest: { select: { person: { select: { name: true, role: true } } } },
```

`robotSchedule: true` já está no select. Dentro de `targetSystems.select`, acrescentar `accessNotes: true`. Dentro de `automationAccounts.select`, acrescentar `ownerName: true` e `notes: true`.

- [ ] **Step 3: Atualizar `hasFichaTecnicaData`**

Acrescentar os campos novos ao predicado e reescrever o comentário, que hoje justifica a ausência de `accessReference` com um argumento que deixou de valer:

```ts
// Guard do slide de ficha de ambiente. Checa os campos que SÓ aparecem nesta
// página — de propósito NÃO repete hosting/author/owner/accessLocation/
// liveSince, que já aparecem no slide de processo, para que um projeto com
// apenas esses não ganhe uma ficha quase inteira de blocos omitidos.
// `currentApplicationAccessReference` entra na lista desde a spec de
// 2026-08-14, que passou a exibi-lo — antes ele era o único campo que nunca
// saía no deck, e por isso não servia como critério de entrada.
export function hasFichaTecnicaData(p: ExistingAutomationProject): boolean {
  return Boolean(
    p.currentApplicationAssetId ||
      p.currentApplicationOwnerRole ||
      p.ownerArea?.name ||
      p.currentApplicationAccessReference ||
      p.robotSchedule ||
      p.currentApplicationDataInput ||
      p.currentApplicationDataInputDetails ||
      p.currentApplicationDataOutput ||
      p.currentApplicationDataOutputDetails ||
      (Array.isArray(p.currentApplicationContingencyActions) &&
        p.currentApplicationContingencyActions.length > 0) ||
      p.currentApplicationContingencyDetails ||
      p.currentApplicationBackupOwner ||
      p.handlesSensitiveData ||
      (Array.isArray(p.sensitiveDataCategories) && p.sensitiveDataCategories.length > 0) ||
      p.sensitiveDataDetails ||
      p.targetSystems.length > 0 ||
      p.automationAccounts.length > 0 ||
      p.peopleOfInterest.length > 0
  );
}
```

- [ ] **Step 4: Usar o predicado compartilhado no `where`**

Importar `isExistingAutomation` não resolve aqui (o `where` é declarativo, não um predicado de runtime), então em vez disso deixar o `where` como está e acrescentar acima dele o comentário que amarra os dois:

```ts
        // Mesma população que `isExistingAutomation` em
        // src/shared/lib/existing-automation.ts decide no cliente — as duas
        // precisam mudar juntas.
        OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: erros APENAS em `scripts/preview-ficha-tecnica-slide.ts` (os três objetos fixos não têm os campos novos) — serão corrigidos na Task 12. Nenhum erro em `src/`.

- [ ] **Step 6: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts
git commit -m "feat: deck busca acessos, contas e pessoas de interesse da ficha"
```

---

### Task 10: Reescrever o slide de ficha do deck

**Files:**
- Modify: `src/server/deck/build-existing-automations-deck.ts`

- [ ] **Step 1: Substituir a geometria fixa por cursor**

Remover as constantes `FICHA_ROW1_H`, `FICHA_ROW2_H`, `FICHA_ROW3_H`, `FICHA_ROW1_Y`, `FICHA_ROW2_Y`, `FICHA_ROW3_Y`, `FICHA_MAX_SYSTEMS_SHOWN` e `FICHA_MAX_ACCOUNTS_SHOWN` (linhas ~481-504) e pôr no lugar:

```ts
// Geometria da ficha de ambiente. Ao contrário da versão anterior, que
// reservava altura fixa por linha de blocos, aqui cada coluna tem seu próprio
// cursor Y: blocos vazios são omitidos (regra da spec de 2026-08-14) e os
// seguintes sobem. As três larguras continuam fixas.
const FICHA_LEFT_X = MARGIN_X;
const FICHA_LEFT_W = 4.3;
const FICHA_COL_GAP = 0.3;
const FICHA_RIGHT_X = FICHA_LEFT_X + FICHA_LEFT_W + FICHA_COL_GAP;
const FICHA_RIGHT_W = CONTENT_W - FICHA_LEFT_W - FICHA_COL_GAP;
const FICHA_BLOCK_GAP = 0.22;
/** Altura do rótulo de bloco antes do conteúdo começar. */
const FICHA_LABEL_H = 0.32;
/** Altura da faixa de fluxo (3 caixas, até 4 linhas cada). */
const FICHA_FLOW_H = 1.0;
/** Fundo da área de conteúdo — a régua do rodapé do master fica em 6.92". */
const FICHA_BOTTOM_Y = 6.85;

// Corpo das tabelas por tier de densidade. Nenhum item é descartado: quando o
// volume cresce, a fonte desce e a lista quebra em duas colunas
// (splitIntoColumns) — ver "Como tudo cabe" na spec.
const FICHA_TIER_FONT: Record<DensityTier, number> = {
  comfortable: 9,
  dense: 8,
  compact: 7,
};

/** Altura estimada de uma linha de tabela, por tier (em polegadas). */
const FICHA_TIER_ROW_H: Record<DensityTier, number> = {
  comfortable: 0.24,
  dense: 0.21,
  compact: 0.18,
};
```

Importar no topo do arquivo:

```ts
import {
  buildEnvironmentSheet,
  densityTierFor,
  splitIntoColumns,
  type DensityTier,
  type EnvironmentSheet,
  type EnvironmentSheetSource,
} from "@/shared/lib/existing-automation";
```

E acrescentar `COLOR_ZEBRA` à lista de imports que já vem de `./deck-theme` — a faixa de
fluxo usa o mesmo fundo dos cartões do slide executivo, e esse arquivo ainda não o importa.

- [ ] **Step 2: Adaptar o projeto do deck para o formato normalizado**

Acrescentar antes de `addFichaTecnicaSlide`:

```ts
/**
 * Espelho server-side de `projectToEnvironmentSource` (o adaptador do React).
 * Existe separado porque a fonte é diferente — linhas cruas do Prisma, com
 * `targetSystem`/`customName` ainda por resolver — mas o destino é o mesmo
 * tipo, e portanto a mesma regra de omissão.
 *
 * Sem máscara: o deck é gerado por um admin autenticado para uma empresa
 * específica; modo demonstração é conceito da tela, não do arquivo exportado.
 */
function deckProjectToEnvironmentSource(p: ExistingAutomationProject): EnvironmentSheetSource {
  return {
    hosting: p.currentApplicationHosting,
    hostingCustom: p.currentApplicationHostingCustom,
    assetId: p.currentApplicationAssetId,
    robotSchedule: p.robotSchedule,
    liveSince: p.currentApplicationLiveSince,
    dataInput: p.currentApplicationDataInput,
    dataInputDetails: p.currentApplicationDataInputDetails,
    dataOutput: p.currentApplicationDataOutput,
    dataOutputDetails: p.currentApplicationDataOutputDetails,
    author: p.currentApplicationAuthor,
    owner: p.currentApplicationOwner,
    ownerRole: p.currentApplicationOwnerRole,
    ownerArea: p.ownerArea?.name ?? null,
    backupOwner: p.currentApplicationBackupOwner,
    peopleOfInterest: p.peopleOfInterest.map((link) => ({
      name: link.person.name,
      role: link.person.role,
    })),
    accessLocation: p.currentApplicationAccessLocation,
    accessReference: p.currentApplicationAccessReference,
    contingencyActions: p.currentApplicationContingencyActions,
    contingencyDetails: p.currentApplicationContingencyDetails,
    handlesSensitiveData: p.handlesSensitiveData,
    sensitiveDataCategories: p.sensitiveDataCategories,
    sensitiveDataDetails: p.sensitiveDataDetails,
    systems: p.targetSystems.map((s) => ({
      name: targetSystemName(s) ?? "",
      category: s.targetSystem?.category?.name ?? null,
      accessPoint: s.accessPoint,
      accessNotes: s.accessNotes,
    })),
    accounts: p.automationAccounts.map((a) => ({
      username: a.username,
      type: a.accountType,
      system: accountSystemName(a),
      owner: a.ownerName,
      notes: a.notes,
    })),
  };
}
```

- [ ] **Step 3: Reescrever `addFichaTecnicaSlide`**

Substituir a função inteira (linhas ~543-746) por:

```ts
/** Desenha um bloco de texto e devolve o Y logo abaixo dele. */
function addTextBlock(
  slide: Slide,
  label: string,
  entries: { label: string; value: string }[],
  x: number,
  y: number,
  w: number,
  fontSize: number
): number {
  addFichaBlockLabel(slide, label, x, y, w);
  const h = Math.min(entries.length * 0.26 + 0.1, FICHA_BOTTOM_Y - y - FICHA_LABEL_H);
  slide.addText(
    entries.map((entry, index) => ({
      text: `${entry.label}: ${entry.value}`,
      options: {
        fontSize,
        color: index === 0 ? COLOR_PRIMARY : COLOR_SECONDARY,
        bold: index === 0,
        breakLine: index < entries.length - 1,
      },
    })),
    { x, y: y + FICHA_LABEL_H, w, h, valign: "top", fit: "shrink", lineSpacingMultiple: 1.25 }
  );
  return y + FICHA_LABEL_H + h + FICHA_BLOCK_GAP;
}

/**
 * Desenha uma lista como uma ou duas tabelas lado a lado e devolve o Y abaixo.
 * A quebra em duas colunas (splitIntoColumns) é o que permite listar TUDO sem
 * descartar item nem estourar o rodapé.
 */
function addListBlock<T>(
  slide: Slide,
  label: string,
  rowsOf: (item: T) => [string, string],
  items: T[],
  x: number,
  y: number,
  w: number,
  tier: DensityTier
): number {
  addFichaBlockLabel(slide, label, x, y, w);
  const columns = splitIntoColumns(items);
  const columnW = (w - (columns.length - 1) * 0.15) / columns.length;
  const tallest = Math.max(...columns.map((c) => c.length));

  columns.forEach((column, index) => {
    const colX = x + index * (columnW + 0.15);
    const colW: [number, number] = [columnW * 0.45, columnW * 0.55];
    const rows: TableRow[] = column.map((item) => {
      const [first, second] = rowsOf(item);
      return [
        { text: fichaTruncate(first, colW[0]) },
        { text: fichaTruncate(second, colW[1]) },
      ];
    });
    slide.addTable(rows, {
      x: colX,
      y: y + FICHA_LABEL_H,
      w: columnW,
      colW,
      fontSize: FICHA_TIER_FONT[tier],
      color: COLOR_PRIMARY,
      border: fichaTableBorder(),
      valign: "middle",
      margin: [0.02, 0.06, 0.02, 0.06],
      autoPage: false,
    });
  });

  return y + FICHA_LABEL_H + tallest * FICHA_TIER_ROW_H[tier] + FICHA_BLOCK_GAP;
}

/** A faixa entrada → onde roda → saída, no topo. Devolve o Y abaixo dela. */
function addFlowStrip(slide: Slide, sheet: EnvironmentSheet, y: number): number {
  const boxes = [sheet.flow.input, sheet.flow.runtime, sheet.flow.output].filter(
    (box): box is NonNullable<typeof box> => box !== undefined
  );
  if (boxes.length === 0) return y;

  const gap = 0.3;
  const boxW = (CONTENT_W - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((box, index) => {
    const x = MARGIN_X + index * (boxW + gap);
    slide.addShape("rect", { x, y, w: boxW, h: FICHA_FLOW_H, fill: { color: COLOR_ZEBRA } });
    slide.addShape("rect", { x, y, w: 0.04, h: FICHA_FLOW_H, fill: { color: COLOR_ACCENT } });
    slide.addText(
      [
        {
          text: box.title.toUpperCase(),
          options: { fontSize: TYPE.eyebrow, bold: true, color: COLOR_ACCENT, breakLine: true },
        },
        ...box.lines.map((line, lineIndex) => ({
          text: line,
          options: {
            fontSize: lineIndex === 0 ? 11 : 9,
            bold: lineIndex === 0,
            color: lineIndex === 0 ? COLOR_PRIMARY : COLOR_SECONDARY,
            breakLine: lineIndex < box.lines.length - 1,
          },
        })),
      ],
      {
        x: x + 0.16,
        y: y + 0.08,
        w: boxW - 0.3,
        h: FICHA_FLOW_H - 0.16,
        valign: "top",
        fit: "shrink",
        lineSpacingMultiple: 1.15,
      }
    );
    if (index < boxes.length - 1) {
      slide.addText("→", {
        x: x + boxW,
        y: y + FICHA_FLOW_H / 2 - 0.15,
        w: gap,
        h: 0.3,
        fontSize: 16,
        color: COLOR_ACCENT,
        align: "center",
      });
    }
  });

  return y + FICHA_FLOW_H + FICHA_BLOCK_GAP;
}

export function addFichaTecnicaSlide(pres: PptxGenJS, project: ExistingAutomationProject): void {
  const sheet = buildEnvironmentSheet(deckProjectToEnvironmentSource(project));
  // Guard duplo com hasFichaTecnicaData no chamador: aquele decide se vale a
  // pena a página, este garante que nunca se desenha uma ficha sem nada.
  if (!sheet) return;

  // `tag` identifica este como o SEGUNDO slide da mesma solução (o primeiro
  // usa a área como tag) — sem ele, alguém folheando o deck veria dois slides
  // seguidos com o mesmo título e nenhuma pista do que os distingue.
  const slide = addTitledSlide(pres, project.title, undefined, "Ficha de ambiente", true);
  const tier = densityTierFor(sheet.itemCount);
  const fontSize = FICHA_TIER_FONT[tier];

  const blocksTop = addFlowStrip(slide, sheet, CONTENT_TOP_Y_TALL_TITLE);

  let leftY = blocksTop;
  const peopleEntries = [
    ...sheet.people,
    ...(sheet.peopleOfInterest.length > 0
      ? [
          {
            label: "Pessoas de interesse",
            value: sheet.peopleOfInterest
              .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
              .join(", "),
          },
        ]
      : []),
  ];
  if (peopleEntries.length > 0) {
    leftY = addTextBlock(slide, "Pessoas", peopleEntries, FICHA_LEFT_X, leftY, FICHA_LEFT_W, fontSize);
  }
  if (sheet.access.length > 0) {
    leftY = addTextBlock(
      slide,
      "Acessos e contingência",
      sheet.access,
      FICHA_LEFT_X,
      leftY,
      FICHA_LEFT_W,
      fontSize
    );
  }

  let rightY = blocksTop;
  if (sheet.systems.length > 0) {
    rightY = addListBlock(
      slide,
      "Sistemas em que atua",
      (s) => [
        [s.name, s.category].filter(Boolean).join(" · "),
        [s.accessPoint, s.accessNotes].filter(Boolean).join(" — "),
      ],
      sheet.systems,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      tier
    );
  }
  if (sheet.accounts.length > 0) {
    rightY = addListBlock(
      slide,
      "Contas utilizadas",
      (a) => [a.username, [a.typeLabel, a.system, a.owner, a.notes].filter(Boolean).join(" · ")],
      sheet.accounts,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      tier
    );
  }
  if (sheet.sensitive.length > 0) {
    addTextBlock(
      slide,
      "Dados sigilosos",
      sheet.sensitive,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      fontSize
    );
  }
}
```

> `username` aparece porque foi decisão explícita do usuário levá-lo ao deck — não existe
> (e nunca existiu) campo de senha neste modelo. Manter esse comentário no código junto
> ao bloco de contas.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: erros apenas em `scripts/preview-ficha-tecnica-slide.ts` (Task 12).

- [ ] **Step 5: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts
git commit -m "feat: slide de ficha de ambiente no deck com omissao e reflow"
```

---

### Task 11: Enxugar o slide de processo do deck de existentes

**Files:**
- Modify: `src/server/deck/build-existing-automations-deck.ts:299-327`

- [ ] **Step 1: Reduzir `extraLines`**

Substituir o array por:

```ts
    // As linhas técnicas (onde roda, quem desenvolveu, responsável, acessos,
    // em produção desde) migraram para a ficha de ambiente — mesma repartição
    // que o slide React faz entre a página executiva e a página 2. Aqui ficam
    // só os dois dados de operação pós-entrega.
    const extraLines: QuantitativeLine[] = [
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? ROBOT_OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : "Sem status",
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
            : "Não informado",
        isSaving: true,
      },
    ];
```

`hostingLabel`, `accessLabel` e `liveSinceLabel` continuam em uso por `addInventorySlide` — não remover.

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: erros apenas em `scripts/preview-ficha-tecnica-slide.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts
git commit -m "refactor: slide de processo do deck cede as linhas tecnicas para a ficha"
```

---

### Task 12: Preview do deck e verificação final

**Files:**
- Modify: `scripts/preview-ficha-tecnica-slide.ts`

- [ ] **Step 1: Atualizar os três casos existentes**

Em cada um dos objetos `filled`, `partial` e `empty`, acrescentar os campos novos:

```ts
  currentApplicationAccessReference: null,
  robotSchedule: null,
  peopleOfInterest: [],
```

Em `filled`, dar valores reais a eles:

```ts
  currentApplicationAccessReference: "KeePass \\ TI \\ RPA \\ Financeiro",
  robotSchedule: "Diário, às 6h",
  peopleOfInterest: [
    { person: { name: "Carla Menezes", role: "Gerente Financeiro" } },
    { person: { name: "Diego Farias", role: "Auditoria Interna" } },
  ],
```

Nos `targetSystems` de todos os casos, acrescentar `accessNotes`; nos `automationAccounts`, `ownerName` e `notes`. Em `filled`:

```ts
  targetSystems: Array.from({ length: 8 }, (_, i) => ({
    customName: i % 3 === 0 ? `Sistema legado ${i}` : null,
    accessPoint: `https://sistema-${i}.exemplo.com.br/acesso`,
    accessNotes: i % 2 === 0 ? "Abrir chamado para o time de infraestrutura" : null,
    targetSystem:
      i % 3 === 0
        ? null
        : { name: `Sistema ${i}`, category: { name: i % 2 === 0 ? "ERP" : "Portal" } },
  })),
  automationAccounts: Array.from({ length: 6 }, (_, i) => ({
    username: `rpa_conta_${i}@empresa.com.br`,
    accountType: i % 2 === 0 ? "servico" : "email",
    ownerName: i % 2 === 0 ? "TI" : "Financeiro",
    notes: null,
    projectTargetSystem: {
      customName: null,
      targetSystem: { name: `Sistema ${i}` },
    },
  })),
```

- [ ] **Step 2: Acrescentar um quarto caso — tier compacto**

Depois de `empty`, acrescentar:

```ts
// Caso 4: volume grande (20 sistemas + 12 contas = tier "compact") — confirma
// que a lista quebra em duas colunas, a fonte desce para 7pt e NADA é
// descartado. É o caso que a versão anterior resolvia cortando linhas e
// escrevendo "+N adicionais".
const heavy: ExistingAutomationProject = {
  ...filled,
  title: "Integração fiscal multi-sistema — Contabilidade",
  targetSystems: Array.from({ length: 20 }, (_, i) => ({
    customName: null,
    accessPoint: `https://sistema-${i}.exemplo.com.br`,
    accessNotes: null,
    targetSystem: { name: `Sistema ${i}`, category: { name: "ERP" } },
  })),
  automationAccounts: Array.from({ length: 12 }, (_, i) => ({
    username: `rpa_${i}@empresa.com.br`,
    accountType: "servico",
    ownerName: "TI",
    notes: null,
    projectTargetSystem: { customName: null, targetSystem: { name: `Sistema ${i}` } },
  })),
};
```

E incluir `heavy` no loop:

```ts
for (const project of [filled, partial, empty, heavy]) {
```

Atualizar o comentário do topo do arquivo: o arquivo agora deve sair com **3** slides (`filled`, `partial`, `heavy` — `empty` continua pulado pelo guard).

- [ ] **Step 3: Gerar e conferir**

Run: `pnpm deck:preview-ficha`
Expected: `preview-ficha-tecnica-slide.pptx` regenerado, log confirmando 3 slides.

Abrir o arquivo no PowerPoint e confirmar, slide a slide:
1. `filled` — faixa de fluxo com as três caixas, 8 sistemas em duas colunas, 6 contas, todos os blocos presentes, nada sobrepondo o rodapé.
2. `partial` — sem caixa de saída na faixa (não há `dataOutput`), sem bloco de contas, sem substituto: os blocos seguintes sobem e não sobra buraco.
3. `heavy` — 20 sistemas e 12 contas em duas colunas cada, fonte 7pt, **nenhum** "+N adicionais", nada abaixo de 6.92".

- [ ] **Step 4: Verificação final de tudo**

Run: `npx tsc --noEmit`
Expected: sem nenhum erro.

Run: `pnpm verify:ambiente`
Expected: todas as linhas `OK:`.

Run: `pnpm lint`
Expected: sem erros novos.

Run: `pnpm build`
Expected: build completo.

Com `pnpm dev` rodando, conferir na tela:
- Automação existente completa → 2 páginas; impressão em PDF com 2 folhas.
- Automação existente sem ficha → 1 página.
- Projeto de oportunidade → 1 página, idêntica à de antes exceto pelas linhas novas de status/economia quando houver valor.
- Modo demonstração ativo → hostname, login, ponto de acesso e referência de acesso mascarados na página 2.

Baixar o deck de automações existentes de uma empresa real e conferir que o slide de processo perdeu as 5 linhas técnicas e que a ficha de ambiente veio logo depois dele.

- [ ] **Step 5: Commit**

```bash
git add scripts/preview-ficha-tecnica-slide.ts
git commit -m "test: preview da ficha cobre tier compacto e blocos omitidos"
```
