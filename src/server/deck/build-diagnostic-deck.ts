import { addBusinessDays, differenceInCalendarDays } from "date-fns";
import PptxGenJS from "pptxgenjs";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { computeWaveSchedule, type WaveScheduleItem } from "@/shared/lib/wave-schedule";
import {
  computePaybackCurve,
  findPaybackDate,
  type PaybackPoint,
} from "@/shared/lib/payback";
import { formatCurrency, formatDate } from "@/shared/utils";

/**
 * Geração server-side do deck consolidado de diagnóstico de robotização em
 * PPTX editável (Passo 8a do blueprint). Escolha de `pptxgenjs` (não
 * Puppeteer): entregar um `.pptx` editável é mais valioso para uma consultoria
 * que revisa esses decks depois, e evita rodar Chromium headless em produção.
 *
 * Estratégia: reaproveita os procedures tRPC já existentes via `createCaller`
 * (montando um Context com o id de um admin real, já que os procedures
 * agregados são `adminProcedure`) e as funções PURAS de cronograma/payback dos
 * Passos 5/6 — sem duplicar nenhuma regra de negócio.
 *
 * Organização em funções `addXxxSlide` separadas de propósito: o Passo 8b vai
 * ESTENDER este módulo com slides por processo, então cada slide é uma unidade
 * isolada fácil de acrescentar sem reescrever a orquestração.
 */

// Paleta simples e neutra reutilizada pelos slides (hex sem "#", como o
// pptxgenjs espera).
const COLOR_PRIMARY = "1E293B"; // slate-800
const COLOR_ACCENT = "2563EB"; // blue-600
const COLOR_MUTED = "64748B"; // slate-500
const COLOR_HEADER_BG = "1E293B";
const COLOR_HEADER_TEXT = "FFFFFF";
const COLOR_TABLE_BORDER = "E2E8F0";

const TABLE_HEADER_OPTS = {
  bold: true,
  color: COLOR_HEADER_TEXT,
  fill: { color: COLOR_HEADER_BG },
} as const;

type Ranking = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getPrioritizedRanking"]>>;
type AreaSummary = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getAreaSummary"]>>;
type Interviews = Awaited<ReturnType<ReturnType<typeof createCaller>["interview"]["list"]>>;

type Slide = ReturnType<PptxGenJS["addSlide"]>;
type TableRow = Parameters<Slide["addTable"]>[0][number];

const INTERVIEW_STATUS_LABEL: Record<string, string> = {
  realizado: "Realizado",
  agendado: "Agendado",
  cancelado: "Cancelado",
};

/**
 * Gera o buffer (.pptx) do deck consolidado de diagnóstico de uma empresa.
 *
 * Lança um erro claro se não houver nenhum admin no banco (necessário para
 * montar o Context do caller, já que os procedures agregados são admin-only)
 * ou se a empresa não existir.
 */
export async function buildDiagnosticDeck(companyId: string): Promise<Buffer> {
  const admin = await db.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  if (!admin) {
    throw new Error(
      "Nenhum usuário ADMIN/SUPER_ADMIN encontrado no banco — impossível montar o contexto autorizado para gerar o deck."
    );
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    throw new Error(`Empresa não encontrada (id: ${companyId}).`);
  }

  const ctx: Context = { db, userId: admin.id, realUserId: admin.id };
  const caller = createCaller(ctx);

  const [areaSummary, rankingEconomia, rankingQualitativo, rankingCombinado, settings, interviews] =
    await Promise.all([
      caller.project.getAreaSummary({ companyId }),
      caller.project.getPrioritizedRanking({ companyId, sortBy: "economia" }),
      caller.project.getPrioritizedRanking({ companyId, sortBy: "qualitativo" }),
      caller.project.getPrioritizedRanking({ companyId, sortBy: "combinado" }),
      caller.settings.getSettings(),
      caller.interview.list({ companyId }),
    ]);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Pipeline";
  pres.company = "Pipeline";
  pres.subject = `Diagnóstico de robotização — ${company.name}`;

  addCoverSlide(pres, company.name);
  addAreaSummarySlide(pres, areaSummary);
  addRankingSlide(pres, "Ranking por economia", rankingEconomia, "economia");
  addRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo");
  addRankingSlide(pres, "Ranking combinado", rankingCombinado, "combinado");
  addScheduleSlide(pres, rankingCombinado, settings.wave1StartDate);
  addPaybackSlide(pres, rankingCombinado, settings);
  // Entrevistas: se não houver nenhuma, o slide é pulado inteiramente (não
  // criamos um slide vazio nem lançamos erro — decisão explícita do Passo 8a).
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }

  // `nodebuffer` retorna um Buffer do Node nesta versão do pptxgenjs (4.x). A
  // assinatura declarada é um union amplo, por isso o cast explícito.
  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

