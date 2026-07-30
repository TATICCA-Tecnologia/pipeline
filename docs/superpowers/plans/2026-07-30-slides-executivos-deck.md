# Slides executivos de abertura do deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inserir dois slides de resumo executivo ("O trabalho realizado" e "Os números do diagnóstico") entre a capa e a primeira tabela do deck de diagnóstico.

**Architecture:** Extrair primitivas de tema/layout de `build-diagnostic-deck.ts` para um módulo `deck-theme.ts` (evita ciclo de import), extrair o cálculo de payback para uma função pura reaproveitada pelos dois slides que o mostram, e criar `executive-summary-slides.ts` com uma função pura de agregação + dois slides. Nenhuma query nova: todos os dados já vêm do `Promise.all` existente.

**Tech Stack:** TypeScript, pptxgenjs 4.x, tsx (execução de script), Next.js App Router.

**Spec:** `docs/superpowers/specs/2026-07-30-slides-executivos-deck-design.md`

**Nota sobre testes:** o repositório não tem framework de teste (sem vitest/jest, sem `*.test.ts`). Instalar um está fora do escopo. A verificação de cada tarefa é: `npx tsc --noEmit` + `npm run lint` + um script de preview (`npm run deck:preview`) que gera um `.pptx` com dados fixos, sem banco — criado na Task 3 e usado como o "teste" visual repetível deste plano.

---

### Task 1: Extrair `deck-theme.ts`

Recorte puro: nenhum valor muda, nenhum slide existente sai diferente. O objetivo é permitir que `executive-summary-slides.ts` use as primitivas sem criar dependência circular com `build-diagnostic-deck.ts`.

**Files:**
- Create: `src/server/deck/deck-theme.ts`
- Modify: `src/server/deck/build-diagnostic-deck.ts`
- Modify: `src/server/deck/build-existing-automations-deck.ts:13-25`

- [ ] **Step 1: Criar `deck-theme.ts` movendo os blocos abaixo VERBATIM de `build-diagnostic-deck.ts`**

Copie, na ordem listada e sem alterar uma vírgula (inclusive os comentários — eles explicam decisões de design que devem sobreviver ao move):

| Linhas de origem | Conteúdo |
|---|---|
| 44–60 | comentário da paleta + `COLOR_PRIMARY` … `COLOR_ON_DARK_MUTED` |
| 62–73 | comentário de tipografia + `FONT_HEADING`, `FONT_BODY` |
| 75–94 | comentário da escala + `TYPE` |
| 96–108 | `MASTER_CONTENT`, `MASTER_FULL_BLEED`, `MASTER_COVER`, `COVER_BAND_H`, `MARGIN_X`, `CONTENT_W` (com comentários) |
| 110–123 | comentário do logo + `LOGO_ASPECT_RATIO`, `LOGO_DATA_URI` |
| 125–133 | `TABLE_HEADER_OPTS` |
| 139–140 | `export type Slide`, `export type TableRow` |
| 370–482 | doc comment + `defineDeckTheme` |
| 484–555 | `addCoverSlide` |
| 557–601 | doc comment + `addSectionSlide` |
| 1586–1673 | doc comment + `addTitledSlide` |
| 1675–1684 | doc comment + `CONTENT_TOP_Y`, `CONTENT_TOP_Y_WITH_SUBTITLE`, `CONTENT_TOP_Y_TALL_TITLE` |
| 1686–1734 | doc comment + `addSlideTable` |

O arquivo novo começa com:

```typescript
import fs from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { formatDate } from "@/shared/utils";

/**
 * Tema, masters e primitivas de layout compartilhados pelos decks .pptx.
 *
 * Extraído de `build-diagnostic-deck.ts`: o deck de automações existentes e os
 * slides executivos precisam das mesmas cores, da mesma escala tipográfica e do
 * mesmo `addTitledSlide`, e um módulo de slides importando de outro módulo de
 * slides criava dependência circular. Aqui não há nenhuma regra de negócio nem
 * nenhum dado — só a identidade visual do material.
 */
```

Todos os símbolos movidos ficam `export` (hoje a maioria é `const` privado). `COLOR_TEAL` (linha 155) **não** se move — ele é do slide de processo e continua em `build-diagnostic-deck.ts`.

- [ ] **Step 2: Remover os blocos movidos de `build-diagnostic-deck.ts` e adicionar o import**

Apague as linhas listadas no Step 1 e insira, junto aos outros imports do topo:

