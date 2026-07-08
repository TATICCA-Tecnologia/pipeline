"use client";

import { useMemo } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/shared/utils";

/**
 * Timeline (Gantt simples) de uma onda de implementação — Passo 5 do
 * blueprint de diagnóstico de robotização. Recebe o cronograma JÁ calculado
 * por `computeWaveSchedule` (src/shared/lib/wave-schedule.ts) e desenha
 * barras horizontais posicionadas proporcionalmente numa régua de meses.
 * Não é uma lib de gantt — apenas divs posicionados por %, calendar-based.
 */

export type WaveTimelineItem = {
  projectId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  /** Opcional: usada só para colorir a barra por área (cor cíclica, não requisito rígido). */
  areaName?: string | null;
  /**
   * `false` quando a duração veio do fallback de 1 dia de `computeWaveSchedule`
   * (esforço ainda não estimado pelo arquiteto), não de um
   * `implementationEffortDays` real — a barra recebe uma indicação visual
   * diferente para não ser confundida com uma estimativa real de 1 dia.
   * Omitido/`undefined` é tratado como `true` (barra "normal").
   */
  effortEstimated?: boolean;
};

interface WaveTimelineProps {
  items: WaveTimelineItem[];
  emptyMessage?: string;
  className?: string;
}

const AREA_COLOR_VARS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function buildAreaColorMap(items: WaveTimelineItem[]): Map<string, string> {
  const uniqueAreas = Array.from(
    new Set(items.map((item) => item.areaName).filter((name): name is string => Boolean(name)))
  ).sort();
  const map = new Map<string, string>();
  uniqueAreas.forEach((name, index) => {
    map.set(name, AREA_COLOR_VARS[index % AREA_COLOR_VARS.length]);
  });
  return map;
}

export function WaveTimeline({
  items,
  emptyMessage = "Nenhum robô agendado para esta onda.",
  className,
}: WaveTimelineProps) {
  const { rangeStart, rangeEnd, totalDays, monthTicks, areaColorMap } = useMemo(() => {
    if (items.length === 0) {
      return {
        rangeStart: null as Date | null,
        rangeEnd: null as Date | null,
        totalDays: 0,
        monthTicks: [] as Date[],
        areaColorMap: new Map<string, string>(),
      };
    }

    const start = new Date(Math.min(...items.map((i) => i.startDate.getTime())));
    // +1 dia para o próprio dia de término entrar na largura da barra
    // (um robô que começa e termina no mesmo dia útil ainda precisa de largura visível).
    const end = new Date(Math.max(...items.map((i) => addDays(i.endDate, 1).getTime())));

    const days = Math.max(1, differenceInCalendarDays(end, start));
    const ticks = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) });

    return {
      rangeStart: start,
      rangeEnd: end,
      totalDays: days,
      monthTicks: ticks,
      areaColorMap: buildAreaColorMap(items),
    };
  }, [items]);

  if (items.length === 0 || !rangeStart || !rangeEnd) {
    return <p className="text-sm text-muted-foreground py-10 text-center">{emptyMessage}</p>;
  }

  function pctOf(date: Date): number {
    return (differenceInCalendarDays(date, rangeStart!) / totalDays) * 100;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Régua de meses */}
      <div className="relative h-6 border-b border-border/60 text-xs text-muted-foreground">
        {monthTicks.map((month) => (
          <div
            key={month.toISOString()}
            className="absolute top-0 border-l border-border/40 pl-1.5"
            style={{ left: `${pctOf(month < rangeStart ? rangeStart : month)}%` }}
          >
            {format(month, "MMM/yy", { locale: ptBR })}
          </div>
        ))}
      </div>

      {/* Barras, uma linha por robô */}
      <div className="space-y-2">
        {items.map((item) => {
          const left = pctOf(item.startDate);
          const width = Math.max(pctOf(addDays(item.endDate, 1)) - left, 1.5);
          const color = item.areaName
            ? (areaColorMap.get(item.areaName) ?? "var(--color-chart-1)")
            : "var(--color-chart-1)";
          // effortEstimated === false: duração veio do fallback de 1 dia
          // (esforço ainda não estimado), não de um valor real — sinalizar
          // com borda tracejada + opacidade reduzida + "?" no rótulo, para
          // não parecer uma estimativa real de 1 dia.
          const isFallback = item.effortEstimated === false;

          return (
            <div key={item.projectId} className="relative h-9">
              <div
                className={cn(
                  "absolute h-9 rounded-md flex items-center px-2 text-xs font-medium text-white shadow-sm overflow-hidden whitespace-nowrap",
                  isFallback && "border-2 border-dashed border-white/70 opacity-70"
                )}
                style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                title={
                  `${item.title}: ${format(item.startDate, "dd/MM/yyyy")} – ${format(item.endDate, "dd/MM/yyyy")}` +
                  (isFallback ? " (esforço ainda não estimado — assumido 1 dia)" : "")
                }
              >
                <span className="truncate">
                  {item.title}
                  {isFallback && " (?)"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
