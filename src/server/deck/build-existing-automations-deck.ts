import PptxGenJS from "pptxgenjs";
import type { RobotOperationalStatus } from "@prisma/client";
import { db } from "@/server/db";
import { createCaller } from "@/server/trpc/root";
import type { Context } from "@/server/trpc/context";
import { formatCurrency, formatDate } from "@/shared/utils";
// Só o que `hostingLabel`/`accessLabel` (do inventário) ainda resolvem aqui: a
// ficha de ambiente resolve seus próprios labels dentro de
// `buildEnvironmentSheet`, no módulo puro.
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
  COLOR_PRIMARY,
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_SECONDARY,
  COLOR_TABLE_BORDER,
  COLOR_ZEBRA,
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
import {
  buildEnvironmentSheet,
  densityTierFor,
  splitIntoColumns,
  type DensityTier,
  type EnvironmentSheet,
  type EnvironmentSheetSource,
} from "@/shared/lib/existing-automation";

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
// de project.router.ts (sem id/order: o slide não precisa de chave React e a
// ordem já vem aplicada pelo `orderBy` do próprio select).
export type FichaTargetSystemRow = {
  customName: string | null;
  accessPoint: string | null;
  // Entra na ficha a partir da spec de 2026-08-14: o público do deck de
  // automações existentes é o TI de segurança, e "como chegar no acesso" é
  // parte do que ele precisa auditar. Continua sendo ponteiro, nunca credencial.
  accessNotes: string | null;
  targetSystem: { name: string; category: { name: string } | null } | null;
};