```typescript
import {
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_SECONDARY,
  COLOR_SURFACE,
  COLOR_MUTED_SURFACE,
  COLOR_TABLE_BORDER,
  TYPE,
  MARGIN_X,
  CONTENT_W,
  CONTENT_TOP_Y,
  CONTENT_TOP_Y_WITH_SUBTITLE,
  CONTENT_TOP_Y_TALL_TITLE,
  TABLE_HEADER_OPTS,
  defineDeckTheme,
  addCoverSlide,
  addSectionSlide,
  addTitledSlide,
  addSlideTable,
  type Slide,
  type TableRow,
} from "./deck-theme";
```

`import fs from "node:fs"` e `import path from "node:path"` saem de `build-diagnostic-deck.ts` — eram usados só pelo `LOGO_DATA_URI`.

`build-diagnostic-deck.ts` precisa **re-exportar** o que outros módulos importam dele hoje, para não quebrar `build-existing-automations-deck.ts` antes do Step 3:

```typescript
export {
  defineDeckTheme,
  addCoverSlide,
  addSectionSlide,
  addTitledSlide,
  addSlideTable,
  COLOR_MUTED,
  TABLE_HEADER_OPTS,
  type Slide,
  type TableRow,
};
```

- [ ] **Step 3: Apontar `build-existing-automations-deck.ts` para o módulo novo**

Substituir o bloco de import das linhas 13–25 por dois imports com origens corretas — tema vem de `deck-theme`, slides de conteúdo continuam vindo do deck de diagnóstico:

```typescript
import {
  addCoverSlide,
  addTitledSlide,
  addSlideTable,
  defineDeckTheme,
  COLOR_MUTED,
  TABLE_HEADER_OPTS,
  type Slide,
  type TableRow,
} from "./deck-theme";
import {
  addInterviewsSlide,
  addProjectSlide,
  type Interviews,
  type QuantitativeLine,
} from "./build-diagnostic-deck";
```

Com isso o bloco de re-export do Step 2 deixa de ter consumidores — **remova-o** de `build-diagnostic-deck.ts`. Os únicos símbolos que continuam exportados de lá são os slides de conteúdo (`addProjectSlide`, `addInterviewsSlide`, `addAreaSummarySlide` se aplicável) e os tipos `Interviews`/`QuantitativeLine`.

- [ ] **Step 4: Verificar que nada quebrou**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: ambos sem erro. Se `tsc` reclamar de símbolo não encontrado, é um bloco que ficou para trás ou um `export` faltando em `deck-theme.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/deck/deck-theme.ts src/server/deck/build-diagnostic-deck.ts src/server/deck/build-existing-automations-deck.ts
git commit -m "refactor: extrai tema e primitivas de layout do deck para deck-theme"
```

---

### Task 2: Extrair `computeDeckPayback`

Hoje o cálculo de payback vive dentro de `addPaybackSlide`. O KPI executivo precisa do mesmo número e recalcular em dois lugares deixa os slides livres para divergir.

**Files:**
- Modify: `src/server/deck/build-diagnostic-deck.ts` (`addPaybackSlide` e `buildDiagnosticDeck`)

- [ ] **Step 1: Criar a função pura, logo acima de `addPaybackSlide`**

```typescript
/**
 * Curva de payback + data + meses, calculados UMA vez por deck.
 *
 * Existe como função separada porque dois slides mostram o mesmo número (o KPI
 * do resumo executivo e o slide de payback). Calculado em dois lugares, um
 * arredondamento diferente já bastaria para o deck se contradizer.
 */
type DeckPayback = {
  curve: PaybackPoint[];
  paybackDate: Date | null;
  /** Meses entre o início do cronograma e o payback; null se não atingido. */
  paybackMonths: number | null;
  /** Nº de oportunidades com onda atribuída — a base do cálculo. */
  scheduledCount: number;
};

function computeDeckPayback(
  ranking: Ranking,
  settings: PaybackDeckSettings,
  structureCosts: StructureCostItem[]
): DeckPayback {
  const { wave1, wave2, startDate } = computeWaveSchedules(ranking, settings.wave1StartDate);
  const paybackSchedule = toDeckPaybackItems([...wave1, ...wave2], ranking, settings);
  const curve = computePaybackCurve(
    paybackSchedule,
    settings.developerDailyRateBRL,
    structureCosts
  );
  const paybackDate = findPaybackDate(curve);

  const scheduleStartDate =
    paybackSchedule.length === 0
      ? startDate
      : new Date(Math.min(...paybackSchedule.map((item) => item.startDate.getTime())));

  const paybackMonths = paybackDate
    ? Math.max(0, Math.round(differenceInCalendarDays(paybackDate, scheduleStartDate) / 30.44))
    : null;

  return { curve, paybackDate, paybackMonths, scheduledCount: paybackSchedule.length };
}
```

