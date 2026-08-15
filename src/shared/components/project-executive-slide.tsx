"use client";

import { type ReactNode } from "react";
import Image from "next/image";
import type { Project, RobotOperationalStatus } from "@/shared/types";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import { formatCurrency } from "@/shared/utils";
import { isExistingAutomation } from "@/shared/lib/opportunity-classification";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { SlidePage } from "./slide/slide-page";
import { EnvironmentSheetPage } from "./slide/environment-sheet-page";
import { RatingRadarChart, RATING_AXES, DEFAULT_RATING } from "./slide/rating-radar-chart";

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

  // Rótulos vindos do enum RobotOperationalStatus — mesma tradução que
  // build-existing-automations-deck.ts usa no deck. Diferente de `status`,
  // este campo NÃO passa por toFrontendStatus: chega com o caixa alta cru do
  // Prisma. Tipado pela união (e não Record<string, string>) para que um
  // quarto membro do enum vire erro de compilação em vez de um "undefined"
  // silencioso na tabela.
  const OPERATIONAL_STATUS_LABEL: Record<RobotOperationalStatus, string> = {
    ACTIVE: "Ativo",
    PAUSED: "Pausado",
    ISSUE: "Com problema",
  };

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
    ...buildLabeledLines([
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : undefined,
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
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
    // print:gap-0 — 24px de respiro entre as páginas na tela, zero na impressão:
    // o gap empurraria a segunda página para uma terceira folha no PDF.
    <div className="flex flex-col items-center gap-6 print:gap-0">
      <SlidePage resetKey={project.id}>
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
      </SlidePage>
      {isExistingAutomation(project) && <EnvironmentSheetPage project={project} />}
    </div>
  );
}