export type FichaAutomationAccountRow = {
  username: string;
  accountType: string | null;
  ownerName: string | null;
  notes: string | null;
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
  currentApplicationAccessReference: string | null;
  currentApplicationLiveSince: Date | null;
  currentApplicationAssetId: string | null;
  currentApplicationOwnerRole: string | null;
  robotSchedule: string | null;
  ownerArea: { name: string } | null;
  // Join table ProjectPersonOfInterest — o `select` devolve o vínculo, não a
  // pessoa direto.
  peopleOfInterest: { person: { name: string; role: string | null } }[];
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

// Guard do slide de ficha de ambiente. Checa os campos que SÓ aparecem nesta
// página — de propósito NÃO repete hosting/author/owner/accessLocation/
// liveSince, que já aparecem no slide de processo, para que um projeto com
// apenas esses não ganhe uma ficha quase inteira de blocos omitidos.
// `currentApplicationAccessReference` entra na lista desde a spec de
// 2026-08-14, que passou a exibi-lo — antes ele era o único campo que nunca
// saía no deck, e por isso não servia como critério de entrada.
// Exportada (junto com `addFichaTecnicaSlide` mais abaixo) para
// scripts/preview-ficha-tecnica-slide.ts poder gerar o slide com dados fixos
// sem duplicar esta regra.
export function hasFichaTecnicaData(p: ExistingAutomationProject): boolean {
  return Boolean(
    p.currentApplicationAssetId ||
      p.currentApplicationOwnerRole ||
      p.ownerArea?.name ||
      p.currentApplicationAccessReference ||
      p.robotSchedule ||
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
      p.automationAccounts.length > 0 ||
      p.peopleOfInterest.length > 0
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
          // Mesma população que `isExistingAutomation` em
          // src/shared/lib/opportunity-classification.ts decide no cliente — as
          // duas precisam mudar juntas. Aqui o status é o enum cru do Prisma
          // ("DONE"); lá é o já mapeado por toFrontendStatus ("completed").
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
          currentApplicationAccessReference: true,
          currentApplicationLiveSince: true,
          // Campos novos da ficha técnica (Passo 13).
          currentApplicationAssetId: true,
          currentApplicationOwnerRole: true,
          ownerArea: { select: { name: true } },
          peopleOfInterest: { select: { person: { select: { name: true, role: true } } } },
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
              accessNotes: true,
              targetSystem: { select: { name: true, category: { select: { name: true } } } },
            },
          },
          automationAccounts: {
            orderBy: { order: "asc" },
            select: {
              username: true,
              accountType: true,
              ownerName: true,
              notes: true,
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

// Geometria da ficha de ambiente. Ao contrário da versão anterior, que
// reservava altura fixa por linha de blocos, aqui cada coluna tem seu próprio
// cursor Y: blocos vazios são omitidos (regra da spec de 2026-08-14) e os
// seguintes sobem. As três larguras continuam fixas.
const FICHA_LEFT_X = MARGIN_X;
const FICHA_LEFT_W = 4.3;
const FICHA_COL_GAP = 0.3;
const FICHA_RIGHT_X = FICHA_LEFT_X + FICHA_LEFT_W + FICHA_COL_GAP;
const FICHA_RIGHT_W = CONTENT_W - FICHA_LEFT_W - FICHA_COL_GAP;
const FICHA_BLOCK_GAP = 0.22;
/** Altura do rótulo de bloco antes do conteúdo começar. */
const FICHA_LABEL_H = 0.32;
/** Altura da faixa de fluxo (3 caixas, até 4 linhas cada). */
const FICHA_FLOW_H = 1.0;
/** Fundo da área de conteúdo — a régua do rodapé do master fica em 6.92". */
const FICHA_BOTTOM_Y = 6.85;

// Corpo das tabelas por tier de densidade. Nenhum item é descartado: quando o
// volume cresce, a fonte desce e a lista quebra em duas colunas
// (splitIntoColumns) — ver "Como tudo cabe" na spec.
const FICHA_TIER_FONT: Record<DensityTier, number> = {
  comfortable: 9,
  dense: 8,
  compact: 7,
};

/** Altura estimada de uma linha de tabela, por tier (em polegadas). */
const FICHA_TIER_ROW_H: Record<DensityTier, number> = {
  comfortable: 0.24,
  dense: 0.21,
  compact: 0.18,
};

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
// altura da tabela nunca passa do estimado — é o que sustenta o cursor Y desta
// ficha (reticência = truncou). Note que isto corta DENTRO da célula: nenhuma
// linha inteira é descartada, ao contrário da versão anterior desta ficha.
const FICHA_TABLE_CHARS_PER_INCH = 10;

function fichaTruncate(text: string, colWidthIn: number): string {
  const maxChars = Math.max(8, Math.floor(colWidthIn * FICHA_TABLE_CHARS_PER_INCH));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}
/**
 * Espelho server-side de `projectToEnvironmentSource` (o adaptador do React).
 * Existe separado porque a fonte é diferente — linhas cruas do Prisma, com
 * `targetSystem`/`customName` ainda por resolver — mas o destino é o mesmo
 * tipo, e portanto a mesma regra de omissão.
 *
 * Sem máscara: o deck é gerado por um admin autenticado para uma empresa
 * específica; modo demonstração é conceito da tela, não do arquivo exportado.
 */
function deckProjectToEnvironmentSource(p: ExistingAutomationProject): EnvironmentSheetSource {
  return {
    hosting: p.currentApplicationHosting,
    hostingCustom: p.currentApplicationHostingCustom,
    assetId: p.currentApplicationAssetId,
    robotSchedule: p.robotSchedule,
    liveSince: p.currentApplicationLiveSince,
    dataInput: p.currentApplicationDataInput,
    dataInputDetails: p.currentApplicationDataInputDetails,
    dataOutput: p.currentApplicationDataOutput,
    dataOutputDetails: p.currentApplicationDataOutputDetails,
    author: p.currentApplicationAuthor,
    owner: p.currentApplicationOwner,
    ownerRole: p.currentApplicationOwnerRole,
    ownerArea: p.ownerArea?.name ?? null,
    backupOwner: p.currentApplicationBackupOwner,
    peopleOfInterest: p.peopleOfInterest.map((link) => ({
      name: link.person.name,
      role: link.person.role,
    })),
    accessLocation: p.currentApplicationAccessLocation,
    accessReference: p.currentApplicationAccessReference,
    contingencyActions: p.currentApplicationContingencyActions,
    contingencyDetails: p.currentApplicationContingencyDetails,
    handlesSensitiveData: p.handlesSensitiveData,
    sensitiveDataCategories: p.sensitiveDataCategories,
    sensitiveDataDetails: p.sensitiveDataDetails,
    systems: p.targetSystems.map((s) => ({
      name: targetSystemName(s) ?? "",
      category: s.targetSystem?.category?.name ?? null,
      accessPoint: s.accessPoint,
      accessNotes: s.accessNotes,
    })),
    accounts: p.automationAccounts.map((a) => ({
      username: a.username,
      type: a.accountType,
      system: accountSystemName(a),
      owner: a.ownerName,
      notes: a.notes,
    })),
  };
}

/** Desenha um bloco de texto e devolve o Y logo abaixo dele. */
function addTextBlock(
  slide: Slide,
  label: string,
  entries: { label: string; value: string }[],
  x: number,
  y: number,
  w: number,
  fontSize: number
): number {
  addFichaBlockLabel(slide, label, x, y, w);
  const h = Math.min(entries.length * 0.26 + 0.1, FICHA_BOTTOM_Y - y - FICHA_LABEL_H);
  slide.addText(
    entries.map((entry, index) => ({
      text: `${entry.label}: ${entry.value}`,
      options: {
        fontSize,
        color: index === 0 ? COLOR_PRIMARY : COLOR_SECONDARY,
        bold: index === 0,
        breakLine: index < entries.length - 1,
      },
    })),
    { x, y: y + FICHA_LABEL_H, w, h, valign: "top", fit: "shrink", lineSpacingMultiple: 1.25 }
  );
  return y + FICHA_LABEL_H + h + FICHA_BLOCK_GAP;
}

/**
 * Desenha uma lista como uma ou duas tabelas lado a lado e devolve o Y abaixo.
 * A quebra em duas colunas (splitIntoColumns) é o que permite listar TUDO sem
 * descartar item nem estourar o rodapé.
 */
function addListBlock<T>(
  slide: Slide,
  label: string,
  rowsOf: (item: T) => [string, string],
  items: T[],
  x: number,
  y: number,
  w: number,
  tier: DensityTier
): number {
  addFichaBlockLabel(slide, label, x, y, w);
  const columns = splitIntoColumns(items);
  const columnW = (w - (columns.length - 1) * 0.15) / columns.length;
  const tallest = Math.max(...columns.map((c) => c.length));

  columns.forEach((column, index) => {
    const colX = x + index * (columnW + 0.15);
    const colW: [number, number] = [columnW * 0.45, columnW * 0.55];
    const rows: TableRow[] = column.map((item) => {
      const [first, second] = rowsOf(item);
      return [
        { text: fichaTruncate(first, colW[0]) },
        { text: fichaTruncate(second, colW[1]) },
      ];
    });
    slide.addTable(rows, {
      x: colX,
      y: y + FICHA_LABEL_H,
      w: columnW,
      colW,
      fontSize: FICHA_TIER_FONT[tier],
      color: COLOR_PRIMARY,
      border: fichaTableBorder(),
      valign: "middle",
      margin: [0.02, 0.06, 0.02, 0.06],
      autoPage: false,
    });
  });

  return y + FICHA_LABEL_H + tallest * FICHA_TIER_ROW_H[tier] + FICHA_BLOCK_GAP;
}

/** A faixa entrada → onde roda → saída, no topo. Devolve o Y abaixo dela. */
function addFlowStrip(slide: Slide, sheet: EnvironmentSheet, y: number): number {
  const boxes = [sheet.flow.input, sheet.flow.runtime, sheet.flow.output].filter(
    (box): box is NonNullable<typeof box> => box !== undefined
  );
  if (boxes.length === 0) return y;

  const gap = 0.3;
  const boxW = (CONTENT_W - gap * (boxes.length - 1)) / boxes.length;
  boxes.forEach((box, index) => {
    const x = MARGIN_X + index * (boxW + gap);
    slide.addShape("rect", { x, y, w: boxW, h: FICHA_FLOW_H, fill: { color: COLOR_ZEBRA } });
    slide.addShape("rect", { x, y, w: 0.04, h: FICHA_FLOW_H, fill: { color: COLOR_ACCENT } });
    slide.addText(
      [
        {
          text: box.title.toUpperCase(),
          options: { fontSize: TYPE.eyebrow, bold: true, color: COLOR_ACCENT, breakLine: true },
        },
        ...box.lines.map((line, lineIndex) => ({
          text: line,
          options: {
            fontSize: lineIndex === 0 ? 11 : 9,
            bold: lineIndex === 0,
            color: lineIndex === 0 ? COLOR_PRIMARY : COLOR_SECONDARY,
            breakLine: lineIndex < box.lines.length - 1,
          },
        })),
      ],
      {
        x: x + 0.16,
        y: y + 0.08,
        w: boxW - 0.3,
        h: FICHA_FLOW_H - 0.16,
        valign: "top",
        fit: "shrink",
        lineSpacingMultiple: 1.15,
      }
    );
    if (index < boxes.length - 1) {
      slide.addText("→", {
        x: x + boxW,
        y: y + FICHA_FLOW_H / 2 - 0.15,
        w: gap,
        h: 0.3,
        fontSize: 16,
        color: COLOR_ACCENT,
        align: "center",
      });
    }
  });

  return y + FICHA_FLOW_H + FICHA_BLOCK_GAP;
}

export function addFichaTecnicaSlide(pres: PptxGenJS, project: ExistingAutomationProject): void {
  const sheet = buildEnvironmentSheet(deckProjectToEnvironmentSource(project));
  // Guard duplo com hasFichaTecnicaData no chamador: aquele decide se vale a
  // pena a página, este garante que nunca se desenha uma ficha sem nada.
  if (!sheet) return;

  // `tag` identifica este como o SEGUNDO slide da mesma solução (o primeiro
  // usa a área como tag) — sem ele, alguém folheando o deck veria dois slides
  // seguidos com o mesmo título e nenhuma pista do que os distingue.
  const slide = addTitledSlide(pres, project.title, undefined, "Ficha de ambiente", true);
  const tier = densityTierFor(sheet.itemCount);
  const fontSize = FICHA_TIER_FONT[tier];

  const blocksTop = addFlowStrip(slide, sheet, CONTENT_TOP_Y_TALL_TITLE);

  let leftY = blocksTop;
  const peopleEntries = [
    ...sheet.people,
    ...(sheet.peopleOfInterest.length > 0
      ? [
          {
            label: "Pessoas de interesse",
            value: sheet.peopleOfInterest
              .map((p) => (p.role ? `${p.name} (${p.role})` : p.name))
              .join(", "),
          },
        ]
      : []),
  ];
  if (peopleEntries.length > 0) {
    leftY = addTextBlock(
      slide,
      "Pessoas",
      peopleEntries,
      FICHA_LEFT_X,
      leftY,
      FICHA_LEFT_W,
      fontSize
    );
  }
  if (sheet.access.length > 0) {
    leftY = addTextBlock(
      slide,
      "Acessos e contingência",
      sheet.access,
      FICHA_LEFT_X,
      leftY,
      FICHA_LEFT_W,
      fontSize
    );
  }

  let rightY = blocksTop;
  if (sheet.systems.length > 0) {
    rightY = addListBlock(
      slide,
      "Sistemas em que atua",
      (s) => [
        [s.name, s.category].filter(Boolean).join(" · "),
        [s.accessPoint, s.accessNotes].filter(Boolean).join(" — "),
      ],
      sheet.systems,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      tier
    );
  }
  if (sheet.accounts.length > 0) {
    // Username aparece porque foi decisão explícita do usuário levá-lo ao
    // deck — não existe (e nunca existiu) campo de senha neste modelo.
    rightY = addListBlock(
      slide,
      "Contas utilizadas",
      (a) => [a.username, [a.typeLabel, a.system, a.owner, a.notes].filter(Boolean).join(" · ")],
      sheet.accounts,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      tier
    );
  }
  if (sheet.sensitive.length > 0) {
    addTextBlock(
      slide,
      "Dados sigilosos",
      sheet.sensitive,
      FICHA_RIGHT_X,
      rightY,
      FICHA_RIGHT_W,
      fontSize
    );
  }
}