- [ ] **Step 2: Fazer `addPaybackSlide` receber o resultado pronto**

Trocar a assinatura e apagar o miolo de cálculo (linhas 1047–1066 do arquivo original), que agora vive em `computeDeckPayback`:

```typescript
function addPaybackSlide(pres: PptxGenJS, payback: DeckPayback): void {
  const slide = addTitledSlide(
    pres,
    "Payback / ROI acumulado",
    "Duas curvas ao longo do tempo: tudo que a automação custa (desenvolvimento, sustentação mensal e estrutura) contra tudo que ela economiza. O ponto em que a curva de economia cruza a de custo é o payback — a partir dali a operação passa a gerar retorno líquido.",
    undefined,
    false,
    0.76
  );
  const { curve, paybackDate, paybackMonths } = payback;
```

O restante do corpo (bloco de métrica à direita, `if (curve.length === 0)`, `addChart`) fica **idêntico** — ele já usa exatamente `paybackDate`, `paybackMonths` e `curve`.

`const summaryText = ...` (linha 1064 do original) é **código morto** — a variável nunca é lida. Apague junto.

- [ ] **Step 3: Atualizar a chamada em `buildDiagnosticDeck`**

O bloco `paybackSettings` precisa subir para antes de `const pres = new PptxGenJS()` (as Tasks 3 e 4 vão precisar do payback antes de o primeiro slide ser criado). Deixe a região assim, logo depois de `const structureCosts = ...`:

```typescript
  // Premissas resolvidas UMA vez aqui: os slides de payback recebem números já
  // decididos (empresa > global > padrão) em vez de decidirem por conta
  // própria, que é o que mantém o .pptx idêntico à aba Payback da tela de
  // priorização.
  const paybackSettings = {
    developerDailyRateBRL: developerDailyRateFrom(
      resolveDeveloperHourlyRate(company.developerHourlyRateBRL, settings.developerHourlyRateBRL)
    ),
    maintenanceHourlyRateBRL: resolveMaintenanceHourlyRate(
      company.maintenanceHourlyRateBRL,
      settings.maintenanceHourlyRateBRL
    ),
    defaultMaintenanceHoursPerWeek: settings.defaultMaintenanceHoursPerWeek,
    wave1StartDate: settings.wave1StartDate,
  };
  const payback = computeDeckPayback(rankingCombinado, paybackSettings, structureCosts);
```

E na sequência de slides, trocar a chamada:

```typescript
  addPaybackMethodSlide(pres);
  addPaybackSlide(pres, payback);
  addPaybackCompositionSlide(pres, rankingCombinado, paybackSettings);
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sem erro. Em particular, nenhum aviso de variável não usada — se `npm run lint` reclamar de `structureCosts` ou `settings` não usados dentro de `addPaybackSlide`, é sinal de que algum parâmetro antigo ficou na assinatura.

- [ ] **Step 5: Commit**

```bash
git add src/server/deck/build-diagnostic-deck.ts
git commit -m "refactor: payback do deck calculado uma vez em computeDeckPayback"
```

---

### Task 3: Slide "O trabalho realizado"

**Files:**
- Create: `src/server/deck/executive-summary-slides.ts`
- Create: `scripts/preview-executive-slides.ts`
- Modify: `package.json` (script `deck:preview`)
- Modify: `src/server/deck/build-diagnostic-deck.ts` (`buildDiagnosticDeck`)

- [ ] **Step 1: Criar `executive-summary-slides.ts` com a agregação de dados**

Os tipos de entrada são declarados estruturalmente (só os campos usados), de propósito: o módulo não importa nada de `build-diagnostic-deck.ts` e por isso não fecha ciclo. Os objetos reais do deck são compatíveis por estrutura.

```typescript
import PptxGenJS from "pptxgenjs";
import { formatCompactBRL } from "@/shared/utils";
import {
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SECONDARY,
  COLOR_ZEBRA,
  CONTENT_TOP_Y_WITH_SUBTITLE,
  CONTENT_W,
  MARGIN_X,
  TYPE,
  addTitledSlide,
} from "./deck-theme";

/**
 * Os dois slides de abertura do deck de diagnóstico: o que foi feito e qual o
 * resultado. Vêm antes de qualquer tabela porque é isso que decide se quem
 * recebe o arquivo por e-mail continua lendo.
 *
 * Módulo sem acesso a banco e sem regra de negócio: recebe números já
 * calculados por `buildDiagnosticDeck` e só decide como desenhá-los.
 */

