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

function formatHours(hours: number): string {
  return `${Math.round(hours).toLocaleString("pt-BR")}h`;
}

type AreaSummaryTooltipPayload = {
  payload: {
    areaName: string;
    totalEstimatedSavingBRL: number;
  };
};

function AreaSummaryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: AreaSummaryTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{item.areaName}</p>
      <p className="text-muted-foreground">
        {formatCurrency(item.totalEstimatedSavingBRL)}
      </p>
    </div>
  );
}

export function AreaSummaryChart({ companyId }: { companyId?: string }) {
  const { data, isLoading } = trpc.project.getAreaSummary.useQuery({ companyId });

  const totals = data?.reduce(
    (acc, row) => ({
      projectCount: acc.projectCount + row.projectCount,
      totalEstimatedSavingBRL: acc.totalEstimatedSavingBRL + row.totalEstimatedSavingBRL,
      totalCurrentAnnualHours: acc.totalCurrentAnnualHours + row.totalCurrentAnnualHours,
    }),
    { projectCount: 0, totalEstimatedSavingBRL: 0, totalCurrentAnnualHours: 0 }
  );

  return (
    <Card
      className="bg-card animate-fade-up"
      style={{ animationDelay: "420ms", animationFillMode: "both" }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Resumo por área
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

        {!isLoading && data && data.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="w-full" style={{ height: Math.max(256, data.length * 36 + 40) }}>
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
                    content={<AreaSummaryTooltip />}
                    cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                  />
                  <Bar
                    dataKey="totalEstimatedSavingBRL"
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
                    <TableHead className="text-right">Projetos</TableHead>
                    <TableHead className="text-right">Saving anual</TableHead>
                    <TableHead className="text-right">Horas/ano</TableHead>
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
                        {formatCurrency(row.totalEstimatedSavingBRL)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHours(row.totalCurrentAnnualHours)}
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
                        {formatCurrency(totals.totalEstimatedSavingBRL)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatHours(totals.totalCurrentAnnualHours)}
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
