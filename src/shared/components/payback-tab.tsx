"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { differenceInBusinessDays, differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { formatCurrency } from "@/shared/utils";
import {
  computePaybackCurve,
  computeStructureCostAt,
  findPaybackDate,
  resolveDeveloperDailyRate,
  type StructureCostItem,
} from "@/shared/lib/payback";
import type { WaveScheduleItem } from "@/shared/lib/wave-schedule";
import { PaybackChart } from "@/src/shared/components/payback-chart";
import { CompanyCostItemsCard } from "@/src/shared/components/company-cost-items-card";
import { ToggleGroup, ToggleGroupItem } from "@/src/shared/components/ui/toggle-group";

/**
 * Aba "Payback" da tela de priorização — Passo 6 do blueprint de diagnóstico,
 * agora editável: taxa diária da empresa, dias úteis e economia anual de cada
 * robô, e os itens de custo de estrutura são ajustados aqui mesmo, gravando
 * direto no banco.
 *
 * A página dona (priorizacao/page.tsx) continua responsável pelos cronogramas
 * das ondas, porque a aba "Cronograma" usa os mesmos — recalculá-los aqui
 * duplicaria a lógica do Passo 5. Tudo que é exclusivo do payback (curva,
 * composição, custos de estrutura) vive neste componente.
 *
 * Escopo: ver `PaybackScope` abaixo. A conta não é necessariamente de todos os
 * robôs da empresa, e a tela precisa dizer isso — era exatamente essa omissão
 * que fazia o número parecer errado.
 */

/**
 * Quais robôs entram na conta do payback.
 *
 * `ondas` (padrão) = só os classificados nas ondas 1 e 2 — o plano de
 * implementação acordado. `pipeline` = também os robôs do pipeline ainda sem
 * onda definida, agendados em sequência depois da onda 2.
 *
 * O escopo existe porque a conta antiga era silenciosamente a de `ondas`: um
 * robô sem onda não somava custo nem economia e nada na tela dizia isso, o que
 * fazia o KPI "Economia anual" ser lido como economia da empresa inteira.
 *
 * O deck (.pptx, src/server/deck/build-diagnostic-deck.ts) exporta sempre o
 * escopo `ondas` — é um material de plano de implementação, não do pipeline
 * inteiro. O toggle avisa isso ao usuário para o .pptx não parecer divergente.
 */
type PaybackScope = "ondas" | "pipeline";

interface PaybackTabProps {
  companyId: string;
  isLoading: boolean;
  wave1Schedule: WaveScheduleItem[];
  wave2Schedule: WaveScheduleItem[];
  /**
   * Robôs do pipeline fora das ondas 1/2, já sequenciados após a onda 2 pela
   * página dona. Só entram na conta no escopo `pipeline`.
   */
  unassignedSchedule: WaveScheduleItem[];
  /** Economia anual por projeto, vinda do ranking já carregado pela página. */
  savingByProjectId: Map<string, number>;
  /** Esforço em dias úteis por projeto (null = ainda não estimado). */
  effortDaysByProjectId: Map<string, number | null>;
  /** Valor cru gravado na empresa — `null` significa "herda o global". */
  companyDailyRateBRL: number | null;
  /** Valor global de SystemSettings, usado como fallback e como placeholder. */
  globalDailyRateBRL: number | null;
  /** Usada como início de referência quando não há nenhum robô agendado. */
  wave1StartDate: Date;
}

/**
 * Input numérico que só grava no blur (ou no Enter) e reverte para o valor
 * atual quando o texto digitado é inválido. O rascunho local existe para o
 * usuário poder apagar e redigitar sem que cada tecla dispare uma mutation;
 * ao commitar, o rascunho é descartado e o input volta a refletir a prop —
 * que é atualizada pela invalidação da query logo em seguida.
 */