/** Só os campos lidos daqui — mantém o módulo independente do tipo do ranking. */
type RankedOpportunity = { id: string; estimatedAnnualSavingBRL: number | null };
type ProjectHours = { id: string; currentAnnualHours: number | null };
type InterviewLike = {
  status: string;
  area: { name: string } | null;
  participants: { personId: string }[];
};

/**
 * Recorte de `DeckPayback` que o slide 2 consome. Declarado aqui, e não
 * importado de `build-diagnostic-deck.ts`, para este módulo não ter nenhuma
 * aresta de volta para quem o importa — nem de tipo.
 */
export type PaybackSummary = {
  curve: { date: Date; cumulativeCost: number; cumulativeSaving: number }[];
  paybackMonths: number | null;
  scheduledCount: number;
};

export type ExecutiveSummaryData = {
  opportunityCount: number;
  areaCount: number;
  manualHoursPerYear: number;
  totalAnnualSavingBRL: number;
  completedInterviewCount: number;
  peopleHeardCount: number;
  areasHeard: string[];
};

/**
 * As horas vêm dos projetos cruzados com o ranking, e não de `getAreaSummary`:
 * o resumo por área só conta projetos COM área definida, então usá-lo
 * subestimaria as horas em qualquer empresa que tenha uma oportunidade sem
 * área. O cruzamento por id aplica a mesma população do ranking (pipeline,
 * fora DONE/CANCELLED) sobre a lista completa de projetos.
 */
export function buildExecutiveSummaryData(input: {
  ranking: RankedOpportunity[];
  areaCount: number;
  projects: ProjectHours[];
  interviews: InterviewLike[];
}): ExecutiveSummaryData {
  const rankedIds = new Set(input.ranking.map((row) => row.id));
  const manualHoursPerYear = input.projects
    .filter((project) => rankedIds.has(project.id))
    .reduce((sum, project) => sum + (project.currentAnnualHours ?? 0), 0);

  const completed = input.interviews.filter((interview) => interview.status === "realizado");
  const people = new Set(
    completed.flatMap((interview) => interview.participants.map((p) => p.personId))
  );
  const areasHeard = Array.from(
    new Set(
      completed
        .map((interview) => interview.area?.name)
        .filter((name): name is string => Boolean(name))
    )
  );

  return {
    opportunityCount: input.ranking.length,
    areaCount: input.areaCount,
    manualHoursPerYear,
    totalAnnualSavingBRL: input.ranking.reduce(
      (sum, row) => sum + (row.estimatedAnnualSavingBRL ?? 0),
      0
    ),
    completedInterviewCount: completed.length,
    peopleHeardCount: people.size,
    areasHeard,
  };
}

/** `9800` → `"9.800 h"`. */
function formatHours(hours: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(Math.round(hours))} h`;
}
```

- [ ] **Step 2: Adicionar o slide 1 no mesmo arquivo**

