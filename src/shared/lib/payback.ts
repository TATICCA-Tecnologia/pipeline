import { addDays, differenceInCalendarDays, isWeekend } from "date-fns";

/**
 * Curva de payback (custo acumulado x economia acumulada) de uma onda de
 * implementação — Passo 6 do blueprint de diagnóstico de robotização.
 * Reaproveita o cronograma sequencial já calculado pelo Passo 5
 * (`computeWaveSchedule`, src/shared/lib/wave-schedule.ts), que já retorna
 * `startDate`/`endDate` por robô — por isso este módulo não precisa
 * reconstruir o início de cada robô a partir do esforço em dias; recebe o
 * schedule já com `startDate`/`endDate` (mais simples e evita duplicar a
 * lógica de sequenciamento do Passo 5, ver comentário no wave-schedule.ts).
 * Função PURA (sem I/O, sem ctx.db) — reutilizável pelo export em PPTX do
 * Passo 8a/8b.
 */

export type PaybackScheduleItem = {
  projectId: string;
  startDate: Date;
  endDate: Date;
  estimatedAnnualSavingBRL: number;
};

export type PaybackPoint = {
  date: Date;
  cumulativeCost: number;
  cumulativeSaving: number;
};

/** Granularidade da série retornada: um ponto a cada 7 dias corridos. */
const POINT_INTERVAL_DAYS = 7;

/**
 * Janela mínima da curva (dias corridos) mesmo quando o cronograma total é
 * muito curto (ex.: 1 robô de poucos dias) — sem isso a curva ficaria com 1-2
 * pontos e não mostraria a economia se estabilizando/crescendo depois da
 * entrega, que é o objetivo do gráfico (slide de referência do deck original).
 */
const MIN_WINDOW_DAYS = 60;

/**
 * Conta quantos dias úteis do robô (dentro de `[windowStart, windowEnd]`) já
 * se passaram até `asOf` (inclusive). Modelo consistente com
 * `computeWaveSchedule`: 1 desenvolvedor, sem paralelismo, sem noção de
 * feriados (só fins de semana) — o robô "consome" `dailyRateBRL` em cada dia
 * útil da sua própria janela de desenvolvimento, e nenhum custo é reconhecido
 * fora dela (nem antes do robô começar, nem depois de já ter sido entregue).
 */
function businessDaysElapsedInWindow(windowStart: Date, windowEnd: Date, asOf: Date): number {
  if (asOf < windowStart) return 0;
  const clampedEnd = asOf < windowEnd ? asOf : windowEnd;
  let count = 0;
  let cursor = windowStart;
  while (cursor <= clampedEnd) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/**
 * Calcula, num único dia `asOf`, o custo acumulado e a economia acumulada de
 * todo o schedule até aquele ponto.
 *
 * Custo: soma, para cada robô, `dailyRateBRL` por dia útil já decorrido
 * dentro da janela `[startDate, endDate]` daquele robô especificamente — ou
 * seja, o custo de cada robô é reconhecido de forma distribuída ao longo dos
 * dias em que ele está sendo desenvolvido (não tudo de uma vez no início nem
 * no fim). Como o schedule do Passo 5 é sequencial (1 desenvolvedor por vez),
 * no máximo um robô contribui custo em cada dia.
 *
 * Economia: para cada robô já entregue (`endDate <= asOf`), soma
 * `estimatedAnnualSavingBRL / 365` por dia decorrido desde a entrega.
 * Decisão: a economia começa a contar no PRÓPRIO dia de entrega (o robô
 * já entra em produção e passa a economizar a partir do dia em que termina
 * de ser desenvolvido) — por isso `daysSinceDelivery` usa `+ 1` (o dia da
 * entrega conta como o 1º dia de economia, não o dia seguinte).
 */
function computePointAt(schedule: PaybackScheduleItem[], dailyRateBRL: number, asOf: Date): PaybackPoint {
  let cumulativeCost = 0;
  let cumulativeSaving = 0;

  for (const item of schedule) {
    cumulativeCost +=
      dailyRateBRL * businessDaysElapsedInWindow(item.startDate, item.endDate, asOf);

    if (asOf >= item.endDate) {
      const daysSinceDelivery = differenceInCalendarDays(asOf, item.endDate) + 1;
      cumulativeSaving += (item.estimatedAnnualSavingBRL / 365) * daysSinceDelivery;
    }
  }

  return { date: asOf, cumulativeCost, cumulativeSaving };
}

/**
 * Calcula a curva de payback (custo acumulado x economia acumulada) para um
 * schedule de robôs já sequenciado (`computeWaveSchedule`).
 *
 * Granularidade semanal (um ponto a cada `POINT_INTERVAL_DAYS` dias corridos),
 * começando na menor `startDate` do schedule, até aproximadamente 2x a
 * duração total do cronograma (ou `MIN_WINDOW_DAYS`, o que for maior) — para
 * a curva de economia ter espaço de mostrar sua tendência depois que todos os
 * robôs já foram entregues.
 *
 * Retorna `[]` se `schedule` estiver vazio (nada para calcular).
 */
export function computePaybackCurve(
  schedule: PaybackScheduleItem[],
  dailyRateBRL: number
): PaybackPoint[] {
  if (schedule.length === 0) return [];

  const scheduleStart = new Date(Math.min(...schedule.map((item) => item.startDate.getTime())));
  const scheduleEnd = new Date(Math.max(...schedule.map((item) => item.endDate.getTime())));
  const totalDurationDays = Math.max(0, differenceInCalendarDays(scheduleEnd, scheduleStart));
  const windowDays = Math.max(totalDurationDays * 2, MIN_WINDOW_DAYS);
  const windowEnd = addDays(scheduleStart, windowDays);

  const points: PaybackPoint[] = [];
  let cursor = scheduleStart;
  while (cursor <= windowEnd) {
    points.push(computePointAt(schedule, dailyRateBRL, cursor));
    cursor = addDays(cursor, POINT_INTERVAL_DAYS);
  }

  // A régua de 7 em 7 dias raramente cai exatamente em `windowEnd` — adiciona
  // um ponto final exato pra curva não parecer cortada antes do fim da janela
  // calculada.
  const lastPoint = points[points.length - 1];
  if (!lastPoint || differenceInCalendarDays(windowEnd, lastPoint.date) > 0) {
    points.push(computePointAt(schedule, dailyRateBRL, windowEnd));
  }

  return points;
}

/**
 * Encontra a primeira data da curva em que a economia acumulada alcança (ou
 * ultrapassa) o custo acumulado — o "dia de payback".
 *
 * Ignora pontos em que `cumulativeCost === 0`: no primeiro ponto da curva
 * (antes de qualquer robô começar a ser desenvolvido), tanto custo quanto
 * economia acumulados são 0, e `0 >= 0` seria tecnicamente verdadeiro — o que
 * relataria "payback no dia 1" de forma enganosa, sem nenhum custo ou
 * economia real terem ocorrido ainda.
 *
 * Retorna `null` se o payback não ocorrer dentro da janela calculada por
 * `computePaybackCurve`.
 */
export function findPaybackDate(curve: PaybackPoint[]): Date | null {
  const point = curve.find((p) => p.cumulativeCost > 0 && p.cumulativeSaving >= p.cumulativeCost);
  return point ? point.date : null;
}
