# Deck "Automações Existentes" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um segundo export `.pptx` — "Automações Existentes" — espelhando a estrutura do deck de diagnóstico atual, mas para a população de automações já existentes/entregues, com capa, resumo por área, 2 rankings (economia acumulada/qualitativo), entrevistas e um slide por automação (reaproveitando o slide de processo já existente, com duas linhas novas: status operacional e economia acumulada real).

**Architecture:** Exporta 5 funções + 4 tipos + 2 constantes já existentes em `src/server/deck/build-diagnostic-deck.ts` (puramente aditivo, nenhuma lógica muda) para reuso num arquivo novo, `src/server/deck/build-existing-automations-deck.ts`, que escreve do zero só o que é genuinamente diferente (resumo por área e rankings da nova população). Uma rota de API nova (`/api/empresas/[id]/deck-automacoes-existentes`) espelha a rota de export já existente, e um botão novo em `admin/empresas/page.tsx` aciona o download.

**Tech Stack:** Next.js (Route Handlers), Prisma, tRPC (via `createCaller`), `pptxgenjs`.

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest) e `npm run lint` não funciona neste ambiente (eslint não instalado). A verificação de cada task é feita via `npx tsc --noEmit`; a geração real do `.pptx` (que depende de banco de dados) não pode ser testada neste ambiente — fica com o usuário na Task 5.

**Spec:** `docs/superpowers/specs/2026-07-14-deck-automacoes-existentes-design.md`

---

### Task 1: Exportar helpers reaproveitáveis de `build-diagnostic-deck.ts`

**Files:**
- Modify: `src/server/deck/build-diagnostic-deck.ts` (várias linhas — ver steps)

Esta task só adiciona a palavra-chave `export` a funções/tipos/constantes já existentes, e adiciona um terceiro parâmetro opcional a `addProjectSlide`. Nenhuma lógica existente muda.

- [ ] **Step 1: Exportar os tipos `Slide`, `TableRow`, `Interviews`**

Em `src/server/deck/build-diagnostic-deck.ts`, localize:

```ts
type Slide = ReturnType<PptxGenJS["addSlide"]>;
type TableRow = Parameters<Slide["addTable"]>[0][number];
```

Troque por:

```ts
export type Slide = ReturnType<PptxGenJS["addSlide"]>;
export type TableRow = Parameters<Slide["addTable"]>[0][number];
```

Em seguida, localize:

```ts
type Ranking = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getPrioritizedRanking"]>>;
type AreaSummary = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getAreaSummary"]>>;
type Interviews = Awaited<ReturnType<ReturnType<typeof createCaller>["interview"]["list"]>>;
```

Troque por:

```ts
type Ranking = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getPrioritizedRanking"]>>;
type AreaSummary = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getAreaSummary"]>>;
export type Interviews = Awaited<ReturnType<ReturnType<typeof createCaller>["interview"]["list"]>>;
```

(`Ranking`/`AreaSummary` continuam privados — são específicos do deck de oportunidades, não usados pelo arquivo novo.)

- [ ] **Step 2: Exportar `COLOR_MUTED` e `TABLE_HEADER_OPTS`**

Em `src/server/deck/build-diagnostic-deck.ts`, localize:

```ts
const COLOR_PRIMARY = "1E293B"; // slate-800
const COLOR_ACCENT = "2563EB"; // blue-600
const COLOR_MUTED = "64748B"; // slate-500
const COLOR_HEADER_BG = "1E293B";
const COLOR_HEADER_TEXT = "FFFFFF";
const COLOR_TABLE_BORDER = "E2E8F0";
```

Troque por:

```ts
const COLOR_PRIMARY = "1E293B"; // slate-800
const COLOR_ACCENT = "2563EB"; // blue-600
export const COLOR_MUTED = "64748B"; // slate-500
const COLOR_HEADER_BG = "1E293B";
const COLOR_HEADER_TEXT = "FFFFFF";
const COLOR_TABLE_BORDER = "E2E8F0";
```