```typescript
const SCOPE_NARRATIVE =
  "O diagnóstico percorreu as áreas operacionais da empresa para identificar, quantificar e priorizar processos com potencial de automação. Cada oportunidade foi levantada junto a quem executa a atividade hoje e validada com o gestor da área.";

/** Traço em vez de zero quando a empresa não tem o dado — ver spec, degradação. */
const NO_DATA = "—";

export function addExecutiveScopeSlide(pres: PptxGenJS, data: ExecutiveSummaryData): void {
  const slide = addTitledSlide(pres, "O trabalho realizado", SCOPE_NARRATIVE);

  const steps = [
    {
      number: "01",
      label: "Entrevistas",
      value:
        data.completedInterviewCount > 0
          ? `${data.completedInterviewCount} ${data.completedInterviewCount === 1 ? "entrevista realizada" : "entrevistas realizadas"}\n${data.peopleHeardCount} ${data.peopleHeardCount === 1 ? "pessoa ouvida" : "pessoas ouvidas"}`
          : NO_DATA,
    },
    {
      number: "02",
      label: "Mapeamento",
      value: `${data.opportunityCount} ${data.opportunityCount === 1 ? "processo detalhado" : "processos detalhados"}`,
    },
    {
      number: "03",
      label: "Quantificação",
      value: `${formatHours(data.manualHoursPerYear)} de trabalho manual por ano`,
    },
    {
      number: "04",
      label: "Priorização",
      value: `${data.areaCount} ${data.areaCount === 1 ? "área coberta" : "áreas cobertas"}`,
    },
  ];

  const gap = 0.25;
  const stepW = (CONTENT_W - gap * 3) / 4;
  const stepH = 1.7;
  const top = CONTENT_TOP_Y_WITH_SUBTITLE;

  steps.forEach((step, index) => {
    const x = MARGIN_X + index * (stepW + gap);
    slide.addShape("rect", { x, y: top, w: stepW, h: stepH, fill: { color: COLOR_ZEBRA } });
    // Barra de acento à esquerda: mesma marca visual da caixa de destaque do
    // slide de processo, sem introduzir cor nova.
    slide.addShape("rect", { x, y: top, w: 0.05, h: stepH, fill: { color: COLOR_ACCENT } });
    slide.addText(step.number, {
      x: x + 0.25,
      y: top + 0.16,
      w: stepW - 0.45,
      h: 0.3,
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1.5,
      color: COLOR_ACCENT,
    });
    slide.addText(step.label, {
      x: x + 0.25,
      y: top + 0.48,
      w: stepW - 0.45,
      h: 0.36,
      fontSize: TYPE.bodyLarge,
      bold: true,
      color: COLOR_PRIMARY,
    });
    slide.addText(step.value, {
      x: x + 0.25,
      y: top + 0.88,
      w: stepW - 0.45,
      h: 0.7,
      fontSize: TYPE.body,
      color: COLOR_SECONDARY,
      lineSpacingMultiple: 1.25,
      valign: "top",
    });
  });

  if (data.areasHeard.length > 0) {
    slide.addText(`Áreas ouvidas:  ${data.areasHeard.join("  ·  ")}`, {
      x: MARGIN_X,
      y: top + stepH + 0.45,
      w: CONTENT_W,
      h: 0.5,
      fontSize: TYPE.body,
      color: COLOR_MUTED,
      valign: "top",
    });
  }
}
```

- [ ] **Step 3: Criar o script de preview**

Gera os slides com dados fixos, sem banco — é o "teste" repetível deste plano. Na Task 3 ele cobre só o slide 1; a Task 4 acrescenta o segundo.

`scripts/preview-executive-slides.ts`:

```typescript
import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import { defineDeckTheme, addCoverSlide } from "../src/server/deck/deck-theme";
import {
  addExecutiveScopeSlide,
  buildExecutiveSummaryData,
} from "../src/server/deck/executive-summary-slides";

/**
 * Gera preview-executive-slides.pptx com dados fixos, sem tocar no banco.
 * Serve para conferir os slides executivos (inclusive os cenários sem dado)
 * sem precisar subir o app. Rode: npm run deck:preview
 */

const full = buildExecutiveSummaryData({
  ranking: Array.from({ length: 24 }, (_, i) => ({
    id: `p${i}`,
    estimatedAnnualSavingBRL: 51_666,
  })),
  areaCount: 6,
  projects: Array.from({ length: 24 }, (_, i) => ({ id: `p${i}`, currentAnnualHours: 408 })),
  interviews: [
    { status: "realizado", area: { name: "Financeiro" }, participants: [{ personId: "a" }] },
    { status: "realizado", area: { name: "Fiscal" }, participants: [{ personId: "b" }] },
    { status: "agendado", area: { name: "TI" }, participants: [{ personId: "c" }] },
  ],
});

const empty = buildExecutiveSummaryData({
  ranking: [],
  areaCount: 0,
  projects: [],
  interviews: [],
});

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";
defineDeckTheme(pres, "Empresa Exemplo");
addCoverSlide(pres, "Empresa Exemplo");
addExecutiveScopeSlide(pres, full);
addExecutiveScopeSlide(pres, empty);

void pres.write({ outputType: "nodebuffer" }).then((buffer) => {
  fs.writeFileSync("preview-executive-slides.pptx", buffer as Buffer);
  console.log("Gerado: preview-executive-slides.pptx");
});
```

Adicionar em `package.json`, no bloco `scripts`:

```json
    "deck:preview": "tsx scripts/preview-executive-slides.ts",
```

E em `.gitignore`, para o arquivo gerado não entrar no repo:

```
preview-executive-slides.pptx
```

- [ ] **Step 4: Rodar o preview e conferir**

```bash
npm run deck:preview
```

