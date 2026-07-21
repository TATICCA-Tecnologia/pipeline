import fs from "node:fs";
import path from "node:path";
import { addBusinessDays, differenceInBusinessDays, differenceInCalendarDays } from "date-fns";
import PptxGenJS from "pptxgenjs";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { computeWaveSchedule, type WaveScheduleItem } from "@/shared/lib/wave-schedule";
import {
  computePaybackCurve,
  computeStructureCostAt,
  findPaybackDate,
  type PaybackPoint,
  type StructureCostItem,
} from "@/shared/lib/payback";
import {
  BENEFIT_OPTIONS,
  PROCESS_FREQUENCIES,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
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
export const COLOR_MUTED = "64748B"; // slate-500
const COLOR_HEADER_BG = "1E293B";
const COLOR_HEADER_TEXT = "FFFFFF";
const COLOR_TABLE_BORDER = "E2E8F0";

// Logo carregado uma única vez no module scope (não recarregado por slide).
// Se o arquivo não existir por algum motivo em produção, a capa é gerada sem
// logo — nunca falha o export inteiro por causa de um asset estático.
const LOGO_ASPECT_RATIO = 2500 / 981; // largura/altura original do PNG
const LOGO_DATA_URI: string | null = (() => {
  try {
    const buf = fs.readFileSync(
      path.join(process.cwd(), "public", "taticca-logo-horizontal.png")
    );
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

export const TABLE_HEADER_OPTS = {
  bold: true,
  color: COLOR_HEADER_TEXT,
  fill: { color: COLOR_HEADER_BG },
} as const;

type Ranking = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getPrioritizedRanking"]>>;
type AreaSummary = Awaited<ReturnType<ReturnType<typeof createCaller>["project"]["getAreaSummary"]>>;
export type Interviews = Awaited<ReturnType<ReturnType<typeof createCaller>["interview"]["list"]>>;

export type Slide = ReturnType<PptxGenJS["addSlide"]>;
export type TableRow = Parameters<Slide["addTable"]>[0][number];

const INTERVIEW_STATUS_LABEL: Record<string, string> = {
  realizado: "Realizado",
  agendado: "Agendado",
  cancelado: "Cancelado",
};

// Destaque teal do card React ("Principais ações da automação" e cabeçalhos da
// tabela quantitativa) — mantido aqui para que o slide por processo tenha o
// mesmo vocabulário visual do componente de referência.
const COLOR_TEAL = "0D9488"; // teal-600
const COLOR_TEAL_BG = "F0FDFA"; // teal-50
const COLOR_HIGHLIGHT_BG = "F8FAFC"; // slate-50 (caixa do architectNotes)
const COLOR_SAVING = "059669"; // emerald-600 (economia estimada)

// Eixos e fallback da avaliação qualitativa — MESMA config e MESMA regra do
// componente React `project-executive-slide.tsx` (RATING_AXES / DEFAULT_RATING).
// Uma nota null usa 3 como fallback, e o percentual é média/5*100 arredondado.
type RatingKey =
  | "ratingErrorReduction"
  | "ratingProcessCriticality"
  | "ratingInternalImpact"
  | "ratingExternalImpact"
  | "ratingCompliance";

const RATING_AXES: { key: RatingKey; label: string }[] = [
  { key: "ratingErrorReduction", label: "Redução de erros" },
  { key: "ratingProcessCriticality", label: "Criticidade" },
  { key: "ratingInternalImpact", label: "Impacto interno" },
  { key: "ratingExternalImpact", label: "Impacto externo" },
  { key: "ratingCompliance", label: "Políticas" },
];

const DEFAULT_RATING = 3;

/**
 * Campos de Project lidos pelo slide por processo. Selecionados explicitamente
 * numa ÚNICA `findMany` (ver `buildDiagnosticDeck`) — sem N+1: os dados de todos
 * os projetos vêm de uma só query, nunca uma por projeto.
 */
type ProjectDeckRow = {
  id: string;
  title: string;
  description: string | null;
  architectNotes: string | null;
  benefits: unknown;
  processFrequency: string | null;
  robotSchedule: string | null;
  peopleInvolved: number | null;
  taskDurationHours: number | null;
  currentAnnualHours: number | null;
  monthlyHoursSaved: number | null;
  ratingErrorReduction: number | null;
  ratingProcessCriticality: number | null;
  ratingInternalImpact: number | null;
  ratingExternalImpact: number | null;
  ratingCompliance: number | null;
};

/**
 * Gera o buffer (.pptx) do deck consolidado de diagnóstico de uma empresa.
 *
 * `actingUserId`: id do admin já autenticado/verificado pelo chamador (a rota
 * `/api/empresas/[id]/deck` já leu `x-user-id` e confirmou role ADMIN/SUPER_ADMIN
 * antes de chegar aqui) — usado diretamente para montar o Context do caller,
 * sem repetir nenhuma query. Não fazemos `findFirst` por um admin arbitrário
 * aqui: a identidade que already passou pela checagem de autorização é a que
 * deve ser usada, tanto por consistência de auditoria (ActivityLog, se algum
 * procedure futuro vier a gravar um) quanto para não mascarar quem gerou o export.
 *
 * Lança um erro claro se a empresa não existir.
 */
export async function buildDiagnosticDeck(companyId: string, actingUserId: string): Promise<Buffer> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    throw new Error(`Empresa não encontrada (id: ${companyId}).`);
  }

  const ctx: Context = { db, userId: actingUserId, realUserId: actingUserId };
  const caller = createCaller(ctx);

  const [
    areaSummary,
    rankingEconomia,
    rankingQualitativo,
    rankingCombinado,
    settings,
    interviews,
    projects,
    costItems,
  ] = await Promise.all([
    caller.project.getAreaSummary({ companyId }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "economia" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "qualitativo" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "combinado" }),
    caller.settings.getSettings(),
    caller.interview.list({ companyId }),
    // Slide por processo (Passo 8b): TODOS os projetos da empresa numa ÚNICA
    // query (sem N+1). Ordem determinística por createdAt asc (empate por id)
    // para que o mesmo deck saia sempre na mesma sequência.
    // NOTA DE PERFORMANCE: um deck com dezenas de projetos gera um slide (com
    // tabela + radar chart) por projeto; para empresas muito grandes isso pode
    // se aproximar do timeout de função serverless. Não é resolvível/testável
    // sem ambiente de produção neste passo — apenas registrado como preocupação
    // conhecida caso vire um problema real (ex.: paginar/limitar o export).
    db.project.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        architectNotes: true,
        benefits: true,
        processFrequency: true,
        robotSchedule: true,
        peopleInvolved: true,
        taskDurationHours: true,
        currentAnnualHours: true,
        monthlyHoursSaved: true,
        ratingErrorReduction: true,
        ratingProcessCriticality: true,
        ratingInternalImpact: true,
        ratingExternalImpact: true,
        ratingCompliance: true,
      },
    }),
    caller.company.listCostItems({ companyId }),
  ]);

  const structureCosts: StructureCostItem[] = costItems.map((item) => ({
    type: item.type as "recorrente" | "pontual",
    amountBRL: item.amountBRL,
    startDate: item.startDate,
    endDate: item.endDate,
  }));

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
  addPaybackSlide(pres, rankingCombinado, settings, structureCosts);
  addPaybackCompositionSlide(pres, rankingCombinado, settings, structureCosts);
  // Entrevistas: se não houver nenhuma, o slide é pulado inteiramente (não
  // criamos um slide vazio nem lançamos erro — decisão explícita do Passo 8a).
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  // Um slide por processo, na ordem determinística já definida na query.
  for (const project of projects) {
    addProjectSlide(pres, project);
  }

  // `nodebuffer` retorna um Buffer do Node nesta versão do pptxgenjs (4.x). A
  // assinatura declarada é um union amplo, por isso o cast explícito.
  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