function addCoverSlide(pres: PptxGenJS, companyName: string): void {
  const slide = pres.addSlide();
  slide.addText("Diagnóstico de robotização", {
    x: 0.6,
    y: 2.2,
    w: "90%",
    h: 1,
    fontSize: 36,
    bold: true,
    color: COLOR_PRIMARY,
  });
  slide.addText(companyName, {
    x: 0.6,
    y: 3.3,
    w: "90%",
    h: 0.8,
    fontSize: 24,
    color: COLOR_ACCENT,
  });
  slide.addText(formatDate(new Date()), {
    x: 0.6,
    y: 4.1,
    w: "90%",
    h: 0.6,
    fontSize: 16,
    color: COLOR_MUTED,
  });
}

function addAreaSummarySlide(pres: PptxGenJS, areaSummary: AreaSummary): void {
  const slide = addTitledSlide(pres, "Resultados agregados por área");

  if (areaSummary.length === 0) {
    slide.addText("Nenhum projeto com área definida para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Projetos", options: TABLE_HEADER_OPTS },
    { text: "Economia estimada (ano)", options: TABLE_HEADER_OPTS },
    { text: "Horas atuais (ano)", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = areaSummary.map((a) => [
    { text: a.areaName },
    { text: String(a.projectCount) },
    { text: formatCurrency(a.totalEstimatedSavingBRL) },
    { text: `${Math.round(a.totalCurrentAnnualHours)} h` },
  ]);

  const totals: TableRow = [
    { text: "Total", options: { bold: true } },
    {
      text: String(areaSummary.reduce((sum, a) => sum + a.projectCount, 0)),
      options: { bold: true },
    },
    {
      text: formatCurrency(areaSummary.reduce((sum, a) => sum + a.totalEstimatedSavingBRL, 0)),
      options: { bold: true },
    },
    {
      text: `${Math.round(areaSummary.reduce((sum, a) => sum + a.totalCurrentAnnualHours, 0))} h`,
      options: { bold: true },
    },
  ];

  addSlideTable(slide, [header, ...rows, totals], [4, 1.8, 3.5, 2.5]);
}

function activeScoreOf(row: Ranking[number], sortBy: "economia" | "qualitativo" | "combinado"): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  if (sortBy === "qualitativo") return Math.round(row.qualitativeScorePercent);
  return Math.round(row.combinedScore);
}

function addRankingSlide(
  pres: PptxGenJS,
  title: string,
  ranking: Ranking,
  sortBy: "economia" | "qualitativo" | "combinado"
): void {
  const slide = addTitledSlide(pres, title);

  if (ranking.length === 0) {
    slide.addText("Nenhum projeto encontrado para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "#", options: TABLE_HEADER_OPTS },
    { text: "Processo", options: TABLE_HEADER_OPTS },
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Economia (ano)", options: TABLE_HEADER_OPTS },
    { text: "Score", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = ranking.map((row, index) => [
    { text: String(index + 1) },
    { text: row.title },
    { text: row.areaName ?? "-" },
    {
      text: row.estimatedAnnualSavingBRL != null ? formatCurrency(row.estimatedAnnualSavingBRL) : "-",
    },
    { text: String(activeScoreOf(row, sortBy)) },
  ]);

  addSlideTable(slide, [header, ...rows], [0.6, 5, 2.9, 2.4, 1.3]);
}

/**
 * Separa os projetos por onda (1/2) e monta os dois cronogramas sequenciais,
 * replicando exatamente a lógica da página `admin/empresas/[id]/priorizacao`:
 * a onda 1 começa em `wave1StartDate`; a onda 2 começa no primeiro dia útil
 * após o fim da onda 1 (ondas sequenciais, não paralelas). Retorna os dois
 * schedules já calculados — reaproveitado pelos slides de cronograma e payback.
 */
function computeWaveSchedules(
  ranking: Ranking,
  wave1StartDateRaw: Date | null
): { wave1: WaveScheduleItem[]; wave2: WaveScheduleItem[]; startDate: Date } {
  // Se a data de início da onda 1 ainda não foi configurada em Configurações,
  // usa hoje como referência (mesma decisão da página de priorização).
  const wave1StartDate = wave1StartDateRaw ? new Date(wave1StartDateRaw) : new Date();

  const toInput = (rows: Ranking) =>
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      implementationEffortDays: row.implementationEffortDays,
      waveOrder: row.waveOrder,
    }));

  const wave1Projects = ranking.filter((row) => row.implementationWave === 1);
  const wave2Projects = ranking.filter((row) => row.implementationWave === 2);

  const wave1 = computeWaveSchedule(toInput(wave1Projects), wave1StartDate);

  const wave2StartDate =
    wave1.length === 0
      ? wave1StartDate
      : addBusinessDays(
          wave1.reduce((latest, item) => (item.endDate > latest ? item.endDate : latest), wave1[0].endDate),
          1
        );

  const wave2 = computeWaveSchedule(toInput(wave2Projects), wave2StartDate);

  return { wave1, wave2, startDate: wave1StartDate };
}

function addScheduleSlide(pres: PptxGenJS, ranking: Ranking, wave1StartDateRaw: Date | null): void {
  const slide = addTitledSlide(pres, "Cronograma de implementação");
  const { wave1, wave2 } = computeWaveSchedules(ranking, wave1StartDateRaw);

  const items = [
    ...wave1.map((item) => ({ wave: 1, item })),
    ...wave2.map((item) => ({ wave: 2, item })),
  ];

  if (items.length === 0) {
    slide.addText("Nenhum projeto atribuído a uma onda de implementação.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Onda", options: TABLE_HEADER_OPTS },
    { text: "Processo", options: TABLE_HEADER_OPTS },
    { text: "Início", options: TABLE_HEADER_OPTS },
    { text: "Fim", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = items.map(({ wave, item }) => [
    { text: `Onda ${wave}` },
    { text: item.title + (item.effortEstimated ? "" : " (esforço não estimado)") },
    { text: formatDate(item.startDate) },
    { text: formatDate(item.endDate) },
  ]);

  addSlideTable(slide, [header, ...rows], [1.4, 6.2, 2.3, 2.3]);
}

function addPaybackSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null }
): void {
  const slide = addTitledSlide(pres, "Payback / ROI acumulado");
  const { wave1, wave2, startDate } = computeWaveSchedules(ranking, settings.wave1StartDate);

  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );

  const paybackSchedule = [...wave1, ...wave2].map((item) => ({
    projectId: item.projectId,
    startDate: item.startDate,
    endDate: item.endDate,
    estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
  }));

  const dailyRate = settings.developerDailyRateBRL ?? 0;
  const curve = computePaybackCurve(paybackSchedule, dailyRate);
  const paybackDate = findPaybackDate(curve);

  const scheduleStartDate =
    paybackSchedule.length === 0
      ? startDate
      : new Date(Math.min(...paybackSchedule.map((item) => item.startDate.getTime())));

  const paybackMonths = paybackDate
    ? Math.max(0, Math.round(differenceInCalendarDays(paybackDate, scheduleStartDate) / 30.44))
    : null;

  const summaryText = paybackDate
    ? `Payback estimado em ${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
    : "Payback não atingido no período calculado";

  slide.addText(summaryText, {
    x: 0.5,
    y: 1.1,
    w: "90%",
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: COLOR_ACCENT,
  });

  if (curve.length === 0) {
    slide.addText(
      "Sem dados suficientes para calcular a curva de payback (nenhum projeto atribuído a uma onda).",
      { x: 0.5, y: 1.8, fontSize: 14, color: COLOR_MUTED }
    );
    return;
  }

  const labels = curve.map((p: PaybackPoint) => formatDate(p.date));
  const chartData = [
    {
      name: "Custo acumulado",
      labels,
      values: curve.map((p) => Math.round(p.cumulativeCost)),
    },
    {
      name: "Economia acumulada",
      labels,
      values: curve.map((p) => Math.round(p.cumulativeSaving)),
    },
  ];

  slide.addChart("line", chartData, {
    x: 0.5,
    y: 1.8,
    w: 12,
    h: 5,
    showLegend: true,
    legendPos: "b",
    lineDataSymbol: "none",
    chartColors: [COLOR_MUTED, COLOR_ACCENT],
  });
}

function addInterviewsSlide(pres: PptxGenJS, interviews: Interviews): void {
  const slide = addTitledSlide(pres, "Entrevistas");

  const header: TableRow = [
    { text: "Participante", options: TABLE_HEADER_OPTS },
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Data", options: TABLE_HEADER_OPTS },
    { text: "Status", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = interviews.map((interview) => [
    { text: interview.participantName },
    { text: interview.area?.name ?? "-" },
    { text: formatDate(new Date(interview.scheduledDate)) },
    { text: INTERVIEW_STATUS_LABEL[interview.status] ?? interview.status },
  ]);

  addSlideTable(slide, [header, ...rows], [4.5, 3.5, 2.5, 2]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addTitledSlide(pres: PptxGenJS, title: string): Slide {
  const slide = pres.addSlide();
  slide.addText(title, {
    x: 0.5,
    y: 0.3,
    w: "90%",
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: COLOR_PRIMARY,
  });
  return slide;
}

function addSlideTable(slide: Slide, rows: TableRow[], colW: number[]): void {
  slide.addTable(rows, {
    x: 0.5,
    y: 1.1,
    w: 12.3,
    colW,
    fontSize: 11,
    border: { type: "solid", pt: 1, color: COLOR_TABLE_BORDER },
    valign: "middle",
    autoPage: true,
    autoPageRepeatHeader: true,
  });
}
