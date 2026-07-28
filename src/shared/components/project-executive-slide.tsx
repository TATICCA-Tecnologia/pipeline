"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import type { Project } from "@/shared/types";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  resolveLabel,
  resolveCurrentApplicationHostingLabel,
} from "@/shared/constants/project-taxonomy";
import { formatDate } from "@/shared/utils";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
import { useDemoMode } from "@/shared/context/demo-mode-context";

// Página de tamanho fixo (16:9, mesma proporção de um slide de verdade) — o conteúdo
// NUNCA muda o tamanho da página; em vez disso, encolhe (useFitToSlide abaixo) até caber.
const SLIDE_WIDTH = 1100;
const SLIDE_HEIGHT = Math.round((SLIDE_WIDTH * 9) / 16);
const MIN_SLIDE_SCALE = 0.5;

// O conteúdo é medido SEMPRE na largura fixa SLIDE_WIDTH (nunca varia) — isso evita um
// problema real de uma versão anterior desta função, que recalculava a largura junto com
// a escala (pra não sobrar espaço lateral) e podia oscilar sem nunca convergir num valor
// que realmente coubesse, resultando em conteúdo cortado silenciosamente pelo
// overflow:hidden da página. Aqui a conta é direta e sempre garantida: mede a altura
// natural (scrollHeight, que ignora o transform) numa largura fixa, e a escala final é
// sempre >= à necessária pra essa altura caber em SLIDE_HEIGHT — nunca corta conteúdo.
// Um ResizeObserver reage a mudanças tardias de altura (fonte/imagem carregando depois).
function useFitToSlide(
  contentRef: React.RefObject<HTMLDivElement | null>,
  resetKey: string
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    setScale(1);
  }, [resetKey]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      const naturalHeight = el.scrollHeight;
      const next =
        naturalHeight > SLIDE_HEIGHT
          ? Math.max(MIN_SLIDE_SCALE, SLIDE_HEIGHT / naturalHeight)
          : 1;
      setScale((current) => (Math.abs(next - current) > 0.002 ? next : current));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentRef, resetKey]);

  return scale;
}

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
const RADAR_CENTER = { x: 230, y: 150 };
const RADAR_UNIT = 20; // pixels per rating point (1-5 scale => 20-100px radius from center)

function pointAt(radius: number, axisIndex: number): { x: number; y: number } {
  const angle = ((-90 + 72 * axisIndex) * Math.PI) / 180;
  return {
    x: RADAR_CENTER.x + radius * Math.cos(angle),
    y: RADAR_CENTER.y + radius * Math.sin(angle),
  };
}

const CATEGORY_LABEL_POS: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}[] = [
  { x: 230, y: 18, anchor: "middle" },
  { x: 368, y: 109, anchor: "start" },
  { x: 315, y: 271, anchor: "middle" },
  { x: 145, y: 271, anchor: "middle" },
  { x: 92, y: 109, anchor: "end" },
];

