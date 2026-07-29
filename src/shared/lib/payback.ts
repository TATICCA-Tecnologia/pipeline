import { addDays, addMonths, differenceInCalendarDays, isWeekend } from "date-fns";
import { HOURS_PER_BUSINESS_DAY } from "@/shared/lib/wave-schedule";

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
  /**
   * Custo de sustentação do robô por semana, JÁ valorizado pelo caller
   * (horas/semana × taxa horária de manutenção). Recebe o valor pronto em vez
   * de horas + taxa porque a resolução de qual taxa e quantas horas valem
   * (projeto > global > padrão) é responsabilidade de quem monta o schedule —
   * a curva só distribui o número no tempo.
   */
  maintenanceCostPerWeekBRL: number;
};

export type PaybackPoint = {
  date: Date;
  cumulativeCost: number;
  cumulativeSaving: number;
};

/** Item de custo de estrutura da empresa (`CompanyCostItem`) — pessoas, licenças, etc. */
export type StructureCostItem = {
  type: "recorrente" | "pontual";
  amountBRL: number;
  startDate: Date;
  endDate: Date | null;
};

/** Granularidade da série retornada: um ponto a cada 7 dias corridos. */
const POINT_INTERVAL_DAYS = 7;

/**
 * Carência antes da sustentação começar a custar: 1 mês após a entrega do
 * robô. Assume-se que o primeiro mês em produção ainda é estabilização coberta
 * pelo desenvolvimento, e a manutenção recorrente começa depois disso.
 */
const MAINTENANCE_GRACE_MONTHS = 1;

/**
 * Janela mínima da curva: 5 anos corridos. O horizonte precisa ser longo o
 * bastante para o payback aparecer DENTRO do gráfico — com a janela antiga
 * (60 dias, ou 2x a duração do cronograma) uma onda curta rendia uma tela de
 * ~4 meses, em que a economia mal tinha começado a acumular e o cruzamento com
 * o custo caía fora do período calculado. A granularidade continua semanal
 * (`POINT_INTERVAL_DAYS`), então 5 anos são ~261 pontos de controle: o eixo X
 * é rareado na renderização, não aqui.
 */
const MIN_WINDOW_DAYS = 365 * 5;

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
 * Custo de estrutura (pessoas/licenças/infraestrutura — `CompanyCostItem`)
 * acumulado até `asOf`. Item recorrente: soma `(amountBRL * 12 / 365) × dias
 * decorridos entre startDate e min(asOf, endDate ?? asOf)` — mesmo padrão de
 * "anualiza e divide por 365" já usado no lado da economia
 * (`estimatedAnnualSavingBRL / 365`). Item pontual: soma o valor cheio a
 * partir de `startDate` (reconhecido de uma vez, não distribuído).
 * Exportada porque a tela de Priorização usa separadamente pra mostrar o
 * total de estrutura na tabela de composição, fora da curva.
 */