Em seguida, localize:

```ts
const TABLE_HEADER_OPTS = {
  bold: true,
  color: COLOR_HEADER_TEXT,
  fill: { color: COLOR_HEADER_BG },
} as const;
```

Troque por:

```ts
export const TABLE_HEADER_OPTS = {
  bold: true,
  color: COLOR_HEADER_TEXT,
  fill: { color: COLOR_HEADER_BG },
} as const;
```

- [ ] **Step 3: Exportar `addCoverSlide`, `addTitledSlide`, `addSlideTable`, `addInterviewsSlide`**

Em `src/server/deck/build-diagnostic-deck.ts`, localize cada uma destas 4 linhas (uma de cada vez, cada uma é única no arquivo) e adicione `export` antes de `function`:

```ts
function addCoverSlide(pres: PptxGenJS, companyName: string): void {
```
→
```ts
export function addCoverSlide(pres: PptxGenJS, companyName: string): void {
```

```ts
function addInterviewsSlide(pres: PptxGenJS, interviews: Interviews): void {
```
→
```ts
export function addInterviewsSlide(pres: PptxGenJS, interviews: Interviews): void {
```

```ts
function addTitledSlide(pres: PptxGenJS, title: string): Slide {
```
→
```ts
export function addTitledSlide(pres: PptxGenJS, title: string): Slide {
```

```ts
function addSlideTable(slide: Slide, rows: TableRow[], colW: number[]): void {
```
→
```ts
export function addSlideTable(slide: Slide, rows: TableRow[], colW: number[]): void {
```

- [ ] **Step 4: Exportar `QuantitativeLine` e dar a `addProjectSlide` um terceiro parâmetro opcional**

Em `src/server/deck/build-diagnostic-deck.ts`, localize:

```ts
type QuantitativeLine = { label: string; value: string; isGap?: boolean; isSaving?: boolean };
```

Troque por:

```ts
export type QuantitativeLine = { label: string; value: string; isGap?: boolean; isSaving?: boolean };
```

Em seguida, localize:

```ts
function addProjectSlide(pres: PptxGenJS, project: ProjectDeckRow): void {
  const slide = addTitledSlide(pres, project.title);
```

Troque por:

```ts
export function addProjectSlide(
  pres: PptxGenJS,
  project: ProjectDeckRow,
  extraQuantitativeLines: QuantitativeLine[] = []
): void {
  const slide = addTitledSlide(pres, project.title);
```

Por fim, localize (mais abaixo, na mesma função):

```ts
  const quantitativeLines = buildQuantitativeLines(project);
  addSectionLabel(slide, "Avaliação Quantitativa", rightX, 1.1, rightW);
```

Troque por:

```ts
  const quantitativeLines = [...buildQuantitativeLines(project), ...extraQuantitativeLines];
  addSectionLabel(slide, "Avaliação Quantitativa", rightX, 1.1, rightW);
```

- [ ] **Step 5: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `build-diagnostic-deck.ts` (erros pré-existentes não relacionados em `chart.tsx`/`input-otp.tsx`/`sidebar.tsx`/`toaster.tsx` são esperados).

- [ ] **Step 6: Commit**

```bash
git add src/server/deck/build-diagnostic-deck.ts
git commit -m "refactor: export reusable deck slide helpers for the existing-automations deck"
```

---

### Task 2: `src/server/deck/build-existing-automations-deck.ts` (novo arquivo)