Esperado: `Gerado: preview-executive-slides.pptx`. Abra o arquivo. Slide 2 deve mostrar `2 entrevistas realizadas / 2 pessoas ouvidas`, `24 processos detalhados`, `9.792 h de trabalho manual por ano`, `6 áreas cobertas` e a linha `Áreas ouvidas: Financeiro · Fiscal` (a entrevista `agendado` **não** entra). Slide 3 (cenário vazio) deve mostrar `—` no bloco 01, `0` nos demais, e **nenhuma** linha "Áreas ouvidas".

- [ ] **Step 5: Ligar no deck real**

Em `buildDiagnosticDeck`, logo depois do `const payback = ...` da Task 2:

```typescript
  const executiveData = buildExecutiveSummaryData({
    ranking: rankingCombinado,
    areaCount: areaSummary.length,
    projects,
    interviews,
  });
```

E na sequência de slides, entre a capa e o resumo por área:

```typescript
  addCoverSlide(pres, company.name);
  addExecutiveScopeSlide(pres, executiveData);
  addAreaSummarySlide(pres, areaSummary);
```

Com o import no topo do arquivo:

```typescript
import {
  addExecutiveScopeSlide,
  buildExecutiveSummaryData,
} from "./executive-summary-slides";
```

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit
npm run lint
```

Esperado: sem erro.

- [ ] **Step 7: Commit**

```bash
git add src/server/deck/executive-summary-slides.ts src/server/deck/build-diagnostic-deck.ts scripts/preview-executive-slides.ts package.json .gitignore
git commit -m "feat: slide executivo 'O trabalho realizado' na abertura do deck"
```

---

### Task 4: Slide "Os números do diagnóstico"

**Files:**
- Modify: `src/server/deck/executive-summary-slides.ts`
- Modify: `scripts/preview-executive-slides.ts`
- Modify: `src/server/deck/build-diagnostic-deck.ts` (`buildDiagnosticDeck`)

- [ ] **Step 1: Adicionar o slide em `executive-summary-slides.ts`**

```typescript
const NUMBERS_NARRATIVE =
  "Resultado consolidado das oportunidades mapeadas, considerando o cronograma de implementação proposto e os custos de desenvolvimento, sustentação e estrutura.";

export function addExecutiveNumbersSlide(
  pres: PptxGenJS,
  data: ExecutiveSummaryData,
  payback: PaybackSummary
): void {
  const slide = addTitledSlide(pres, "Os números do diagnóstico", NUMBERS_NARRATIVE);

  const kpis: { value: string; label: string; accent: boolean }[] = [
    { value: String(data.opportunityCount), label: "Oportunidades", accent: false },
    { value: String(data.areaCount), label: "Áreas", accent: false },
    { value: formatHours(data.manualHoursPerYear), label: "Trabalho manual/ano", accent: false },
    { value: formatCompactBRL(data.totalAnnualSavingBRL), label: "Economia anual", accent: true },
    {
      value:
        payback.paybackMonths != null
          ? `${payback.paybackMonths} ${payback.paybackMonths === 1 ? "mês" : "meses"}`
          : NO_DATA,
      label: payback.paybackMonths != null ? "Payback" : "Payback não atingido",
      accent: true,
    },
  ];

  const top = CONTENT_TOP_Y_WITH_SUBTITLE;
  const kpiW = CONTENT_W / kpis.length;
  kpis.forEach((kpi, index) => {
    const x = MARGIN_X + index * kpiW;
    // Régua superior em vez de caixa: o número precisa ser a única coisa pesada
    // da faixa, e cinco caixas seguidas leem como tabela.
    slide.addShape("rect", { x, y: top, w: kpiW - 0.3, h: 0.028, fill: { color: COLOR_ACCENT } });
    slide.addText(kpi.value, {
      x,
      y: top + 0.14,
      w: kpiW - 0.3,
      h: 0.62,
      fontSize: TYPE.metricValue,
      bold: true,
      color: kpi.accent ? COLOR_ACCENT : COLOR_PRIMARY,
      valign: "top",
    });
    slide.addText(kpi.label.toUpperCase(), {
      x,
      y: top + 0.8,
      w: kpiW - 0.3,
      h: 0.4,
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1,
      color: COLOR_MUTED,
      valign: "top",
    });
  });

  // Nota só quando os dois escopos divergem: economia soma tudo que foi
  // mapeado, payback só o que já tem onda. Sem a nota, o leitor cruza os dois
  // números e conclui que um deles está errado.
  const hasScopeNote = payback.scheduledCount < data.opportunityCount;
  const chartTop = top + 1.35;
  const chartBottom = hasScopeNote ? 6.4 : 6.8;

  if (payback.curve.length === 0) {
    slide.addText("Cronograma ainda não definido — nenhuma oportunidade alocada em onda.", {
      x: MARGIN_X,
      y: chartTop,
      w: CONTENT_W,
      h: 0.5,
      fontSize: TYPE.bodyLarge,
      color: COLOR_MUTED,
    });
  } else {
    const labels = payback.curve.map((point) => formatDate(point.date));
    slide.addChart(
      "line",
      [
        {
          name: "Custo acumulado",
          labels,
          values: payback.curve.map((point) => Math.round(point.cumulativeCost)),
        },
        {
          name: "Economia acumulada",
          labels,
          values: payback.curve.map((point) => Math.round(point.cumulativeSaving)),
        },
      ],
      {
        x: MARGIN_X,
        y: chartTop,
        w: CONTENT_W,
        h: chartBottom - chartTop,
        showLegend: true,
        legendPos: "b",
        legendFontSize: TYPE.caption,
        lineDataSymbol: "none",
        lineSize: 2.5,
        chartColors: [COLOR_MUTED, COLOR_ACCENT],
        // Aqui a curva é ilustrativa — o slide com as datas legíveis vem depois,
        // na Parte 2. Esconder o eixo de categoria evita a faixa preta de ~261
        // rótulos semanais num gráfico que só precisa mostrar o cruzamento.
        catAxisHidden: true,
        valAxisLabelFontSize: TYPE.caption - 1,
        valAxisLabelColor: COLOR_MUTED,
        valAxisLabelFormatCode: "R$ #,##0",
        valGridLine: { style: "solid", size: 0.5, color: COLOR_TABLE_BORDER },
        catGridLine: { style: "none" },
        border: { pt: 0, color: COLOR_SURFACE },
      }
    );
  }

  if (hasScopeNote) {
    slide.addText(
      `Economia anual considera as ${data.opportunityCount} oportunidades mapeadas; o payback é calculado sobre as ${payback.scheduledCount} já alocadas nas ondas 1 e 2.`,
      {
        x: MARGIN_X,
        y: 6.48,
        w: CONTENT_W,
        h: 0.35,
        fontSize: TYPE.caption,
        color: COLOR_MUTED,
        valign: "top",
      }
    );
  }
}
```

Acrescentar ao import de `./deck-theme` no topo do arquivo os símbolos novos usados aqui:

```typescript
  COLOR_SURFACE,
  COLOR_TABLE_BORDER,
