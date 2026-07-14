# Tela "Automações Existentes" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma tela admin por empresa (`/admin/empresas/[id]/automacoes-existentes`) que mostra ranking e resumo por área das automações já existentes/entregues (`hasCurrentApplication === "sim"` OU `status === "DONE"`), usando economia acumulada real em vez de estimada, reaproveitando o Slide Executivo já existente para o detalhe por automação.

**Architecture:** Duas queries novas em `project.router.ts` espelham `getPrioritizedRanking`/`getAreaSummary` com o filtro invertido e reaproveitando o motor de scoring (`@/shared/lib/scoring`) sem nenhuma mudança nele. No frontend, um componente de gráfico novo (cópia estrutural de `AreaSummaryChart`) e uma página nova (estrutura da aba "Ranking" de Priorização, sem Cronograma/Payback) consomem essas queries; o "Ver detalhes" de cada linha abre o `ProjectExecutiveSlideModal` já existente, sem alteração nele.

**Tech Stack:** Next.js (App Router), tRPC, Prisma, React, recharts, shadcn/ui (`Table`, `Badge`, `Card`, `Button`).

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest) e `npm run lint` não funciona neste ambiente (eslint não instalado). A verificação de cada task é feita via `npx tsc --noEmit`; a verificação funcional final (Task 6) precisa de um banco de dados, que não existe neste ambiente — fica com o usuário.

**Spec:** `docs/superpowers/specs/2026-07-14-tela-automacoes-existentes-design.md`

---

### Task 1: `getExistingAutomationsRanking` (backend)

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:798-799` (insere logo antes do `});` de fechamento do `projectRouter`)

- [ ] **Step 1: Adicionar a query nova**

Em `src/server/trpc/routers/project.router.ts`, localize o final do arquivo:

```ts
      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),
});
```

Troque por (adiciona a nova procedure entre o fechamento de `getPrioritizedRanking` e o `});` do router):

```ts
      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),

  // Ranking de automações já existentes/entregues (hasCurrentApplication="sim"
  // ou status DONE) — o inverso exato do filtro de getPrioritizedRanking.
  // Reaproveita o motor de scoring de @/shared/lib/scoring, alimentado por
  // accumulatedSavingBRL (economia acumulada real) em vez de
  // estimatedAnnualSavingBRL — sem score de complexidade/combinado, que não
  // faz sentido para algo que já foi entregue.
  getExistingAutomationsRanking: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        sortBy: z.enum(["economia", "qualitativo"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const [projects, settings] = await Promise.all([
        ctx.db.project.findMany({
          where: {
            companyId: input.companyId,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
          select: {
            id: true,
            title: true,
            areaId: true,
            area: { select: { name: true } },
            ratingErrorReduction: true,
            ratingProcessCriticality: true,
            ratingInternalImpact: true,
            ratingExternalImpact: true,
            ratingCompliance: true,
            accumulatedSavingBRL: true,
            operationalStatus: true,
          },
        }),
        ctx.db.systemSettings.findUnique({ where: { id: "default" } }),
      ]);

      const qualWeights: QualitativeWeights = settings
        ? {
            qualWeightErrorReduction: settings.qualWeightErrorReduction,
            qualWeightProcessCriticality: settings.qualWeightProcessCriticality,
            qualWeightInternalImpact: settings.qualWeightInternalImpact,
            qualWeightExternalImpact: settings.qualWeightExternalImpact,
            qualWeightCompliance: settings.qualWeightCompliance,
          }
        : DEFAULT_QUALITATIVE_WEIGHTS;

      const maxSavingInSet = projects.reduce(
        (max, p) => Math.max(max, p.accumulatedSavingBRL ?? 0),
        0
      );

      const ranked = projects.map((p) => {
        const qualitativeScorePercent = computeQualitativeScore(p, qualWeights);
        const economiaScore = computeEconomiaScore(p.accumulatedSavingBRL, maxSavingInSet);

        return {
          id: p.id,
          title: p.title,
          areaName: p.area?.name ?? null,
          qualitativeScorePercent,
          accumulatedSavingBRL: p.accumulatedSavingBRL,
          economiaScore,
          operationalStatus: p.operationalStatus,
        };
      });

      const sortKey =
        input.sortBy === "economia" ? ("economiaScore" as const) : ("qualitativeScorePercent" as const);

      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),
});
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts` (erros pré-existentes não relacionados em `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` são esperados).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add getExistingAutomationsRanking query"
```

