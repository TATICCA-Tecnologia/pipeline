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
