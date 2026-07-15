"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addBusinessDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  format,
} from "date-fns";
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
import { computePaybackCurve, findPaybackDate } from "@/shared/lib/payback";
import { WaveTimeline } from "@/src/shared/components/wave-timeline";
import { PaybackChart } from "@/src/shared/components/payback-chart";
import { AreaSummaryChart } from "@/src/shared/components/area-summary-chart";
import { ExistingAutomationsAreaSummaryChart } from "@/src/shared/components/existing-automations-area-summary-chart";

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

/**
 * `computeWaveSchedule` agenda sequencialmente sem folgas (próximo item
 * sempre começa no 1º dia útil após o fim do anterior) — um gap de calendário
 * maior que um fim de semana normal (~3 dias) entre itens consecutivos indica
 * dado inconsistente (ex.: esforço em dias não-inteiro, id fora de ordem).
 */
function findScheduleGaps(
  schedule: { projectId: string; title: string; startDate: Date; endDate: Date }[]
): { fromTitle: string; toTitle: string; gapDays: number }[] {
  const gaps: { fromTitle: string; toTitle: string; gapDays: number }[] = [];
  for (let i = 1; i < schedule.length; i++) {
    const prev = schedule[i - 1];
    const curr = schedule[i];
    const gapDays = differenceInCalendarDays(curr.startDate, prev.endDate);
    if (gapDays > 3) {
      gaps.push({ fromTitle: prev.title, toTitle: curr.title, gapDays });
    }
  }
  return gaps;
}