export function addCoverSlide(pres: PptxGenJS, companyName: string): void {
  const slide = pres.addSlide();
  if (LOGO_DATA_URI) {
    const width = 2.8;
    slide.addImage({
      data: LOGO_DATA_URI,
      x: 0.6,
      y: 0.6,
      w: width,
      h: width / LOGO_ASPECT_RATIO,
    });
  }
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
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null },
  structureCosts: StructureCostItem[]
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
  const curve = computePaybackCurve(paybackSchedule, dailyRate, structureCosts);
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

// Uma linha por robô com os números que alimentam a curva do slide anterior
// (mesma tabela "Composição do cálculo" da aba Payback em /admin/empresas/
// [id]/priorizacao) — autoPage/autoPageRepeatHeader de addSlideTable cobre
// decks com muitos robôs sem estourar o slide.
function addPaybackCompositionSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null },
  structureCosts: StructureCostItem[]
): void {
  const { wave1, wave2 } = computeWaveSchedules(ranking, settings.wave1StartDate);
  const withWave = [
    ...wave1.map((item) => ({ ...item, wave: 1 as const })),
    ...wave2.map((item) => ({ ...item, wave: 2 as const })),
  ];

  if (withWave.length === 0) return;

  const slide = addTitledSlide(pres, "Composição do payback");
  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );
  const dailyRate = settings.developerDailyRateBRL ?? 0;
  const structureCostToDate = computeStructureCostAt(structureCosts, new Date());

  const header: TableRow = [
    { text: "Processo", options: TABLE_HEADER_OPTS },
    { text: "Onda", options: TABLE_HEADER_OPTS },
    { text: "Entrega", options: TABLE_HEADER_OPTS },
    { text: "Dias úteis", options: TABLE_HEADER_OPTS },
    { text: "Custo de dev.", options: TABLE_HEADER_OPTS },
    { text: "Economia/mês", options: TABLE_HEADER_OPTS },
    { text: "Economia/ano", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = withWave.map((item) => {
    const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
    const developmentCostBRL = businessDays * dailyRate;
    const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
    return [
      { text: item.title },
      { text: `Onda ${item.wave}` },
      { text: formatDate(item.endDate) },
      { text: String(businessDays) },
      { text: formatCurrency(developmentCostBRL) },
      { text: formatCurrency(annualSavingBRL / 12) },
      { text: formatCurrency(annualSavingBRL) },
    ];
  });

  if (structureCostToDate > 0) {
    rows.push([
      { text: "Estrutura (pessoas/licenças) acumulada até hoje", options: { colspan: 5 } },
      { text: formatCurrency(structureCostToDate) },
      { text: "" },
    ]);
  }

  addSlideTable(slide, [header, ...rows], [4.1, 1.1, 1.5, 1.1, 1.6, 1.5, 1.4]);
}

export function addInterviewsSlide(pres: PptxGenJS, interviews: Interviews): void {
  const slide = addTitledSlide(pres, "Entrevistas");

  const header: TableRow = [
    { text: "Participante", options: TABLE_HEADER_OPTS },
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Data", options: TABLE_HEADER_OPTS },
    { text: "Status", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = interviews.map((interview) => [
    { text: interview.participants.map((p) => p.person.name).join(", ") },
    { text: interview.area?.name ?? "-" },
    { text: formatDate(new Date(interview.scheduledDate)) },
    { text: INTERVIEW_STATUS_LABEL[interview.status] ?? interview.status },
  ]);

  addSlideTable(slide, [header, ...rows], [4.5, 3.5, 2.5, 2]);
}

// ---------------------------------------------------------------------------
// Slide por processo (Passo 8b) — "tradução" do card React
// `src/shared/components/project-executive-slide.tsx` para as primitivas
// nativas do pptxgenjs (texto + tabela + radar chart), reutilizando EXATAMENTE
// os mesmos campos, rótulos e fórmulas do componente de referência. Nenhum
// texto novo é gerado: só os campos já preenchidos são reaproveitados.
// ---------------------------------------------------------------------------

// Igual ao `NOT_QUANTIFIED_LABEL` do componente React: Colaboradores/Duração vêm
// da entrevista e uma lacuna aqui NÃO some da tabela — mostra rótulo neutro.
const NOT_QUANTIFIED_LABEL = "Não quantificado nesta reunião";

// Réplica de `roundHours` do componente React (evita floats longos ao converter
// horas anuais em mensais; usa vírgula decimal, pt-BR).
function roundHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString().replace(".", ",");
}

// Extrai as chaves de benefícios do campo Json de forma segura (mesma leitura
// que o componente React faz sobre `project.benefits`, que é `string[]`).
function benefitKeysOf(benefits: unknown): string[] {
  if (!Array.isArray(benefits)) return [];
  return benefits.filter((b): b is string => typeof b === "string");
}

export type QuantitativeLine = { label: string; value: string; isGap?: boolean; isSaving?: boolean };

// Monta as linhas da tabela quantitativa com a MESMA regra do componente React:
// linhas com valor null/vazio são puladas (buildLabeledLines), EXCETO
// Colaboradores/Duração, que sempre aparecem (com rótulo neutro quando ausentes).
function buildQuantitativeLines(project: ProjectDeckRow): QuantitativeLine[] {
  const lines: QuantitativeLine[] = [];

  const periodicidade = resolveLabel(project.processFrequency, PROCESS_FREQUENCIES);
  if (periodicidade) lines.push({ label: "Periodicidade do processo", value: periodicidade });
  if (project.robotSchedule) lines.push({ label: "Rodagem do bot", value: project.robotSchedule });

  lines.push({
    label: "Colaboradores",
    value: project.peopleInvolved != null ? String(project.peopleInvolved) : NOT_QUANTIFIED_LABEL,
    isGap: project.peopleInvolved == null,
  });
  lines.push({
    label: "Duração por execução",
    value: project.taskDurationHours != null ? `${project.taskDurationHours}h` : NOT_QUANTIFIED_LABEL,
    isGap: project.taskDurationHours == null,
  });

  if (project.currentAnnualHours != null) {
    lines.push({ label: "Horas anuais", value: `${project.currentAnnualHours}h` });
    lines.push({
      label: "Horas totais gastas por mês",
      value: `${roundHours(project.currentAnnualHours / 12)}h`,
    });
  }

  if (project.monthlyHoursSaved != null) {
    lines.push({
      label: "Economia estimada",
      value: `${project.monthlyHoursSaved}h/mês`,
      isSaving: true,
    });
  }

  return lines;
}

// Layout do bloco direito (tabela quantitativa + header/radar qualitativo).
// A tabela usa linhas de altura automática (sem `autoPage`, sem tamanho fixo),
// então o header/radar abaixo dela precisam ser posicionados dinamicamente —
// caso contrário, um projeto com as 7 linhas preenchidas (ou um valor longo,
// como `robotSchedule` livre ou o fallback "Não quantificado nesta reunião",
// que pode quebrar em 2 linhas dentro da coluna de 3.2") faz a tabela crescer
// além da posição fixa onde o header/radar estavam, colidindo visualmente.
// `estimateQuantTableHeight` é uma estimativa conservadora (superestima) da
// altura renderizada, usada só para posicionar os elementos abaixo — não
// precisa ser exata, só nunca subestimar.
const RIGHT_TABLE_TOP_Y = 1.45;
const ROW_BASE_HEIGHT_IN = 0.34; // altura de uma linha de 1 linha de texto (fontSize 10, valign middle)
const ROW_WRAP_EXTRA_IN = 0.24; // altura adicional por linha extra de quebra
const CHARS_PER_LINE_AT_10PT = 34; // heurística conservadora p/ coluna de valor (~3.2")
const RADAR_HEADER_GAP_IN = 0.35; // espaço entre o fim da tabela e o header qualitativo
const QUALITATIVE_HEADER_MIN_Y = 4.55; // posição original (piso) quando a tabela é curta
const QUALITATIVE_HEADER_TO_RADAR_GAP_IN = 0.4;
const RADAR_CHART_DEFAULT_H = 2.3;
const RADAR_CHART_MIN_H = 1.5; // nunca encolhe o radar abaixo disso (ilegível)
const SLIDE_CONTENT_BOTTOM_Y = 7.3; // LAYOUT_WIDE tem 7.5" de altura; margem de 0.2"

function estimateWrappedLines(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estimateQuantTableHeight(lines: QuantitativeLine[]): number {
  return lines.reduce((total, line) => {
    // Label e valor podem quebrar independentemente (colunas de larguras
    // diferentes) — usa o maior número de linhas entre os dois.
    const labelLines = estimateWrappedLines(line.label, CHARS_PER_LINE_AT_10PT);
    const valueLines = estimateWrappedLines(line.value, CHARS_PER_LINE_AT_10PT);
    const wrappedLines = Math.max(labelLines, valueLines);
    return total + ROW_BASE_HEIGHT_IN + (wrappedLines - 1) * ROW_WRAP_EXTRA_IN;
  }, 0);
}

function addSectionLabel(slide: Slide, text: string, x: number, y: number, w: number): void {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.3,
    fontSize: 10,
    bold: true,
    color: COLOR_PRIMARY,
    charSpacing: 1,
  });
}

export function addProjectSlide(
  pres: PptxGenJS,
  project: ProjectDeckRow,
  extraQuantitativeLines: QuantitativeLine[] = []
): void {
  const slide = addTitledSlide(pres, project.title);

  // ----- Coluna esquerda: textos (só campos já preenchidos) -----
  const leftX = 0.5;
  const leftW = 6.2;
  let leftY = 1.1;

  if (project.description) {
    addSectionLabel(slide, "O processo hoje", leftX, leftY, leftW);
    slide.addText(project.description, {
      x: leftX,
      y: leftY + 0.32,
      w: leftW,
      h: 1.9,
      fontSize: 11,
      color: COLOR_PRIMARY,
      valign: "top",
      fit: "shrink",
    });
    leftY += 2.35;
  }

  if (project.architectNotes) {
    const boxH = 1.7;
    // Borda teal à esquerda (rect fino) + caixa de fundo slate, replicando o
    // destaque `border-l-4 border-teal-500 bg-slate-50` do card React.
    slide.addShape("rect", {
      x: leftX,
      y: leftY,
      w: 0.06,
      h: boxH,
      fill: { color: COLOR_TEAL },
    });
    slide.addText(
      [
        {
          text: "Principais ações da automação",
          options: { bold: true, fontSize: 9, color: COLOR_PRIMARY, charSpacing: 1, breakLine: true },
        },
        { text: project.architectNotes, options: { fontSize: 11, color: COLOR_PRIMARY } },
      ],
      {
        x: leftX + 0.06,
        y: leftY,
        w: leftW - 0.06,
        h: boxH,
        fill: { color: COLOR_HIGHLIGHT_BG },
        valign: "top",
        margin: 6,
        fit: "shrink",
      }
    );
    leftY += boxH + 0.25;
  }

  const benefitLabels = benefitKeysOf(project.benefits).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );
  if (benefitLabels.length > 0) {
    addSectionLabel(slide, "Benefícios esperados", leftX, leftY, leftW);
    slide.addText(benefitLabels.join(" · "), {
      x: leftX,
      y: leftY + 0.32,
      w: leftW,
      h: 1.3,
      fontSize: 11,
      color: COLOR_PRIMARY,
      valign: "top",
      fit: "shrink",
    });
  }

  // ----- Coluna direita: tabela quantitativa + radar qualitativo -----
  const rightX = 7.0;
  const rightW = 5.8;

  const quantitativeLines = [...buildQuantitativeLines(project), ...extraQuantitativeLines];
  addSectionLabel(slide, "Avaliação Quantitativa", rightX, 1.1, rightW);

  if (quantitativeLines.length > 0) {
    const rows: TableRow[] = quantitativeLines.map((line) => [
      {
        text: line.label,
        options: { bold: true, color: COLOR_TEAL, fill: { color: COLOR_TEAL_BG } },
      },
      {
        text: line.value,
        options: {
          color: line.isSaving ? COLOR_SAVING : line.isGap ? COLOR_MUTED : COLOR_PRIMARY,
          italic: line.isGap,
          bold: line.isSaving,
        },
      },
    ]);
    slide.addTable(rows, {
      x: rightX,
      y: RIGHT_TABLE_TOP_Y,
      w: rightW,
      colW: [2.6, rightW - 2.6],
      fontSize: 10,
      border: { type: "solid", pt: 1, color: COLOR_TABLE_BORDER },
      valign: "middle",
    });
  }

  // Header/radar qualitativos são posicionados ABAIXO do fim estimado da
  // tabela (nunca numa posição fixa) — ver comentário de
  // `estimateQuantTableHeight` acima sobre por que isso é necessário.
  const estimatedTableBottomY =
    quantitativeLines.length > 0
      ? RIGHT_TABLE_TOP_Y + estimateQuantTableHeight(quantitativeLines)
      : RIGHT_TABLE_TOP_Y;
  const qualitativeHeaderY = Math.max(
    QUALITATIVE_HEADER_MIN_Y,
    estimatedTableBottomY + RADAR_HEADER_GAP_IN
  );
  const radarY = qualitativeHeaderY + QUALITATIVE_HEADER_TO_RADAR_GAP_IN;
  // Se a tabela estimada for tão alta que empurra o radar perto do fim do
  // slide, encolhe a altura do radar (nunca abaixo de RADAR_CHART_MIN_H) em
  // vez de deixá-lo estourar a página.
  const radarH = Math.max(
    RADAR_CHART_MIN_H,
    Math.min(RADAR_CHART_DEFAULT_H, SLIDE_CONTENT_BOTTOM_Y - radarY)
  );

  // Radar: 5 eixos = os 5 critérios, com DEFAULT_RATING=3 de fallback (mesma
  // regra do componente React). ratingPercent = média/5*100 arredondado.
  const ratingValues = RATING_AXES.map((axis) => project[axis.key] ?? DEFAULT_RATING);
  const ratingAverage = ratingValues.reduce((sum, v) => sum + v, 0) / ratingValues.length;
  const ratingPercent = Math.round((ratingAverage / 5) * 100);
  const ratingAverageLabel = ratingAverage.toFixed(1).replace(".", ",");

  slide.addText(
    [
      { text: "AVALIAÇÃO QUALITATIVA   ", options: { bold: true, fontSize: 10, color: COLOR_PRIMARY, charSpacing: 1 } },
      { text: `${ratingPercent}% (${ratingAverageLabel})`, options: { bold: true, fontSize: 14, color: COLOR_TEAL } },
    ],
    { x: rightX, y: qualitativeHeaderY, w: rightW, h: 0.4, valign: "middle" }
  );

  slide.addChart(
    "radar",
    [
      {
        name: "Avaliação qualitativa",
        labels: RATING_AXES.map((axis) => axis.label),
        values: ratingValues,
      },
    ],
    {
      x: rightX,
      y: radarY,
      w: rightW,
      h: radarH,
      radarStyle: "filled",
      showLegend: false,
      showTitle: false,
      chartColors: ["4F46E5"],
      chartColorsOpacity: 32,
      catAxisLabelColor: COLOR_PRIMARY,
      catAxisLabelFontSize: 9,
      valAxisMinVal: 0,
      valAxisMaxVal: 5,
      valAxisHidden: true,
    }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function addTitledSlide(pres: PptxGenJS, title: string): Slide {
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

export function addSlideTable(slide: Slide, rows: TableRow[], colW: number[]): void {
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