---

### Task 2: `getExistingAutomationsAreaSummary` (backend)

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts` (logo após `getExistingAutomationsRanking`, adicionado na Task 1)

- [ ] **Step 1: Adicionar a query nova**

Em `src/server/trpc/routers/project.router.ts`, localize o final de `getExistingAutomationsRanking` (adicionado na Task 1):

```ts
      const sortKey =
        input.sortBy === "economia" ? ("economiaScore" as const) : ("qualitativeScorePercent" as const);

      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),
});
```

Troque por:

```ts
      const sortKey =
        input.sortBy === "economia" ? ("economiaScore" as const) : ("qualitativeScorePercent" as const);

      return ranked.sort((a, b) => b[sortKey] - a[sortKey]);
    }),

  // Resumo por área das automações já existentes/entregues — mesmo padrão de
  // getAreaSummary, com o filtro invertido e somando accumulatedSavingBRL
  // (economia acumulada real) em vez de estimatedAnnualSavingBRL/currentAnnualHours.
  getExistingAutomationsAreaSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["areaId"],
        _count: true,
        _sum: { accumulatedSavingBRL: true },
        where: {
          areaId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const areaIds = grouped
        .map((g) => g.areaId)
        .filter((id): id is string => id != null);

      const areas = await ctx.db.projectArea.findMany({
        where: { id: { in: areaIds } },
      });
      const areaById = new Map(areas.map((a) => [a.id, a]));

      return grouped
        .filter((g) => g.areaId != null && areaById.has(g.areaId))
        .map((g) => {
          const area = areaById.get(g.areaId as string)!;
          return {
            areaId: area.id,
            areaName: area.name,
            projectCount: g._count,
            totalAccumulatedSavingBRL: g._sum.accumulatedSavingBRL ?? 0,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
});
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add getExistingAutomationsAreaSummary query"
```

---

### Task 3: `ExistingAutomationsAreaSummaryChart` (frontend)

**Files:**
- Create: `src/shared/components/existing-automations-area-summary-chart.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/shared/trpc/client";
import { Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { formatCurrency, formatCompactBRL } from "@/shared/utils";

type ExistingAutomationsAreaSummaryTooltipPayload = {
  payload: {
    areaName: string;
    totalAccumulatedSavingBRL: number;
  };
};

function ExistingAutomationsAreaSummaryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ExistingAutomationsAreaSummaryTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.areaName}</p>
      <p className="text-muted-foreground">
        {formatCurrency(item.totalAccumulatedSavingBRL)}
      </p>
    </div>
  );
}

export function ExistingAutomationsAreaSummaryChart({ companyId }: { companyId?: string }) {
  const { data, isLoading } = trpc.project.getExistingAutomationsAreaSummary.useQuery({
    companyId,
  });

  return (
    <Card
      className="bg-card animate-fade-up"
      style={{ animationDelay: "420ms", animationFillMode: "both" }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Resumo por área — automações existentes
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        )}

        {!isLoading && (!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma automação existente com área definida ainda.
          </p>
        )}

        {!isLoading && data && data.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    stroke="var(--color-border)"
                    strokeOpacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(value: number) => formatCompactBRL(value)}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="areaName"
                    width={110}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ExistingAutomationsAreaSummaryTooltip />}
                    cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="totalAccumulatedSavingBRL"
                    fill="var(--color-chart-1)"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Automações</TableHead>
                    <TableHead className="text-right">Economia acumulada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.areaId}>
                      <TableCell className="font-medium">{row.areaName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.projectCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totalAccumulatedSavingBRL)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `existing-automations-area-summary-chart.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/existing-automations-area-summary-chart.tsx
git commit -m "feat: add ExistingAutomationsAreaSummaryChart component"
```

---

### Task 4: Nova página `/admin/empresas/[id]/automacoes-existentes`

