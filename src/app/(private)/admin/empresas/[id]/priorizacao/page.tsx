"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { addBusinessDays } from "date-fns";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Label as RechartsLabel,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/shared/components/ui/tabs";
import { ArrowLeft, ListOrdered } from "lucide-react";
import { formatCurrency, formatCompactBRL } from "@/shared/utils";
import { COMPLEXITY_LEVELS } from "@/shared/constants/project-taxonomy";
import { computeWaveSchedule } from "@/shared/lib/wave-schedule";
import { WaveTimeline } from "@/src/shared/components/wave-timeline";

interface Props {
  params: Promise<{ id: string }>;
}

type SortBy = "economia" | "qualitativo" | "combinado";

const SORT_TABS: { value: SortBy; label: string }[] = [
  { value: "economia", label: "Economia" },
  { value: "qualitativo", label: "Qualitativo" },
  { value: "combinado", label: "Combinado" },
];

const COMPLEXITY_LABEL: Record<string, string> = Object.fromEntries(
  COMPLEXITY_LEVELS.map((c) => [c.value, c.label])
);

const WAVE_NONE = "__none__";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type RankingRow = {
  id: string;
  title: string;
  areaName: string | null;
  qualitativeScorePercent: number;
  complexity: string | null;
  estimatedAnnualSavingBRL: number | null;
  economiaScore: number;
  combinedScore: number;
  implementationWave: number | null;
  waveOrder: number | null;
  implementationEffortDays: number | null;
};

function activeScoreOf(row: RankingRow, sortBy: SortBy): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  if (sortBy === "qualitativo") return Math.round(row.qualitativeScorePercent);
  return Math.round(row.combinedScore);
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
        Saving: {formatCurrency(row.estimatedAnnualSavingBRL ?? 0)}
      </p>
      <p className="text-muted-foreground">
        Score ({sortBy}): {row.activeScore}
      </p>
      <p className="text-muted-foreground">
        Complexidade: {row.complexity ? COMPLEXITY_LABEL[row.complexity] ?? row.complexity : "-"}
      </p>
    </div>
  );
}

