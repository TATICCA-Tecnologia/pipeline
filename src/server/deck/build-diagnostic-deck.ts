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
  developerDailyRateFrom,
  findPaybackDate,
  maintenanceCostPerWeek,
  resolveDeveloperHourlyRate,
  resolveMaintenanceHourlyRate,
  type PaybackPoint,
  type PaybackScheduleItem,
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

// Paleta reutilizada pelos slides (hex sem "#", como o pptxgenjs espera).
// Navy + azul de acento: contraste alto sobre branco em qualquer projetor, e
// nenhuma cor decorativa competindo com os dados.
const COLOR_PRIMARY = "0F172A"; // navy — títulos e texto principal
const COLOR_ACCENT = "0369A1"; // azul — números-chave, régua de título, capa
export const COLOR_MUTED = "64748B"; // cinza — legendas, notas de rodapé
const COLOR_HEADER_BG = "0F172A";
const COLOR_HEADER_TEXT = "FFFFFF";
const COLOR_TABLE_BORDER = "E2E8F0";
const COLOR_ZEBRA = "F8FAFC"; // fundo das linhas pares da tabela
const COLOR_SURFACE = "FFFFFF";
const COLOR_SECONDARY = "334155"; // slate-700 — subtítulos e texto de apoio
const COLOR_MUTED_SURFACE = "E8ECF1"; // fundo de linhas de total/destaque
// Pares para uso sobre o navy da capa: o acento e o cinza normais não têm
// contraste suficiente contra fundo escuro.
const COLOR_ACCENT_ON_DARK = "7DD3FC"; // azul claro
const COLOR_ON_DARK_MUTED = "94A3B8"; // cinza claro

/**
 * Tipografia do deck.
 *
 * Escolha deliberada de uma fonte que EXISTE na máquina de quem abre o arquivo:
 * um .pptx não embarca fontes, então uma Google Font (Lexend, Inter...) seria
 * substituída por qualquer coisa no PowerPoint do cliente e quebraria todo o
 * alinhamento. Segoe UI acompanha o Windows desde o 7 e o Office; Calibri é o
 * fallback declarado por vir junto com o Office também no macOS. Trocar o deck
 * inteiro de fonte = mudar estas duas constantes.
 */
const FONT_HEADING = "Segoe UI";
const FONT_BODY = "Segoe UI";

/**
 * Escala tipográfica (pt). Passos deliberadamente distantes entre si — a versão
 * antiga usava 22/16/14/11/10 e a diferença entre um título de seção e um
 * rótulo de tabela quase não se lia, que é o que fazia o deck parecer um dump
 * de dados em vez de um material de consultoria.
 */
const TYPE = {
  coverTitle: 40,
  coverSubtitle: 20,
  sectionTitle: 30,
  slideTitle: 24,
  slideSubtitle: 13,
  metricValue: 28,
  bodyLarge: 13,
  body: 11,
  caption: 10,
  eyebrow: 10,
} as const;

/** Nome do master usado pelos slides de conteúdo (título + logo + rodapé). */
const MASTER_CONTENT = "CONTENT";
/** Master sem chrome, para divisórias de seção. */
const MASTER_FULL_BLEED = "FULL_BLEED";
/** Master da capa: fundo navy sólido com faixa branca no topo, sem rodapé. */
const MASTER_COVER = "COVER";
/** Altura da faixa branca da capa, onde o logo é assentado. */
const COVER_BAND_H = 2.35;