function RatingRadarChart({ project }: { project: Project }) {
  const values = RATING_AXES.map((axis) => ({
    ...axis,
    value: project[axis.key] ?? DEFAULT_RATING,
  }));

  const gridRings = [1, 2, 3, 4, 5].map((ring) =>
    RATING_AXES.map((_, i) => {
      const p = pointAt(ring * RADAR_UNIT, i);
      return `${p.x},${p.y}`;
    }).join(" ")
  );

  const dataPolygonPoints = values
    .map((v, i) => {
      const p = pointAt(v.value * RADAR_UNIT, i);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 460 300" className="w-full max-w-[360px]">
        {gridRings.map((points, i) => (
          <polygon key={i} points={points} fill="none" stroke="#e5e5ef" strokeWidth={1} />
        ))}
        {RATING_AXES.map((_, i) => {
          const outer = pointAt(5 * RADAR_UNIT, i);
          return (
            <line
              key={i}
              x1={RADAR_CENTER.x}
              y1={RADAR_CENTER.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#d8d8e5"
            />
          );
        })}
        <polygon
          points={dataPolygonPoints}
          fill="#6366f1"
          fillOpacity={0.32}
          stroke="#4f46e5"
          strokeWidth={2.5}
        />
        {values.map((v, i) => (
          <text
            key={`label-${i}`}
            x={CATEGORY_LABEL_POS[i].x}
            y={CATEGORY_LABEL_POS[i].y}
            fontSize={13}
            fontWeight={600}
            fill="#4b4b5e"
            textAnchor={CATEGORY_LABEL_POS[i].anchor}
          >
            {v.label}
          </text>
        ))}
        {values.map((v, i) => {
          const p = pointAt(v.value * RADAR_UNIT, i);
          return (
            <g key={`badge-${i}`}>
              <circle cx={p.x} cy={p.y} r={14} fill="#ffffff" stroke="#4f46e5" strokeWidth={2} />
              <text
                x={p.x}
                y={p.y + 5}
                fontSize={14}
                fontWeight={800}
                fill="#4f46e5"
                textAnchor="middle"
              >
                {v.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="inline-block border-b-2 border-teal-500 pb-0.5 text-xs font-bold uppercase tracking-wide text-foreground">
      {children}
    </div>
  );
}

// Evita floats longos (ex.: 3.6666666666666665h) ao converter horas anuais em mensais.
function roundHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString().replace(".", ",");
}

function buildLabeledLines(
  entries: { label: string; value: string | undefined }[]
): { label: string; value: string }[] {
  return entries.filter((e): e is { label: string; value: string } => Boolean(e.value));
}

// Igual a buildLabeledLines, mas cada linha pode ter um "detail" (texto de
// contexto complementar) que é renderizado como uma sub-linha própria em vez
// de concatenado na mesma frase — juntar "Abordagem: Não, projeto do zero" a
// um parágrafo inteiro sobre como o processo funciona hoje não lê como uma
// frase única coerente.
function buildLabeledLinesWithDetail(
  entries: { label: string; value: string | undefined; detail?: string }[]
): { label: string; value: string; detail?: string }[] {
  return entries
    .filter((e): e is { label: string; value: string; detail?: string } => Boolean(e.value))
    .map((e) => ({ label: e.label, value: e.value, detail: e.detail?.trim() || undefined }));
}

export function ProjectExecutiveSlide({ project }: { project: Project }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scale = useFitToSlide(contentRef, project.id);
  const { maskFreeText, maskCompanyName } = useDemoMode();

  const areaEntrevistada = project.projectType.split(" · Plataforma")[0];

  const situacaoAtualLines = buildLabeledLinesWithDetail([
    {
      label: "Abordagem",
      value: resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
      detail: maskFreeText(project.existingSystemDetails) ?? undefined,
    },
    {
      label: "Aplicação existente hoje",
      value: resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
      detail: maskFreeText(project.currentApplicationDetails) ?? undefined,
    },
    // Ficha de sustentação: linhas sem valor são descartadas por
    // buildLabeledLinesWithDetail, então um projeto que não é automação
    // existente não ganha nenhuma linha extra aqui.
    // "Onde encontrar" (currentApplicationAccessReference) fica de fora de
    // propósito — é texto livre apontando onde as credenciais moram, e o mesmo
    // critério já exclui esse campo do deck .pptx.
    {
      label: "Onde roda",
      value: resolveCurrentApplicationHostingLabel(
        project.currentApplicationHosting,
        maskFreeText(project.currentApplicationHostingCustom)
      ),
    },
    { label: "Quem desenvolveu", value: maskFreeText(project.currentApplicationAuthor) ?? undefined },
    { label: "Responsável hoje", value: maskFreeText(project.currentApplicationOwner) ?? undefined },
    {
      label: "Onde ficam os acessos",
      value: resolveLabel(
        project.currentApplicationAccessLocation,
        CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS
      ),
    },
    {
      label: "Em produção desde",
      value: project.currentApplicationLiveSince
        ? formatDate(new Date(project.currentApplicationLiveSince))
        : undefined,
    },
    { label: "Público-alvo", value: maskFreeText(project.targetAudience) ?? undefined },
  ]);

  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);
  const construcaoLines = buildLabeledLines([
    { label: "Solução", value: solutionTypeLabels.length > 0 ? solutionTypeLabels.join(", ") : undefined },
    { label: "Execução", value: resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES) },
  ]);

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );

  const periodicidadeLabel = resolveLabel(project.processFrequency, PROCESS_FREQUENCIES);

  // Colaboradores/Duração vêm direto da entrevista com o cliente — ao contrário dos outros
  // campos desta seção, uma lacuna aqui não deve sumir da tabela (pareceria que ninguém
  // perguntou); mostra um rótulo neutro em vez do valor, para ser explicado educadamente
  // ao cliente como algo a confirmar, sem virar um alerta/destaque de atenção no slide.
  const NOT_QUANTIFIED_LABEL = "N/A";

  const quantitativeLines: { label: string; value: string; isGap?: boolean }[] = [
    ...buildLabeledLines([
      { label: "Periodicidade do processo", value: periodicidadeLabel },
      { label: "Rodagem do bot", value: maskFreeText(project.robotSchedule) ?? undefined },
    ]),
    {
      label: "Colaboradores",
      value: project.peopleInvolved != null ? String(project.peopleInvolved) : NOT_QUANTIFIED_LABEL,
      isGap: project.peopleInvolved == null,
    },
    {
      label: "Duração por execução",
      value: project.taskDurationHours != null ? `${project.taskDurationHours}h` : NOT_QUANTIFIED_LABEL,
      isGap: project.taskDurationHours == null,
    },
    ...buildLabeledLines([
      {
        label: "Horas anuais",
        value: project.currentAnnualHours != null ? `${project.currentAnnualHours}h` : undefined,
      },
      {
        label: "Horas totais gastas por mês",
        value:
          project.currentAnnualHours != null
            ? `${roundHours(project.currentAnnualHours / 12)}h`
            : undefined,
      },
    ]),
  ];
  const monthlyHoursSavedLabel =
    project.monthlyHoursSaved != null ? `${project.monthlyHoursSaved}h/mês` : undefined;

  const ratingValues = RATING_AXES.map((axis) => project[axis.key] ?? DEFAULT_RATING);
  const ratingAverage = ratingValues.reduce((sum, v) => sum + v, 0) / ratingValues.length;
  const ratingPercent = Math.round((ratingAverage / 5) * 100);
  const ratingAverageLabel = ratingAverage.toFixed(1).replace(".", ",");

  return (
    <div
      className="executive-slide-print-root relative mx-auto overflow-hidden bg-white shadow-md"
      style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}
    >
      {/*
        Página de tamanho FIXO (16:9) — nunca cresce. Se o conteúdo não couber,
        useFitToSlide encolhe o conteúdo (fonte/espaçamento, via transform: scale)
        até caber, em vez de truncar texto ou mudar o tamanho da página.
      */}
      <div
        ref={contentRef}
        className="relative text-[#1a1a2e]"
        style={{
          width: SLIDE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          // transform não muda a posição de layout do elemento, só o visual — centraliza
          // manualmente o espaço que sobra na largura quando scale < 1 (encolheu).
          marginLeft: (SLIDE_WIDTH * (1 - scale)) / 2,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-16"
          style={{ background: "#1a2b4a", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />
        <div
          className="absolute inset-y-0 left-[18px] w-[46px]"
          style={{ background: "#14b8a6", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
        />

        <div className="relative flex flex-col p-10 pl-[100px]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            {project.companyName && (
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {maskCompanyName(project.companyId, project.companyName)}
              </div>
            )}
            <h1 className="max-w-[85%] text-3xl font-extrabold leading-tight tracking-tight">
              {maskFreeText(project.title)}
            </h1>
            {areaEntrevistada && (
              <p className="mt-1 text-sm font-semibold text-teal-600">{areaEntrevistada}</p>
            )}
            {((project.solutionTypes && project.solutionTypes.length > 0) ||
              project.mainToolCategory) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.solutionTypes?.map((k) => (
                  <span
                    key={k.id}
                    className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"
                  >
                    {k.name}
                  </span>
                ))}
                {project.mainToolCategory && (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {project.mainTool
                      ? `${project.mainToolCategory.name} — ${project.mainTool.name}`
                      : project.mainToolCategory.name}
                  </span>
                )}
              </div>
            )}
          </div>
          <Image
            src="/taticca-logo-horizontal.png"
            alt="TATICCA"
            width={163}
            height={64}
            className="h-16 w-auto flex-shrink-0 object-contain"
          />
        </div>

        <div className="flex gap-10">
          <div className="flex flex-1 flex-col gap-5">
            {project.description && (
              <div>
                <SectionLabel>O processo hoje</SectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {maskFreeText(project.description)}
                </p>
              </div>
            )}
            {situacaoAtualLines.length > 0 && (
              <div>
                <SectionLabel>Situação atual</SectionLabel>
                <div className="mt-1.5 space-y-2">
                  {situacaoAtualLines.map((line) => (
                    <div key={line.label}>
                      <p className="text-sm leading-relaxed text-foreground/90">
                        <span className="font-medium">{line.label}:</span> {line.value}
                      </p>
                      {line.detail && (
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {line.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {construcaoLines.length > 0 && (
              <div>
                <SectionLabel>Construção</SectionLabel>
                <div className="mt-1.5 space-y-0.5">
                  {construcaoLines.map((line) => (
                    <p key={line.label} className="text-sm leading-relaxed text-foreground/90">
                      <span className="font-medium">{line.label}:</span> {line.value}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {project.architectNotes && (
              <div className="rounded-r-md border-l-4 border-teal-500 bg-slate-50 px-4 py-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
                  Principais ações da automação
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {maskFreeText(project.architectNotes)}
                </p>
              </div>
            )}
            {benefitLabels.length > 0 && (
              <div>
                <SectionLabel>Benefícios esperados</SectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {benefitLabels.join(" · ")}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-5">
            {(quantitativeLines.length > 0 || monthlyHoursSavedLabel) && (
              <div>
                <SectionLabel>Avaliação Quantitativa</SectionLabel>
                <table className="mt-1.5 w-full border-collapse text-sm">
                  <tbody>
                    {quantitativeLines.map((line) => (
                      <tr key={line.label} className="border-b border-slate-100 last:border-b-0">
                        <td className="bg-teal-50 px-3 py-2 font-medium text-teal-700">
                          {line.label}
                        </td>
                        <td
                          className={
                            line.isGap
                              ? "px-3 py-2 italic text-muted-foreground"
                              : "px-3 py-2 text-foreground/90"
                          }
                        >
                          {line.value}
                        </td>
                      </tr>
                    ))}
                    {monthlyHoursSavedLabel && (
                      <tr>
                        <td className="bg-teal-50 px-3 py-2 font-medium text-teal-700">
                          Economia estimada
                        </td>
                        <td className="px-3 py-2 font-semibold text-emerald-600">
                          {monthlyHoursSavedLabel}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-1 flex-col">
              <div className="mb-2 flex items-baseline justify-between">
                <SectionLabel>Avaliação Qualitativa</SectionLabel>
                <div className="text-lg font-extrabold text-teal-600">
                  {ratingPercent}%{" "}
                  <span className="text-sm font-semibold text-muted-foreground">
                    ({ratingAverageLabel})
                  </span>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <RatingRadarChart project={project} />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