**Files:**
- Create: `src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx`

- [ ] **Step 1: Criar a página**

```tsx
"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Label as RechartsLabel,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { ArrowLeft, Bot } from "lucide-react";
import { formatCurrency, formatCompactBRL } from "@/shared/utils";
import { ROBOT_OPERATIONAL_STATUS_CONFIG } from "@/shared/types";
import type { Project, RobotOperationalStatus } from "@/shared/types";
import { ExistingAutomationsAreaSummaryChart } from "@/shared/components/existing-automations-area-summary-chart";
import { useModal } from "@/shared/context/modal-context";
import { ProjectExecutiveSlideModal } from "@/src/app/(private)/admin/projetos/_components/project-executive-slide.modal";

interface Props {
  params: Promise<{ id: string }>;
}

type SortBy = "economia" | "qualitativo";

const SORT_TABS: { value: SortBy; label: string }[] = [
  { value: "economia", label: "Economia acumulada" },
  { value: "qualitativo", label: "Qualitativo" },
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type RankingRow = {
  id: string;
  title: string;
  areaName: string | null;
  qualitativeScorePercent: number;
  accumulatedSavingBRL: number | null;
  economiaScore: number;
  operationalStatus: RobotOperationalStatus | null;
};

function activeScoreOf(row: RankingRow, sortBy: SortBy): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  return Math.round(row.qualitativeScorePercent);
}

type ChartTooltipPayload = {
  payload: RankingRow & { activeScore: number };
};

function RankingTooltip({
  active,
  payload,
  sortBy,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  sortBy: SortBy;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl max-w-[220px]">
      <p className="font-medium text-foreground truncate">{row.title}</p>
      <p className="text-muted-foreground">
        Economia acumulada: {formatCurrency(row.accumulatedSavingBRL ?? 0)}
      </p>
      <p className="text-muted-foreground">
        Score ({sortBy}): {row.activeScore}
      </p>
    </div>
  );
}

export default function AutomacoesExistentesPage({ params }: Props) {
  const { id: companyId } = use(params);
  const { openModal } = useModal();
  const [sortBy, setSortBy] = useState<SortBy>("economia");

  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const { data: ranking = [], isLoading } = trpc.project.getExistingAutomationsRanking.useQuery({
    companyId,
    sortBy,
  });

  const chartData = useMemo(
    () =>
      ranking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [ranking, sortBy]
  );

  function handleViewDetails(row: RankingRow) {
    openModal(
      `existing-automation-slide-${row.id}`,
      ProjectExecutiveSlideModal,
      { project: { id: row.id, title: row.title } as unknown as Project },
      { size: "full", position: "center" }
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Automações existentes
          </h1>
          <p className="text-muted-foreground">
            {company?.name ?? "Carregando..."} — automações já entregues/existentes, fora do
            funil de desenvolvimento
          </p>
        </div>
      </div>

      <ExistingAutomationsAreaSummaryChart companyId={companyId} />

      <div className="flex gap-2">
        {SORT_TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={sortBy === tab.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Economia acumulada x score (
            {SORT_TABS.find((t) => t.value === sortBy)?.label.toLowerCase()})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          )}
          {!isLoading && chartData.length === 0 && (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Nenhuma automação existente encontrada para esta empresa.
            </p>
          )}
          {!isLoading && chartData.length > 0 && (
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 24, right: 16, bottom: 48, left: 8 }}
                >
                  <CartesianGrid
                    stroke="var(--color-border)"
                    strokeOpacity={0.4}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="shortTitle"
                    angle={-30}
                    textAnchor="end"
                    height={70}
                    interval={0}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="saving"
                    tickFormatter={(value: number) => formatCompactBRL(value)}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="score"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  >
                    <RechartsLabel
                      value="Score (0-100)"
                      angle={-90}
                      position="insideRight"
                      style={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    />
                  </YAxis>
                  <Tooltip content={<RankingTooltip sortBy={sortBy} />} />
                  <Bar
                    yAxisId="saving"
                    dataKey="accumulatedSavingBRL"
                    fill="var(--color-chart-1)"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                  <Line
                    yAxisId="score"
                    dataKey="activeScore"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">Qualitativo %</TableHead>
                <TableHead>Status operacional</TableHead>
                <TableHead className="text-right">Economia acumulada</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhuma automação existente encontrada para esta empresa.
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((row, index) => {
                  const statusConfig = row.operationalStatus
                    ? ROBOT_OPERATIONAL_STATUS_CONFIG[row.operationalStatus]
                    : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate">
                        {row.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.areaName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(row.qualitativeScorePercent)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig?.color}>
                          {statusConfig?.label ?? "Sem status"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.accumulatedSavingBRL != null
                          ? formatCurrency(row.accumulatedSavingBRL)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(row)}>
                          Ver detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `automacoes-existentes/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx"