export function computeStructureCostAt(structureCosts: StructureCostItem[], asOf: Date): number {
  let total = 0;
  for (const item of structureCosts) {
    if (asOf < item.startDate) continue;
    if (item.type === "pontual") {
      total += item.amountBRL;
      continue;
    }
    const clampedEnd = item.endDate && item.endDate < asOf ? item.endDate : asOf;
    const days = differenceInCalendarDays(clampedEnd, item.startDate) + 1;
    total += (item.amountBRL * 12 / 365) * Math.max(0, days);
  }
  return total;
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
 *
 * Manutenção: custo recorrente de sustentação de cada robô, distribuído por
 * dia corrido (`maintenanceCostPerWeekBRL / 7`, mesmo padrão de rateio da
 * economia e do custo de estrutura), a partir de `MAINTENANCE_GRACE_MONTHS`
 * após a entrega e sem data de fim — um robô entregue custa sustentação para
 * sempre, e é isso que faz a curva de custo continuar subindo depois que todo
 * o desenvolvimento acabou.
 */
function computePointAt(
  schedule: PaybackScheduleItem[],
  dailyRateBRL: number,
  structureCosts: StructureCostItem[],
  asOf: Date
): PaybackPoint {
  let cumulativeCost = computeStructureCostAt(structureCosts, asOf);
  let cumulativeSaving = 0;

  for (const item of schedule) {
    cumulativeCost +=
      dailyRateBRL * businessDaysElapsedInWindow(item.startDate, item.endDate, asOf);

    const maintenanceStart = addMonths(item.endDate, MAINTENANCE_GRACE_MONTHS);
    if (asOf >= maintenanceStart) {
      const maintenanceDays = differenceInCalendarDays(asOf, maintenanceStart) + 1;
      cumulativeCost += (item.maintenanceCostPerWeekBRL / 7) * maintenanceDays;
    }

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
  dailyRateBRL: number,
  structureCosts: StructureCostItem[] = []
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
    points.push(computePointAt(schedule, dailyRateBRL, structureCosts, cursor));
    cursor = addDays(cursor, POINT_INTERVAL_DAYS);
  }

  // A régua de 7 em 7 dias raramente cai exatamente em `windowEnd` — adiciona
  // um ponto final exato pra curva não parecer cortada antes do fim da janela
  // calculada.
  const lastPoint = points[points.length - 1];
  if (!lastPoint || differenceInCalendarDays(windowEnd, lastPoint.date) > 0) {
    points.push(computePointAt(schedule, dailyRateBRL, structureCosts, windowEnd));
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

/**
 * Taxa horária padrão do desenvolvedor quando nada foi configurado — nem na
 * empresa, nem no global. Custo de desenvolvimento é negociado por hora na
 * prática, então a premissa é horária e o custo do dia útil sai dela
 * (160/h × 8h = R$ 1.280/dia útil).
 */
export const DEFAULT_DEVELOPER_HOURLY_RATE_BRL = 160;

/**
 * Resolve a taxa HORÁRIA do desenvolvedor efetiva de uma empresa.
 *
 * Precedência: valor da empresa > valor global de `SystemSettings` >
 * `DEFAULT_DEVELOPER_HOURLY_RATE_BRL`.
 *
 * `0` na empresa é um valor legítimo e VENCE o global — só `null`/`undefined`
 * herdam. Isso permite modelar uma empresa cujo custo de desenvolvimento não
 * entra na conta sem que o valor global reapareça por baixo (por isso o `??`,
 * não o `||`).
 *
 * Fonte única: usada pela aba Payback e pelo gerador de deck
 * (src/server/deck/build-diagnostic-deck.ts) — se um dos dois calcular a taxa
 * por conta própria, o .pptx passa a divergir do gráfico da tela.
 */
export function resolveDeveloperHourlyRate(
  companyRate: number | null | undefined,
  globalRate: number | null | undefined
): number {
  return companyRate ?? globalRate ?? DEFAULT_DEVELOPER_HOURLY_RATE_BRL;
}

/**
 * Converte a taxa horária do desenvolvedor no custo de um dia útil, que é a
 * unidade que `computePaybackCurve` consome (o cronograma do Passo 5 é medido
 * em dias úteis). Existe como função para a conversão viver num lugar só —
 * tela e deck não podem multiplicar por jornadas diferentes.
 */
export function developerDailyRateFrom(hourlyRateBRL: number): number {
  return hourlyRateBRL * HOURS_PER_BUSINESS_DAY;
}

/**
 * Taxa horária padrão de manutenção quando nada foi configurado. Igual à de
 * desenvolvimento por ora — o ponto de existir um campo próprio é permitir
 * que sustentação seja precificada diferente do desenvolvimento, não presumir
 * um desconto que ninguém pediu.
 */
export const DEFAULT_MAINTENANCE_HOURLY_RATE_BRL = 160;

/** Horas de sustentação por semana assumidas quando o robô não tem estimativa própria. */
export const DEFAULT_MAINTENANCE_HOURS_PER_WEEK = 1;

/**
 * Resolve a taxa HORÁRIA de manutenção efetiva de uma empresa. Mesma regra de
 * precedência de `resolveDeveloperHourlyRate` (empresa > global > padrão, com
 * `0` da empresa vencendo o global).
 */
export function resolveMaintenanceHourlyRate(
  companyRate: number | null | undefined,
  globalRate: number | null | undefined
): number {
  return companyRate ?? globalRate ?? DEFAULT_MAINTENANCE_HOURLY_RATE_BRL;
}

/**
 * Custo semanal de sustentação de um robô: horas/semana estimadas (do projeto,
 * ou o padrão global quando o projeto não tem estimativa) × taxa horária de
 * manutenção. É o valor que `PaybackScheduleItem.maintenanceCostPerWeekBRL`
 * espera receber pronto.
 */
export function maintenanceCostPerWeek(
  projectHoursPerWeek: number | null | undefined,
  defaultHoursPerWeek: number | null | undefined,
  maintenanceHourlyRateBRL: number
): number {
  const hours =
    projectHoursPerWeek ?? defaultHoursPerWeek ?? DEFAULT_MAINTENANCE_HOURS_PER_WEEK;
  return hours * maintenanceHourlyRateBRL;
}
