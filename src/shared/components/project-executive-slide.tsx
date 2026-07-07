"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { Project } from "@/shared/types";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

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

function buildLabeledLines(
  entries: { label: string; value: string | undefined }[]
): { label: string; value: string }[] {
  return entries.filter((e): e is { label: string; value: string } => Boolean(e.value));
}

function withDetail(base: string | undefined, detail: string | undefined): string | undefined {
  if (!base) return undefined;
  return detail ? `${base} — ${detail}` : base;
}

export function ProjectExecutiveSlide({ project }: { project: Project }) {
  const areaEntrevistada = project.projectType.split(" · Plataforma")[0];

  const situacaoAtualLines = buildLabeledLines([
    {
      label: "Abordagem",
      value: withDetail(
        resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
        project.existingSystemDetails
      ),
    },
    {
      label: "Aplicação existente hoje",
      value: withDetail(
        resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
        project.currentApplicationDetails
      ),
    },
    { label: "Público-alvo", value: project.targetAudience },
  ]);

  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (v) => SOLUTION_TYPES.find((s) => s.value === v)?.label ?? v
  );
  const construcaoLines = buildLabeledLines([
    { label: "Solução", value: solutionTypeLabels.length > 0 ? solutionTypeLabels.join(", ") : undefined },
    { label: "Execução", value: resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES) },
  ]);

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );

  const periodicidadeLabel = resolveLabel(project.processFrequency, PROCESS_FREQUENCIES);

  const quantitativeLines = buildLabeledLines([
    { label: "Periodicidade do processo", value: periodicidadeLabel },
    { label: "Rodagem do bot", value: project.robotSchedule },
    {
      label: "Colaboradores",
      value: project.peopleInvolved != null ? String(project.peopleInvolved) : undefined,
    },
    {
      label: "Duração por execução",
      value: project.taskDurationHours != null ? `${project.taskDurationHours}h` : undefined,
    },
    {
      label: "Horas anuais",
      value: project.currentAnnualHours != null ? `${project.currentAnnualHours}h` : undefined,
    },
  ]);
  const monthlyHoursSavedLabel =
    project.monthlyHoursSaved != null ? `${project.monthlyHoursSaved}h/mês` : undefined;

  const ratingValues = RATING_AXES.map((axis) => project[axis.key] ?? DEFAULT_RATING);
  const ratingAverage = ratingValues.reduce((sum, v) => sum + v, 0) / ratingValues.length;
  const ratingPercent = Math.round((ratingAverage / 5) * 100);
  const ratingAverageLabel = ratingAverage.toFixed(1).replace(".", ",");

  return (
    <div className="executive-slide-print-root relative mx-auto aspect-[16/9] max-w-[1100px] overflow-hidden bg-white text-[#1a1a2e] shadow-md">
      <div
        className="absolute inset-y-0 left-0 w-16"
        style={{ background: "#1a2b4a", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
      />
      <div
        className="absolute inset-y-0 left-[18px] w-[46px]"
        style={{ background: "#14b8a6", clipPath: "polygon(0 0, 100% 0, 40% 100%, 0 100%)" }}
      />

      <div className="absolute inset-0 flex flex-col p-10 pl-[100px]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            {project.companyName && (
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {project.companyName}
              </div>
            )}
            <h1 className="max-w-[85%] text-3xl font-extrabold leading-tight tracking-tight">
              {project.title}
            </h1>
            {areaEntrevistada && (
              <p className="mt-1 text-sm font-semibold text-teal-600">{areaEntrevistada}</p>
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

        <div className="flex flex-1 gap-10">
          <div className="flex flex-1 flex-col gap-5">
            {project.description && (
              <div>
                <SectionLabel>O processo hoje</SectionLabel>
                <p className="line-clamp-3 mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {project.description}
                </p>
              </div>
            )}
            {situacaoAtualLines.length > 0 && (
              <div>
                <SectionLabel>Situação atual</SectionLabel>
                <div className="mt-1.5 space-y-0.5">
                  {situacaoAtualLines.map((line) => (
                    <p
                      key={line.label}
                      className="line-clamp-2 text-sm leading-relaxed text-foreground/90"
                    >
                      <span className="font-medium">{line.label}:</span> {line.value}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {construcaoLines.length > 0 && (
              <div>
                <SectionLabel>Construção</SectionLabel>
                <div className="mt-1.5 space-y-0.5">
                  {construcaoLines.map((line) => (
                    <p
                      key={line.label}
                      className="line-clamp-2 text-sm leading-relaxed text-foreground/90"
                    >
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
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
                  {project.architectNotes}
                </p>
              </div>
            )}
            {benefitLabels.length > 0 && (
              <div>
                <SectionLabel>Benefícios esperados</SectionLabel>
                <p className="line-clamp-2 mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {benefitLabels.join(" · ")}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-5">
            {quantitativeLines.length > 0 && (
              <div>
                <SectionLabel>Avaliação Quantitativa</SectionLabel>
                <table className="mt-1.5 w-full border-collapse text-sm">
                  <tbody>
                    {quantitativeLines.map((line) => (
                      <tr key={line.label} className="border-b border-slate-100 last:border-b-0">
                        <td className="bg-teal-50 px-3 py-2 font-medium text-teal-700">
                          {line.label}
                        </td>
                        <td className="px-3 py-2 text-foreground/90">{line.value}</td>
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
  );
}