git commit -m "feat: add Automações Existentes ranking page"
```

---

### Task 5: Ponto de entrada em `admin/empresas/page.tsx`

**Files:**
- Modify: `src/app/(private)/admin/empresas/page.tsx:27` (import de ícones)
- Modify: `src/app/(private)/admin/empresas/page.tsx:233-239` (linha de ações da tabela)

- [ ] **Step 1: Adicionar o ícone `Bot` aos imports**

Em `src/app/(private)/admin/empresas/page.tsx`, localize:

```tsx
import { Building2, Plus, Search, Pencil, ListOrdered, Users, Download } from "lucide-react";
```

Troque por:

```tsx
import { Bot, Building2, Plus, Search, Pencil, ListOrdered, Users, Download } from "lucide-react";
```

- [ ] **Step 2: Adicionar o botão de link**

Em `src/app/(private)/admin/empresas/page.tsx`, localize:

```tsx
                        <Link href={`/admin/empresas/${company.id}/priorizacao`}>
                          <Button size="icon" variant="ghost" title="Priorização">
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/empresas/${company.id}/entrevistas`}>
```

Troque por:

```tsx
                        <Link href={`/admin/empresas/${company.id}/priorizacao`}>
                          <Button size="icon" variant="ghost" title="Priorização">
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/empresas/${company.id}/automacoes-existentes`}>
                          <Button size="icon" variant="ghost" title="Automações Existentes">
                            <Bot className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/empresas/${company.id}/entrevistas`}>
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `admin/empresas/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/empresas/page.tsx"
git commit -m "feat: add Automações Existentes entry point to empresas list"
```

---

### Task 6: Verificação manual (requer banco de dados)

**Files:** nenhum (só teste manual)

Este ambiente de desenvolvimento não tem `DATABASE_URL`/banco local configurado, então esta task não pode ser executada pelo agente — precisa ser feita pelo usuário num ambiente com banco (local com dados de teste, ou observando o comportamento em produção após o deploy).

- [ ] **Step 1: Confirmar que a tela lista as automações certas**

1. Numa empresa com pelo menos um projeto "Melhoria" (`hasCurrentApplication = "sim"`) e um projeto `Concluído`, clique no ícone novo (robô) na listagem de empresas (`/admin/empresas`).
2. Confirme que ambos aparecem na tabela de `/admin/empresas/[id]/automacoes-existentes` — e que nenhum projeto "Novo"/ativo aparece ali.

- [ ] **Step 2: Confirmar as duas abas de ordenação**

1. Alterne entre "Economia acumulada" e "Qualitativo" e confirme que a ordem da tabela e o gráfico mudam de acordo.
2. Confirme que projetos sem `accumulatedSavingBRL` preenchido aparecem com "-" na coluna de economia e ficam ordenados por último na aba "Economia acumulada".

- [ ] **Step 3: Confirmar o resumo por área**

1. Confirme que o gráfico "Resumo por área — automações existentes" no topo soma corretamente a economia acumulada por área (compare com os valores individuais da tabela abaixo).

- [ ] **Step 4: Confirmar "Ver detalhes"**

1. Clique em "Ver detalhes" de uma linha e confirme que abre o Slide Executivo (mesmo modal já usado em "Detalhes do projeto"), com os dados completos do projeto carregando corretamente.

- [ ] **Step 5: Reportar resultado**

Se algum passo falhar, anote exatamente o que foi observado (empresa, projeto, tela) para investigação.
