# Resumo Executivo (One Pager) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Resumo Executivo" tab to the company Priorização page showing opportunity/existing-automation counts and area/tool breakdowns, with no financial or timeline data.

**Architecture:** Two new tRPC query procedures mirror the existing `getAreaSummary`/`getExistingAutomationsAreaSummary` pattern but group by `mainToolId` instead of `areaId`; the existing `getAreaSummaryGaps` procedure gains two more counters. A new self-contained React component (`ExecutiveOnePager`) fetches all five queries, merges pipeline+existing counts client-side into stacked-bar rows (top 8 + "Outras"), and renders two stat cards plus two horizontal stacked bar charts. Wired in as the new first tab of the existing `Tabs` in the Priorização page.

**Tech Stack:** Next.js (App Router), tRPC v11, Prisma, Recharts, shadcn/ui `Card`/`Tabs`, Tailwind.

**Note on testing:** this repository has no automated test runner configured (no `jest`/`vitest`, no `test` script in `package.json`). Verification steps in this plan use `tsc --noEmit` for type safety and manual QA in the running dev server, consistent with how the rest of the codebase is verified.

---

## File Structure

- **Modify:** `src/server/trpc/routers/project.router.ts`
  - Add `getToolSummary` (pipeline count by tool)
  - Add `getExistingAutomationsToolSummary` (existing count by tool)
  - Extend `getAreaSummaryGaps` with `pipelineWithoutTool`/`deliveredWithoutTool`
- **Create:** `src/shared/components/executive-one-pager.tsx`
  - `mergeAndGroup()` — merges pipeline+existing rows by id, sorts desc by total, collapses past the top 8 into "Outras"
  - `BreakdownChart` — renders one stacked horizontal bar chart (reused for área and ferramenta)
  - `ExecutiveOnePager` — fetches the 5 queries, computes totals, renders stat cards + the two `BreakdownChart`s + gaps footer
- **Modify:** `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`
  - Import `ExecutiveOnePager`
  - Add `resumo-executivo` as the new first `TabsTrigger`, make it the `Tabs` `defaultValue`
  - Add its `TabsContent`

---

