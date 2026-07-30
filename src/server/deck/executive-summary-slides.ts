import PptxGenJS from "pptxgenjs";
import { formatCompactBRL, formatDate } from "@/shared/utils";
import {
  COLOR_ACCENT,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SECONDARY,
  COLOR_SURFACE,
  COLOR_TABLE_BORDER,
  COLOR_ZEBRA,
  CONTENT_TOP_Y_WITH_SUBTITLE,
  CONTENT_W,
  MARGIN_X,
  TYPE,
  addTitledSlide,
} from "./deck-theme";

/**
 * Os dois slides de abertura do deck de diagnóstico: o que foi feito e qual o
 * resultado. Vêm antes de qualquer tabela porque é isso que decide se quem
 * recebe o arquivo por e-mail continua lendo.
 *
 * Módulo sem acesso a banco e sem regra de negócio: recebe números já
 * calculados por `buildDiagnosticDeck` e só decide como desenhá-los.
 */

/** Só os campos lidos daqui — mantém o módulo independente do tipo do ranking. */
type RankedOpportunity = { id: string; estimatedAnnualSavingBRL: number | null };
type ProjectHours = { id: string; currentAnnualHours: number | null };
type InterviewLike = {
  status: string;
  area: { name: string } | null;
  participants: { personId: string }[];
};

/**
 * Recorte de `DeckPayback` que o slide 2 consome. Declarado aqui, e não
 * importado de `build-diagnostic-deck.ts`, para este módulo não ter nenhuma
 * aresta de volta para quem o importa — nem de tipo.
 */
export type PaybackSummary = {
  curve: { date: Date; cumulativeCost: number; cumulativeSaving: number }[];
  paybackMonths: number | null;
  scheduledCount: number;
};

export type ExecutiveSummaryData = {
  opportunityCount: number;
  areaCount: number;
  manualHoursPerYear: number;
  totalAnnualSavingBRL: number;
  completedInterviewCount: number;
  peopleHeardCount: number;
  areasHeard: string[];
};

/**
 * As horas vêm dos projetos cruzados com o ranking, e não de `getAreaSummary`:
 * o resumo por área só conta projetos COM área definida, então usá-lo
 * subestimaria as horas em qualquer empresa que tenha uma oportunidade sem
 * área. O cruzamento por id aplica a mesma população do ranking (pipeline,
 * fora DONE/CANCELLED) sobre a lista completa de projetos.
 */
export function buildExecutiveSummaryData(input: {
  ranking: RankedOpportunity[];
  areaCount: number;
  projects: ProjectHours[];
  interviews: InterviewLike[];
}): ExecutiveSummaryData {
  const rankedIds = new Set(input.ranking.map((row) => row.id));
  const manualHoursPerYear = input.projects
    .filter((project) => rankedIds.has(project.id))
    .reduce((sum, project) => sum + (project.currentAnnualHours ?? 0), 0);

  const completed = input.interviews.filter((interview) => interview.status === "realizado");
  const people = new Set(
    completed.flatMap((interview) => interview.participants.map((p) => p.personId))
  );
  const areasHeard = Array.from(
    new Set(
      completed
        .map((interview) => interview.area?.name)
        .filter((name): name is string => Boolean(name))
    )
  );

  return {
    opportunityCount: input.ranking.length,
    areaCount: input.areaCount,
    manualHoursPerYear,
    totalAnnualSavingBRL: input.ranking.reduce(
      (sum, row) => sum + (row.estimatedAnnualSavingBRL ?? 0),
      0
    ),
    completedInterviewCount: completed.length,
    peopleHeardCount: people.size,
    areasHeard,
  };
}

/** `9800` → `"9.800 h"`. */
function formatHours(hours: number): string {
  return `${new Intl.NumberFormat("pt-BR").format(Math.round(hours))} h`;
}

const SCOPE_NARRATIVE =
  "O diagnóstico percorreu as áreas operacionais da empresa para identificar, quantificar e priorizar processos com potencial de automação. Cada oportunidade foi levantada junto a quem executa a atividade hoje e validada com o gestor da área.";

