import PptxGenJS from "pptxgenjs";
import type { RobotOperationalStatus } from "@prisma/client";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { formatCurrency, formatDate } from "@/shared/utils";
import {
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  resolveLabel,
  resolveCurrentApplicationHostingLabel,
  resolveDataEndpointLabel,
  resolveAccountTypeLabel,
  resolveSensitiveDataAnswerLabel,
  resolveKeyLabels,
} from "@/shared/constants/project-taxonomy";
import {
  addCoverSlide,
  addTitledSlide,
  addSlideTable,
  defineDeckTheme,
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_SECONDARY,
  COLOR_TABLE_BORDER,
  TYPE,
  MARGIN_X,
  CONTENT_W,
  CONTENT_TOP_Y_TALL_TITLE,
  TABLE_HEADER_OPTS,
  type Slide,
  type TableRow,
} from "./deck-theme";
import {
  addInterviewsSlide,
  addProjectSlide,
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

// Formato cru devolvido pelo `select` de targetSystems/automationAccounts
// abaixo — deliberadamente mais enxuto que TargetSystemRow/AutomationAccountRow
// de project.router.ts (sem id/order/accessNotes: o slide não precisa de
// chave React nem exibe "como acessar", só "onde é acessado").
export type FichaTargetSystemRow = {
  customName: string | null;
  accessPoint: string | null;
  targetSystem: { name: string; category: { name: string } | null } | null;
};

export type FichaAutomationAccountRow = {
  username: string;
  accountType: string | null;
  projectTargetSystem: {
    customName: string | null;
    targetSystem: { name: string } | null;
  } | null;
};

// Exportado para scripts/preview-ficha-tecnica-slide.ts poder tipar seus
// projetos fixos com o mesmo formato que `addFichaTecnicaSlide` espera.
export type ExistingAutomationProject = {
  title: string;
  currentApplicationHosting: string | null;
  currentApplicationHostingCustom: string | null;
  currentApplicationAuthor: string | null;
  currentApplicationOwner: string | null;
  currentApplicationAccessLocation: string | null;
  currentApplicationLiveSince: Date | null;
  currentApplicationAssetId: string | null;
  currentApplicationOwnerRole: string | null;
  ownerArea: { name: string } | null;
  currentApplicationDataInput: string | null;
  currentApplicationDataInputDetails: string | null;
  currentApplicationDataOutput: string | null;
  currentApplicationDataOutputDetails: string | null;
  currentApplicationContingencyActions: unknown;
  currentApplicationContingencyDetails: string | null;
  currentApplicationBackupOwner: string | null;
  handlesSensitiveData: string | null;
  sensitiveDataCategories: unknown;
  sensitiveDataDetails: string | null;
  targetSystems: FichaTargetSystemRow[];
  automationAccounts: FichaAutomationAccountRow[];
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

// Guard do slide de ficha técnica (Passo 13). Checa só os campos NOVOS desta
// task + as duas listas — de propósito NÃO repete os campos de
// hasSustentacaoData (hosting/author/owner/accessLocation/liveSince): esses já
// aparecem no slide de processo (extraLines) e no inventário, então um projeto
// que só tem ESSES preenchidos não ganha ficha técnica própria, que seria
// majoritariamente "Não informado".
// Exportada (junto com `addFichaTecnicaSlide` mais abaixo) para
// scripts/preview-ficha-tecnica-slide.ts poder gerar o slide com dados fixos
// sem duplicar esta regra.
export function hasFichaTecnicaData(p: ExistingAutomationProject): boolean {
  return Boolean(
    p.currentApplicationAssetId ||
      p.currentApplicationOwnerRole ||
      p.ownerArea?.name ||
      p.currentApplicationDataInput ||
      p.currentApplicationDataInputDetails ||
      p.currentApplicationDataOutput ||
      p.currentApplicationDataOutputDetails ||
      (Array.isArray(p.currentApplicationContingencyActions) &&
        p.currentApplicationContingencyActions.length > 0) ||
      p.currentApplicationContingencyDetails ||
      p.currentApplicationBackupOwner ||
      p.handlesSensitiveData ||
      (Array.isArray(p.sensitiveDataCategories) && p.sensitiveDataCategories.length > 0) ||
      p.sensitiveDataDetails ||
      p.targetSystems.length > 0 ||
      p.automationAccounts.length > 0
  );
}

// Nome resolvível de um sistema-alvo: catálogo (targetSystem.name) ou texto
// livre (customName) quando fora do catálogo — mesma regra de
// mapTargetSystemsForView em project.router.ts. Linha sem nenhum dos dois é
// descartada (dado inconsistente, não deveria existir via formulário).
function targetSystemName(s: FichaTargetSystemRow): string | null {
  return s.targetSystem?.name || s.customName || null;
}

function accountSystemName(a: FichaAutomationAccountRow): string | null {
  return a.projectTargetSystem?.targetSystem?.name ?? a.projectTargetSystem?.customName ?? null;
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
          // Campos novos da ficha técnica (Passo 13).
          currentApplicationAssetId: true,
          currentApplicationOwnerRole: true,
          ownerArea: { select: { name: true } },
          currentApplicationDataInput: true,
          currentApplicationDataInputDetails: true,
          currentApplicationDataOutput: true,
          currentApplicationDataOutputDetails: true,
          currentApplicationContingencyActions: true,
          currentApplicationContingencyDetails: true,
          currentApplicationBackupOwner: true,
          handlesSensitiveData: true,
          sensitiveDataCategories: true,
          sensitiveDataDetails: true,
          // Mesma forma de select que project.router.ts (byId) usa — ver
          // TargetSystemRow/AutomationAccountRow lá.
          targetSystems: {
            orderBy: { order: "asc" },
            select: {
              customName: true,
              accessPoint: true,
              targetSystem: { select: { name: true, category: { select: { name: true } } } },
            },
          },
          automationAccounts: {
            orderBy: { order: "asc" },
            select: {
              username: true,
              accountType: true,
              projectTargetSystem: {
                select: { customName: true, targetSystem: { select: { name: true } } },
              },
            },
          },
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
    // Sem nenhum campo novo, o slide seria uma página de "Não informado" —
    // deck de empresa que ainda não fez o levantamento não deve carregá-la.
    if (hasFichaTecnicaData(project)) {
      addFichaTecnicaSlide(pres, project);
    }
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

// Rótulo de bloco (caixa alta, espaçado, cor de acento) — mesmo estilo visual
// de `addSectionLabel` em build-diagnostic-deck.ts. Não importado de lá porque
// não é exportado (função privada daquele módulo); reescrever aqui é mais
// simples do que abrir uma exportação só para isto.
function addFichaBlockLabel(slide: Slide, text: string, x: number, y: number, w: number): void {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.3,
    fontSize: TYPE.eyebrow,
    bold: true,
    color: COLOR_ACCENT,
    charSpacing: 1.5,
  });
}

// Limites de linhas exibidas nas duas listas. Um deck circula na frente do
// cliente: uma tabela que cresce sem controle dentro de um bloco de altura
// fixa (ao contrário das tabelas de página inteira, que usam autoPage) vazaria
// sobre o bloco vizinho sem erro nenhum. Em vez disso, corta e avisa quantos
// itens ficaram de fora — nunca vaza, nunca finge que a lista acabou.
const FICHA_MAX_SYSTEMS_SHOWN = 6;
const FICHA_MAX_ACCOUNTS_SHOWN = 5;

// Geometria do slide de ficha técnica (Passo 13). Cinco blocos em três linhas:
// [Hospedagem | Sistemas] / [Fluxo de dados] / [Sustentação | Contas]. Valores
// fixos (não calculados a partir do conteúdo, ao contrário da tabela
// quantitativa do slide de processo) porque aqui o conteúdo é sempre truncado
// a um número máximo de linhas (ver FICHA_MAX_*_SHOWN acima) — a altura
// necessária tem teto conhecido, então não precisa ser estimada dinamicamente.
const FICHA_LEFT_X = MARGIN_X;
const FICHA_LEFT_W = 4.3;
const FICHA_COL_GAP = 0.3;
const FICHA_RIGHT_X = FICHA_LEFT_X + FICHA_LEFT_W + FICHA_COL_GAP;
const FICHA_RIGHT_W = CONTENT_W - FICHA_LEFT_W - FICHA_COL_GAP;
const FICHA_ROW_GAP = 0.15;
const FICHA_ROW1_H = 2.05; // Hospedagem / Sistemas em que atua (até 6 linhas + aviso de corte)
const FICHA_ROW2_H = 0.95; // Fluxo de dados (2 linhas fixas: entrada/saída)
const FICHA_ROW3_H = 2.13; // Sustentação / Contas utilizadas (até 5 linhas + aviso de corte)
const FICHA_ROW1_Y = CONTENT_TOP_Y_TALL_TITLE;
const FICHA_ROW2_Y = FICHA_ROW1_Y + FICHA_ROW1_H + FICHA_ROW_GAP;
const FICHA_ROW3_Y = FICHA_ROW2_Y + FICHA_ROW2_H + FICHA_ROW_GAP;
// Fecha em 6.85": a régua do rodapé do master fica em 6.92", então isto deixa
// ~0.07" de folga — suficiente porque o conteúdo de cada bloco tem teto
// conhecido (ver comentário acima), não estimado.

// Fábrica (não constante) porque o tipo de `border` do pptxgenjs exige uma
// tupla mutável de 4 elementos — um array widened (ou `as const`, que gera
// tupla `readonly`) não bate com essa assinatura.
function fichaTableBorder(): [
  PptxGenJS.BorderProps,
  PptxGenJS.BorderProps,
  PptxGenJS.BorderProps,
  PptxGenJS.BorderProps,
] {
  return [
    { type: "none" },
    { type: "none" },
    { type: "solid", pt: 0.75, color: COLOR_TABLE_BORDER },
    { type: "none" },
  ];
}

// Chars por polegada de coluna, no corpo de tabela (9-10pt Segoe UI) — mesma
// ordem de grandeza conservadora que `CHARS_PER_LINE_AT_10PT` usa em
// build-diagnostic-deck.ts (34 chars numa coluna de 3.2", ≈10,6/pol).
// Por que isto existe: pptxgenjs grava toda linha de tabela como `<a:tr h="0">`
// — a altura real é recalculada pelo PowerPoint ao abrir o arquivo, a partir
// do texto de cada célula, e NÃO do valor fixo que este módulo reserva pro
// bloco. Um `accessPoint`/detalhe de texto livre longo o bastante pra quebrar
// linha faz a linha crescer além do espaço reservado e sobrepor o bloco
// abaixo, sem erro nenhum. Truncar aqui garante 1 linha por célula, então a
// altura da tabela nunca passa do estimado — troca "pode vazar" por "corta e
// avisa" (reticência = truncou; ver também "+N adicionais" para linhas
// inteiras cortadas).
const FICHA_TABLE_CHARS_PER_INCH = 10;

function fichaTruncate(text: string, colWidthIn: number): string {
  const maxChars = Math.max(8, Math.floor(colWidthIn * FICHA_TABLE_CHARS_PER_INCH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export function addFichaTecnicaSlide(pres: PptxGenJS, project: ExistingAutomationProject): void {
  // `tag` identifica este como o SEGUNDO slide da mesma solução (o primeiro
  // usa a área como tag) — sem ele, alguém folheando o deck veria dois slides
  // seguidos com o mesmo título e nenhuma pista do que os distingue.
  const slide = addTitledSlide(pres, project.title, undefined, "Ficha técnica", true);

  // ----- Linha 1: Hospedagem | Sistemas em que atua -----
  addFichaBlockLabel(slide, "Hospedagem", FICHA_LEFT_X, FICHA_ROW1_Y, FICHA_LEFT_W);
  slide.addText(
    [
      {
        text: hostingLabel(project),
        options: { bold: true, fontSize: 13, color: COLOR_PRIMARY, breakLine: true },
      },
      {
        text: `Ativo: ${project.currentApplicationAssetId ?? "Não informado"}`,
        options: { fontSize: 10, color: COLOR_SECONDARY, breakLine: true },
      },
      {
        text: `Em produção desde ${liveSinceLabel(project)}`,
        options: { fontSize: 10, color: COLOR_MUTED },
      },
    ],
    {
      x: FICHA_LEFT_X,
      y: FICHA_ROW1_Y + 0.32,
      w: FICHA_LEFT_W,
      h: FICHA_ROW1_H - 0.32,
      valign: "top",
      fit: "shrink",
      lineSpacingMultiple: 1.3,
    }
  );

  addFichaBlockLabel(slide, "Sistemas em que atua", FICHA_RIGHT_X, FICHA_ROW1_Y, FICHA_RIGHT_W);
  const systemsTableY = FICHA_ROW1_Y + 0.32;
  if (project.targetSystems.length === 0) {
    slide.addText("Nenhum sistema cadastrado.", {
      x: FICHA_RIGHT_X,
      y: systemsTableY,
      w: FICHA_RIGHT_W,
      h: 0.3,
      fontSize: 10,
      italic: true,
      color: COLOR_MUTED,
    });
  } else {
    const shown = project.targetSystems.slice(0, FICHA_MAX_SYSTEMS_SHOWN);
    const hiddenCount = project.targetSystems.length - shown.length;
    const systemsColW: [number, number, number] = [1.9, 1.6, FICHA_RIGHT_W - 1.9 - 1.6];
    const rows: TableRow[] = shown.map((s) => [
      { text: fichaTruncate(targetSystemName(s) ?? "-", systemsColW[0]) },
      { text: fichaTruncate(s.targetSystem?.category?.name ?? "-", systemsColW[1]) },
      { text: fichaTruncate(s.accessPoint ?? "Não informado", systemsColW[2]) },
    ]);
    if (hiddenCount > 0) {
      rows.push([
        {
          text: `+ ${hiddenCount} sistema${hiddenCount > 1 ? "s" : ""} ${hiddenCount > 1 ? "adicionais" : "adicional"} cadastrado${hiddenCount > 1 ? "s" : ""}`,
          options: { colspan: 3, italic: true, color: COLOR_MUTED },
        },
      ]);
    }
    slide.addTable(rows, {
      x: FICHA_RIGHT_X,
      y: systemsTableY,
      w: FICHA_RIGHT_W,
      colW: systemsColW,
      fontSize: 9,
      color: COLOR_PRIMARY,
      border: fichaTableBorder(),
      valign: "middle",
      margin: [0.03, 0.06, 0.03, 0.06],
      autoPage: false,
    });
  }

  // ----- Linha 2: Fluxo de dados (largura inteira) -----
  addFichaBlockLabel(slide, "Fluxo de dados", FICHA_LEFT_X, FICHA_ROW2_Y, CONTENT_W);
  const dataFlowColW: [number, number, number] = [1.3, 1.9, CONTENT_W - 1.3 - 1.9];
  const dataFlowRows: TableRow[] = [
    [
      { text: "Entrada", options: { bold: true, color: COLOR_ACCENT } },
      { text: resolveDataEndpointLabel(project.currentApplicationDataInput) ?? "Não informado" },
      {
        text: fichaTruncate(
          project.currentApplicationDataInputDetails?.trim() || "Não informado",
          dataFlowColW[2]
        ),
      },
    ],
    [
      { text: "Saída", options: { bold: true, color: COLOR_ACCENT } },
      { text: resolveDataEndpointLabel(project.currentApplicationDataOutput) ?? "Não informado" },
      {
        text: fichaTruncate(
          project.currentApplicationDataOutputDetails?.trim() || "Não informado",
          dataFlowColW[2]
        ),
      },
    ],
  ];
  slide.addTable(dataFlowRows, {
    x: FICHA_LEFT_X,
    y: FICHA_ROW2_Y + 0.32,
    w: CONTENT_W,
    colW: dataFlowColW,
    fontSize: 10,
    color: COLOR_PRIMARY,
    border: fichaTableBorder(),
    valign: "middle",
    margin: [0.03, 0.08, 0.03, 0.08],
    autoPage: false,
  });

  // ----- Linha 3: Sustentação | Contas utilizadas -----
  addFichaBlockLabel(slide, "Sustentação", FICHA_LEFT_X, FICHA_ROW3_Y, FICHA_LEFT_W);
  const contingencyLabels = resolveKeyLabels(
    project.currentApplicationContingencyActions,
    CURRENT_APPLICATION_CONTINGENCY_OPTIONS
  );
  const contingencyDetails = project.currentApplicationContingencyDetails?.trim();
  const contingencyText =
    (contingencyLabels.length > 0 ? contingencyLabels.join(", ") : "Não informado") +
    (contingencyDetails ? ` — ${contingencyDetails}` : "");
  const sensitiveAnswer = resolveSensitiveDataAnswerLabel(project.handlesSensitiveData) ?? "Não informado";
  const sensitiveDetails = project.sensitiveDataDetails?.trim();
  slide.addText(
    [
      {
        text: `${project.currentApplicationOwner ?? "Não informado"} · ${
          project.currentApplicationOwnerRole ?? "Não informado"
        } · ${project.ownerArea?.name ?? "Não informado"}`,
        options: { bold: true, fontSize: 10, color: COLOR_PRIMARY, breakLine: true },
      },
      {
        text: `Substituto: ${project.currentApplicationBackupOwner ?? "Não informado"}`,
        options: { fontSize: 10, color: COLOR_SECONDARY, breakLine: true },
      },
      {
        text: `Se parar: ${contingencyText}`,
        options: { fontSize: 10, color: COLOR_SECONDARY, breakLine: true },
      },
      {
        text: `Dados sigilosos: ${sensitiveAnswer}${sensitiveDetails ? ` — ${sensitiveDetails}` : ""}`,
        options: { fontSize: 10, color: COLOR_SECONDARY },
      },
    ],
    {
      x: FICHA_LEFT_X,
      y: FICHA_ROW3_Y + 0.32,
      w: FICHA_LEFT_W,
      h: FICHA_ROW3_H - 0.32,
      valign: "top",
      fit: "shrink",
      lineSpacingMultiple: 1.25,
    }
  );

  addFichaBlockLabel(slide, "Contas utilizadas", FICHA_RIGHT_X, FICHA_ROW3_Y, FICHA_RIGHT_W);
  const accountsTableY = FICHA_ROW3_Y + 0.32;
  if (project.automationAccounts.length === 0) {
    slide.addText("Nenhuma conta cadastrada.", {
      x: FICHA_RIGHT_X,
      y: accountsTableY,
      w: FICHA_RIGHT_W,
      h: 0.3,
      fontSize: 10,
      italic: true,
      color: COLOR_MUTED,
    });
  } else {
    const shown = project.automationAccounts.slice(0, FICHA_MAX_ACCOUNTS_SHOWN);
    const hiddenCount = project.automationAccounts.length - shown.length;
    const accountsColW: [number, number, number] = [2.4, 1.8, FICHA_RIGHT_W - 2.4 - 1.8];
    // Username aparece porque foi decisão explícita do usuário levá-lo ao
    // deck — não existe (e nunca existiu) campo de senha neste modelo.
    const rows: TableRow[] = shown.map((a) => [
      { text: fichaTruncate(a.username, accountsColW[0]) },
      { text: fichaTruncate(resolveAccountTypeLabel(a.accountType) ?? "-", accountsColW[1]) },
      { text: fichaTruncate(accountSystemName(a) ?? "-", accountsColW[2]) },
    ]);
    if (hiddenCount > 0) {
      rows.push([
        {
          text: `+ ${hiddenCount} conta${hiddenCount > 1 ? "s" : ""} ${hiddenCount > 1 ? "adicionais" : "adicional"} cadastrada${hiddenCount > 1 ? "s" : ""}`,
          options: { colspan: 3, italic: true, color: COLOR_MUTED },
        },
      ]);
    }
    slide.addTable(rows, {
      x: FICHA_RIGHT_X,
      y: accountsTableY,
      w: FICHA_RIGHT_W,
      colW: accountsColW,
      fontSize: 9,
      color: COLOR_PRIMARY,
      border: fichaTableBorder(),
      valign: "middle",
      margin: [0.03, 0.06, 0.03, 0.06],
      autoPage: false,
    });
  }
}
