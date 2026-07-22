"use client";

import { trpc } from "@/shared/trpc/client";
import {
  PROJECT_AREAS as FALLBACK_AREAS,
  PROJECT_THEMES_BY_AREA as FALLBACK_THEMES,
  FEATURE_SUGGESTION_GROUPS as FALLBACK_SUGGESTIONS,
  URGENCY_LEVELS as FALLBACK_URGENCY_LEVELS,
} from "@/shared/constants/project-taxonomy";

/**
 * Hook que busca áreas, temas e sugestões de funcionalidades do banco de dados.
 * Enquanto carrega (ou em caso de erro), usa os dados padrão do sistema.
 */
export function useTaxonomy() {
  const { data: dbAreas, isLoading } = trpc.taxonomy.listAreas.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  const { data: dbSuggestions } = trpc.taxonomy.listSuggestions.useQuery(
    { areaSlug: undefined },
    { staleTime: 1000 * 60 * 5 }
  );

  const { data: dbUrgencyLevels, isLoading: isLoadingUrgencyLevels } =
    trpc.taxonomy.listUrgencyLevels.useQuery(undefined, {
      staleTime: 1000 * 60 * 5,
    });

  // Se o banco ainda não tem dados (não seeded), usa os hardcoded
  const useDb = !isLoading && dbAreas && dbAreas.length > 0;

  const useDbUrgencyLevels =
    !isLoadingUrgencyLevels && dbUrgencyLevels && dbUrgencyLevels.length > 0;
  const urgencyLevels = useDbUrgencyLevels
    ? dbUrgencyLevels!.map((u) => ({ value: u.slug, label: u.name }))
    : FALLBACK_URGENCY_LEVELS.filter((u) => u.value !== "outro").map((u) => ({
        value: u.value,
        label: u.label,
      }));

  const areas = useDb
    ? dbAreas!.map((a) => ({ value: a.slug, label: a.name, id: a.id as string | undefined }))
    : FALLBACK_AREAS.map((a) => ({ value: a.value, label: a.label, id: undefined as string | undefined }));

  const themesByArea: Record<string, { value: string; label: string; id?: string }[]> = useDb
    ? Object.fromEntries(
        dbAreas!.map((a) => [
          a.slug,
          a.themes.map((t) => ({ value: t.slug, label: t.name, id: t.id as string | undefined })),
        ])
      )
    : FALLBACK_THEMES;

  // Sugestões agrupadas por área
  const suggestionGroups = (() => {
    if (!useDb || !dbSuggestions || dbSuggestions.length === 0) {
      return FALLBACK_SUGGESTIONS;
    }
    // Agrupar por areaSlug
    const grouped = new Map<string, string[]>();
    for (const s of dbSuggestions) {
      if (!grouped.has(s.areaSlug)) grouped.set(s.areaSlug, []);
      grouped.get(s.areaSlug)!.push(s.label);
    }
    // Converter para o formato { category, items }
    return dbAreas!
      .filter((a) => grouped.has(a.slug))
      .map((a) => ({
        category: a.name,
        items: grouped.get(a.slug) ?? [],
      }))
      .filter((g) => g.items.length > 0);
  })();

  function buildTypeLabel(areaSlug: string, themeSlug: string): string {
    const area = areas.find((a) => a.value === areaSlug);
    const themes = themesByArea[areaSlug] ?? [];
    const theme = themes.find((t) => t.value === themeSlug);
    if (!area?.label) return theme?.label ?? "Outro";
    if (!theme?.label) return area.label;
    return `${area.label} - ${theme.label}`;
  }

  return {
    areas,
    themesByArea,
    suggestionGroups,
    urgencyLevels,
    buildTypeLabel,
    isLoading,
  };
}