/** Margem esquerda/direita única do deck — tudo se alinha nela. */
const MARGIN_X = 0.6;
/** Largura útil = 13.33 (LAYOUT_WIDE) - 2 margens. */
const CONTENT_W = 13.33 - MARGIN_X * 2;

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
  // Caixa alta espaçada no cabeçalho: distingue rótulo de dado sem precisar de
  // borda, e é o que faz a tabela ler como relatório em vez de planilha.
  fontSize: TYPE.caption,
  charSpacing: 0.8,
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
// O slide de processo herdou um teal do card React de referência que destoava
// do resto do deck (navy + azul). Apontar para as cores da paleta mantém o
// destaque sem introduzir uma terceira família de cor num material que só usa
// duas.
const COLOR_TEAL = COLOR_ACCENT;
const COLOR_TEAL_BG = "EFF6FF"; // azul-50, par claro do acento
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
  area: { name: string } | null;
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
    select: {
      name: true,
      developerHourlyRateBRL: true,
      maintenanceHourlyRateBRL: true,
    },
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
        // Área usada como subtítulo do slide de processo: com dezenas de
        // slides individuais, o título sozinho não diz de quem é o processo.
        area: { select: { name: true } },
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
  pres.author = "TATICCA";
  pres.company = "TATICCA";
  pres.subject = `Diagnóstico de robotização — ${company.name}`;
  defineDeckTheme(pres, company.name);

  addCoverSlide(pres, company.name);
  addAreaSummarySlide(pres, areaSummary);
  addSectionSlide(
    pres,
    "Parte 1",
    "Priorização das oportunidades",
    "Nem todo processo automatizável merece ser automatizado primeiro. As páginas a seguir ordenam as oportunidades por três critérios diferentes — retorno financeiro, peso estratégico e um score combinado — para que a escolha da ordem de execução seja uma decisão explícita, e não uma consequência de quem pediu primeiro."
  );
  addPrioritizationMethodSlide(pres);
  addRankingSlide(pres, "Ranking por economia", rankingEconomia, "economia");
  addRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo");
  addRankingSlide(pres, "Ranking combinado", rankingCombinado, "combinado");
  addSectionSlide(
    pres,
    "Parte 2",
    "Plano de implementação e retorno",
    "Definida a ordem, esta seção responde às duas perguntas seguintes: quando cada robô entra em produção e em quanto tempo o investimento se paga. O cronograma e a curva de payback partem das mesmas premissas de esforço, custo e economia — mudar qualquer uma delas recalcula as duas."
  );
  addScheduleSlide(pres, rankingCombinado, settings.wave1StartDate);
  // Premissas resolvidas UMA vez aqui: os slides de payback recebem números já
  // decididos (empresa > global > padrão) em vez de decidirem por conta
  // própria, que é o que mantém o .pptx idêntico à aba Payback da tela de
  // priorização.
  const paybackSettings = {
    developerDailyRateBRL: developerDailyRateFrom(
      resolveDeveloperHourlyRate(
        company.developerHourlyRateBRL,
        settings.developerHourlyRateBRL
      )
    ),
    maintenanceHourlyRateBRL: resolveMaintenanceHourlyRate(
      company.maintenanceHourlyRateBRL,
      settings.maintenanceHourlyRateBRL
    ),
    defaultMaintenanceHoursPerWeek: settings.defaultMaintenanceHoursPerWeek,
    wave1StartDate: settings.wave1StartDate,
  };
  addPaybackMethodSlide(pres);
  addPaybackSlide(pres, rankingCombinado, paybackSettings, structureCosts);
  addPaybackCompositionSlide(pres, rankingCombinado, paybackSettings, structureCosts);
  // Entrevistas: se não houver nenhuma, o slide é pulado inteiramente (não
  // criamos um slide vazio nem lançamos erro — decisão explícita do Passo 8a).
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  // Divisória só quando existe conteúdo depois dela — uma seção anunciada e
  // vazia é pior do que não ter divisória.
  if (projects.length > 0) {
    addSectionSlide(
      pres,
      "Parte 3",
      "Detalhamento por processo",
      "Uma página por processo mapeado: como ele funciona hoje, o volume de trabalho manual envolvido, a solução técnica proposta e a avaliação qualitativa que sustenta sua posição no ranking. É o material de referência para a validação com cada área."
    );
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

/**
 * Define a fonte-tema e os dois slide masters do deck.
 *
 * Por que masters em vez de desenhar o chrome slide a slide: o logo, a régua de
 * rodapé e o número de página passam a existir em TODOS os slides de conteúdo
 * automaticamente, inclusive nas páginas que o `autoPage` das tabelas cria
 * sozinho (que antes nasciam sem nenhuma identidade visual). Era essa a causa
 * de "o logo da TATICCA não aparece": ele só era desenhado na capa, e a partir
 * do segundo slide o material perdia qualquer marca.
 *
 * `pres.theme` define a fonte padrão do arquivo, então os ~40 `addText`
 * espalhados pelos slides herdam a tipografia sem precisar repetir `fontFace`
 * em cada chamada.
 */
export function defineDeckTheme(
  pres: PptxGenJS,
  companyName: string,
  deckLabel = "Diagnóstico de robotização"
): void {
  pres.theme = { headFontFace: FONT_HEADING, bodyFontFace: FONT_BODY };

  const logoW = 1.5;
  const logoH = logoW / LOGO_ASPECT_RATIO;

  pres.defineSlideMaster({
    title: MASTER_CONTENT,
    background: { color: COLOR_SURFACE },
    objects: [
      // Régua fina do rodapé — separa o conteúdo da assinatura sem pesar.
      {
        rect: {
          x: MARGIN_X,
          y: 6.92,
          w: CONTENT_W,
          h: 0.012,
          fill: { color: COLOR_TABLE_BORDER },
        },
      },
      {
        text: {
          text: `TATICCA · ${deckLabel} · ${companyName}`,
          options: {
            x: MARGIN_X,
            y: 7.0,
            w: CONTENT_W - 2.0,
            h: 0.3,
            fontSize: TYPE.caption,
            color: COLOR_MUTED,
            valign: "middle",
          },
        },
      },
      ...(LOGO_DATA_URI
        ? [
            {
              image: {
                data: LOGO_DATA_URI,
                x: 13.33 - MARGIN_X - logoW,
                y: 6.99,
                w: logoW,
                h: logoH,
              },
            },
          ]
        : []),
    ],
    slideNumber: {
      x: 13.33 - MARGIN_X - logoW - 0.55,
      y: 7.0,
      w: 0.45,
      h: 0.3,
      fontSize: TYPE.caption,
      color: COLOR_MUTED,
      align: "right",
      valign: "middle",
    },
  });

  pres.defineSlideMaster({
    title: MASTER_FULL_BLEED,
    background: { color: COLOR_SURFACE },
    objects: [
      // Faixa vertical de acento na borda esquerda: âncora visual das
      // divisórias, e o único elemento puramente gráfico do miolo.
      { rect: { x: 0, y: 0, w: 0.22, h: 7.5, fill: { color: COLOR_ACCENT } } },
    ],
  });

  pres.defineSlideMaster({
    title: MASTER_COVER,
    background: { color: COLOR_PRIMARY },
    objects: [
      // Faixa branca no topo: o PNG do logo tem tipografia escura e traço sem
      // versão negativa, então ele desaparece sobre o navy. Em vez de exigir um
      // segundo arquivo de logo (que a empresa pode não ter), a capa reserva
      // uma faixa clara para ele — solução que também é o padrão de capa
      // corporativa com marca no topo.
      { rect: { x: 0, y: 0, w: 13.33, h: COVER_BAND_H, fill: { color: COLOR_SURFACE } } },
      // Fio de acento fechando a faixa contra o navy.
      {
        rect: {
          x: 0,
          y: COVER_BAND_H,
          w: 13.33,
          h: 0.055,
          fill: { color: COLOR_ACCENT },
        },
      },
      // Faixa de acento no rodapé da capa, fechando a composição.
      { rect: { x: 0, y: 7.32, w: 13.33, h: 0.18, fill: { color: COLOR_ACCENT } } },
    ],
  });
}

export function addCoverSlide(
  pres: PptxGenJS,
  companyName: string,
  title = "Diagnóstico de robotização"
): void {
  // Capa em fundo navy sólido, não branco: é o único slide do deck que troca de
  // fundo, e é isso que dá o "peso" de abertura de material de consultoria —
  // o miolo continua branco para não pesar na leitura nem na impressão.
  const slide = pres.addSlide({ masterName: MASTER_COVER });

  if (LOGO_DATA_URI) {
    // Logo grande, centralizado dentro da faixa branca do master — na capa ele
    // é o elemento principal, não uma marca de canto.
    const width = 4.4;
    const height = width / LOGO_ASPECT_RATIO;
    slide.addImage({
      data: LOGO_DATA_URI,
      x: (13.33 - width) / 2,
      y: (COVER_BAND_H - height) / 2,
      w: width,
      h: height,
    });
  }

  slide.addText("RELATÓRIO DE DIAGNÓSTICO", {
    x: 0,
    y: 3.35,
    w: 13.33,
    h: 0.3,
    align: "center",
    fontSize: TYPE.eyebrow,
    bold: true,
    charSpacing: 3,
    color: COLOR_ACCENT_ON_DARK,
  });
  slide.addText(title, {
    x: 0,
    y: 3.8,
    w: 13.33,
    h: 0.95,
    align: "center",
    fontSize: TYPE.coverTitle,
    bold: true,
    color: COLOR_SURFACE,
  });
  // Régua centralizada entre o título e o nome da empresa.
  slide.addShape("rect", {
    x: (13.33 - 2.2) / 2,
    y: 4.92,
    w: 2.2,
    h: 0.035,
    fill: { color: COLOR_ACCENT_ON_DARK },
  });
  slide.addText(companyName, {
    x: 0,
    y: 5.2,
    w: 13.33,
    h: 0.55,
    align: "center",
    fontSize: TYPE.coverSubtitle,
    color: COLOR_SURFACE,
  });
  slide.addText(formatDate(new Date()), {
    x: 0,
    y: 5.85,
    w: 13.33,
    h: 0.4,
    align: "center",
    fontSize: TYPE.bodyLarge,
    color: COLOR_ON_DARK_MUTED,
  });
}

/**
 * Slide divisor de seção. Um deck de 9+ slides sem divisórias lê como um dump
 * de tabelas; as divisórias dão ao apresentador pontos naturais de respiro e
 * ao leitor um índice implícito.
 */
export function addSectionSlide(
  pres: PptxGenJS,
  kicker: string,
  title: string,
  description?: string
): void {
  const slide = pres.addSlide({ masterName: MASTER_FULL_BLEED });
  slide.addText(kicker.toUpperCase(), {
    x: MARGIN_X + 0.2,
    y: 2.85,
    w: CONTENT_W,
    h: 0.3,
    fontSize: TYPE.eyebrow,
    bold: true,
    charSpacing: 2,
    color: COLOR_ACCENT,
  });
  slide.addText(title, {
    x: MARGIN_X + 0.2,
    y: 3.25,
    w: CONTENT_W,
    h: 0.7,
    fontSize: TYPE.sectionTitle,
    bold: true,
    color: COLOR_PRIMARY,
  });
  if (description) {
    slide.addText(description, {
      x: MARGIN_X + 0.2,
      y: 4.1,
      // Metade da largura: parágrafo de abertura de seção é para ser lido, não
      // varrido — linha longa demais derruba a legibilidade.
      w: CONTENT_W * 0.55,
      h: 1.2,
      fontSize: TYPE.bodyLarge,
      color: COLOR_SECONDARY,
      lineSpacingMultiple: 1.35,
      valign: "top",
    });
  }
}

/**
 * Os cinco critérios da avaliação qualitativa, com o que cada nota significa.
 * Espelham `ratingErrorReduction`/`ratingProcessCriticality`/... do Project e
 * os pesos configuráveis em SystemSettings.
 */
const QUALITATIVE_CRITERIA: { name: string; question: string }[] = [
  {
    name: "Redução de erros",
    question:
      "Quanto o processo manual está sujeito a falhas hoje e quanto a automação elimina esse risco",
  },
  {
    name: "Criticidade do processo",
    question:
      "O quanto a operação depende deste processo e qual o impacto de ele parar ou atrasar",
  },
  {
    name: "Impacto interno",
    question: "Quantas pessoas e áreas internas se beneficiam diretamente da automação",
  },
  {
    name: "Impacto externo",
    question: "Efeito percebido por clientes, fornecedores ou órgãos externos",
  },
  {
    name: "Compliance",
    question:
      "Exigência regulatória, de auditoria ou de rastreabilidade atendida pela automação",
  },
];

/**
 * Metodologia da avaliação qualitativa, antes dos rankings.
 *
 * Sem este slide o leitor encontra uma coluna "Score" nos rankings seguintes e
 * um percentual nos slides de processo sem nenhuma explicação de onde saem —
 * era a lacuna mais visível do deck gerado em relação ao feito à mão.
 */
function addPrioritizationMethodSlide(pres: PptxGenJS): void {
  const slide = addTitledSlide(
    pres,
    "Metodologia de priorização",
    "Cada oportunidade levantada é avaliada em cinco critérios, com nota de 1 a 5. A média ponderada dessas notas forma a avaliação qualitativa, que é combinada à economia estimada e à complexidade de implementação para produzir o score de priorização usado nos rankings a seguir."
  );

  const header: TableRow = [
    { text: "Critério", options: TABLE_HEADER_OPTS },
    { text: "O que é avaliado", options: TABLE_HEADER_OPTS },
  ];
  const rows: TableRow[] = QUALITATIVE_CRITERIA.map((criterion) => [
    { text: criterion.name, options: { bold: true } },
    { text: criterion.question },
  ]);

  addSlideTable(slide, [header, ...rows], [3.4, 8.7], { y: CONTENT_TOP_Y_WITH_SUBTITLE });

  // Legenda da escala logo abaixo da tabela: é a informação que o leitor
  // procura ao ver "4" numa célula, e precisa estar no mesmo slide.
  slide.addText(
    "Escala aplicada a todos os critérios:  1 — muito baixo   ·   2 — baixo   ·   3 — moderado   ·   4 — alto   ·   5 — muito alto",
    {
      x: MARGIN_X,
      y: 6.05,
      w: CONTENT_W,
      h: 0.4,
      fontSize: TYPE.caption,
      color: COLOR_MUTED,
      valign: "middle",
    }
  );
}

/**
 * Metodologia do payback, antes da curva. Declara as premissas de custo e de
 * economia em texto, para o número de meses do slide seguinte não aparecer sem
 * lastro.
 */
function addPaybackMethodSlide(pres: PptxGenJS): void {
  const slide = addTitledSlide(
    pres,
    "Metodologia do cálculo de retorno",
    "O payback compara, ao longo do tempo, tudo o que a automação custa contra tudo o que ela economiza. As premissas abaixo são as que alimentam a curva e a composição apresentadas na sequência, e podem ser ajustadas por empresa."
  );

  const header: TableRow = [
    { text: "Componente", options: TABLE_HEADER_OPTS },
    { text: "Como é calculado", options: TABLE_HEADER_OPTS },
  ];
  const rows: TableRow[] = [
    [
      { text: "Custo de desenvolvimento", options: { bold: true } },
      {
        text: "Dias úteis estimados de construção do robô × jornada de 8h × taxa horária de desenvolvimento. Reconhecido de forma distribuída ao longo dos dias em que o robô está sendo desenvolvido.",
      },
    ],
    [
      { text: "Custo de manutenção", options: { bold: true } },
      {
        text: "Horas de sustentação por semana × taxa horária de manutenção, específica e distinta da taxa de desenvolvimento. Recorrente, iniciando um mês após a entrega de cada robô.",
      },
    ],
    [
      { text: "Custo de estrutura", options: { bold: true } },
      {
        text: "Pessoas, licenças e infraestrutura da operação de automação, cadastradas por empresa. Independem da quantidade de robôs entregues.",
      },
    ],
    [
      { text: "Economia", options: { bold: true } },
      {
        text: "Horas de trabalho manual eliminadas por mês × 12 × taxa horária do profissional que executa a atividade hoje. Começa a contar na data de entrega de cada robô.",
      },
    ],
    [
      { text: "Cronograma", options: { bold: true } },
      {
        text: "Um desenvolvedor dedicado, um robô por vez, em sequência estrita — sem paralelismo. A data de entrega de cada robô determina quando sua economia entra na conta.",
      },
    ],
  ];

  addSlideTable(slide, [header, ...rows], [3.4, 8.7], { y: CONTENT_TOP_Y_WITH_SUBTITLE });
}

function addAreaSummarySlide(pres: PptxGenJS, areaSummary: AreaSummary): void {
  const slide = addTitledSlide(
    pres,
    "Resultados agregados por área",
    "Após o levantamento de oportunidades realizado junto às áreas, a tabela abaixo consolida as oportunidades identificadas por área responsável, com a economia anual estimada e o volume de horas de trabalho manual envolvido hoje. É a visão que permite enxergar onde o esforço operacional está concentrado e priorizar as conversas seguintes com cada gestor."
  );

  if (areaSummary.length === 0) {
    slide.addText("Nenhum projeto com área definida para esta empresa.", {
      x: MARGIN_X,
      y: CONTENT_TOP_Y_WITH_SUBTITLE,
      fontSize: TYPE.bodyLarge,
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

  // Linha de total com fundo próprio: a zebra da tabela não pode deixá-la
  // parecer só mais uma linha de dados.
  const totalOpts = { bold: true, fill: { color: COLOR_MUTED_SURFACE }, color: COLOR_PRIMARY };
  const totals: TableRow = [
    { text: "Total", options: totalOpts },
    {
      text: String(areaSummary.reduce((sum, a) => sum + a.projectCount, 0)),
      options: totalOpts,
    },
    {
      text: formatCurrency(areaSummary.reduce((sum, a) => sum + a.totalEstimatedSavingBRL, 0)),
      options: totalOpts,
    },
    {
      text: `${Math.round(areaSummary.reduce((sum, a) => sum + a.totalCurrentAnnualHours, 0))} h`,
      options: totalOpts,
    },
  ];

  addSlideTable(
    slide,
    [header, ...rows, totals],
    [4.2, 1.8, 3.6, 2.5],
    { y: CONTENT_TOP_Y_WITH_SUBTITLE }
  );
}

function activeScoreOf(row: Ranking[number], sortBy: "economia" | "qualitativo" | "combinado"): number {
  if (sortBy === "economia") return Math.round(row.economiaScore * 100);
  if (sortBy === "qualitativo") return Math.round(row.qualitativeScorePercent);
  return Math.round(row.combinedScore);
}

/**
 * Cada ranking existe porque ordena por um critério diferente — sem dizer qual,
 * três slides quase idênticos em sequência confundem mais do que informam.
 */
const RANKING_SUBTITLE: Record<"economia" | "qualitativo" | "combinado", string> = {
  economia:
    "Aplicando o critério financeiro isoladamente, as oportunidades são ordenadas pela economia anual estimada — resultado das horas de trabalho manual eliminadas, valorizadas pelo custo/hora do profissional que executa a atividade hoje. Esta é a leitura indicada para sustentar a aprovação do investimento junto à diretoria.",
  qualitativo:
    "Sob a ótica estratégica, as oportunidades são reordenadas pela avaliação qualitativa apresentada anteriormente, independentemente do valor economizado. Processos de baixo retorno financeiro podem assumir as primeiras posições quando envolvem risco de compliance ou criticidade operacional elevada.",
  combinado:
    "Recomendamos esta leitura para definir a ordem de execução: ela pondera economia, avaliação qualitativa e complexidade de implementação num único indicador. As oportunidades no topo da lista são as que entregam maior valor com menor esforço, e formam a base das ondas propostas a seguir.",
};

function addRankingSlide(
  pres: PptxGenJS,
  title: string,
  ranking: Ranking,
  sortBy: "economia" | "qualitativo" | "combinado"
): void {
  const slide = addTitledSlide(pres, title, RANKING_SUBTITLE[sortBy]);

  if (ranking.length === 0) {
    slide.addText("Nenhum projeto encontrado para esta empresa.", {
      x: MARGIN_X,
      y: CONTENT_TOP_Y_WITH_SUBTITLE,
      fontSize: TYPE.bodyLarge,
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

  addSlideTable(
    slide,
    [header, ...rows],
    [0.6, 5.0, 2.8, 2.4, 1.3],
    { y: CONTENT_TOP_Y_WITH_SUBTITLE }
  );
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
  const slide = addTitledSlide(
    pres,
    "Cronograma de implementação",
    "Sequência de entrega proposta, dividida em duas ondas. O modelo assume um desenvolvedor dedicado trabalhando um robô por vez, sem paralelismo: cada processo começa no dia útil seguinte ao término do anterior, e a onda 2 só inicia após o fim da onda 1. As datas se ajustam automaticamente a qualquer mudança de esforço ou de prioridade."
  );
  const { wave1, wave2 } = computeWaveSchedules(ranking, wave1StartDateRaw);

  const items = [
    ...wave1.map((item) => ({ wave: 1, item })),
    ...wave2.map((item) => ({ wave: 2, item })),
  ];

  if (items.length === 0) {
    slide.addText("Nenhum projeto atribuído a uma onda de implementação.", {
      x: MARGIN_X,
      y: CONTENT_TOP_Y_WITH_SUBTITLE,
      fontSize: TYPE.bodyLarge,
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

  addSlideTable(
    slide,
    [header, ...rows],
    [1.3, 6.2, 2.3, 2.3],
    { y: CONTENT_TOP_Y_WITH_SUBTITLE }
  );
}

/**
 * Premissas de custo já resolvidas (empresa > global > padrão) que os slides de
 * payback consomem. Recebem valores prontos de propósito: se cada slide
 * resolvesse por conta própria, o .pptx passaria a divergir da aba Payback.
 */
type PaybackDeckSettings = {
  developerDailyRateBRL: number;
  maintenanceHourlyRateBRL: number;
  defaultMaintenanceHoursPerWeek: number;
  wave1StartDate: Date | null;
};

/**
 * Monta os itens da curva a partir de um recorte do cronograma — mesma
 * conversão que a aba Payback faz em `toPaybackItems`, incluindo o custo
 * semanal de sustentação de cada robô.
 */
function toDeckPaybackItems(
  items: WaveScheduleItem[],
  ranking: Ranking,
  settings: PaybackDeckSettings
): PaybackScheduleItem[] {
  const byId = new Map(ranking.map((row) => [row.id, row]));
  return items.map((item) => {
    const row = byId.get(item.projectId);
    return {
      projectId: item.projectId,
      startDate: item.startDate,
      endDate: item.endDate,
      estimatedAnnualSavingBRL: row?.estimatedAnnualSavingBRL ?? 0,
      maintenanceCostPerWeekBRL: maintenanceCostPerWeek(
        row?.maintenanceHoursPerWeek,
        settings.defaultMaintenanceHoursPerWeek,
        settings.maintenanceHourlyRateBRL
      ),
    };
  });
}

function addPaybackSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: PaybackDeckSettings,
  structureCosts: StructureCostItem[]
): void {
  const slide = addTitledSlide(
    pres,
    "Payback / ROI acumulado",
    "Duas curvas ao longo do tempo: tudo que a automação custa (desenvolvimento, sustentação mensal e estrutura) contra tudo que ela economiza. O ponto em que a curva de economia cruza a de custo é o payback — a partir dali a operação passa a gerar retorno líquido."
  );
  const { wave1, wave2, startDate } = computeWaveSchedules(ranking, settings.wave1StartDate);

  const paybackSchedule = toDeckPaybackItems([...wave1, ...wave2], ranking, settings);

  const dailyRate = settings.developerDailyRateBRL;
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

  // O número que o slide existe para comunicar fica ao LADO do texto
  // explicativo, na coluna que sobra (a narrativa ocupa 78% da largura), e não
  // abaixo dele: empilhado, ele comia a altura do gráfico e chegou a sobrepor a
  // área de plotagem. Aqui ele ganha destaque sem disputar espaço vertical.
  const metricX = MARGIN_X + CONTENT_W * 0.78 + 0.2;
  const metricW = CONTENT_W - CONTENT_W * 0.78 - 0.2;
  slide.addText("PAYBACK ESTIMADO", {
    x: metricX,
    y: 1.06,
    w: metricW,
    h: 0.25,
    align: "right",
    fontSize: TYPE.eyebrow,
    bold: true,
    charSpacing: 1.5,
    color: COLOR_MUTED,
  });
  slide.addText(
    paybackDate ? `${paybackMonths}` : "—",
    {
      x: metricX,
      y: 1.28,
      w: metricW,
      h: 0.6,
      align: "right",
      fontSize: TYPE.metricValue,
      bold: true,
      color: COLOR_ACCENT,
    }
  );
  slide.addText(
    paybackDate
      ? `${paybackMonths === 1 ? "mês" : "meses"} · ${formatDate(paybackDate)}`
      : "não atingido no período",
    {
      x: metricX,
      y: 1.88,
      w: metricW,
      h: 0.3,
      align: "right",
      fontSize: TYPE.caption,
      color: COLOR_MUTED,
    }
  );

  if (curve.length === 0) {
    slide.addText(
      "Sem dados suficientes para calcular a curva de payback (nenhum projeto atribuído a uma onda).",
      {
        x: MARGIN_X,
        y: CONTENT_TOP_Y_WITH_SUBTITLE + 0.7,
        fontSize: TYPE.bodyLarge,
        color: COLOR_MUTED,
      }
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

  // Começa no topo de conteúdo padrão e vai até logo acima da régua de rodapé
  // (6.92): antes a altura era fixa em 4.35 e sobrava um vazio embaixo enquanto
  // o gráfico ficava espremido em cima.
  slide.addChart("line", chartData, {
    x: MARGIN_X,
    y: CONTENT_TOP_Y_WITH_SUBTITLE,
    w: CONTENT_W,
    h: 6.75 - CONTENT_TOP_Y_WITH_SUBTITLE,
    showLegend: true,
    legendPos: "b",
    legendFontSize: TYPE.caption,
    lineDataSymbol: "none",
    lineSize: 2.5,
    // Custo em cinza, economia em azul: a linha que interessa é a que cruza,
    // e ela precisa ser a única com cor de acento.
    chartColors: [COLOR_MUTED, COLOR_ACCENT],
    // A curva tem ~261 pontos semanais (janela de 5 anos): sem rarear, o eixo X
    // vira uma faixa preta ilegível. Mesma decisão do gráfico da tela.
    // `catAxisLabelFrequency` é tipado como string pelo pptxgenjs (vai direto
    // pro XML do gráfico), por isso o String(...).
    catAxisLabelFrequency: String(Math.max(1, Math.ceil(labels.length / 12))),
    catAxisLabelFontSize: TYPE.caption - 1,
    valAxisLabelFontSize: TYPE.caption - 1,
    catAxisLabelColor: COLOR_MUTED,
    valAxisLabelColor: COLOR_MUTED,
    // Sem escala "mi"/"mil": os valores variam de milhares a milhões conforme a
    // empresa, e um divisor fixo mostraria "R$ 0" para os decks menores.
    valAxisLabelFormatCode: "R$ #,##0",
    // Linhas de grade discretas: a grade não pode competir com os dados.
    valGridLine: { style: "solid", size: 0.5, color: COLOR_TABLE_BORDER },
    catGridLine: { style: "none" },
    border: { pt: 0, color: COLOR_SURFACE },
  });
}

// Uma linha por robô com os números que alimentam a curva do slide anterior
// (mesma tabela "Composição do cálculo" da aba Payback em /admin/empresas/
// [id]/priorizacao) — autoPage/autoPageRepeatHeader de addSlideTable cobre
// decks com muitos robôs sem estourar o slide.
function addPaybackCompositionSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: PaybackDeckSettings,
  structureCosts: StructureCostItem[]
): void {
  const { wave1, wave2 } = computeWaveSchedules(ranking, settings.wave1StartDate);
  const withWave = [
    ...wave1.map((item) => ({ ...item, wave: 1 as const })),
    ...wave2.map((item) => ({ ...item, wave: 2 as const })),
  ];

  if (withWave.length === 0) return;

  const slide = addTitledSlide(
    pres,
    "Composição do payback",
    "Abertura processo a processo dos números que formam a curva anterior. Custo de desenvolvimento = dias úteis estimados × jornada × taxa horária de desenvolvimento. Manutenção = horas de sustentação por semana × taxa horária de manutenção, recorrente a partir de um mês após a entrega."
  );
  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );
  const dailyRate = settings.developerDailyRateBRL;
  const structureCostToDate = computeStructureCostAt(structureCosts, new Date());

  const header: TableRow = [
    { text: "Processo", options: TABLE_HEADER_OPTS },
    { text: "Onda", options: TABLE_HEADER_OPTS },
    { text: "Entrega", options: TABLE_HEADER_OPTS },
    { text: "Dias úteis", options: TABLE_HEADER_OPTS },
    { text: "Custo de dev.", options: TABLE_HEADER_OPTS },
    { text: "Manut./ano", options: TABLE_HEADER_OPTS },
    { text: "Economia/mês", options: TABLE_HEADER_OPTS },
    { text: "Economia/ano", options: TABLE_HEADER_OPTS },
  ];

  const maintenanceByProjectId = new Map(
    toDeckPaybackItems(withWave, ranking, settings).map((item) => [
      item.projectId,
      item.maintenanceCostPerWeekBRL,
    ])
  );

  const rows: TableRow[] = withWave.map((item) => {
    const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
    const developmentCostBRL = businessDays * dailyRate;
    const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
    const maintenanceAnnualBRL =
      ((maintenanceByProjectId.get(item.projectId) ?? 0) / 7) * 365;
    return [
      { text: item.title },
      { text: `Onda ${item.wave}` },
      { text: formatDate(item.endDate) },
      { text: String(businessDays) },
      { text: formatCurrency(developmentCostBRL) },
      { text: formatCurrency(maintenanceAnnualBRL) },
      { text: formatCurrency(annualSavingBRL / 12) },
      { text: formatCurrency(annualSavingBRL) },
    ];
  });

  if (structureCostToDate > 0) {
    const structureOpts = { bold: true, fill: { color: COLOR_MUTED_SURFACE }, color: COLOR_PRIMARY };
    rows.push([
      {
        text: "Estrutura (pessoas/licenças) acumulada até hoje",
        options: { ...structureOpts, colspan: 5 },
      },
      { text: formatCurrency(structureCostToDate), options: structureOpts },
      { text: "", options: structureOpts },
      { text: "", options: structureOpts },
    ]);
  }

  addSlideTable(
    slide,
    [header, ...rows],
    [3.4, 0.9, 1.2, 1.0, 1.5, 1.4, 1.4, 1.3],
    { y: CONTENT_TOP_Y_WITH_SUBTITLE }
  );
}

export function addInterviewsSlide(pres: PptxGenJS, interviews: Interviews): void {
  const slide = addTitledSlide(
    pres,
    "Entrevistas",
    "Base do diagnóstico: as conversas realizadas com as áreas para levantar os processos, medir o esforço manual atual e validar as oportunidades. Cada processo detalhado adiante nasceu de uma destas entrevistas."
  );

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

  addSlideTable(
    slide,
    [header, ...rows],
    [4.4, 3.5, 2.2, 2.0],
    { y: CONTENT_TOP_Y_WITH_SUBTITLE }
  );
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
const NOT_QUANTIFIED_LABEL = "N/A";

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
// como `robotSchedule` livre, que pode quebrar em 2 linhas dentro da coluna
// de 3.2") faz a tabela crescer além da posição fixa onde o header/radar
// estavam, colidindo visualmente.
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

/**
 * Rótulo de bloco dentro de um slide (caixa alta, espaçado). Em cor de acento,
 * não em `COLOR_PRIMARY`: em navy ele competia com o texto do próprio bloco e
 * a seção não se lia como um separador.
 */
function addSectionLabel(slide: Slide, text: string, x: number, y: number, w: number): void {
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

export function addProjectSlide(
  pres: PptxGenJS,
  project: ProjectDeckRow,
  extraQuantitativeLines: QuantitativeLine[] = []
): void {
  // Área alinhada à direita do título: com dezenas de slides de processo em
  // sequência, só o título não deixa localizar de quem é o processo ao folhear
  // o deck. Na linha do título (e não abaixo dela) para não esbarrar na régua
  // de acento nem empurrar as duas colunas de conteúdo, que têm altura
  // calculada.
  const slide = addTitledSlide(pres, project.title, undefined, project.area?.name);

  // ----- Coluna esquerda: textos (só campos já preenchidos) -----
  // Alinhadas à margem única do deck (MARGIN_X) e ao topo de conteúdo padrão,
  // para o slide de processo não "dançar" em relação aos demais quando o deck
  // é folheado.
  const leftX = MARGIN_X;
  const leftW = 6.1;
  let leftY = CONTENT_TOP_Y;

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
  const rightX = 7.05;
  const rightW = 13.33 - MARGIN_X - rightX;

  const quantitativeLines = [...buildQuantitativeLines(project), ...extraQuantitativeLines];
  addSectionLabel(slide, "Avaliação Quantitativa", rightX, CONTENT_TOP_Y, rightW);

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

/**
 * Slide de conteúdo: título + régua de acento + texto explicativo opcional.
 *
 * A régua abaixo do título ancora visualmente a página. O texto explicativo
 * ("narrativa") é o parágrafo que o deck feito à mão sempre teve e o gerado
 * não tinha: diz em uma ou duas linhas o que o slide mostra e como lê-lo, para
 * o material se sustentar sozinho quando é enviado por e-mail sem ninguém
 * apresentando. Texto genérico de propósito — não descreve os números da
 * empresa, descreve o que a tabela/gráfico significa.
 */
export function addTitledSlide(
  pres: PptxGenJS,
  title: string,
  narrative?: string,
  /**
   * Rótulo curto alinhado à direita, na mesma linha do título (usado pela área
   * do processo). Fica aqui, e não como um texto solto no slide, porque a
   * largura do título precisa encolher para abrir espaço — senão um título
   * longo passa por baixo do rótulo.
   */
  tag?: string
): Slide {
  const slide = pres.addSlide({ masterName: MASTER_CONTENT });
  const tagW = tag ? 3.2 : 0;
  slide.addText(title, {
    x: MARGIN_X,
    y: 0.35,
    w: CONTENT_W - tagW,
    h: 0.5,
    fontSize: TYPE.slideTitle,
    bold: true,
    color: COLOR_PRIMARY,
  });
  if (tag) {
    slide.addText(tag.toUpperCase(), {
      x: MARGIN_X + CONTENT_W - tagW,
      y: 0.35,
      w: tagW,
      h: 0.5,
      align: "right",
      valign: "middle",
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1.5,
      color: COLOR_MUTED,
    });
  }
  slide.addShape("rect", {
    x: MARGIN_X,
    y: 0.92,
    w: 0.9,
    h: 0.035,
    fill: { color: COLOR_ACCENT },
  });
  if (narrative) {
    slide.addText(narrative, {
      x: MARGIN_X,
      y: 1.04,
      // Medida de leitura controlada: o parágrafo ocupa ~75% da largura em vez
      // da linha inteira de 12", que ficaria longa demais para ler confortável.
      w: CONTENT_W * 0.78,
      h: 1.0,
      fontSize: TYPE.slideSubtitle,
      color: COLOR_SECONDARY,
      lineSpacingMultiple: 1.3,
      valign: "top",
    });
  }
  return slide;
}

/**
 * Onde o conteúdo pode começar, conforme o slide tenha texto explicativo ou
 * não. O valor com texto dá uma folga generosa depois do parágrafo: colada nele
 * a tabela parecia continuação da frase, e o texto perdia a função de
 * introduzir o que vem abaixo.
 */
export const CONTENT_TOP_Y = 1.22;
export const CONTENT_TOP_Y_WITH_SUBTITLE = 2.25;

/**
 * Tabela padrão do deck.
 *
 * Mudança de estilo em relação à versão anterior, que desenhava uma borda sólida
 * em TODAS as células: grade fechada é a marca visual de planilha, não de
 * material de consultoria. Aqui só existem linhas horizontais finas, com zebra
 * alternada para o olho seguir a linha — o alinhamento das colunas já separa
 * verticalmente, sem precisar de traço.
 */
export function addSlideTable(
  slide: Slide,
  rows: TableRow[],
  colW: number[],
  options?: { y?: number }
): void {
  // Zebra aplicada aqui (e não em quem monta as linhas) para que a alternância
  // continue correta mesmo quando o chamador já definiu `fill` em alguma
  // célula — as opções da linha vencem as do nível da tabela.
  const striped = rows.map((row, index) =>
    index > 0 && index % 2 === 0
      ? row.map((cell) => ({
          ...cell,
          options: { fill: { color: COLOR_ZEBRA }, ...cell.options },
        }))
      : row
  );

  slide.addTable(striped, {
    x: MARGIN_X,
    y: options?.y ?? CONTENT_TOP_Y,
    w: CONTENT_W,
    colW,
    fontSize: TYPE.body,
    color: COLOR_PRIMARY,
    border: [
      { type: "none" },
      { type: "none" },
      { type: "solid", pt: 0.75, color: COLOR_TABLE_BORDER },
      { type: "none" },
    ],
    valign: "middle",
    // Respiro interno: a tabela antiga colava o texto na borda da célula, o que
    // é o detalhe que mais denuncia "gerado por script" num deck.
    margin: [0.06, 0.1, 0.06, 0.1],
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageSlideStartY: CONTENT_TOP_Y,
  });
}