/** Traço em vez de zero quando a empresa não tem o dado. */
const NO_DATA = "—";

export function addExecutiveScopeSlide(pres: PptxGenJS, data: ExecutiveSummaryData): void {
  const slide = addTitledSlide(pres, "O trabalho realizado", SCOPE_NARRATIVE);

  const steps = [
    {
      number: "01",
      label: "Entrevistas",
      value:
        data.completedInterviewCount > 0
          ? `${data.completedInterviewCount} ${data.completedInterviewCount === 1 ? "entrevista realizada" : "entrevistas realizadas"}\n${data.peopleHeardCount} ${data.peopleHeardCount === 1 ? "pessoa ouvida" : "pessoas ouvidas"}`
          : NO_DATA,
    },
    {
      number: "02",
      label: "Mapeamento",
      value: `${data.opportunityCount} ${data.opportunityCount === 1 ? "processo detalhado" : "processos detalhados"}`,
    },
    {
      number: "03",
      label: "Quantificação",
      value: `${formatHours(data.manualHoursPerYear)} de trabalho manual por ano`,
    },
    {
      number: "04",
      label: "Priorização",
      value: `${data.areaCount} ${data.areaCount === 1 ? "área coberta" : "áreas cobertas"}`,
    },
  ];

  const gap = 0.25;
  const stepW = (CONTENT_W - gap * 3) / 4;
  const stepH = 1.7;
  const top = CONTENT_TOP_Y_WITH_SUBTITLE;

  steps.forEach((step, index) => {
    const x = MARGIN_X + index * (stepW + gap);
    slide.addShape("rect", { x, y: top, w: stepW, h: stepH, fill: { color: COLOR_ZEBRA } });
    // Barra de acento à esquerda: mesma marca visual da caixa de destaque do
    // slide de processo, sem introduzir cor nova.
    slide.addShape("rect", { x, y: top, w: 0.05, h: stepH, fill: { color: COLOR_ACCENT } });
    slide.addText(step.number, {
      x: x + 0.25,
      y: top + 0.16,
      w: stepW - 0.45,
      h: 0.3,
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1.5,
      color: COLOR_ACCENT,
    });
    slide.addText(step.label, {
      x: x + 0.25,
      y: top + 0.48,
      w: stepW - 0.45,
      h: 0.36,
      fontSize: TYPE.bodyLarge,
      bold: true,
      color: COLOR_PRIMARY,
    });
    slide.addText(step.value, {
      x: x + 0.25,
      y: top + 0.88,
      w: stepW - 0.45,
      h: 0.7,
      fontSize: TYPE.body,
      color: COLOR_SECONDARY,
      lineSpacingMultiple: 1.25,
      valign: "top",
    });
  });

  if (data.areasHeard.length > 0) {
    slide.addText(`Áreas ouvidas:  ${data.areasHeard.join("  ·  ")}`, {
      x: MARGIN_X,
      y: top + stepH + 0.45,
      w: CONTENT_W,
      h: 0.5,
      fontSize: TYPE.body,
      color: COLOR_MUTED,
      valign: "top",
    });
  }
}

const NUMBERS_NARRATIVE =
  "Resultado consolidado das oportunidades mapeadas, considerando o cronograma de implementação proposto e os custos de desenvolvimento, sustentação e estrutura.";