```

E ao import de `@/shared/utils`:

```typescript
import { formatCompactBRL, formatDate } from "@/shared/utils";
```

- [ ] **Step 2: Estender o script de preview**

Em `scripts/preview-executive-slides.ts`, acrescentar as fixtures de payback e as duas chamadas novas:

```typescript
import {
  addExecutiveNumbersSlide,
  type PaybackSummary,
} from "../src/server/deck/executive-summary-slides";

const paybackOk: PaybackSummary = {
  curve: Array.from({ length: 40 }, (_, i) => ({
    date: new Date(2026, 8, 1 + i * 7),
    cumulativeCost: 120_000 + i * 9_000,
    cumulativeSaving: i * 26_000,
  })),
  paybackMonths: 9,
  scheduledCount: 17,
};

const paybackNone: PaybackSummary = {
  curve: [],
  paybackMonths: null,
  scheduledCount: 0,
};
```

E depois das chamadas de `addExecutiveScopeSlide`:

```typescript
addExecutiveNumbersSlide(pres, full, paybackOk);
addExecutiveNumbersSlide(pres, full, paybackNone);
```

- [ ] **Step 3: Rodar o preview e conferir**

```bash
npm run deck:preview
```

Abra o arquivo. O slide "Os números do diagnóstico" com `paybackOk` deve mostrar a faixa `24 / 6 / 9.792 h / R$ 1.2M / 9 meses` (os dois últimos em azul), a curva com as duas linhas se cruzando e a nota de rodapé citando 24 e 17. O slide com `paybackNone` deve mostrar `—` sob `PAYBACK NÃO ATINGIDO`, a mensagem "Cronograma ainda não definido" no lugar do gráfico, e a nota de rodapé citando 24 e 0.

Confira também que nenhum número da faixa estoura a coluna nem encosta no vizinho. Se estourar, reduza `TYPE.metricValue` **apenas neste slide** passando um `fontSize` explícito menor — não altere a escala global do deck.

- [ ] **Step 4: Ligar no deck real**

Em `buildDiagnosticDeck`:

```typescript
  addCoverSlide(pres, company.name);
  addExecutiveScopeSlide(pres, executiveData);
  addExecutiveNumbersSlide(pres, executiveData, payback);
  addAreaSummarySlide(pres, areaSummary);