### Task 1: Add `getToolSummary` procedure

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:847`

- [ ] **Step 1: Insert the new procedure right after `getAreaSummary`**

In `src/server/trpc/routers/project.router.ts`, find this exact block (the end of `getAreaSummary`, right before the `getPrioritizedRanking` comment):

```typescript
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Ranking priorizado dos projetos de uma empresa, reordenável por economia,
```

Replace it with:

```typescript
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Agregação de projetos por ferramenta principal (contagem), mesmo padrão de
  // getAreaSummary mas agrupado por mainToolId — usado pela aba "Resumo
  // Executivo" da Priorização. adminProcedure pelo mesmo motivo de segurança
  // (contagem por ferramenta é dado interno do diagnóstico).
  getToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolId"],
        _count: true,
        where: {
          mainToolId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Ranking priorizado dos projetos de uma empresa, reordenável por economia,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors mentioning `project.router.ts` (the repo has some pre-existing unrelated errors in `src/shared/components/ui/*` — ignore those, they predate this change).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add getToolSummary procedure for pipeline tool breakdown"
```

---

### Task 2: Add `getExistingAutomationsToolSummary` procedure

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts` (right after `getExistingAutomationsAreaSummary`, added by Task 1's edit above it)

- [ ] **Step 1: Insert the new procedure right after `getExistingAutomationsAreaSummary`**

Find this exact block (the end of `getExistingAutomationsAreaSummary`, right before the `getAreaSummaryGaps` comment):

```typescript
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Contagem de projetos de uma empresa sem área definida (areaId null),
```

There are now two occurrences of the `.sort((a, b) => b.projectCount - a.projectCount);\n    }),\n\n` pattern in the file (one from Task 1). Use the surrounding comment text to disambiguate — this is the one immediately followed by `// Contagem de projetos de uma empresa sem área definida`.

Replace it with:

```typescript
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Resumo por ferramenta das automações já existentes/entregues — mesmo
  // padrão de getToolSummary, com o filtro invertido (igual
  // getExistingAutomationsAreaSummary faz para área).
  getExistingAutomationsToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolId"],
        _count: true,
        where: {
          mainToolId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),

  // Contagem de projetos de uma empresa sem área definida (areaId null),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors mentioning `project.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add getExistingAutomationsToolSummary procedure"
```

---

### Task 3: Extend `getAreaSummaryGaps` with tool gaps

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts` (the `getAreaSummaryGaps` procedure)

- [ ] **Step 1: Replace the procedure body**

Find this exact block:

```typescript
  // Contagem de projetos de uma empresa sem área definida (areaId null),
  // separados em pipeline/entregues — usado pela aba "Resumo por Área" da
  // Priorização pra avisar que esses projetos ficam fora dos dois resumos
  // acima (que filtram areaId: { not: null }). Mesmos filtros exatos de
  // getPrioritizedRanking/getExistingAutomationsRanking, só invertendo a
  // condição de areaId.
  getAreaSummaryGaps: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pipelineWithoutArea, deliveredWithoutArea] = await Promise.all([
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
        }),
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            areaId: null,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
        }),
      ]);
      return { pipelineWithoutArea, deliveredWithoutArea };
    }),
```

Replace it with:

```typescript
  // Contagem de projetos de uma empresa sem área/ferramenta definida,
  // separados em pipeline/entregues — usado pela aba "Resumo por Área" (só os
  // dois campos de área) e pela aba "Resumo Executivo" (os quatro campos) da
  // Priorização, pra avisar que esses projetos ficam fora dos resumos
  // correspondentes (que filtram areaId/mainToolId: { not: null }). Mesmos
  // filtros exatos de getPrioritizedRanking/getExistingAutomationsRanking, só
  // invertendo a condição de areaId/mainToolId.
  getAreaSummaryGaps: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool] =
        await Promise.all([
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              areaId: null,
              hasCurrentApplication: { not: "sim" },
              status: { notIn: ["DONE", "CANCELLED"] },
            },
          }),
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              areaId: null,
              OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
            },
          }),
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolId: null,
              hasCurrentApplication: { not: "sim" },
              status: { notIn: ["DONE", "CANCELLED"] },
            },
          }),
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolId: null,
              OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
            },
          }),
        ]);
      return { pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool };
    }),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors. In particular check that `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx` still compiles — it destructures `areaSummaryGaps.pipelineWithoutArea`/`deliveredWithoutArea` today (lines ~806-816), which remain valid since the change is additive.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: extend getAreaSummaryGaps with tool gap counters"
```

---

### Task 4: Create the `ExecutiveOnePager` component

**Files:**
- Create: `src/shared/components/executive-one-pager.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/shared/trpc/client";
import { LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";

const MAX_ROWS = 8;
const OTHERS_LABEL = "Outras";

type NamedCount = { id: string; name: string; projectCount: number };

type MergedRow = {
  id: string;
  name: string;
  pipelineCount: number;
  existingCount: number;
};

// Junta contagem de pipeline com contagem de existentes por categoria (área ou
// ferramenta), ordena do maior pro menor pelo total das duas, e colapsa tudo
// além das MAX_ROWS maiores numa linha "Outras" fixa no fim — mantém o
// gráfico compacto mesmo com taxonomia bem fragmentada.
function mergeAndGroup(pipeline: NamedCount[], existing: NamedCount[]): MergedRow[] {
  const byId = new Map<string, MergedRow>();
  for (const row of pipeline) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      pipelineCount: row.projectCount,
      existingCount: 0,
    });
  }
  for (const row of existing) {
    const current = byId.get(row.id);
    if (current) {
      current.existingCount += row.projectCount;
    } else {
      byId.set(row.id, {
        id: row.id,
        name: row.name,
        pipelineCount: 0,
        existingCount: row.projectCount,
      });
    }
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => b.pipelineCount + b.existingCount - (a.pipelineCount + a.existingCount)
  );

  if (sorted.length <= MAX_ROWS) return sorted;

  const top = sorted.slice(0, MAX_ROWS);
  const rest = sorted.slice(MAX_ROWS);
  const others = rest.reduce<MergedRow>(
    (acc, row) => ({
      ...acc,
      pipelineCount: acc.pipelineCount + row.pipelineCount,
      existingCount: acc.existingCount + row.existingCount,
    }),
    { id: "others", name: OTHERS_LABEL, pipelineCount: 0, existingCount: 0 }
  );

  return [...top, others];
}

type BreakdownTooltipPayload = { payload: MergedRow };

function BreakdownTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: BreakdownTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.name}</p>
      <p className="text-muted-foreground">Pipeline: {item.pipelineCount}</p>
      <p className="text-muted-foreground">Existentes: {item.existingCount}</p>
    </div>
  );
}

function countLabel(value: number): string {
  return value > 0 ? String(value) : "";
}

function BreakdownChart({ title, rows }: { title: string; rows: MergedRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground py-6 text-center">Sem dados ainda.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="w-full" style={{ height: Math.max(200, rows.length * 34 + 24) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeOpacity={0.5} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<BreakdownTooltip />} cursor={{ fill: "var(--color-muted)", opacity: 0.4 }} />
            <Bar dataKey="pipelineCount" stackId="a" fill="var(--color-chart-1)" barSize={18}>
              <LabelList
                dataKey="pipelineCount"
                position="center"
                formatter={countLabel}
                style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }}
              />
            </Bar>
            <Bar
              dataKey="existingCount"
              stackId="a"
              fill="var(--color-chart-2)"
              radius={[0, 4, 4, 0]}
              barSize={18}
            >
              <LabelList
                dataKey="existingCount"
                position="center"
                formatter={countLabel}
                style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ExecutiveOnePager({ companyId }: { companyId: string }) {
  const { data: areaOpportunities, isLoading: isLoadingAreaOpportunities } =
    trpc.project.getAreaSummary.useQuery({ companyId });
  const { data: areaExisting, isLoading: isLoadingAreaExisting } =
    trpc.project.getExistingAutomationsAreaSummary.useQuery({ companyId });
  const { data: toolOpportunities, isLoading: isLoadingToolOpportunities } =
    trpc.project.getToolSummary.useQuery({ companyId });
  const { data: toolExisting, isLoading: isLoadingToolExisting } =
    trpc.project.getExistingAutomationsToolSummary.useQuery({ companyId });
  const { data: gaps, isLoading: isLoadingGaps } = trpc.project.getAreaSummaryGaps.useQuery({
    companyId,
  });

  const isLoading =
    isLoadingAreaOpportunities ||
    isLoadingAreaExisting ||
    isLoadingToolOpportunities ||
    isLoadingToolExisting ||
    isLoadingGaps;

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardContent className="py-10">
          <p className="text-sm text-muted-foreground text-center">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  const totalOpportunities =
    (areaOpportunities ?? []).reduce((sum, row) => sum + row.projectCount, 0) +
    (gaps?.pipelineWithoutArea ?? 0);
  const totalExisting =
    (areaExisting ?? []).reduce((sum, row) => sum + row.projectCount, 0) +
    (gaps?.deliveredWithoutArea ?? 0);

  const areaRows = mergeAndGroup(
    (areaOpportunities ?? []).map((row) => ({
      id: row.areaId,
      name: row.areaName,
      projectCount: row.projectCount,
    })),
    (areaExisting ?? []).map((row) => ({
      id: row.areaId,
      name: row.areaName,
      projectCount: row.projectCount,
    }))
  );

  const toolRows = mergeAndGroup(
    (toolOpportunities ?? []).map((row) => ({
      id: row.toolId,
      name: row.toolName,
      projectCount: row.projectCount,
    })),
    (toolExisting ?? []).map((row) => ({
      id: row.toolId,
      name: row.toolName,
      projectCount: row.projectCount,
    }))
  );

  const gapMessages: string[] = [];
  if (gaps && (gaps.pipelineWithoutArea > 0 || gaps.deliveredWithoutArea > 0)) {
    gapMessages.push(
      `${gaps.pipelineWithoutArea} projeto${gaps.pipelineWithoutArea !== 1 ? "s" : ""} em andamento e ${gaps.deliveredWithoutArea} automaç${gaps.deliveredWithoutArea !== 1 ? "ões" : "ão"} entregue${gaps.deliveredWithoutArea !== 1 ? "s" : ""} não têm área definida`
    );
  }
  if (gaps && (gaps.pipelineWithoutTool > 0 || gaps.deliveredWithoutTool > 0)) {
    gapMessages.push(
      `${gaps.pipelineWithoutTool} projeto${gaps.pipelineWithoutTool !== 1 ? "s" : ""} em andamento e ${gaps.deliveredWithoutTool} automaç${gaps.deliveredWithoutTool !== 1 ? "ões" : "ão"} entregue${gaps.deliveredWithoutTool !== 1 ? "s" : ""} não têm ferramenta definida`
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-card">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold tabular-nums">{totalOpportunities}</p>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
              Oportunidades
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold tabular-nums">{totalExisting}</p>
            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">
              Automações existentes
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Panorama por área e ferramenta
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownChart title="Resumo por área" rows={areaRows} />
            <BreakdownChart title="Resumo por ferramenta" rows={toolRows} />
          </div>

          {gapMessages.length > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              {gapMessages.join("; ")} — não aparecem nos resumos acima.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `executive-one-pager.tsx` (the file won't be imported anywhere yet, so this only checks it's internally type-correct).

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/executive-one-pager.tsx
git commit -m "feat: add ExecutiveOnePager component"
```

---

### Task 5: Wire the new tab into the Priorização page

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`

- [ ] **Step 1: Add the import**

Find:

```tsx
import { TotalAreaSummaryChart } from "@/src/shared/components/total-area-summary-chart";
```

Replace with:

```tsx
import { TotalAreaSummaryChart } from "@/src/shared/components/total-area-summary-chart";
import { ExecutiveOnePager } from "@/src/shared/components/executive-one-pager";
```

- [ ] **Step 2: Make the new tab first and the default**

Find:

```tsx
      <Tabs defaultValue="ranking" className="w-full">
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="payback">Payback</TabsTrigger>
          <TabsTrigger value="resumo-area">Resumo por Área</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="space-y-6 mt-4">
```

Replace with:

```tsx
      <Tabs defaultValue="resumo-executivo" className="w-full">
        <TabsList>
          <TabsTrigger value="resumo-executivo">Resumo Executivo</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
          <TabsTrigger value="payback">Payback</TabsTrigger>
          <TabsTrigger value="resumo-area">Resumo por Área</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo-executivo" className="space-y-6 mt-4">
          <ExecutiveOnePager companyId={companyId} />
        </TabsContent>

        <TabsContent value="ranking" className="space-y-6 mt-4">
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors mentioning `priorizacao/page.tsx` or `executive-one-pager.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx"
git commit -m "feat: wire ExecutiveOnePager into a new Resumo Executivo tab"
```

---

### Task 6: Manual QA in the browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: server starts on `http://localhost:3000` with no compile errors.

- [ ] **Step 2: Open a company's Priorização page**

Navigate to `/admin/empresas` (log in as an admin user first if needed), click into any company with existing projects, then open its "Priorização" tab from the row actions (`ListOrdered` icon) — this lands on `/admin/empresas/[id]/priorizacao`.

- [ ] **Step 3: Verify the new tab**

Check:
- "Resumo Executivo" is the first tab and is selected by default.
- Two stat cards show non-negative integer counts for "Oportunidades" and "Automações existentes".
- "Resumo por área" and "Resumo por ferramenta" charts render as horizontal stacked bars, each row sorted largest-to-smallest by total (pipeline + existing), with the pipeline/existing counts as centered numbers inside their segment (segments with 0 show no label).
- Hovering a bar shows a tooltip with the category name, "Pipeline: N", "Existentes: N".
- If the company has projects without area or without tool, the gap message appears below the charts.
- If a company has more than 8 areas or more than 8 tools with projects, confirm an "Outras" row appears last in that chart (may require picking/seeding a company with enough taxonomy variety — note as best-effort if no such company exists in the current dataset).

- [ ] **Step 4: Verify the existing "Resumo por Área" tab still works**

Click into "Resumo por Área" and confirm its gaps footer text (area-only) still renders correctly — this confirms the additive change to `getAreaSummaryGaps` didn't break the existing consumer.

---

## Self-Review Notes

- **Spec coverage:** stat cards (✅ Task 4), área/ferramenta breakdowns with stacked pipeline/existing bars and centered labels (✅ Task 4, matches approved mockup), sort desc by total (✅ `mergeAndGroup`), top 8 + "Outras" always last (✅ `mergeAndGroup`), gaps footer covering area + tool (✅ Task 3 + Task 4), first tab placement (✅ Task 5), no financial/timeline data anywhere (✅ — only counts are fetched/rendered).
- **Type consistency:** `MergedRow`/`NamedCount` shapes are defined once in Task 4 and used consistently; `getAreaSummaryGaps`'s new field names (`pipelineWithoutTool`/`deliveredWithoutTool`, Task 3) match exactly what `ExecutiveOnePager` reads in Task 4.
- **No placeholders:** every step has full code, no TODOs.
