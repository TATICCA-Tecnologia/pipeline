import PptxGenJS from "pptxgenjs";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { formatCurrency } from "@/shared/utils";
import {
  addCoverSlide,
  addTitledSlide,
  addSlideTable,
  addInterviewsSlide,
  addProjectSlide,
  COLOR_MUTED,
  TABLE_HEADER_OPTS,
  type Slide,
  type TableRow,
  type Interviews,
  type QuantitativeLine,
} from "./build-diagnostic-deck";

/**
 * Deck paralelo ao de diagnóstico (build-diagnostic-deck.ts), mas para a
 * população de automações já existentes/entregues (hasCurrentApplication="sim"
 * ou status DONE) — o inverso exato da população usada em getPrioritizedRanking.
 * Sem cronograma/payback/combinado: não se aplicam a algo já entregue.
 */

type ExistingAutomationsRanking = Awaited<
  ReturnType<ReturnType<typeof createCaller>["project"]["getExistingAutomationsRanking"]>
>;
type ExistingAutomationsAreaSummary = Awaited<
  ReturnType<ReturnType<typeof createCaller>["project"]["getExistingAutomationsAreaSummary"]>
>;

type ExistingAutomationDeckRow = {
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
  accumulatedSavingBRL: number | null;
  operationalStatus: "ACTIVE" | "PAUSED" | "ISSUE" | null;
};

const ROBOT_OPERATIONAL_STATUS_LABEL: Record<"ACTIVE" | "PAUSED" | "ISSUE", string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  ISSUE: "Com problema",
};

export async function buildExistingAutomationsDeck(
  companyId: string,
  actingUserId: string
): Promise<Buffer> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    throw new Error(`Empresa não encontrada (id: ${companyId}).`);
  }

  const ctx: Context = { db, userId: actingUserId, realUserId: actingUserId };
  const caller = createCaller(ctx);

  const [areaSummary, rankingEconomia, rankingQualitativo, interviews, projects] =
    await Promise.all([
      caller.project.getExistingAutomationsAreaSummary({ companyId }),
      caller.project.getExistingAutomationsRanking({ companyId, sortBy: "economia" }),
      caller.project.getExistingAutomationsRanking({ companyId, sortBy: "qualitativo" }),
      caller.interview.list({ companyId }),
      db.project.findMany({
        where: {
          companyId,
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
        },
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
          accumulatedSavingBRL: true,
          operationalStatus: true,
        },
      }),
    ]);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Pipeline";
  pres.company = "Pipeline";
  pres.subject = `Automações existentes — ${company.name}`;

  addCoverSlide(pres, company.name);
  addAreaSummarySlide(pres, areaSummary);
  addRankingSlide(pres, "Ranking por economia acumulada", rankingEconomia, "economia");
  addRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo");
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  for (const project of projects as ExistingAutomationDeckRow[]) {
    const extraLines: QuantitativeLine[] = [
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? ROBOT_OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : "Sem status",
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
            : "Não informado",
        isSaving: true,
      },
    ];
    addProjectSlide(pres, project, extraLines);
  }

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

function addAreaSummarySlide(pres: PptxGenJS, areaSummary: ExistingAutomationsAreaSummary): void {
  const slide = addTitledSlide(pres, "Resultados agregados por área — automações existentes");

  if (areaSummary.length === 0) {
    slide.addText("Nenhuma automação existente com área definida para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Automações", options: TABLE_HEADER_OPTS },
    { text: "Economia acumulada (real)", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = areaSummary.map((a) => [
    { text: a.areaName },
    { text: String(a.projectCount) },
    { text: formatCurrency(a.totalAccumulatedSavingBRL) },
  ]);

  const totals: TableRow = [
    { text: "Total", options: { bold: true } },
    {
      text: String(areaSummary.reduce((sum, a) => sum + a.projectCount, 0)),
      options: { bold: true },
    },
    {
      text: formatCurrency(areaSummary.reduce((sum, a) => sum + a.totalAccumulatedSavingBRL, 0)),
      options: { bold: true },
    },
  ];

  addSlideTable(slide, [header, ...rows, totals], [4, 2.5, 3.7]);
}

function activeScoreOf(
  row: ExistingAutomationsRanking[number],
  sortBy: "economia" | "qualitativo"
): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  return Math.round(row.qualitativeScorePercent);
}

function addRankingSlide(
  pres: PptxGenJS,
  title: string,
  ranking: ExistingAutomationsRanking,
  sortBy: "economia" | "qualitativo"
): void {
  const slide = addTitledSlide(pres, title);

  if (ranking.length === 0) {
    slide.addText("Nenhuma automação existente encontrada para esta empresa.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "#", options: TABLE_HEADER_OPTS },
    { text: "Automação", options: TABLE_HEADER_OPTS },
    { text: "Área", options: TABLE_HEADER_OPTS },
    { text: "Economia acumulada", options: TABLE_HEADER_OPTS },
    { text: "Score", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = ranking.map((row, index) => [
    { text: String(index + 1) },
    { text: row.title },
    { text: row.areaName ?? "-" },
    {
      text: row.accumulatedSavingBRL != null ? formatCurrency(row.accumulatedSavingBRL) : "-",
    },
    { text: String(activeScoreOf(row, sortBy)) },
  ]);

  addSlideTable(slide, [header, ...rows], [0.6, 5, 2.9, 2.4, 1.3]);
}
