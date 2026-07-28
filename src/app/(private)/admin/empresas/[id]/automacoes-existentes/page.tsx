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
import { useDemoMode } from "@/shared/context/demo-mode-context";
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
import {
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";

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
  currentApplicationHosting: string | null;
  currentApplicationHostingCustom: string | null;
  currentApplicationOwner: string | null;
};

// "Outro" guarda o texto real no campo custom; qualquer outro slug vira o
// rótulo da taxonomia (resolveLabel devolve o próprio slug se não reconhecer).
// Recebe a linha já mascarada por displayRanking — o texto de "outro" é livre e
// precisa passar por maskFreeText no modo demo, igual ao título e ao responsável.
function hostingLabelOf(row: RankingRow): string {
  if (row.currentApplicationHosting === "outro") {
    return row.currentApplicationHostingCustom?.trim() || "Outro";
  }
  return resolveLabel(row.currentApplicationHosting, CURRENT_APPLICATION_HOSTING_OPTIONS) ?? "-";
}

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

  const { maskFreeText, maskCompanyName } = useDemoMode();
  const { data: ranking = [], isLoading } = trpc.project.getExistingAutomationsRanking.useQuery({
    companyId,
    sortBy,
  });
  const displayRanking = useMemo(
    () =>
      ranking.map((row) => ({
        ...row,
        title: maskFreeText(row.title) ?? row.title,
        currentApplicationHostingCustom: maskFreeText(row.currentApplicationHostingCustom) ?? null,
      })),
    [ranking, maskFreeText]
  );

  const chartData = useMemo(
    () =>
      displayRanking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [displayRanking, sortBy]
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
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."} — automações já
            entregues/existentes, fora do funil de desenvolvimento
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
                <TableHead>Onde roda</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Qualitativo %</TableHead>
                <TableHead>Status operacional</TableHead>
                <TableHead className="text-right">Economia acumulada</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : displayRanking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    Nenhuma automação existente encontrada para esta empresa.
                  </TableCell>
                </TableRow>
              ) : (
                displayRanking.map((row, index) => {
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
                      <TableCell className="text-muted-foreground max-w-[180px] truncate">
                        {hostingLabelOf(row)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[160px] truncate">
                        {maskFreeText(row.currentApplicationOwner) ?? "-"}
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
