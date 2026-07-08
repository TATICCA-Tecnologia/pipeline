"use client";

import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactBRL, formatCurrency } from "@/shared/utils";
import type { PaybackPoint } from "@/shared/lib/payback";

/**
 * Gráfico de payback (custo acumulado x economia acumulada) — Passo 6 do
 * blueprint de diagnóstico de robotização. Recebe a curva já calculada por
 * `computePaybackCurve` (src/shared/lib/payback.ts) e desenha duas linhas
 * (custo, economia), marcando o dia de payback com uma `ReferenceLine`
 * vertical quando houver um.
 */

interface PaybackChartProps {
  curve: PaybackPoint[];
  paybackDate: Date | null;
  className?: string;
}

type ChartDatum = {
  dateLabel: string;
  cumulativeCost: number;
  cumulativeSaving: number;
};

type TooltipPayloadEntry = { payload: ChartDatum };

function PaybackTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">{point.dateLabel}</p>
      <p className="text-muted-foreground">Custo acumulado: {formatCurrency(point.cumulativeCost)}</p>
      <p className="text-muted-foreground">
        Economia acumulada: {formatCurrency(point.cumulativeSaving)}
      </p>
    </div>
  );
}

export function PaybackChart({ curve, paybackDate, className }: PaybackChartProps) {
  if (curve.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Nenhum robô agendado para calcular a curva de payback.
      </p>
    );
  }

  const data: ChartDatum[] = curve.map((point) => ({
    dateLabel: format(point.date, "dd/MM/yy"),
    cumulativeCost: Math.round(point.cumulativeCost),
    cumulativeSaving: Math.round(point.cumulativeSaving),
  }));

  // O ponto de payback é sempre um dos pontos da própria curva (é escolhido
  // por `findPaybackDate` a partir dela) — por isso dá pra localizar o rótulo
  // correspondente comparando o dia formatado, sem precisar guardar o índice.
  const paybackLabel = paybackDate ? format(paybackDate, "dd/MM/yy") : null;

  return (
    <div className={className ?? "h-96 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 16, bottom: 48, left: 8 }}>
          <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="dateLabel"
            angle={-30}
            textAnchor="end"
            height={70}
            interval="preserveStartEnd"
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactBRL(value)}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<PaybackTooltip />} />
          <Line
            type="monotone"
            dataKey="cumulativeCost"
            name="Custo acumulado"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="cumulativeSaving"
            name="Economia acumulada"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            dot={false}
          />
          {paybackLabel && (
            <ReferenceLine
              x={paybackLabel}
              stroke="var(--color-chart-3)"
              strokeDasharray="4 4"
              label={{
                value: "Payback",
                position: "top",
                fill: "var(--color-chart-3)",
                fontSize: 11,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