function EditableNumber({
  value,
  onCommit,
  allowEmpty = false,
  integer = false,
  className,
  step,
  placeholder,
  ariaLabel,
  id,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  allowEmpty?: boolean;
  /** Rejeita decimais no cliente — `implementationEffortDays` é `z.number().int()` no servidor. */
  integer?: boolean;
  className?: string;
  step?: string;
  /**
   * Mostrado em cinza quando o campo está vazio — usado para revelar o valor
   * que o cálculo está de fato usando enquanto o dado não foi preenchido.
   */
  placeholder?: string;
  /** Contexto para leitor de tela quando o cabeçalho da coluna não basta. */
  ariaLabel?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value != null ? String(value) : "");

  function commit() {
    if (draft === null) return; // nada foi digitado
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed === "") {
      if (allowEmpty) {
        if (value !== null) onCommit(null);
        return;
      }
      toast.error("Valor obrigatório — nada foi alterado.");
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Informe um número maior ou igual a zero.");
      return;
    }
    if (integer && !Number.isInteger(parsed)) {
      toast.error("Informe um número inteiro de dias.");
      return;
    }
    if (parsed === value) return;
    onCommit(parsed);
  }

  return (
    <Input
      type="number"
      min={0}
      step={step}
      className={className}
      id={id}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function PaybackTab({
  companyId,
  isLoading,
  wave1Schedule,
  wave2Schedule,
  unassignedSchedule,
  savingByProjectId,
  effortDaysByProjectId,
  companyDailyRateBRL,
  globalDailyRateBRL,
  wave1StartDate,
}: PaybackTabProps) {
  const utils = trpc.useUtils();

  const [scope, setScope] = useState<PaybackScope>("ondas");

  const dailyRate = resolveDeveloperDailyRate(companyDailyRateBRL, globalDailyRateBRL);

  const { data: costItems = [] } = trpc.company.listCostItems.useQuery({ companyId });

  const structureCosts: StructureCostItem[] = useMemo(
    () =>
      costItems.map((item) => ({
        type: item.type as "recorrente" | "pontual",
        amountBRL: item.amountBRL,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    [costItems]
  );

  const companyMutation = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.listAll.invalidate();
      toast.success("Taxa diária atualizada.");
    },
    onError: (error) => {
      toast.error("Erro ao salvar a taxa diária", { description: error.message });
    },
  });

  const projectMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      // Sem filtro de input: a página troca `sortBy`, e cada variação é uma
      // entrada de cache diferente do mesmo ranking.
      utils.project.getPrioritizedRanking.invalidate();
      toast.success("Projeto atualizado.");
    },
    onError: (error) => {
      toast.error("Erro ao salvar o projeto", { description: error.message });
    },
  });

  // Lista única de robôs no escopo escolhido — a curva e a tabela de composição
  // derivam dela, para não haver chance de o gráfico e a tabela discordarem
  // sobre quais robôs entraram na conta.
  const scopedItems = useMemo(() => {
    const items = [
      ...wave1Schedule.map((item) => ({ ...item, waveLabel: "Onda 1" })),
      ...wave2Schedule.map((item) => ({ ...item, waveLabel: "Onda 2" })),
    ];
    if (scope === "pipeline") {
      items.push(...unassignedSchedule.map((item) => ({ ...item, waveLabel: "Sem onda" })));
    }
    return items;
  }, [wave1Schedule, wave2Schedule, unassignedSchedule, scope]);

  const paybackSchedule = useMemo(
    () =>
      scopedItems.map((item) => ({
        projectId: item.projectId,
        startDate: item.startDate,
        endDate: item.endDate,
        estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
      })),
    [scopedItems, savingByProjectId]
  );

  const curve = useMemo(
    () => computePaybackCurve(paybackSchedule, dailyRate, structureCosts),
    [paybackSchedule, dailyRate, structureCosts]
  );

  const paybackDate = useMemo(() => findPaybackDate(curve), [curve]);

  // "Data de início do cronograma": a menor startDate entre os robôs do escopo
  // atual — usada só para expressar o payback em "N meses a partir do início",
  // nunca como um número fixo.
  const scheduleStartDate = useMemo(() => {
    if (paybackSchedule.length === 0) return wave1StartDate;
    return new Date(Math.min(...paybackSchedule.map((item) => item.startDate.getTime())));
  }, [paybackSchedule, wave1StartDate]);

  const paybackMonths = useMemo(() => {
    if (!paybackDate) return null;
    const days = differenceInCalendarDays(paybackDate, scheduleStartDate);
    return Math.max(0, Math.round(days / 30.44));
  }, [paybackDate, scheduleStartDate]);

  // Composição do payback: uma linha por robô, com os números que alimentam
  // a curva acima (facilita conferir/auditar de onde vêm custo e economia).
  const composition = useMemo(() => {
    return scopedItems.map((item) => {
      const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
      const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
      return {
        projectId: item.projectId,
        title: item.title,
        waveLabel: item.waveLabel,
        endDate: item.endDate,
        businessDays,
        developmentCostBRL: businessDays * dailyRate,
        monthlySavingBRL: annualSavingBRL / 12,
        annualSavingBRL,
        // Valor gravado no projeto, que é o que o input edita — pode diferir de
        // `businessDays` (derivado do cronograma) quando o esforço é null e o
        // Passo 5 aplicou o fallback de 20 dias úteis.
        effortDays: effortDaysByProjectId.get(item.projectId) ?? null,
      };
    });
  }, [scopedItems, savingByProjectId, effortDaysByProjectId, dailyRate]);

  const totals = useMemo(() => {
    const developmentCost = composition.reduce((sum, i) => sum + i.developmentCostBRL, 0);
    const annualSaving = composition.reduce((sum, i) => sum + i.annualSavingBRL, 0);
    // Sem robôs agendados a curva é vazia e não existe "fim da janela"; nesse
    // caso o custo de estrutura é medido até hoje, senão o KPI mostraria R$ 0
    // logo acima da linha da tabela que exibe esse mesmo custo acumulado — a
    // empresa pode ter estrutura rodando sem nenhum robô nas ondas ainda.
    const lastPoint = curve[curve.length - 1];
    const structureCost = computeStructureCostAt(structureCosts, lastPoint?.date ?? new Date());
    return { developmentCost, annualSaving, structureCost };
  }, [composition, curve, structureCosts]);

  // Total de custo de estrutura já acumulado até hoje (fora da janela
  // projetada) — mostrado como uma linha própria na tabela de composição,
  // separado do custo de dev por robô que já aparece linha a linha.
  const structureCostToDate = useMemo(
    () => computeStructureCostAt(structureCosts, new Date()),
    [structureCosts]
  );

  const unassignedCount = unassignedSchedule.length;

  // A frase precisa dizer explicitamente quantos robôs ficaram DE FORA — o
  // ponto que confundia era o KPI mostrar só quantos entraram, sem revelar que
  // existia um resto invisível.
  const scopeHint =
    scope === "pipeline"
      ? `Inclui os ${unassignedCount} robô${unassignedCount === 1 ? "" : "s"} sem onda definida, agendado${unassignedCount === 1 ? "" : "s"} em sequência depois da onda 2, na ordem do ranking. O deck (.pptx) exporta sempre o escopo "Ondas 1 e 2".`
      : unassignedCount > 0
        ? `${unassignedCount} robô${unassignedCount === 1 ? "" : "s"} do pipeline ainda sem onda definida fica${unassignedCount === 1 ? "" : "m"} de fora desta conta — troque para "Pipeline completo" para incluí-${unassignedCount === 1 ? "lo" : "los"}.`
        : "Todos os robôs do pipeline desta empresa já estão nas ondas 1 e 2.";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Premissas de custo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="developer-daily-rate">Taxa diária do desenvolvedor (R$)</Label>
            <EditableNumber
              id="developer-daily-rate"
              value={companyDailyRateBRL}
              allowEmpty
              step="0.01"
              onCommit={(next) =>
                companyMutation.mutate({ id: companyId, developerDailyRateBRL: next })
              }
            />
            <p className="text-xs text-muted-foreground">
              {companyDailyRateBRL == null
                ? `Vazio = usa o padrão global de ${formatCurrency(globalDailyRateBRL ?? 0)} (Configurações).`
                : `Valor específico desta empresa. Apague o campo para voltar ao padrão global de ${formatCurrency(globalDailyRateBRL ?? 0)}.`}
            </p>
            {/*
              As duas taxas do payback são fáceis de trocar: esta é o CUSTO de
              construir o robô, e a outra (taxa horária, na aba Arquitetura de
              cada projeto) é o custo/hora de quem faz a atividade manualmente
              hoje, que vira a ECONOMIA. Dizer isso aqui, ao lado do campo,
              evita que a taxa do dev acabe preenchida no lugar da outra.
            */}
            <p className="text-xs text-muted-foreground">
              Só o lado do <strong>custo</strong>: quanto custa um dia de
              desenvolvimento do robô. Não confundir com a{" "}
              <em>taxa horária do profissional que executa a atividade</em>{" "}
              (aba Arquitetura de cada projeto), que é o que alimenta a economia.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Payback / ROI acumulado</CardTitle>
              <p className="text-sm font-medium mt-1">
                {paybackDate
                  ? `Payback estimado em ${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
                  : "Payback não atingido no período calculado"}
              </p>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={scope}
              // O Radix devolve "" quando o item já ativo é clicado de novo; sem
              // o guard o escopo ficaria vazio e a curva sumiria da tela.
              onValueChange={(next) => {
                if (next) setScope(next as PaybackScope);
              }}
              aria-label="Escopo do cálculo de payback"
            >
              <ToggleGroupItem value="ondas" className="px-3">
                Ondas 1 e 2
              </ToggleGroupItem>
              <ToggleGroupItem value="pipeline" className="px-3">
                Pipeline completo
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-xs text-muted-foreground">{scopeHint}</p>
          <p className="text-xs text-muted-foreground">
            Em qualquer escopo, a base é o pipeline desta empresa: automações já
            existentes e projetos concluídos ou cancelados nunca entram nesta conta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTile
              label="Custo total projetado"
              value={formatCurrency(totals.developmentCost + totals.structureCost)}
              hint={`dev ${formatCurrency(totals.developmentCost)} + estrutura ${formatCurrency(totals.structureCost)} até o fim da janela`}
            />
            <KpiTile
              label="Economia anual"
              value={formatCurrency(totals.annualSaving)}
              hint={`${composition.length} robô${composition.length === 1 ? "" : "s"} ${
                scope === "pipeline" ? "no pipeline (ondas 1, 2 e sem onda)" : "nas ondas 1 e 2"
              }`}
            />
            <KpiTile
              label="Payback"
              value={
                paybackDate
                  ? `${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
                  : "não atingido"
              }
              hint={
                paybackDate
                  ? `em ${format(paybackDate, "dd/MM/yyyy")}`
                  : "dentro da janela projetada"
              }
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          ) : (
            <PaybackChart curve={curve} paybackDate={paybackDate} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição do cálculo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Um robô por linha, no escopo selecionado acima, com os números que alimentam a
            curva — custo de desenvolvimento = dias úteis × taxa diária do desenvolvedor;
            economia = horas/mês economizadas × 12 × taxa horária do profissional que executa
            a atividade (definida por projeto, na aba Arquitetura). Dias úteis e economia são
            editáveis: a alteração é gravada no projeto e recalcula cronograma e curva. Dias úteis
            em branco = ainda não estimado; o cronograma usa o padrão mostrado em cinza no campo.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Onda</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="w-28 text-right">Dias úteis</TableHead>
                <TableHead className="text-right">Custo de dev.</TableHead>
                <TableHead className="text-right">Economia/mês</TableHead>
                <TableHead className="w-40 text-right">Economia/ano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {composition.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {scope === "pipeline"
                      ? "Nenhum robô no pipeline desta empresa."
                      : "Nenhum robô nas ondas 1/2 ainda."}
                  </TableCell>
                </TableRow>
              ) : (
                composition.map((item) => (
                  <TableRow key={item.projectId}>
                    {/*
                      Só o título é clicável (não a linha inteira, como na aba
                      antiga): as células de dias úteis e economia têm inputs
                      inline, e um onClick na TableRow dispararia a navegação a
                      cada clique/blur dentro deles.
                    */}
                    <TableCell className="font-medium max-w-[260px] truncate">
                      <Link
                        href={`/admin/projetos/${item.projectId}/especificacao`}
                        className="hover:text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.waveLabel}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(item.endDate, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber
                        className="h-8 w-20 text-right"
                        value={item.effortDays}
                        integer
                        step="1"
                        // Campo vazio (esforço não estimado) mostra em cinza o
                        // número de dias que o cronograma está de fato usando
                        // — o mesmo que alimenta o custo de dev. desta linha.
                        placeholder={String(item.businessDays)}
                        ariaLabel={`Dias úteis de ${item.title}`}
                        // Vazio grava null = "ainda não estimado"; o Passo 5
                        // volta a aplicar o fallback de 20 dias úteis.
                        allowEmpty
                        onCommit={(next) =>
                          projectMutation.mutate({
                            id: item.projectId,
                            implementationEffortDays: next,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.developmentCostBRL)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.monthlySavingBRL)}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber
                        className="h-8 w-32 text-right"
                        step="0.01"
                        value={item.annualSavingBRL}
                        ariaLabel={`Economia anual de ${item.title}`}
                        onCommit={(next) =>
                          projectMutation.mutate({
                            id: item.projectId,
                            estimatedAnnualSavingBRL: next,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
              {structureCostToDate > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell className="font-medium" colSpan={4}>
                    Estrutura (pessoas/licenças) acumulada até hoje
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium" colSpan={3}>
                    {formatCurrency(structureCostToDate)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CompanyCostItemsCard
        companyId={companyId}
        description="Pessoas, licenças e infraestrutura — entram na curva de payback como custo acumulado, além do custo de desenvolvimento de cada robô."
      />
    </div>
  );
}