export default function PriorizacaoPage({ params }: Props) {
  const { id: companyId } = use(params);
  const [sortBy, setSortBy] = useState<SortBy>("combinado");

  const utils = trpc.useUtils();
  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });

  // Cronograma reaproveita os dados já buscados pelo ranking acima (que já
  // traz implementationWave/waveOrder/implementationEffortDays) — nenhuma
  // chamada de rede adicional é feita para a aba "Cronograma".
  const { data: settings } = trpc.settings.getSettings.useQuery();

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.getPrioritizedRanking.invalidate({ companyId, sortBy });
      toast.success("Onda de implementação atualizada.");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar onda", { description: error.message });
    },
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

  // Data de início da onda 1: vem de SystemSettings.wave1StartDate (Passo 1/3).
  // Se ainda não configurada, usa hoje como referência (a timeline continua
  // funcional, só sem uma data "oficial" definida pelo admin ainda).
  const wave1StartDate = useMemo(
    () => (settings?.wave1StartDate ? new Date(settings.wave1StartDate) : new Date()),
    [settings?.wave1StartDate]
  );

  const wave1Projects = useMemo(
    () => ranking.filter((row) => row.implementationWave === 1),
    [ranking]
  );
  const wave2Projects = useMemo(
    () => ranking.filter((row) => row.implementationWave === 2),
    [ranking]
  );

  const wave1Schedule = useMemo(
    () =>
      computeWaveSchedule(
        wave1Projects.map((row) => ({
          id: row.id,
          title: row.title,
          implementationEffortDays: row.implementationEffortDays,
          waveOrder: row.waveOrder,
        })),
        wave1StartDate
      ),
    [wave1Projects, wave1StartDate]
  );

  // Decisão de simplicidade (Passo 5): só a onda 1 usa wave1StartDate como
  // início; a onda 2 começa no primeiro dia útil após o fim da onda 1 (ou em
  // wave1StartDate também, se a onda 1 estiver vazia). Cada onda reinicia a
  // contagem de dias úteis a partir do seu próprio início — não são cronogramas
  // paralelos, são sequenciais (onda 2 só começa depois que a onda 1 termina).
  const wave2StartDate = useMemo(() => {
    if (wave1Schedule.length === 0) return wave1StartDate;
    const wave1EndDate = wave1Schedule.reduce(
      (latest, item) => (item.endDate > latest ? item.endDate : latest),
      wave1Schedule[0].endDate
    );
    return addBusinessDays(wave1EndDate, 1);
  }, [wave1Schedule, wave1StartDate]);

  const wave2Schedule = useMemo(
    () =>
      computeWaveSchedule(
        wave2Projects.map((row) => ({
          id: row.id,
          title: row.title,
          implementationEffortDays: row.implementationEffortDays,
          waveOrder: row.waveOrder,
        })),
        wave2StartDate
      ),
    [wave2Projects, wave2StartDate]
  );

  const areaNameByProjectId = useMemo(
    () => new Map(ranking.map((row) => [row.id, row.areaName])),
    [ranking]
  );

  function handleWaveChange(row: RankingRow, value: string) {
    if (value === WAVE_NONE) {
      updateMutation.mutate({ id: row.id, implementationWave: null, waveOrder: null });
      return;
    }
    const wave = Number(value);
    // Ao atribuir uma onda, assume automaticamente a próxima ordem livre
    // dentro daquela onda (maior waveOrder atual + 1), a menos que o projeto
    // já tenha uma ordem definida nessa mesma onda.
    const alreadyInWave = row.implementationWave === wave && row.waveOrder != null;
    const nextOrder = alreadyInWave
      ? row.waveOrder!
      : Math.max(
          0,
          ...ranking
            .filter((r) => r.implementationWave === wave && r.waveOrder != null)
            .map((r) => r.waveOrder as number)
        ) + 1;
    updateMutation.mutate({ id: row.id, implementationWave: wave, waveOrder: nextOrder });
  }

  function handleWaveOrderChange(row: RankingRow, value: string) {
    if (row.implementationWave == null) return;
    const parsed = parseInt(value, 10);
    updateMutation.mutate({
      id: row.id,
      implementationWave: row.implementationWave,
      waveOrder: Number.isNaN(parsed) ? null : parsed,
    });
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
            <ListOrdered className="h-6 w-6" />
            Priorização de processos
          </h1>
          <p className="text-muted-foreground">
            {company?.name ?? "Carregando..."} — ranking reordenável por critério
          </p>
        </div>
      </div>

      <Tabs defaultValue="ranking" className="w-full">
        <TabsList>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking" className="space-y-6 mt-4">
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
                Saving x score ({SORT_TABS.find((t) => t.value === sortBy)?.label.toLowerCase()})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading && (
                <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
              )}
              {!isLoading && chartData.length === 0 && (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  Nenhum projeto encontrado para esta empresa.
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
                        dataKey="estimatedAnnualSavingBRL"
                        fill="var(--color-chart-1)"
                        radius={[4, 4, 0, 0]}
                        barSize={28}
                      >
                        <LabelList
                          dataKey="complexity"
                          position="top"
                          formatter={(value: string | null) =>
                            value ? COMPLEXITY_LABEL[value] ?? value : ""
                          }
                          style={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                      </Bar>
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
                    <TableHead>Complexidade</TableHead>
                    <TableHead className="text-right">Economia</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Onda</TableHead>
                    <TableHead className="w-20">Ordem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        Carregando ranking...
                      </TableCell>
                    </TableRow>
                  ) : ranking.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        Nenhum projeto encontrado para esta empresa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ranking.map((row, index) => (
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
                          {row.complexity ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {COMPLEXITY_LABEL[row.complexity] ?? row.complexity}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.estimatedAnnualSavingBRL != null
                            ? formatCurrency(row.estimatedAnnualSavingBRL)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {activeScoreOf(row, sortBy)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={
                              row.implementationWave != null
                                ? String(row.implementationWave)
                                : WAVE_NONE
                            }
                            onValueChange={(value) => handleWaveChange(row, value)}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue placeholder="Onda" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={WAVE_NONE}>Nenhuma</SelectItem>
                              <SelectItem value="1">Onda 1</SelectItem>
                              <SelectItem value="2">Onda 2</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-16"
                            disabled={row.implementationWave == null}
                            value={row.waveOrder ?? ""}
                            onChange={(e) => handleWaveOrderChange(row, e.target.value)}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cronograma" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Onda 1</CardTitle>
              <p className="text-xs text-muted-foreground">
                Início: {wave1StartDate.toLocaleDateString("pt-BR")}
                {!settings?.wave1StartDate &&
                  " (data de início da onda 1 ainda não configurada em Configurações — usando hoje como referência)"}
              </p>
            </CardHeader>
            <CardContent>
              <WaveTimeline
                items={wave1Schedule.map((item) => ({
                  ...item,
                  areaName: areaNameByProjectId.get(item.projectId) ?? null,
                }))}
                emptyMessage="Nenhum projeto marcado na onda 1."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Onda 2</CardTitle>
              <p className="text-xs text-muted-foreground">
                Início: {wave2StartDate.toLocaleDateString("pt-BR")} (primeiro dia útil após o fim
                da onda 1)
              </p>
            </CardHeader>
            <CardContent>
              <WaveTimeline
                items={wave2Schedule.map((item) => ({
                  ...item,
                  areaName: areaNameByProjectId.get(item.projectId) ?? null,
                }))}
                emptyMessage="Nenhum projeto marcado na onda 2."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
