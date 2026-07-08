import type { Project } from "@prisma/client";

/**
 * Motor de scoring do Pipeline — funções PURAS (sem I/O, sem ctx.db),
 * pensadas para serem testáveis isoladamente.
 *
 * Nenhuma tela consome estas funções ainda; isso é responsabilidade de
 * uma tarefa futura do blueprint de diagnóstico de robotização.
 */

/** Valor usado quando um rating individual é `null` (mesma convenção de project-executive-slide.tsx). */
export const DEFAULT_RATING = 3;

export type QualitativeWeights = {
  qualWeightErrorReduction: number;
  qualWeightProcessCriticality: number;
  qualWeightInternalImpact: number;
  qualWeightExternalImpact: number;
  qualWeightCompliance: number;
};

export type CombinedScoreWeights = {
  scoreWeightEconomia: number;
  scoreWeightQualitativo: number;
  scoreWeightComplexidade: number;
};

type ProjectRatings = Pick<
  Project,
  | "ratingErrorReduction"
  | "ratingProcessCriticality"
  | "ratingInternalImpact"
  | "ratingExternalImpact"
  | "ratingCompliance"
>;

/**
 * Soma ponderada dos 5 ratings qualitativos, cada um normalizado /5 antes de
 * multiplicar pelo peso correspondente. Retorna 0-100.
 * Ratings `null` usam DEFAULT_RATING.
 */
export function computeQualitativeScore(
  project: ProjectRatings,
  weights: QualitativeWeights
): number {
  const norm = (rating: number | null) => (rating ?? DEFAULT_RATING) / 5;

  const weighted =
    norm(project.ratingErrorReduction) * weights.qualWeightErrorReduction +
    norm(project.ratingProcessCriticality) * weights.qualWeightProcessCriticality +
    norm(project.ratingInternalImpact) * weights.qualWeightInternalImpact +
    norm(project.ratingExternalImpact) * weights.qualWeightExternalImpact +
    norm(project.ratingCompliance) * weights.qualWeightCompliance;

  return weighted * 100;
}

/**
 * Mapeia a dificuldade técnica (complexidade) para um score 0-1 onde valores
 * maiores significam "mais fácil" (portanto melhor para priorizar).
 * Retorna 0.6 quando `complexity` é null ou não reconhecido.
 */
export function computeComplexityScore(complexity: string | null): number {
  const map: Record<string, number> = { baixa: 1, media: 0.6, alta: 0.3 };
  if (complexity === null) return 0.6;
  return map[complexity] ?? 0.6;
}

/**
 * Score de economia financeira relativo ao maior valor do conjunto avaliado.
 * Retorna 0-1 (clampado). Retorna 0 se a economia for null ou o máximo for 0.
 */
export function computeEconomiaScore(
  estimatedAnnualSavingBRL: number | null,
  maxSavingInSet: number
): number {
  if (estimatedAnnualSavingBRL === null || maxSavingInSet === 0) return 0;
  const ratio = estimatedAnnualSavingBRL / maxSavingInSet;
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Score combinado (0-100) cruzando economia financeira, qualitativo e
 * dificuldade técnica, de acordo com os pesos configuráveis.
 */
export function computeCombinedScore(
  economiaScore: number,
  qualitativeScore0to100: number,
  complexityScore: number,
  weights: CombinedScoreWeights
): number {
  const combined =
    economiaScore * weights.scoreWeightEconomia +
    (qualitativeScore0to100 / 100) * weights.scoreWeightQualitativo +
    complexityScore * weights.scoreWeightComplexidade;

  return Math.round(100 * combined);
}
