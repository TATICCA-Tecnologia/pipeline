/**
 * Saving estimado anual = horas economizadas por mês (reportadas no projeto)
 * × 12 × taxa horária efetiva (override do projeto ou padrão de SystemSettings).
 * Função PURA — mesma convenção de scoring.ts/wave-schedule.ts/payback.ts.
 */
export function computeAnnualSavingBRL(
  monthlyHoursSaved: number | null | undefined,
  hourlyRateBRL: number
): number | null {
  if (monthlyHoursSaved == null || !Number.isFinite(hourlyRateBRL)) return null;
  return monthlyHoursSaved * 12 * hourlyRateBRL;
}
