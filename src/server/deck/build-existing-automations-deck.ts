import PptxGenJS from "pptxgenjs";
import type { RobotOperationalStatus } from "@prisma/client";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { formatCurrency, formatDate } from "@/shared/utils";
import {
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  resolveLabel,
  resolveCurrentApplicationHostingLabel,
} from "@/shared/constants/project-taxonomy";
import {
  addCoverSlide,
  addTitledSlide,
  addSlideTable,
  defineDeckTheme,
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

const ROBOT_OPERATIONAL_STATUS_LABEL: Record<RobotOperationalStatus, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  ISSUE: "Com problema",
};

type ExistingAutomationProject = {
  title: string;
  currentApplicationHosting: string | null;
  currentApplicationHostingCustom: string | null;
  currentApplicationAuthor: string | null;
  currentApplicationOwner: string | null;
  currentApplicationAccessLocation: string | null;
  currentApplicationLiveSince: Date | null;
};

// Sem valor nenhum, o deck mostra "-" em vez de célula vazia.
function hostingLabel(p: ExistingAutomationProject): string {
  return (
    resolveCurrentApplicationHostingLabel(
      p.currentApplicationHosting,
      p.currentApplicationHostingCustom
    ) ?? "-"
  );
}

function accessLabel(p: ExistingAutomationProject): string {
  return (
    resolveLabel(p.currentApplicationAccessLocation, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS) ??
    "-"
  );
}

function liveSinceLabel(p: ExistingAutomationProject): string {
  return p.currentApplicationLiveSince ? formatDate(p.currentApplicationLiveSince) : "-";
}

// Um projeto sem nenhum campo de ficha preenchido não entra no slide de
// inventário — uma tabela só de traços não informa nada.
// Checa seis campos, não sete: `currentApplicationAccessReference` é de
// propósito o único que nunca sai no deck (é texto livre apontando onde as
// credenciais moram), então não faz sentido usá-lo como critério de entrada
// numa tabela que não vai exibi-lo. É por isso que este predicado difere do
// homônimo em project-detail-sections.tsx, que inclui o sétimo campo.
function hasSustentacaoData(p: ExistingAutomationProject): boolean {
  return Boolean(
    p.currentApplicationHosting ||
      p.currentApplicationHostingCustom ||
      p.currentApplicationAuthor ||
      p.currentApplicationOwner ||
      p.currentApplicationAccessLocation ||
      p.currentApplicationLiveSince
  );
}

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
          // Subtítulo de área no slide de processo (ver addProjectSlide).
          area: { select: { name: true } },
          accumulatedSavingBRL: true,
          operationalStatus: true,
          currentApplicationHosting: true,
          currentApplicationHostingCustom: true,
          currentApplicationAuthor: true,
          currentApplicationOwner: true,
          currentApplicationAccessLocation: true,
          currentApplicationLiveSince: true,
        },
      }),
    ]);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "TATICCA";
  pres.company = "TATICCA";
  pres.subject = `Automações existentes — ${company.name}`;
  // Obrigatório antes de qualquer addCoverSlide/addTitledSlide: esses helpers
  // criam slides a partir dos masters definidos aqui. Sem esta chamada eles
  // referenciariam um master inexistente nesta apresentação.
  defineDeckTheme(pres, company.name, "Automações existentes");

  addCoverSlide(pres, company.name, "Automações existentes");
  addAreaSummarySlide(pres, areaSummary);
  addRankingSlide(pres, "Ranking por economia acumulada", rankingEconomia, "economia");
  addRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo");
  addInventorySlide(pres, projects);
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  for (const project of projects) {
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
      { label: "Onde roda", value: hostingLabel(project) },
      { label: "Quem desenvolveu", value: project.currentApplicationAuthor ?? "Não informado" },
      { label: "Responsável hoje", value: project.currentApplicationOwner ?? "Não informado" },
      { label: "Onde ficam os acessos", value: accessLabel(project) },
      { label: "Em produção desde", value: liveSinceLabel(project) },
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

// Slide de inventário técnico (Passo 7): uma linha por automação com ficha de
// sustentação preenchida — visão única para levar numa reunião com TI, sem
// precisar abrir slide por slide. Igual a `addRankingSlide`, a tabela cresce
// sem paginação/limite (autoPage do addSlideTable cobre a quebra de página).
function addInventorySlide(pres: PptxGenJS, projects: ExistingAutomationProject[]): void {
  const withData = projects.filter(hasSustentacaoData);
  const slide = addTitledSlide(pres, "Inventário técnico — sustentação e acessos");

  if (withData.length === 0) {
    slide.addText("Nenhuma automação existente com ficha de sustentação preenchida.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Automação", options: TABLE_HEADER_OPTS },
    { text: "Onde roda", options: TABLE_HEADER_OPTS },
    { text: "Quem fez", options: TABLE_HEADER_OPTS },
    { text: "Responsável", options: TABLE_HEADER_OPTS },
    { text: "Acessos", options: TABLE_HEADER_OPTS },
    { text: "Desde", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = withData.map((p) => [
    { text: p.title },
    { text: hostingLabel(p) },
    { text: p.currentApplicationAuthor ?? "-" },
    { text: p.currentApplicationOwner ?? "-" },
    { text: accessLabel(p) },
    { text: liveSinceLabel(p) },
  ]);

  addSlideTable(slide, [header, ...rows], [3.2, 2.2, 2, 2, 2, 1.2]);
}