export default function PriorizacaoPage({ params }: Props) {
  const { id: companyId } = use(params);
  const router = useRouter();
  const [sortBy, setSortBy] = useState<SortBy>("combinado");

  const utils = trpc.useUtils();
  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });

  const { data: areaSummaryGaps } = trpc.project.getAreaSummaryGaps.useQuery({ companyId });

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

  const wave1Gaps = useMemo(() => findScheduleGaps(wave1Schedule), [wave1Schedule]);
  const wave2Gaps = useMemo(() => findScheduleGaps(wave2Schedule), [wave2Schedule]);

  function goToProject(projectId: string) {
    router.push(`/admin/projetos/${projectId}/especificacao`);
  }

  const areaNameByProjectId = useMemo(
    () => new Map(ranking.map((row) => [row.id, row.areaName])),
    [ranking]
  );

  // Payback (Passo 6): reaproveita os dois schedules já calculados acima pelo
  // Passo 5 (nenhuma chamada de rede adicional) e a saving anual de cada
  // robô, já presente no ranking buscado no topo da página.
  const savingByProjectId = useMemo(
    () => new Map(ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])),
    [ranking]
  );

  const paybackSchedule = useMemo(
    () =>
      [...wave1Schedule, ...wave2Schedule].map((item) => ({
        projectId: item.projectId,
        startDate: item.startDate,
        endDate: item.endDate,
        estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
      })),
    [wave1Schedule, wave2Schedule, savingByProjectId]
  );

  const developerDailyRateBRL = settings?.developerDailyRateBRL ?? 0;

  const paybackCurve = useMemo(
    () => computePaybackCurve(paybackSchedule, developerDailyRateBRL),
    [paybackSchedule, developerDailyRateBRL]
  );

  const paybackDate = useMemo(() => findPaybackDate(paybackCurve), [paybackCurve]);

  // Composição do payback: uma linha por robô, com os números que alimentam
  // a curva acima (facilita conferir/auditar de onde vêm custo e economia).
  const paybackComposition = useMemo(() => {
    const withWave = [
      ...wave1Schedule.map((item) => ({ ...item, wave: 1 as const })),
      ...wave2Schedule.map((item) => ({ ...item, wave: 2 as const })),
    ];
    return withWave.map((item) => {
      const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
      const developmentCostBRL = businessDays * developerDailyRateBRL;
      const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
      return {
        projectId: item.projectId,
        title: item.title,
        wave: item.wave,
        startDate: item.startDate,
        endDate: item.endDate,
        businessDays,
        developmentCostBRL,
        monthlySavingBRL: annualSavingBRL / 12,
        annualSavingBRL,
      };
    });
  }, [wave1Schedule, wave2Schedule, savingByProjectId, developerDailyRateBRL]);

  // "Data de início do cronograma": a menor startDate entre os dois schedules
  // combinados (equivale a wave1StartDate quando a onda 1 tem projetos; cai
  // para wave2StartDate se a onda 1 estiver vazia) — usada só para expressar
  // o payback em "N meses a partir do início", nunca como um número fixo.
  const scheduleStartDate = useMemo(() => {
    if (paybackSchedule.length === 0) return wave1StartDate;
    return new Date(Math.min(...paybackSchedule.map((item) => item.startDate.getTime())));
  }, [paybackSchedule, wave1StartDate]);

  const paybackMonths = useMemo(() => {
    if (!paybackDate) return null;
    const days = differenceInCalendarDays(paybackDate, scheduleStartDate);
    return Math.max(0, Math.round(days / 30.44));
  }, [paybackDate, scheduleStartDate]);

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
          <TabsTrigger value="payback">Payback</TabsTrigger>
          <TabsTrigger value="resumo-area">Resumo por Área</TabsTrigger>
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
                          <Link
                            href={`/admin/projetos/${row.id}/especificacao`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.title}
                          </Link>
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
              {wave1Gaps.length > 0 && (
                <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {wave1Gaps.map((gap, i) => (
                    <p key={i}>
                      Salto de {gap.gapDays} dias corridos entre &quot;{gap.fromTitle}&quot; e
                      &quot;{gap.toTitle}&quot; — confira o esforço (dias úteis) desses projetos.
                    </p>
                  ))}
                </div>
              )}
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
              ) : (
                <WaveTimeline
                  items={wave1Schedule.map((item) => ({
                    ...item,
                    areaName: areaNameByProjectId.get(item.projectId) ?? null,
                  }))}
                  emptyMessage="Nenhum projeto marcado na onda 1."
                  onItemClick={goToProject}
                />
              )}
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
              {wave2Gaps.length > 0 && (
                <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {wave2Gaps.map((gap, i) => (
                    <p key={i}>
                      Salto de {gap.gapDays} dias corridos entre &quot;{gap.fromTitle}&quot; e
                      &quot;{gap.toTitle}&quot; — confira o esforço (dias úteis) desses projetos.
                    </p>
                  ))}
                </div>
              )}
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
              ) : (
                <WaveTimeline
                  items={wave2Schedule.map((item) => ({
                    ...item,
                    areaName: areaNameByProjectId.get(item.projectId) ?? null,
                  }))}
                  emptyMessage="Nenhum projeto marcado na onda 2."
                  onItemClick={goToProject}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payback" className="space-y-6 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payback / ROI acumulado</CardTitle>
              <p className="text-sm font-medium">
                {paybackDate
                  ? `Payback estimado em ${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
                  : "Payback não atingido no período calculado"}
              </p>
              {!settings?.developerDailyRateBRL && (
                <p className="text-xs text-muted-foreground">
                  Taxa diária do desenvolvedor ainda não configurada em Configurações — usando R$ 0
                  como referência (o custo acumulado ficará zerado).
                </p>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
              ) : (
                <PaybackChart curve={paybackCurve} paybackDate={paybackDate} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Composição do cálculo</CardTitle>
              <p className="text-xs text-muted-foreground">
                Um robô por linha, com os números que alimentam a curva acima — custo de
                desenvolvimento = dias úteis × taxa diária do desenvolvedor; economia = saving
                estimado anual do projeto.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Onda</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead className="text-right">Dias úteis</TableHead>
                    <TableHead className="text-right">Custo de dev.</TableHead>
                    <TableHead className="text-right">Economia/mês</TableHead>
                    <TableHead className="text-right">Economia/ano</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paybackComposition.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Nenhum robô nas ondas 1/2 ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paybackComposition.map((item) => (
                      <TableRow
                        key={item.projectId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => goToProject(item.projectId)}
                      >
                        <TableCell className="font-medium max-w-[260px] truncate hover:text-primary hover:underline">
                          {item.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">Onda {item.wave}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(item.endDate, "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.businessDays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.developmentCostBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.monthlySavingBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.annualSavingBRL)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumo-area" className="space-y-6 mt-4">
          <AreaSummaryChart companyId={companyId} />
          <ExistingAutomationsAreaSummaryChart companyId={companyId} />
          {areaSummaryGaps &&
            (areaSummaryGaps.pipelineWithoutArea > 0 || areaSummaryGaps.deliveredWithoutArea > 0) && (
              <p className="text-xs text-muted-foreground">
                {areaSummaryGaps.pipelineWithoutArea > 0 &&
                  `${areaSummaryGaps.pipelineWithoutArea} projeto${areaSummaryGaps.pipelineWithoutArea !== 1 ? "s" : ""} em andamento`}
                {areaSummaryGaps.pipelineWithoutArea > 0 && areaSummaryGaps.deliveredWithoutArea > 0 && " e "}
                {areaSummaryGaps.deliveredWithoutArea > 0 &&
                  `${areaSummaryGaps.deliveredWithoutArea} automaç${areaSummaryGaps.deliveredWithoutArea !== 1 ? "ões" : "ão"} entregue${areaSummaryGaps.deliveredWithoutArea !== 1 ? "s" : ""}`}
                {" "}desta empresa não {areaSummaryGaps.pipelineWithoutArea + areaSummaryGaps.deliveredWithoutArea !== 1 ? "têm" : "tem"} área definida e não {areaSummaryGaps.pipelineWithoutArea + areaSummaryGaps.deliveredWithoutArea !== 1 ? "aparecem" : "aparece"} nos resumos acima.
              </p>
            )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
