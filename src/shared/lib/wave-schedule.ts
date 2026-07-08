import { addBusinessDays, isWeekend } from "date-fns";

/**
 * Agendamento sequencial de robôs dentro de uma onda de implementação
 * (Passo 5 do blueprint de diagnóstico de robotização).
 *
 * Modelo: um único desenvolvedor full-time, um robô por vez, em sequência
 * estrita (sem paralelismo). Cada robô consome `implementationEffortDays`
 * dias úteis; o próximo começa no dia útil seguinte ao fim do anterior.
 * Função PURA (sem I/O, sem ctx.db) — testável isoladamente e reutilizável
 * pelo Passo 6 (payback/ROI), que precisa da data de entrega de cada robô.
 */

export type WaveScheduleInput = {
  id: string;
  title: string;
  implementationEffortDays: number | null;
  waveOrder: number | null;
};

export type WaveScheduleItem = {
  projectId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  /**
   * `false` quando `implementationEffortDays` era `null` e o fallback de 1
   * dia foi usado — permite que a UI distinga "estimado em 1 dia" de "ainda
   * não estimado" em vez de renderizar as duas situações de forma idêntica.
   */
  effortEstimated: boolean;
};

/**
 * Fallback de esforço quando `implementationEffortDays` é `null`: assume 1
 * dia útil. Decisão: preferimos manter o projeto agendado (mesmo que a
 * duração real ainda não tenha sido estimada pelo arquiteto) a excluí-lo do
 * cronograma — excluir silenciosamente esconderia o robô da timeline sem
 * nenhum aviso, o que é pior para o caso de uso ("ver a sequência completa
 * da onda"). 1 dia é o menor incremento útil e não distorce muito a soma
 * cumulativa para os poucos projetos que ainda não têm esforço estimado.
 * `WaveScheduleItem.effortEstimated` sinaliza quando esse fallback foi usado,
 * para a UI conseguir diferenciar visualmente.
 */
const FALLBACK_EFFORT_DAYS = 1;

/**
 * Calcula o cronograma sequencial de uma onda de implementação.
 *
 * Ordenação: por `waveOrder` crescente (menor primeiro); projetos com
 * `waveOrder === null` vão para o final, ordenados por `id` (determinístico,
 * já que não há nenhum outro critério explícito de desempate para eles).
 *
 * Soma cumulativa de dias úteis via `addBusinessDays` (date-fns) — não
 * reimplementa contagem de dias úteis manualmente.
 */
export function computeWaveSchedule(
  projects: WaveScheduleInput[],
  startDate: Date
): WaveScheduleItem[] {
  const ordered = [...projects].sort((a, b) => {
    if (a.waveOrder !== null && b.waveOrder !== null) {
      return a.waveOrder - b.waveOrder;
    }
    if (a.waveOrder !== null) return -1;
    if (b.waveOrder !== null) return 1;
    return a.id.localeCompare(b.id);
  });

  const schedule: WaveScheduleItem[] = [];
  // `addBusinessDays(weekendDate, 0)` retorna a própria data de fim de semana
  // inalterada (não "avança" para o próximo dia útil) — por isso o início da
  // onda precisa ser normalizado manualmente antes do primeiro agendamento,
  // senão o primeiro robô começaria num sábado/domingo.
  let cursor = nextBusinessDayOnOrAfter(startDate);

  for (const project of ordered) {
    const effortEstimated = project.implementationEffortDays !== null;
    const effortDays = project.implementationEffortDays ?? FALLBACK_EFFORT_DAYS;
    // effortDays dias úteis a partir de `cursor` inclui o próprio `cursor`
    // como primeiro dia — por isso o fim é cursor + (effortDays - 1) dias úteis.
    // Math.max(1, effortDays) também protege contra um `implementationEffortDays`
    // explícito de 0 (ou negativo), evitando uma chamada "para trás" de
    // addBusinessDays — tratado como 1 dia, igual ao fallback de null.
    const projectStart = cursor;
    const projectEnd = addBusinessDays(projectStart, Math.max(1, effortDays) - 1);

    schedule.push({
      projectId: project.id,
      title: project.title,
      startDate: projectStart,
      endDate: projectEnd,
      effortEstimated,
    });

    cursor = addBusinessDays(projectEnd, 1);
  }

  return schedule;
}

/** Retorna `date` se já for dia útil (seg-sex), senão avança para o próximo dia útil. */
function nextBusinessDayOnOrAfter(date: Date): Date {
  return isWeekend(date) ? addBusinessDays(date, 1) : date;
}