```

E acrescentar `addExecutiveNumbersSlide` ao import de `./executive-summary-slides`.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Esperado: os três sem erro. O `npm run build` aqui (e não nas tasks anteriores) garante que a rota `/api/empresas/[id]/deck` compila com a árvore de imports nova.

- [ ] **Step 6: Commit**

```bash
git add src/server/deck/executive-summary-slides.ts src/server/deck/build-diagnostic-deck.ts scripts/preview-executive-slides.ts
git commit -m "feat: slide executivo 'Os números do diagnóstico' na abertura do deck"
```

---

### Task 5: Verificação no deck real

O preview cobre o desenho dos slides com dados fixos. Esta task confirma que os números batem com os dados reais e com os slides que vêm depois no mesmo deck.

**Files:** nenhum — verificação.

- [ ] **Step 1: Subir o app e gerar o deck**

```bash
npm run dev
```

Abrir `/admin/empresas`, escolher uma empresa com entrevistas, áreas e ondas definidas, e baixar o deck de diagnóstico.

- [ ] **Step 2: Conferir a coerência entre slides**

Abrir o `.pptx` e checar, nesta ordem:

1. A ordem é capa → "O trabalho realizado" → "Os números do diagnóstico" → "Resultados agregados por área".
2. O KPI **Oportunidades** é igual ao número de linhas do "Ranking combinado".
3. O KPI **Áreas** é igual ao número de linhas (fora a de Total) de "Resultados agregados por área".
4. O KPI **Payback** é o mesmo número grande do slide "Payback / ROI acumulado".
5. O KPI **Economia anual** é ≥ o Total da coluna "Economia estimada (ano)" do resumo por área — maior quando existem oportunidades sem área.
6. Rodapé e numeração de página aparecem nos dois slides novos (vêm do master `CONTENT`).

- [ ] **Step 3: Conferir os cenários de dado faltando**

Repetir o download para:

- Uma empresa **sem entrevista cadastrada**: bloco 01 com `—`, sem a linha "Áreas ouvidas", slide presente.
- Uma empresa **sem nenhuma oportunidade em onda**: KPI de payback `—`, mensagem "Cronograma ainda não definido" no lugar do gráfico.

Se não houver empresa nesses estados no ambiente, o preview da Task 4 já cobriu o desenho — registre no commit final qual cenário foi verificado só via preview.

- [ ] **Step 4: Commit final**

Se nenhum ajuste foi necessário, não há o que commitar. Se houve ajuste de layout:

```bash
git add src/server/deck/executive-summary-slides.ts
git commit -m "fix: ajustes de layout dos slides executivos após verificação no deck real"
```

---

## Self-review

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| `deck-theme.ts` com as primitivas listadas | 1 |
| `build-existing-automations-deck.ts` importando tema do módulo certo | 1 |
| `computeDeckPayback` + `addPaybackSlide` recebendo o resultado | 2 |
| Origem de cada número (tabela de dados) | 3, Step 1 |
| Slide 1 com os 4 blocos e a linha de áreas ouvidas | 3, Step 2 |
| Degradação sem entrevista / sem área / sem oportunidade | 3 (Steps 2 e 4), 4 (Step 1) |
| Slide 2 com 5 KPIs, cores e `formatCompactBRL` | 4, Step 1 |
| Curva resumida com `catAxisHidden` e fallback sem onda | 4, Step 1 |
| Nota de rodapé condicional | 4, Step 1 |
| Ordem final do deck | 3 (Step 5), 4 (Step 4) |
| Os 4 cenários de verificação manual | 4 (Step 3), 5 |

**Consistência de tipos:** `DeckPayback` (Task 2) tem quatro campos; `PaybackSummary` (Task 3) declara os três que o slide 2 usa, e `DeckPayback` é estruturalmente atribuível a ele — a chamada `addExecutiveNumbersSlide(pres, executiveData, payback)` da Task 4 compila sem conversão. `ExecutiveSummaryData` é declarado na Task 3 e usado com os mesmos sete campos na Task 4. `formatHours` e `NO_DATA` são declarados na Task 3 e reutilizados na Task 4, no mesmo arquivo.

**Direção das dependências:** `deck-theme.ts` não importa ninguém do `deck/`. `executive-summary-slides.ts` importa só `deck-theme.ts` e `@/shared/utils` — nem tipo vem de `build-diagnostic-deck.ts`, que é quem o importa. Grafo acíclico, sem depender de `import type` ser apagado na compilação.