**Files:**
- Create: `src/server/deck/build-existing-automations-deck.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
import PptxGenJS from "pptxgenjs";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { formatCurrency } from "@/shared/utils";
import {
  addCoverSlide,
  addTitledSlide,
  addSlideTable,
  addInterviewsSlide,
  addProjectSlide,
  COLOR_MUTED,
  TABLE_HEADER_OPTS,
  type Slide,
  type TableRow,
  type Interviews,
  type QuantitativeLine,
} from "./build-diagnostic-deck";

/**
 * Deck paralelo ao de diagnóstico (build-diagnostic-deck.ts), mas para a
 * população de automações já existentes/entregues (hasCurrentApplication="sim"
 * ou status DONE) — o inverso exato da população usada em getPrioritizedRanking.
 * Sem cronograma/payback/combinado: não se aplicam a algo já entregue.
 */

type ExistingAutomationsRanking = Awaited<
  ReturnType<ReturnType<typeof createCaller>["project"]["getExistingAutomationsRanking"]>
>;
type ExistingAutomationsAreaSummary = Awaited<
  ReturnType<ReturnType<typeof createCaller>["project"]["getExistingAutomationsAreaSummary"]>
>;

type ExistingAutomationDeckRow = {
  id: string;
  title: string;
  description: string | null;
  architectNotes: string | null;
  benefits: unknown;
  processFrequency: string | null;
  robotSchedule: string | null;
  peopleInvolved: number | null;
  taskDurationHours: number | null;
  currentAnnualHours: number | null;
  monthlyHoursSaved: number | null;
  ratingErrorReduction: number | null;
  ratingProcessCriticality: number | null;
  ratingInternalImpact: number | null;
  ratingExternalImpact: number | null;
  ratingCompliance: number | null;
  accumulatedSavingBRL: number | null;
  operationalStatus: "ACTIVE" | "PAUSED" | "ISSUE" | null;
};

const ROBOT_OPERATIONAL_STATUS_LABEL: Record<"ACTIVE" | "PAUSED" | "ISSUE", string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  ISSUE: "Com problema",
};

export async function buildExistingAutomationsDeck(
  companyId: string,
  actingUserId: string
): Promise<Buffer> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    throw new Error(`Empresa não encontrada (id: ${companyId}).`);
  }

  const ctx: Context = { db, userId: actingUserId, realUserId: actingUserId };
  const caller = createCaller(ctx);

  const [areaSummary, rankingEconomia, rankingQualitativo, interviews, projects] =
    await Promise.all([
      caller.project.getExistingAutomationsAreaSummary({ companyId }),
      caller.project.getExistingAutomationsRanking({ companyId, sortBy: "economia" }),
      caller.project.getExistingAutomationsRanking({ companyId, sortBy: "qualitativo" }),
      caller.interview.list({ companyId }),
      db.project.findMany({
        where: {
          companyId,
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          architectNotes: true,
          benefits: true,
          processFrequency: true,
          robotSchedule: true,
          peopleInvolved: true,
          taskDurationHours: true,
          currentAnnualHours: true,
          monthlyHoursSaved: true,
          ratingErrorReduction: true,
          ratingProcessCriticality: true,
          ratingInternalImpact: true,
          ratingExternalImpact: true,
          ratingCompliance: true,
          accumulatedSavingBRL: true,
          operationalStatus: true,
        },
      }),
    ]);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Pipeline";
  pres.company = "Pipeline";
  pres.subject = `Automações existentes — ${company.name}`;

  addCoverSlide(pres, company.name);
  addAreaSummarySlide(pres, areaSummary);
  addRankingSlide(pres, "Ranking por economia acumulada", rankingEconomia, "economia");
  addRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo");
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  for (const project of projects as ExistingAutomationDeckRow[]) {
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
    addProjectSlide(pres, project, extraLines);
  }

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

function addAreaSummarySlide(pres: PptxGenJS, areaSummary: ExistingAutomationsAreaSummary): void {
  const slide = addTitledSlide(pres, "Resultados agregados por área — automações existentes");

  if (areaSummary.length === 0) {
    slide.addText("Nenhuma automação existente com área definida para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Automações", options: TABLE_HEADER_OPTS },
    { text: "Economia acumulada (real)", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = areaSummary.map((a) => [
    { text: a.areaName },
    { text: String(a.projectCount) },
    { text: formatCurrency(a.totalAccumulatedSavingBRL) },
  ]);

  const totals: TableRow = [
    { text: "Total", options: { bold: true } },
    {
      text: String(areaSummary.reduce((sum, a) => sum + a.projectCount, 0)),
      options: { bold: true },
    },
    {
      text: formatCurrency(areaSummary.reduce((sum, a) => sum + a.totalAccumulatedSavingBRL, 0)),
      options: { bold: true },
    },
  ];

  addSlideTable(slide, [header, ...rows, totals], [4, 2.5, 3.7]);
}

function activeScoreOf(
  row: ExistingAutomationsRanking[number],
  sortBy: "economia" | "qualitativo"
): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  return Math.round(row.qualitativeScorePercent);
}

function addRankingSlide(
  pres: PptxGenJS,
  title: string,
  ranking: ExistingAutomationsRanking,
  sortBy: "economia" | "qualitativo"
): void {
  const slide = addTitledSlide(pres, title);

  if (ranking.length === 0) {
    slide.addText("Nenhuma automação existente encontrada para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "#", options: TABLE_HEADER_OPTS },
    { text: "Automação", options: TABLE_HEADER_OPTS },
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Economia acumulada", options: TABLE_HEADER_OPTS },
    { text: "Score", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = ranking.map((row, index) => [
    { text: String(index + 1) },
    { text: row.title },
    { text: row.areaName ?? "-" },
    {
      text: row.accumulatedSavingBRL != null ? formatCurrency(row.accumulatedSavingBRL) : "-",
    },
    { text: String(activeScoreOf(row, sortBy)) },
  ]);

  addSlideTable(slide, [header, ...rows], [0.6, 5, 2.9, 2.4, 1.3]);
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `build-existing-automations-deck.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts
git commit -m "feat: add buildExistingAutomationsDeck (.pptx export for existing automations)"
```

---

### Task 3: Endpoint `GET /api/empresas/[id]/deck-automacoes-existentes`

**Files:**
- Create: `src/app/api/empresas/[id]/deck-automacoes-existentes/route.ts`

- [ ] **Step 1: Criar a rota**

```ts
import { db } from "@/server/db";
import { buildExistingAutomationsDeck } from "@/server/deck/build-existing-automations-deck";
import { slugifyFilename } from "@/shared/utils";

