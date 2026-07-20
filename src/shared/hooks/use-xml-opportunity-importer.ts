"use client";

import { useRef, useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { parseSolicitacaoXml } from "@/src/app/(private)/cliente/solicitar/utils/xml-import";
import { buildProjectPayload } from "@/src/app/(private)/cliente/solicitar/utils/build-project-payload";

export interface BatchContext {
  /** Rótulo exibido no diálogo — nome do arquivo .xml no import em lote, ou título sugerido de uma oportunidade gerada por IA. */
  label: string;
  index: number;
  total: number;
}

export interface TaxonomyResult {
  id: string;
  slug: string;
  name: string;
}

export interface TaxonomyResolutionState {
  kind: "area" | "theme";
  rawValue: string;
  // Ambos só usados quando kind === "theme", para a área já resolvida a que o tema pertence:
  // areaIdForTheme é o id real (necessário pro createTheme), areaSlugForTheme é a chave usada
  // pelo Record de temas por área (indexado por slug, não por id) pra listar os temas dela.
  areaIdForTheme?: string;
  areaSlugForTheme?: string;
  batchContext?: BatchContext;
}

export type XmlImportOutcome =
  | { ok: true; title: string; hasWarnings: boolean }
  | { ok: false; error: string };

export interface XmlOpportunityImporterOptions {
  userId: string | undefined;
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  companies: { id: string; name: string }[];
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
  /**
   * Quando definido, toda entrada é criada nesta empresa direto — não abre o
   * diálogo de "empresa ambígua" nem usa a tag <empresa> do XML. Usado pela
   * geração de oportunidades por IA, onde a empresa já foi escolhida antes
   * de gerar.
   */
  forcedCompanyId?: string;
}

/**
 * Lógica de resolução empresa/área/tema + criação de projeto a partir de um
 * XML de <solicitacaoDeProjeto> já parseado — reaproveitada pelo import de
 * XML/zip em /cliente/solicitar e pela geração de oportunidades por IA em
 * /admin/oportunidades/gerar-ia. A UI dos diálogos vive em
 * xml-opportunity-resolution-dialogs.tsx (mesmo hook, dois consumidores).
 *
 * Resolução de empresa/área/tema pausa o loop de import via uma Promise
 * guardada em ref, resolvida quando o diálogo correspondente fecha — todo
 * caminho que fecha um diálogo DEVE passar pela função close* correspondente,
 * senão a Promise nunca resolve e o import trava indefinidamente naquele item.
 */
export function useXmlOpportunityImporter(options: XmlOpportunityImporterOptions) {
  const { userId, areas, themesByArea, companies, buildTypeLabel, forcedCompanyId } = options;
  const { addProject } = useProjects();

  const [pendingXmlImport, setPendingXmlImport] = useState<{
    rawCompanyName: string;
    batchContext?: BatchContext;
  } | null>(null);
  const [chosenCompanyId, setChosenCompanyId] = useState<string | undefined>();
  const companyResolverRef = useRef<((companyId: string | null) => void) | null>(null);

  const [pendingTaxonomyResolution, setPendingTaxonomyResolution] =
    useState<TaxonomyResolutionState | null>(null);
  const [chosenTaxonomyId, setChosenTaxonomyId] = useState<string | undefined>();
  const [creatingNewTaxonomy, setCreatingNewTaxonomy] = useState(false);
  const taxonomyResolverRef = useRef<((result: TaxonomyResult | null) => void) | null>(null);

  const areaResolutionCacheRef = useRef<Map<string, TaxonomyResult>>(new Map());
  const themeResolutionCacheRef = useRef<Map<string, TaxonomyResult>>(new Map());

  function closeCompanyResolutionDialog(companyId: string | null) {
    companyResolverRef.current?.(companyId);
    companyResolverRef.current = null;
    setPendingXmlImport(null);
    setChosenCompanyId(undefined);
  }

  function resolveCompanyAmbiguity(
    rawCompanyName: string,
    batchContext?: BatchContext
  ): Promise<string | null> {
    return new Promise((resolve) => {
      companyResolverRef.current = resolve;
      setPendingXmlImport({ rawCompanyName, batchContext });
      setChosenCompanyId(companies.length === 1 ? companies[0].id : undefined);
    });
  }

  function closeTaxonomyResolutionDialog(result: TaxonomyResult | null) {
    taxonomyResolverRef.current?.(result);
    taxonomyResolverRef.current = null;
    setPendingTaxonomyResolution(null);
    setChosenTaxonomyId(undefined);
    setCreatingNewTaxonomy(false);
  }

  function resolveTaxonomyAmbiguity(
    kind: "area" | "theme",
    rawValue: string,
    areaIdForTheme?: string,
    areaSlugForTheme?: string,
    batchContext?: BatchContext
  ): Promise<TaxonomyResult | null> {
    return new Promise((resolve) => {
      taxonomyResolverRef.current = resolve;
      setPendingTaxonomyResolution({ kind, rawValue, areaIdForTheme, areaSlugForTheme, batchContext });
      setChosenTaxonomyId(undefined);
      setCreatingNewTaxonomy(false);
    });
  }

  async function importXmlEntry(
    xmlText: string,
    batchContext?: BatchContext
  ): Promise<XmlImportOutcome> {
    if (!userId) return { ok: false, error: "Faça login para importar um XML." };

    const result = parseSolicitacaoXml(xmlText, { areas, themesByArea, companies });
    if (!result.ok) return { ok: false, error: result.error };

    let companyId = forcedCompanyId ?? result.companyId;
    if (!forcedCompanyId && result.companyUnresolved) {
      if (companies.length === 0) {
        return {
          ok: false,
          error: result.rawCompanyName
            ? `A tag <empresa> tem o valor '${result.rawCompanyName}', mas não há nenhuma empresa disponível para associar este processo.`
            : "Não há nenhuma empresa disponível para associar este processo.",
        };
      }
      const chosen = await resolveCompanyAmbiguity(result.rawCompanyName, batchContext);
      if (!chosen) return { ok: false, error: "Empresa não resolvida (seleção cancelada)." };
      companyId = chosen;
    }

    let resolvedAreaId: string | undefined = result.areaId;
    let resolvedAreaSlug: string | undefined =
      result.formData.projectArea !== "outro" ? result.formData.projectArea : undefined;
    let resolvedThemeId: string | undefined = result.themeId;

    if (result.formData.projectArea === "outro" && result.formData.customProjectArea.trim()) {
      const rawArea = result.formData.customProjectArea.trim();
      const areaCacheKey = rawArea.toLowerCase();
      const cachedArea = areaResolutionCacheRef.current.get(areaCacheKey);
      const resolvedArea =
        cachedArea ?? (await resolveTaxonomyAmbiguity("area", rawArea, undefined, undefined, batchContext));
      if (resolvedArea) {
        if (!cachedArea) areaResolutionCacheRef.current.set(areaCacheKey, resolvedArea);
        resolvedAreaId = resolvedArea.id;
        resolvedAreaSlug = resolvedArea.slug;
        result.formData.projectArea = resolvedArea.slug;
        result.formData.customProjectArea = resolvedArea.slug === "outro" ? result.formData.customProjectArea : "";
      }
    }

    if (result.formData.projectTheme === "outro" && result.formData.customProjectTheme.trim()) {
      const rawTheme = result.formData.customProjectTheme.trim();
      const themeCacheKey = `${resolvedAreaSlug ?? ""}::${rawTheme.toLowerCase()}`;
      const cachedTheme = themeResolutionCacheRef.current.get(themeCacheKey);
      const resolvedTheme =
        cachedTheme ??
        (await resolveTaxonomyAmbiguity("theme", rawTheme, resolvedAreaId, resolvedAreaSlug, batchContext));
      if (resolvedTheme) {
        if (!cachedTheme) themeResolutionCacheRef.current.set(themeCacheKey, resolvedTheme);
        resolvedThemeId = resolvedTheme.id;
        result.formData.projectTheme = resolvedTheme.slug;
        result.formData.customProjectTheme = "";
      }
    }

    try {
      const payload = buildProjectPayload({
        data: result.formData,
        features: result.features,
        benefits: result.benefits,
        clientId: userId,
        companyId,
        areaId: resolvedAreaId,
        themeId: resolvedThemeId,
        areas,
        themesByArea,
        buildTypeLabel,
      });
      await addProject(payload);
      return { ok: true, title: result.formData.title, hasWarnings: result.warnings.length > 0 };
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      return { ok: false, error: `Não foi possível criar o processo: ${message}` };
    }
  }

  const availableTaxonomyOptions =
    pendingTaxonomyResolution?.kind === "area"
      ? areas
      : themesByArea[pendingTaxonomyResolution?.areaSlugForTheme ?? ""] ?? [];

  return {
    importXmlEntry,
    pendingXmlImport,
    chosenCompanyId,
    setChosenCompanyId,
    closeCompanyResolutionDialog,
    pendingTaxonomyResolution,
    chosenTaxonomyId,
    setChosenTaxonomyId,
    creatingNewTaxonomy,
    setCreatingNewTaxonomy,
    closeTaxonomyResolutionDialog,
    availableTaxonomyOptions,
  };
}
