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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { formatCurrency, formatCompactBRL } from "@/shared/utils";

type TotalAreaRow = {
  areaId: string;
  areaName: string;
  projectCount: number;
  totalSavingBRL: number;
};

type TotalAreaSummaryTooltipPayload = {
  payload: TotalAreaRow;
};

function TotalAreaSummaryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TotalAreaSummaryTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.areaName}</p>
      <p className="text-muted-foreground">{formatCurrency(item.totalSavingBRL)}</p>
    </div>
  );
}

function TotalAreaCountTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TotalAreaSummaryTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.areaName}</p>
      <p className="text-muted-foreground">
        {item.projectCount} automaç{item.projectCount !== 1 ? "ões" : "ão"}
      </p>
    </div>
  );
}

// Junta getAreaSummary (oportunidades em pipeline) com getExistingAutomationsAreaSummary
// (automações já entregues) por área — os dois conjuntos são mutuamente exclusivos
// (mesmo particionamento usado nos dois cards acima), então somar os dois dá o total real
// de cada área, sem contar nada em dobro.
export function TotalAreaSummaryChart({ companyId }: { companyId?: string }) {
  const { data: opportunities, isLoading: isLoadingOpportunities } =
    trpc.project.getAreaSummary.useQuery({ companyId });
  const { data: existing, isLoading: isLoadingExisting } =
    trpc.project.getExistingAutomationsAreaSummary.useQuery({ companyId });

  const isLoading = isLoadingOpportunities || isLoadingExisting;

  const data: TotalAreaRow[] | undefined =
    opportunities && existing
      ? (() => {
          const byArea = new Map<string, TotalAreaRow>();
          for (const row of opportunities) {
            byArea.set(row.areaId, {
              areaId: row.areaId,
              areaName: row.areaName,
              projectCount: row.projectCount,
              totalSavingBRL: row.totalEstimatedSavingBRL,
            });
          }
          for (const row of existing) {
            const current = byArea.get(row.areaId);
            if (current) {
              current.projectCount += row.projectCount;
              current.totalSavingBRL += row.totalAccumulatedSavingBRL;
            } else {
              byArea.set(row.areaId, {
                areaId: row.areaId,
                areaName: row.areaName,
                projectCount: row.projectCount,
                totalSavingBRL: row.totalAccumulatedSavingBRL,
              });
            }
          }
          return Array.from(byArea.values());
        })()
      : undefined;

  const dataBySaving = data ? [...data].sort((a, b) => b.totalSavingBRL - a.totalSavingBRL) : undefined;
  const dataByCount = data ? [...data].sort((a, b) => b.projectCount - a.projectCount) : undefined;

  const totals = data?.reduce(
    (acc, row) => ({
      projectCount: acc.projectCount + row.projectCount,
      totalSavingBRL: acc.totalSavingBRL + row.totalSavingBRL,
    }),
    { projectCount: 0, totalSavingBRL: 0 }
  );

  return (
    <Card
      className="bg-card animate-fade-up"
      style={{ animationDelay: "480ms", animationFillMode: "both" }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Resumo por área — total (oportunidades + existentes)
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando...</p>
        )}

        {!isLoading && (!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum projeto com área definida ainda.
          </p>
        )}

        {!isLoading && dataBySaving && dataByCount && dataBySaving.length > 0 && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Saving total
                </p>
                <div
                  className="w-full"
                  style={{ height: Math.max(256, dataBySaving.length * 36 + 40) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dataBySaving}
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
                        content={<TotalAreaSummaryTooltip />}
                        cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                      />
                      <Bar
                        dataKey="totalSavingBRL"
                        fill="var(--color-chart-1)"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Quantidade de automações
                </p>
                <div
                  className="w-full"
                  style={{ height: Math.max(256, dataByCount.length * 36 + 40) }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dataByCount}
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
                        allowDecimals={false}
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
                        content={<TotalAreaCountTooltip />}
                        cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                      />
                      <Bar
                        dataKey="projectCount"
                        fill="var(--color-chart-2)"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Projetos</TableHead>
                    <TableHead className="text-right">Saving total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataBySaving.map((row) => (
                    <TableRow key={row.areaId}>
                      <TableCell className="font-medium">{row.areaName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.projectCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.totalSavingBRL)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {totals && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {totals.projectCount}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(totals.totalSavingBRL)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