/**
 * GET /api/empresas/[id]/deck-automacoes-existentes
 *
 * Gera e devolve o deck de automações existentes/entregues em PPTX.
 *
 * Autenticação: esta rota NÃO é tRPC, então não passa pelos middlewares
 * `enforceAdmin`. Replicamos a mesma checagem manualmente (mesmo padrão de
 * /api/empresas/[id]/deck) — o app inteiro autentica via header `x-user-id`
 * (não sessão de cookie), então lemos esse header, buscamos o usuário e
 * exigimos role ADMIN/SUPER_ADMIN.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return new Response("Não autenticado (header x-user-id ausente).", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    return new Response("Não autenticado (usuário não encontrado).", { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return new Response("Acesso restrito a administradores.", { status: 403 });
  }

  const { id: companyId } = await params;

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    return new Response("Empresa não encontrada.", { status: 404 });
  }

  try {
    const buffer = await buildExistingAutomationsDeck(companyId, userId);

    const safeName = slugifyFilename(company.name) || companyId;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="automacoes-existentes-${safeName}.pptx"`,
      },
    });
  } catch (err) {
    console.error("Falha ao gerar deck de automações existentes:", err);
    return new Response("Falha ao gerar o deck de automações existentes.", { status: 500 });
  }
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `deck-automacoes-existentes/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/empresas/[id]/deck-automacoes-existentes/route.ts"
git commit -m "feat: add API route for the existing-automations deck export"
```

---

### Task 4: Botão de export em `admin/empresas/page.tsx`

**Files:**
- Modify: `src/app/(private)/admin/empresas/page.tsx` (imports, `handleExportDeck`, linha de ações)

- [ ] **Step 1: Adicionar estado e handler dedicados**

Em `src/app/(private)/admin/empresas/page.tsx`, localize a função `handleExportDeck` (por volta da linha 104):

```tsx
  async function handleExportDeck(company: (typeof companies)[number]) {
    setExportingId(company.id);
    try {
      const response = await fetch(`/api/empresas/${company.id}/deck`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
```

Não precisa mudar esse trecho — localize o final da função (procure o próximo `}` que fecha `handleExportDeck`, deve ter um `finally { setExportingId(null); }` e o fechamento da função) e adicione uma segunda função logo depois, com a mesma estrutura, apontando para a rota nova:

```tsx
  async function handleExportExistingAutomationsDeck(company: (typeof companies)[number]) {
    setExportingExistingAutomationsId(company.id);
    try {
      const response = await fetch(`/api/empresas/${company.id}/deck-automacoes-existentes`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const safeName = slugifyFilename(company.name) || company.id;
      const link = document.createElement("a");
      link.href = url;
      link.download = `automacoes-existentes-${safeName}.pptx`;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: "Erro ao exportar automações existentes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setExportingExistingAutomationsId(null);
    }
  }
```

- [ ] **Step 2: Adicionar o estado `exportingExistingAutomationsId`**

Em `src/app/(private)/admin/empresas/page.tsx`, localize:

```tsx
  const [exportingId, setExportingId] = useState<string | null>(null);
```

Troque por:

```tsx
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingExistingAutomationsId, setExportingExistingAutomationsId] = useState<
    string | null
  >(null);
```

- [ ] **Step 3: Adicionar o botão na linha de ações**

Em `src/app/(private)/admin/empresas/page.tsx`, localize (o botão de export do deck de oportunidades já existente):

```tsx
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
                          disabled={exportingId === company.id}
                          onClick={() => handleExportDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(company)}>
```

Troque por:

```tsx
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
                          disabled={exportingId === company.id}
                          onClick={() => handleExportDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar automações existentes (.pptx)"
                          disabled={exportingExistingAutomationsId === company.id}
                          onClick={() => handleExportExistingAutomationsDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(company)}>
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `admin/empresas/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/empresas/page.tsx"
git commit -m "feat: add export button for the existing-automations deck"
```

---

### Task 5: Verificação manual (requer banco de dados)

**Files:** nenhum (só teste manual)

Este ambiente de desenvolvimento não tem `DATABASE_URL`/banco local configurado, então esta task não pode ser executada pelo agente — precisa ser feita pelo usuário num ambiente com banco.

- [ ] **Step 1: Gerar o deck numa empresa com automações existentes**

1. Numa empresa com pelo menos um projeto "Melhoria" ou `Concluído` (mesma usada na verificação da tela on-screen), clique no botão novo de exportar (ícone de download, ao lado do de "Automações Existentes").
2. Confirme que baixa um arquivo `automacoes-existentes-<empresa>.pptx` sem erro.

- [ ] **Step 2: Conferir o conteúdo do deck**

1. Abra o `.pptx` baixado (PowerPoint, Google Slides ou LibreOffice Impress).
2. Confirme a ordem dos slides: capa → resumo por área → ranking por economia acumulada → ranking qualitativo → entrevistas (se a empresa tiver alguma) → um slide por automação.
3. Confirme que **nenhum** slide de cronograma/payback aparece.
4. Em pelo menos um slide de automação, confirme que a tabela quantitativa (coluna direita) tem, no final, as duas linhas novas: "Status operacional" e "Economia acumulada (real)", com os valores certos (compare com o que aparece em `/admin/empresas/[id]/automacoes-existentes`).

- [ ] **Step 3: Conferir que o deck de oportunidades não mudou**

1. Exporte o deck de diagnóstico normal (botão já existente) da mesma empresa.
2. Confirme que ele continua exatamente igual a antes (capa, resumo por área com "Economia estimada"/"Horas atuais", 3 rankings, cronograma, payback, composição do payback, entrevistas, slide por processo SEM as duas linhas novas).

- [ ] **Step 4: Reportar resultado**

Se algum passo falhar, anote exatamente o que foi observado (empresa, slide, campo) para investigação.