export function addExecutiveNumbersSlide(
  pres: PptxGenJS,
  data: ExecutiveSummaryData,
  payback: PaybackSummary
): void {
  const slide = addTitledSlide(pres, "Os números do diagnóstico", NUMBERS_NARRATIVE);

  const kpis: { value: string; label: string; accent: boolean }[] = [
    { value: String(data.opportunityCount), label: "Oportunidades", accent: false },
    { value: String(data.areaCount), label: "Áreas", accent: false },
    { value: formatHours(data.manualHoursPerYear), label: "Trabalho manual/ano", accent: false },
    { value: formatCompactBRL(data.totalAnnualSavingBRL), label: "Economia anual", accent: true },
    {
      value:
        payback.paybackMonths != null
          ? `${payback.paybackMonths} ${payback.paybackMonths === 1 ? "mês" : "meses"}`
          : NO_DATA,
      label: payback.paybackMonths != null ? "Payback" : "Payback não atingido",
      accent: true,
    },
  ];

  const top = CONTENT_TOP_Y_WITH_SUBTITLE;
  const kpiW = CONTENT_W / kpis.length;
  kpis.forEach((kpi, index) => {
    const x = MARGIN_X + index * kpiW;
    // Régua superior em vez de caixa: o número precisa ser a única coisa pesada
    // da faixa, e cinco caixas seguidas leem como tabela.
    slide.addShape("rect", { x, y: top, w: kpiW - 0.3, h: 0.028, fill: { color: COLOR_ACCENT } });
    slide.addText(kpi.value, {
      x,
      y: top + 0.14,
      w: kpiW - 0.3,
      h: 0.62,
      fontSize: TYPE.metricValue,
      bold: true,
      color: kpi.accent ? COLOR_ACCENT : COLOR_PRIMARY,
      valign: "top",
    });
    slide.addText(kpi.label.toUpperCase(), {
      x,
      y: top + 0.8,
      w: kpiW - 0.3,
      h: 0.4,
      fontSize: TYPE.eyebrow,
      bold: true,
      charSpacing: 1,
      color: COLOR_MUTED,
      valign: "top",
    });
  });

  // Nota só quando os dois escopos divergem: economia soma tudo que foi
  // mapeado, payback só o que já tem onda. Sem a nota, o leitor cruza os dois
  // números e conclui que um deles está errado.
  const hasScopeNote = payback.scheduledCount < data.opportunityCount;
  const chartTop = top + 1.35;
  const chartBottom = hasScopeNote ? 6.4 : 6.8;

  if (payback.curve.length === 0) {
    slide.addText("Cronograma ainda não definido — nenhuma oportunidade alocada em onda.", {
      x: MARGIN_X,
      y: chartTop,
      w: CONTENT_W,
      h: 0.5,
      fontSize: TYPE.bodyLarge,
      color: COLOR_MUTED,
    });
  } else {
    const labels = payback.curve.map((point) => formatDate(point.date));
    slide.addChart(
      "line",
      [
        {
          name: "Custo acumulado",
          labels,
          values: payback.curve.map((point) => Math.round(point.cumulativeCost)),
        },
        {
          name: "Economia acumulada",
          labels,
          values: payback.curve.map((point) => Math.round(point.cumulativeSaving)),
        },
      ],
      {
        x: MARGIN_X,
        y: chartTop,
        w: CONTENT_W,
        h: chartBottom - chartTop,
        showLegend: true,
        legendPos: "b",
        legendFontSize: TYPE.caption,
        lineDataSymbol: "none",
        lineSize: 2.5,
        chartColors: [COLOR_MUTED, COLOR_ACCENT],
        // Aqui a curva é ilustrativa — o slide com as datas legíveis vem depois,
        // na Parte 2. Esconder o eixo de categoria evita a faixa preta de ~261
        // rótulos semanais num gráfico que só precisa mostrar o cruzamento.
        catAxisHidden: true,
        valAxisLabelFontSize: TYPE.caption - 1,
        valAxisLabelColor: COLOR_MUTED,
        valAxisLabelFormatCode: "R$ #,##0",
        valGridLine: { style: "solid", size: 0.5, color: COLOR_TABLE_BORDER },
        catGridLine: { style: "none" },
        border: { pt: 0, color: COLOR_SURFACE },
      }
    );
  }

  if (hasScopeNote) {
    slide.addText(
      `Economia anual considera as ${data.opportunityCount} oportunidades mapeadas; o payback é calculado sobre as ${payback.scheduledCount} já alocadas nas ondas 1 e 2.`,
      {
        x: MARGIN_X,
        y: 6.48,
        w: CONTENT_W,
        h: 0.35,
        fontSize: TYPE.caption,
        color: COLOR_MUTED,
        valign: "top",
      }
    );
  }
}
