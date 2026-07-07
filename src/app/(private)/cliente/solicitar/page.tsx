"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Controller, type FieldPath } from "react-hook-form";
import { useAuth } from "@/shared/context/auth-context";
import { useProjects } from "@/shared/context/projects-context";
import { useFiles } from "@/shared/context/files-context";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/shared/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { useToast } from "@/src/shared/hooks/use-toast";
import { trpc } from "@/shared/trpc/client";
import { useZodForm } from "@/shared/hooks/use-zod-form";
import {
  solicitarProjetoSchema,
  type SolicitarProjetoFormData,
} from "@/shared/schema/solicitar-projeto";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  HelpCircle,
  Plus,
  X,
  Check,
  Upload,
} from "lucide-react";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./utils/solicitar.utils";
import { useTaxonomy } from "./utils/use-taxonomy";
import { buildProjectPayload } from "./utils/build-project-payload";
import { parseSolicitacaoXml } from "./utils/xml-import";
import { extractXmlEntriesFromZip } from "./utils/zip-import";
import { cn } from "@/shared/utils";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const QUALITATIVE_RATINGS = [
  { name: "ratingErrorReduction" as const, label: "Redução de Erros" },
  {
    name: "ratingProcessCriticality" as const,
    label: "Criticidade do processo para a empresa",
  },
  {
    name: "ratingInternalImpact" as const,
    label: "Impacto interno da própria área",
  },
  {
    name: "ratingExternalImpact" as const,
    label: "Impacto externo (clientes/fornecedores)",
  },
  { name: "ratingCompliance" as const, label: "Atendimento a políticas e leis" },
];

type BatchContext = { fileName: string; index: number; total: number };
type BatchImportResult = {
  fileName: string;
  ok: boolean;
  title?: string;
  error?: string;
  hasWarnings?: boolean;
};

type StepKey = "basico" | "envolvidos" | "funcionalidades" | "beneficios" | "prazo";

type StepDef = {
  key: StepKey;
  label: string;
  description: string;
  fieldsToValidate: FieldPath<SolicitarProjetoFormData>[];
};

const STEPS: StepDef[] = [
  {
    key: "basico",
    label: "Básico",
    description: "Informações gerais sobre o processo",
    fieldsToValidate: [
      "title",
      "projectArea",
      "customProjectArea",
      "projectTheme",
      "customProjectTheme",
      "platform",
      "customPlatform",
      "description",
    ],
  },
  {
    key: "envolvidos",
    label: "Envolvidos",
    description: "Quem está envolvido e o estado atual",
    fieldsToValidate: [
      "targetAudience",
      "customTargetAudience",
      "expectedUsers",
      "hasExistingSystem",
      "customHasExistingSystem",
      "existingSystemDetails",
      "hasCurrentApplication",
      "customHasCurrentApplication",
      "currentApplicationDetails",
      "peopleInvolvedDetails",
    ],
  },
  {
    key: "funcionalidades",
    label: "Funcionalidades",
    description: "O que o processo deve contemplar",
    fieldsToValidate: ["projectNarrative"],
  },
  {
    key: "beneficios",
    label: "Benefícios",
    description: "Resultados e impacto esperado",
    fieldsToValidate: [
      "benefitsDetails",
      "monthlyHoursSaved",
      "ratingErrorReduction",
      "ratingProcessCriticality",
      "ratingInternalImpact",
      "ratingExternalImpact",
      "ratingCompliance",
    ],
  },
  {
    key: "prazo",
    label: "Prazo",
    description: "Quando você precisa pronto",
    fieldsToValidate: ["urgency", "customUrgency", "deadline", "additionalInfo"],
  },
];

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={cn(
                "h-8 w-8 rounded-full border text-sm font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SolicitarProjetoPage() {
  const { user, actualUser, isSuperAdmin } = useAuth();
  // Permissão de cadastrar área/tema nova é do usuário REAL, não do papel impersonado por
  // "visualizar como cliente" — um super_admin navegando como cliente continua podendo cadastrar
  // (mesmo padrão já usado acima para companyOptions).
  const canRegisterTaxonomy = actualUser?.role === "admin" || actualUser?.role === "super_admin";
  const { addProject } = useProjects();
  const { addFile } = useFiles();
  const router = useRouter();
  const { toast } = useToast();
  const { data: myCompanies = [], isLoading: myCompaniesLoading } = trpc.user.listMyCompanies.useQuery(
    undefined,
    { enabled: !!user?.id && !isSuperAdmin }
  );
  const { data: allCompanies = [], isLoading: allCompaniesLoading } = trpc.company.list.useQuery(
    undefined,
    { enabled: !!user?.id && isSuperAdmin }
  );
  // Super admin (mesmo "visualizando como cliente") pode escolher/importar para qualquer empresa
  const companyOptions = isSuperAdmin ? allCompanies : myCompanies;
  const companyOptionsLoading = !!user?.id && (isSuperAdmin ? allCompaniesLoading : myCompaniesLoading);

  const {
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    suggestionGroups: FEATURE_SUGGESTION_GROUPS,
    buildTypeLabel: buildClienteProjectTypeLabel,
  } = useTaxonomy();

  const form = useZodForm(solicitarProjetoSchema, {
    defaultValues: {
      title: "",
      projectArea: "",
      customProjectArea: "",
      projectTheme: "",
      customProjectTheme: "",
      platform: DEFAULT_PLATFORM_VALUE,
      customPlatform: "",
      description: "",
      targetAudience: "",
      customTargetAudience: "",
      expectedUsers: "",
      hasExistingSystem: "",
      customHasExistingSystem: "",
      existingSystemDetails: "",
      hasCurrentApplication: "",
      customHasCurrentApplication: "",
      currentApplicationDetails: "",
      peopleInvolved: "",
      peopleInvolvedDetails: "",
      taskDurationHours: "",
      processFrequency: "",
      customProcessFrequency: "",
      benefitsDetails: "",
      monthlyHoursSaved: "",
      ratingErrorReduction: null,
      ratingProcessCriticality: null,
      ratingInternalImpact: null,
      ratingExternalImpact: null,
      ratingCompliance: null,
      projectNarrative: "",
      urgency: "",
      customUrgency: "",
      deadline: "",
      additionalInfo: "",
    },
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = form;

  const projectArea = watch("projectArea");
  const projectTheme = watch("projectTheme");
  const platform = watch("platform");
  const targetAudience = watch("targetAudience");
  const hasExistingSystem = watch("hasExistingSystem");
  const hasCurrentApplication = watch("hasCurrentApplication");
  const taskDurationHours = watch("taskDurationHours");
  const processFrequency = watch("processFrequency");
  const urgency = watch("urgency");

  const previewAnnualHours = useMemo(() => {
    const duration = Number(taskDurationHours);
    const multiplier = PROCESS_FREQUENCY_MULTIPLIERS[processFrequency];
    if (!Number.isFinite(duration) || duration <= 0 || !multiplier) return null;
    return duration * multiplier;
  }, [taskDurationHours, processFrequency]);

  const [stepIndex, setStepIndex] = useState(0);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [xmlImportOutcome, setXmlImportOutcome] = useState<
    { ok: boolean; title: string; message: string } | null
  >(null);
  const [pendingXmlImport, setPendingXmlImport] = useState<{
    rawCompanyName: string;
    batchContext?: BatchContext;
  } | null>(null);
  const [chosenCompanyId, setChosenCompanyId] = useState<string | undefined>();
  // Guarda o `resolve` de uma Promise pendente enquanto o diálogo "Selecione a
  // empresa" está aberto. Existe pra permitir que o loop sequencial de import
  // em lote (`handleImportXmlFile`) dê `await` numa escolha do usuário no meio
  // da iteração, em vez de processar tudo de uma vez ou empilhar diálogos.
  // Toda forma de fechar o diálogo (confirmar, cancelar, Esc/clique fora) deve
  // passar por `closeCompanyResolutionDialog` — se uma delas esquecer de
  // resolver essa Promise, o import correspondente trava para sempre.
  const companyResolverRef = useRef<((companyId: string | null) => void) | null>(null);
  const [pendingTaxonomyResolution, setPendingTaxonomyResolution] = useState<{
    kind: "area" | "theme";
    rawValue: string;
    // Ambos só usados quando kind === "theme", para a área já resolvida a que o tema pertence:
    // areaIdForTheme é o id real (necessário pro createTheme), areaSlugForTheme é a chave usada
    // por PROJECT_THEMES_BY_AREA (Record indexado por slug, não por id) para listar os temas dela.
    areaIdForTheme?: string;
    areaSlugForTheme?: string;
    batchContext?: BatchContext;
  } | null>(null);
  const [chosenTaxonomyId, setChosenTaxonomyId] = useState<string | undefined>();
  const [creatingNewTaxonomy, setCreatingNewTaxonomy] = useState(false);
  const [registerNewArea, setRegisterNewArea] = useState(false);
  const [registerNewTheme, setRegisterNewTheme] = useState(false);
  // Guarda o resolve() da Promise que pausa importXmlEntry aguardando a escolha do usuário no
  // diálogo de área/tema (mesmo padrão do companyResolverRef acima). Deve ser setado ANTES de abrir
  // o diálogo (evita corrida) e limpo em um único lugar (closeTaxonomyResolutionDialog), alcançado por
  // todo caminho que fecha o diálogo (Confirmar, "Manter como Outro", Escape/clique fora via onOpenChange).
  // Se algum caminho de fechamento for adicionado sem passar por essa função, a Promise nunca resolve
  // e o loop de importação trava indefinidamente nesse item.
  const taxonomyResolverRef = useRef<((result: { id: string; slug: string; name: string } | null) => void) | null>(
    null
  );

  const utils = trpc.useUtils();
  const createAreaMutation = trpc.taxonomy.createArea.useMutation();
  const createThemeMutation = trpc.taxonomy.createTheme.useMutation();
  // PROJECT_AREAS/PROJECT_THEMES_BY_AREA vêm de uma query com staleTime de 5min (useTaxonomy) e,
  // dentro de um lote (.zip com vários XMLs), o loop de importXmlEntry já capturou esses valores
  // no fechamento antes de rodar — invalidar a query não atualiza esse valor já capturado no meio
  // do loop. Por isso, além de invalidar (pro resto do app, e pra próxima importação), guardamos
  // aqui as áreas/temas resolvidos (mapeados OU cadastrados) nesta sessão, pra que o 2º arquivo do
  // mesmo lote com o mesmo valor bruto (ex.: "Financeiro" duas vezes) reaproveite a escolha em vez
  // de tentar cadastrar de novo (o que bateria no slug único e falharia) ou perguntar de novo.
  const areaResolutionCacheRef = useRef<Map<string, { id: string; slug: string; name: string }>>(new Map());
  const themeResolutionCacheRef = useRef<Map<string, { id: string; slug: string; name: string }>>(new Map());
  const [batchImportResults, setBatchImportResults] = useState<BatchImportResult[] | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isFirstStep = stepIndex === 0;

  useEffect(() => {
    if (companyOptions.length === 1 && !selectedCompanyId) {
      setSelectedCompanyId(companyOptions[0].id);
    }
  }, [companyOptions, selectedCompanyId]);

  const progress = useMemo(
    () => ((stepIndex + 1) / STEPS.length) * 100,
    [stepIndex]
  );

  function handleAddFeature(feature: string) {
    const trimmed = feature.trim();
    if (trimmed && !features.includes(trimmed)) {
      setFeatures((prev) => [...prev, trimmed]);
    }
    setNewFeature("");
  }

  function handleRemoveFeature(feature: string) {
    setFeatures((prev) => prev.filter((f) => f !== feature));
  }

  function handleToggleBenefit(key: string, checked: boolean | "indeterminate") {
    const isChecked = checked === true;
    setBenefits((prev) =>
      isChecked ? [...prev, key] : prev.filter((b) => b !== key)
    );
  }

  function handleAttachFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setAttachedFiles(Array.from(files));
  }

  // Única forma de fechar o diálogo "Selecione a empresa": resolve a Promise
  // pendente (null = cancelado) e limpa o estado. Centralizado aqui pra evitar
  // que uma nova forma de fechar o diálogo esqueça de resolver a Promise, o
  // que travaria o import (single ou lote) esperando para sempre.
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
      setChosenCompanyId(companyOptions.length === 1 ? companyOptions[0].id : undefined);
    });
  }

  // Único ponto de saída do diálogo de área/tema — resolve a Promise pendente (ou entrega null se
  // cancelado) e limpa todo o estado relacionado. Toda forma de fechar o diálogo deve passar por aqui.
  function closeTaxonomyResolutionDialog(result: { id: string; slug: string; name: string } | null) {
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
  ): Promise<{ id: string; slug: string; name: string } | null> {
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
  ): Promise<{ ok: true; title: string; hasWarnings: boolean } | { ok: false; error: string }> {
    // Defensivo: handleImportXmlFile já barra a ausência de usuário antes de
    // chamar esta função (nos dois branches, zip e arquivo único). Mantido
    // aqui caso importXmlEntry seja reaproveitada em outro ponto de entrada.
    if (!user?.id) return { ok: false, error: "Faça login para importar um XML." };

    const result = parseSolicitacaoXml(xmlText, {
      areas: PROJECT_AREAS,
      themesByArea: PROJECT_THEMES_BY_AREA,
      companies: companyOptions,
    });

    if (!result.ok) return { ok: false, error: result.error };

    let companyId = result.companyId;
    if (result.companyUnresolved) {
      if (companyOptions.length === 0) {
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

    // area/tema já vêm com o id real quando <area>/<tema> bateram direto com uma opção
    // cadastrada (caminho feliz, sem diálogo) — só cai no fluxo de resolução abaixo quando
    // o valor não bateu com nada ("outro").
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
      // Se o usuário cancelar (resolvedArea === null), mantém "outro" + texto livre — comportamento de hoje.
      // Não é cacheado: um próximo arquivo do lote com o mesmo valor bruto pergunta de novo.
    }

    if (result.formData.projectTheme === "outro" && result.formData.customProjectTheme.trim()) {
      const rawTheme = result.formData.customProjectTheme.trim();
      // Chave inclui a área resolvida porque o mesmo nome de tema pode existir em áreas diferentes.
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
        clientId: user.id,
        companyId,
        areaId: resolvedAreaId,
        themeId: resolvedThemeId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);
      return { ok: true, title: result.formData.title, hasWarnings: result.warnings.length > 0 };
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      const message = error instanceof Error ? error.message : "Tente novamente.";
      return { ok: false, error: `Não foi possível criar o processo: ${message}` };
    }
  }

  async function handleImportXmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para importar um XML.",
        variant: "destructive",
      });
      return;
    }

    if (companyOptionsLoading) {
      toast({
        title: "Aguarde",
        description: "A lista de empresas ainda está carregando. Tente novamente em instantes.",
        variant: "destructive",
      });
      return;
    }

    const isZip = file.name.toLowerCase().endsWith(".zip");
    setIsSubmitting(true);
    try {
      if (isZip) {
        const entries = await extractXmlEntriesFromZip(file);
        if (entries.length === 0) {
          setXmlImportOutcome({
            ok: false,
            title: "Erro ao importar zip",
            message: "Nenhum arquivo .xml encontrado dentro do zip.",
          });
          return;
        }

        const results: BatchImportResult[] = [];
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const outcome = await importXmlEntry(entry.xmlText, {
            fileName: entry.fileName,
            index: i + 1,
            total: entries.length,
          });
          results.push(
            outcome.ok
              ? { fileName: entry.fileName, ok: true, title: outcome.title, hasWarnings: outcome.hasWarnings }
              : { fileName: entry.fileName, ok: false, error: outcome.error }
          );
        }
        setBatchImportResults(results);
      } else {
        const xmlText = await file.text();
        const outcome = await importXmlEntry(xmlText);
        if (outcome.ok) {
          const warningsNote = outcome.hasWarnings
            ? ` Alguns valores do XML não foram reconhecidos e foram registrados em "Informações adicionais" para revisão.`
            : "";
          setXmlImportOutcome({
            ok: true,
            title: "Solicitação enviada",
            message: `O processo "${outcome.title}" foi criado e está no backlog.${warningsNote}`,
          });
        } else {
          setXmlImportOutcome({
            ok: false,
            title: "Erro ao importar XML",
            message: outcome.error,
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function goNext() {
    const valid = await trigger(currentStep.fieldsToValidate);
    if (!valid) {
      toast({
        title: "Verifique os campos",
        description: "Há informações obrigatórias ou inválidas neste passo.",
        variant: "destructive",
      });
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function onSubmit(data: SolicitarProjetoFormData) {
    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para solicitar um projeto.",
        variant: "destructive",
      });
      return;
    }

    if (companyOptions.length > 1 && !selectedCompanyId) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha para qual empresa este projeto é.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Quando a área/tema escolhida já é uma opção cadastrada (não "outro"), o id real já
      // está disponível em PROJECT_AREAS/PROJECT_THEMES_BY_AREA (Task 3) — usa direto, sem
      // precisar de nenhum passo extra. Só fica undefined quando o valor é "outro" e nada foi
      // registrado como nova categoria (registerNewArea/registerNewTheme abaixo).
      let areaId: string | undefined = PROJECT_AREAS.find((a) => a.value === data.projectArea)?.id;
      let themeId: string | undefined = (PROJECT_THEMES_BY_AREA[data.projectArea] ?? []).find(
        (t) => t.value === data.projectTheme
      )?.id;
      let areaSlugForPayload = data.projectArea;
      let themeSlugForPayload = data.projectTheme;

      if (registerNewArea && data.projectArea === "outro" && data.customProjectArea.trim()) {
        const name = data.customProjectArea.trim();
        try {
          const created = await createAreaMutation.mutateAsync({ name, slug: slugify(name), order: 0 });
          areaId = created.id;
          areaSlugForPayload = created.slug;
          utils.taxonomy.listAreas.invalidate();
        } catch (error) {
          console.error("Erro ao cadastrar área:", error);
          const message = error instanceof Error ? error.message : "Tente novamente.";
          toast({ title: "Não foi possível cadastrar a área", description: message, variant: "destructive" });
          return;
        }
      }

      if (registerNewTheme && data.projectTheme === "outro" && data.customProjectTheme.trim() && areaId) {
        const name = data.customProjectTheme.trim();
        try {
          const created = await createThemeMutation.mutateAsync({
            name,
            slug: slugify(name),
            areaId,
            order: 0,
          });
          themeId = created.id;
          themeSlugForPayload = created.slug;
          utils.taxonomy.listAreas.invalidate();
        } catch (error) {
          console.error("Erro ao cadastrar tema:", error);
          const message = error instanceof Error ? error.message : "Tente novamente.";
          toast({ title: "Não foi possível cadastrar o tema", description: message, variant: "destructive" });
          return;
        }
      }

      const payload = buildProjectPayload({
        data: { ...data, projectArea: areaSlugForPayload, projectTheme: themeSlugForPayload },
        features,
        benefits,
        clientId: user.id,
        companyId: selectedCompanyId,
        areaId,
        themeId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      const projectId = await addProject(payload);

      if (projectId && attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          try {
            await addFile({ projectId, file });
          } catch {
            // erro por arquivo é silencioso
          }
        }
      }

      toast({
        title: "Solicitação enviada",
        description: "Seu processo foi criado e está no backlog.",
      });
      router.push("/cliente");
    } catch (error) {
      console.error("Erro ao criar processo:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível criar o processo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // PROJECT_THEMES_BY_AREA é indexado por slug da área, não por id — por isso o lookup de temas usa
  // areaSlugForTheme (não areaIdForTheme, que serve só para o createTheme mais abaixo).
  const availableTaxonomyOptions =
    pendingTaxonomyResolution?.kind === "area"
      ? PROJECT_AREAS
      : PROJECT_THEMES_BY_AREA[pendingTaxonomyResolution?.areaSlugForTheme ?? ""] ?? [];

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-3xl space-y-8 pb-10">
        <header className="flex items-center gap-3">
          <Link href="/cliente">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Solicitar novo projeto
            </h1>
            <p className="text-sm text-muted-foreground">
              Quanto mais detalhes, melhor entendemos suas necessidades.
            </p>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-border p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => xmlInputRef.current?.click()}
            disabled={isSubmitting || companyOptionsLoading}
          >
            <Upload className="mr-2 h-4 w-4" />
            {companyOptionsLoading ? "Carregando empresas..." : "Importar XML"}
          </Button>
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,.zip,text/xml,application/zip"
            className="hidden"
            onChange={handleImportXmlFile}
          />
          <a
            href="/modelo-solicitacao-projeto.xml"
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Baixar modelo em branco
          </a>
          <Link
            href="/cliente/solicitar/ajuda-xml"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ajuda com as tags do XML
          </Link>
        </div>

        {/* Stepper */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>
              Passo {stepIndex + 1} de {STEPS.length}
            </span>
            <span>{currentStep.label}</span>
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ol className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <li key={step.key} className="flex flex-1 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => i < stepIndex && setStepIndex(i)}
                    disabled={i > stepIndex}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-medium transition-colors",
                      done && "border-primary bg-primary text-primary-foreground",
                      active && "border-primary bg-background text-primary",
                      !done && !active && "border-border bg-background text-muted-foreground"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </button>
                  <span
                    className={cn(
                      "truncate",
                      active ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <section className="space-y-6">
            <header className="border-b border-border pb-4">
              <h2 className="text-lg font-semibold">{currentStep.label}</h2>
              <p className="text-sm text-muted-foreground">
                {currentStep.description}
              </p>
            </header>

            {currentStep.key === "basico" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Nome do processo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Ex.: Processo de Vendas"
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">{errors.title.message}</p>
                  )}
                </div>

                {companyOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="companyId">
                      Empresa{" "}
                      {companyOptions.length > 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    {companyOptions.length === 1 ? (
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        {companyOptions[0].name}
                      </div>
                    ) : (
                      <Select
                        value={selectedCompanyId}
                        onValueChange={setSelectedCompanyId}
                      >
                        <SelectTrigger id="companyId">
                          <SelectValue placeholder="Selecione a empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          {companyOptions.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="projectArea">
                      Área <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="projectArea"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              setValue("projectTheme", "");
                              setValue("customProjectTheme", "");
                              if (value !== "outro") setValue("customProjectArea", "");
                            }}
                          >
                            <SelectTrigger
                              className={
                                projectArea === "outro" ? "w-32 shrink-0" : "w-full"
                              }
                            >
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_AREAS.map((a) => (
                                <SelectItem key={a.value} value={a.value}>
                                  {a.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {projectArea === "outro" && (
                        <Input
                          id="customProjectArea"
                          {...register("customProjectArea")}
                          placeholder="Qual área?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {projectArea === "outro" && canRegisterTaxonomy && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox checked={registerNewArea} onCheckedChange={(c) => setRegisterNewArea(c === true)} />
                        <span className="text-xs text-muted-foreground">
                          Cadastrar como nova área permanente
                        </span>
                      </div>
                    )}
                    {errors.projectArea && (
                      <p className="text-xs text-destructive">
                        {errors.projectArea.message}
                      </p>
                    )}
                    {errors.customProjectArea && (
                      <p className="text-xs text-destructive">
                        {errors.customProjectArea.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="projectTheme">
                      Tema <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="projectTheme"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== "outro") setValue("customProjectTheme", "");
                            }}
                            disabled={!projectArea}
                          >
                            <SelectTrigger
                              className={
                                projectTheme === "outro" ? "w-32 shrink-0" : "w-full"
                              }
                            >
                              <SelectValue
                                placeholder={
                                  projectArea ? "Selecione" : "Escolha a área antes"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {(PROJECT_THEMES_BY_AREA[projectArea] ?? []).map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {projectTheme === "outro" && (
                        <Input
                          id="customProjectTheme"
                          {...register("customProjectTheme")}
                          placeholder="Qual tema?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {projectTheme === "outro" && canRegisterTaxonomy && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                          checked={registerNewTheme}
                          onCheckedChange={(c) => setRegisterNewTheme(c === true)}
                        />
                        <span className="text-xs text-muted-foreground">
                          Cadastrar como novo tema permanente
                        </span>
                      </div>
                    )}
                    {errors.projectTheme && (
                      <p className="text-xs text-destructive">
                        {errors.projectTheme.message}
                      </p>
                    )}
                    {errors.customProjectTheme && (
                      <p className="text-xs text-destructive">
                        {errors.customProjectTheme.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="platform">Plataforma</Label>
                  <div className="flex gap-2">
                    <Controller
                      control={control}
                      name="platform"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            if (value !== "outro") setValue("customPlatform", "");
                          }}
                        >
                          <SelectTrigger
                            id="platform"
                            className={platform === "outro" ? "w-32 shrink-0" : "w-full"}
                          >
                            <SelectValue placeholder="Onde vai funcionar?" />
                          </SelectTrigger>
                          <SelectContent>
                            {PLATFORMS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {platform === "outro" && (
                      <Input
                        id="customPlatform"
                        {...register("customPlatform")}
                        placeholder="Qual plataforma?"
                        className="flex-1"
                      />
                    )}
                  </div>
                  {errors.customPlatform && (
                    <p className="text-xs text-destructive">{errors.customPlatform.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    Descrição <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    {...register("description")}
                    placeholder="Qual o objetivo principal? Que problema resolve?"
                    rows={5}
                  />
                  {errors.description && (
                    <p className="text-xs text-destructive">
                      {errors.description.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Anexos iniciais (opcional)</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleAttachFilesChange}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.zip,.rar"
                  />
                  {attachedFiles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {attachedFiles.length} arquivo(s) selecionado(s)
                    </p>
                  )}
                </div>
              </div>
            )}

            {currentStep.key === "envolvidos" && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="targetAudience">Setor envolvido</Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="targetAudience"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== "outro")
                                setValue("customTargetAudience", "");
                            }}
                          >
                            <SelectTrigger
                              className={
                                targetAudience === "outro"
                                  ? "w-32 shrink-0"
                                  : "w-full"
                              }
                            >
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {TARGET_AUDIENCES.map((audience) => (
                                <SelectItem
                                  key={audience.value}
                                  value={audience.value}
                                >
                                  {audience.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {targetAudience === "outro" && (
                        <Input
                          id="customTargetAudience"
                          {...register("customTargetAudience")}
                          placeholder="Qual setor?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {errors.customTargetAudience && (
                      <p className="text-xs text-destructive">
                        {errors.customTargetAudience.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="expectedUsers">Número de usuários</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Estimativa de quantas pessoas vão usar
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="expectedUsers"
                      {...register("expectedUsers")}
                      placeholder="Ex.: 10 funcionários"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Já existe um processo/sistema atual?</Label>
                  <div className="flex gap-2">
                    <Controller
                      control={control}
                      name="hasExistingSystem"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            if (value !== "outro") setValue("customHasExistingSystem", "");
                          }}
                        >
                          <SelectTrigger
                            className={
                              hasExistingSystem === "outro" ? "w-32 shrink-0" : "w-full"
                            }
                          >
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {HAS_EXISTING_SYSTEM_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {hasExistingSystem === "outro" && (
                      <Input
                        id="customHasExistingSystem"
                        {...register("customHasExistingSystem")}
                        placeholder="Descreva a situação"
                        className="flex-1"
                      />
                    )}
                  </div>
                  {errors.customHasExistingSystem && (
                    <p className="text-xs text-destructive">
                      {errors.customHasExistingSystem.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="existingSystemDetails">
                    Conte mais sobre o processo atual
                  </Label>
                  <Textarea
                    id="existingSystemDetails"
                    {...register("existingSystemDetails")}
                    placeholder="Como funciona hoje? O que costuma dar errado?"
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Já existe uma aplicação (app/sistema) para esse processo hoje?</Label>
                  <div className="flex gap-2">
                    <Controller
                      control={control}
                      name="hasCurrentApplication"
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);
                            if (value !== "outro") setValue("customHasCurrentApplication", "");
                          }}
                        >
                          <SelectTrigger
                            className={
                              hasCurrentApplication === "outro" ? "w-32 shrink-0" : "w-full"
                            }
                          >
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {HAS_CURRENT_APPLICATION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {hasCurrentApplication === "outro" && (
                      <Input
                        id="customHasCurrentApplication"
                        {...register("customHasCurrentApplication")}
                        placeholder="Descreva a situação"
                        className="flex-1"
                      />
                    )}
                  </div>
                  {errors.customHasCurrentApplication && (
                    <p className="text-xs text-destructive">
                      {errors.customHasCurrentApplication.message}
                    </p>
                  )}
                </div>

                {hasCurrentApplication === "sim" && (
                  <div className="space-y-2">
                    <Label htmlFor="currentApplicationDetails">
                      Detalhes da aplicação existente
                    </Label>
                    <Textarea
                      id="currentApplicationDetails"
                      {...register("currentApplicationDetails")}
                      placeholder="Qual plataforma, quem desenvolveu, desde quando está em uso..."
                      rows={4}
                    />
                  </div>
                )}

                <div className="space-y-2 border-t border-border pt-5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Como esse processo funciona hoje (opcional)
                  </Label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="peopleInvolved">Colaboradores envolvidos</Label>
                      <Input
                        id="peopleInvolved"
                        type="number"
                        min={0}
                        step="1"
                        {...register("peopleInvolved")}
                        placeholder="Ex.: 2"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="taskDurationHours">
                          Duração total por execução (horas)
                        </Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Some o tempo de todos os envolvidos, não só de uma pessoa.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="taskDurationHours"
                        type="number"
                        min={0}
                        step="any"
                        {...register("taskDurationHours")}
                        placeholder="Ex.: 4"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="peopleInvolvedDetails">
                      Quem são os colaboradores envolvidos (opcional)
                    </Label>
                    <Textarea
                      id="peopleInvolvedDetails"
                      {...register("peopleInvolvedDetails")}
                      placeholder="Nomes, cargos ou áreas das pessoas envolvidas"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="processFrequency">Periodicidade do processo</Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="processFrequency"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== "outro") setValue("customProcessFrequency", "");
                            }}
                          >
                            <SelectTrigger
                              id="processFrequency"
                              className={
                                processFrequency === "outro" ? "w-32 shrink-0" : "w-full"
                              }
                            >
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {PROCESS_FREQUENCIES.map((freq) => (
                                <SelectItem key={freq.value} value={freq.value}>
                                  {freq.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {processFrequency === "outro" && (
                        <Input
                          id="customProcessFrequency"
                          {...register("customProcessFrequency")}
                          placeholder="Qual periodicidade?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {errors.customProcessFrequency && (
                      <p className="text-xs text-destructive">
                        {errors.customProcessFrequency.message}
                      </p>
                    )}
                  </div>

                  {previewAnnualHours !== null && (
                    <p className="text-xs text-muted-foreground">
                      Tempo gasto hoje: <strong>{previewAnnualHours.toLocaleString("pt-BR")} h/ano</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {currentStep.key === "funcionalidades" && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="newFeature">Adicionar funcionalidade</Label>
                  <div className="flex gap-2">
                    <Input
                      id="newFeature"
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddFeature(newFeature);
                        }
                      }}
                      placeholder="Digite e pressione Enter"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleAddFeature(newFeature)}
                      disabled={!newFeature.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {features.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Selecionadas
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {features.map((feature) => (
                        <Badge
                          key={feature}
                          variant="secondary"
                          className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                        >
                          {feature}
                          <button
                            type="button"
                            onClick={() => handleRemoveFeature(feature)}
                            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {FEATURE_SUGGESTION_GROUPS.length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      Sugestões (clique para adicionar)
                    </Label>
                    {FEATURE_SUGGESTION_GROUPS.map((group) => {
                      const available = group.items.filter(
                        (s) => !features.includes(s)
                      );
                      if (available.length === 0) return null;
                      return (
                        <div key={group.category} className="space-y-2">
                          <p className="text-xs font-medium text-foreground/80">
                            {group.category}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {available.map((suggestion) => (
                              <Badge
                                key={suggestion}
                                variant="outline"
                                className="cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => handleAddFeature(suggestion)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                {suggestion}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="projectNarrative">
                    Texto descritivo do processo
                  </Label>
                  <Textarea
                    id="projectNarrative"
                    {...register("projectNarrative")}
                    placeholder="Conte como você imagina o processo, fluxos e cenários de uso."
                    rows={5}
                  />
                </div>
              </div>
            )}

            {currentStep.key === "beneficios" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Quais resultados você espera?
                  </Label>
                  {BENEFIT_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className="flex items-start gap-3 cursor-pointer"
                    >
                      <Checkbox
                        checked={benefits.includes(option.key)}
                        onCheckedChange={(v) => handleToggleBenefit(option.key, v)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="benefitsDetails">
                    Descreva as economias e benefícios principais{" "}
                    <span className="text-xs text-muted-foreground">(opcional)</span>
                  </Label>
                  <Textarea
                    id="benefitsDetails"
                    {...register("benefitsDetails")}
                    placeholder="Ex.: redução de X horas/semana, queda de X% em retrabalho..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monthlyHoursSaved">
                    Horas economizadas por mês
                  </Label>
                  <Input
                    id="monthlyHoursSaved"
                    type="number"
                    min={0}
                    step="any"
                    {...register("monthlyHoursSaved")}
                    placeholder="Ex.: 40"
                    className="max-w-[200px]"
                  />
                </div>

                <div className="space-y-1 pt-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Avaliação qualitativa (1-5)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    5 é o mais importante para cada quesito.
                  </p>
                  <div className="divide-y divide-border/60 pt-2">
                    {QUALITATIVE_RATINGS.map((item) => (
                      <Controller
                        key={item.name}
                        control={control}
                        name={item.name}
                        render={({ field }) => (
                          <RatingRow
                            label={item.label}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentStep.key === "prazo" && (
              <div className="space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="urgency">Nível de urgência</Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="urgency"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== "outro") setValue("customUrgency", "");
                            }}
                          >
                            <SelectTrigger
                              className={urgency === "outro" ? "w-32 shrink-0" : "w-full"}
                            >
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {URGENCY_LEVELS.map((level) => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {urgency === "outro" && (
                        <Input
                          id="customUrgency"
                          {...register("customUrgency")}
                          placeholder="Qual urgência?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {errors.customUrgency && (
                      <p className="text-xs text-destructive">{errors.customUrgency.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="deadline">Data limite (opcional)</Label>
                    <Input id="deadline" type="date" {...register("deadline")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="additionalInfo">Informações adicionais</Label>
                  <Textarea
                    id="additionalInfo"
                    {...register("additionalInfo")}
                    placeholder="Restrições técnicas, integrações, segurança, dados da empresa..."
                    rows={4}
                  />
                </div>
              </div>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={isFirstStep}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>

            {isLastStep ? (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  "Enviando..."
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar solicitação
                  </>
                )}
              </Button>
            ) : (
              <Button type="button" onClick={goNext}>
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>

      <AlertDialog
        open={xmlImportOutcome !== null}
        onOpenChange={(open) => {
          if (!open) setXmlImportOutcome(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{xmlImportOutcome?.title}</AlertDialogTitle>
            <AlertDialogDescription>{xmlImportOutcome?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const wasSuccess = xmlImportOutcome?.ok;
                setXmlImportOutcome(null);
                if (wasSuccess) router.push("/cliente");
              }}
            >
              {xmlImportOutcome?.ok ? "Ver meus processos" : "Entendi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={pendingXmlImport !== null}
        onOpenChange={(open) => {
          if (!open) closeCompanyResolutionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              {pendingXmlImport?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Arquivo {pendingXmlImport.batchContext.index} de {pendingXmlImport.batchContext.total}:{" "}
                  {pendingXmlImport.batchContext.fileName}
                </span>
              )}
              {pendingXmlImport?.rawCompanyName
                ? `O XML indica a empresa "${pendingXmlImport.rawCompanyName}", que não corresponde a nenhuma empresa disponível.`
                : "O XML não indica uma empresa."}{" "}
              Escolha para qual empresa este processo deve ser criado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={chosenCompanyId} onValueChange={setChosenCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companyOptions.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeCompanyResolutionDialog(null)}>
              Cancelar
            </Button>
            <Button
              // isSubmitting fica `true` durante todo o import (único ou lote
              // inteiro), incluindo enquanto este diálogo está aberto esperando
              // o usuário — não incluir isSubmitting aqui, senão o botão fica
              // permanentemente desabilitado e o diálogo trava sem forma de
              // confirmar.
              disabled={!chosenCompanyId}
              onClick={() => {
                if (!chosenCompanyId) return;
                closeCompanyResolutionDialog(chosenCompanyId);
              }}
            >
              Confirmar e criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={batchImportResults !== null}
        onOpenChange={(open) => {
          if (!open) setBatchImportResults(null);
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Resultado da importação em lote</AlertDialogTitle>
            <AlertDialogDescription>
              {batchImportResults?.filter((r) => r.ok).length} de {batchImportResults?.length} arquivo(s)
              importado(s) com sucesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {batchImportResults?.map((r) => (
              <div
                key={r.fileName}
                className={cn(
                  "rounded-md border px-3 py-2",
                  r.ok ? "border-emerald-200 bg-emerald-50" : "border-destructive/30 bg-destructive/5"
                )}
              >
                <div className="font-medium">{r.fileName}</div>
                {r.ok ? (
                  <div className="text-muted-foreground">
                    Processo &quot;{r.title}&quot; criado.
                    {r.hasWarnings
                      ? ' Alguns valores não foram reconhecidos — revise em "Informações adicionais".'
                      : ""}
                  </div>
                ) : (
                  <div className="text-destructive">{r.error}</div>
                )}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const hadAnySuccess = batchImportResults?.some((r) => r.ok);
                setBatchImportResults(null);
                if (hadAnySuccess) router.push("/cliente");
              }}
            >
              Ver meus processos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={pendingTaxonomyResolution !== null}
        onOpenChange={(open) => {
          if (!open) closeTaxonomyResolutionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingTaxonomyResolution?.kind === "area" ? "Área não cadastrada" : "Tema não cadastrado"}
            </DialogTitle>
            <DialogDescription>
              {pendingTaxonomyResolution?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Arquivo {pendingTaxonomyResolution.batchContext.index} de{" "}
                  {pendingTaxonomyResolution.batchContext.total}: {pendingTaxonomyResolution.batchContext.fileName}
                </span>
              )}
              O XML indica{" "}
              {pendingTaxonomyResolution?.kind === "area" ? "a área" : "o tema"} &quot;
              {pendingTaxonomyResolution?.rawValue}&quot;, que não corresponde a nenhuma opção cadastrada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                Usar {pendingTaxonomyResolution?.kind === "area" ? "uma área" : "um tema"} já cadastrado
              </Label>
              <Select
                value={creatingNewTaxonomy ? "" : chosenTaxonomyId}
                onValueChange={(value) => {
                  setChosenTaxonomyId(value);
                  setCreatingNewTaxonomy(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {availableTaxonomyOptions
                    .filter((opt): opt is typeof opt & { id: string } => Boolean(opt.id))
                    .map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {canRegisterTaxonomy &&
              !(pendingTaxonomyResolution?.kind === "theme" && !pendingTaxonomyResolution?.areaIdForTheme) && (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3">
                  <Checkbox
                    checked={creatingNewTaxonomy}
                    onCheckedChange={(checked) => {
                      setCreatingNewTaxonomy(checked === true);
                      if (checked === true) setChosenTaxonomyId(undefined);
                    }}
                  />
                  <span className="text-sm">
                    Cadastrar &quot;{pendingTaxonomyResolution?.rawValue}&quot; como{" "}
                    {pendingTaxonomyResolution?.kind === "area" ? "nova área" : "novo tema"} permanente
                  </span>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => closeTaxonomyResolutionDialog(null)}>
              Manter como &quot;Outro&quot;
            </Button>
            <Button
              disabled={(!chosenTaxonomyId && !creatingNewTaxonomy) || createAreaMutation.isPending || createThemeMutation.isPending}
              onClick={async () => {
                if (!pendingTaxonomyResolution) return;
                if (creatingNewTaxonomy) {
                  const name = pendingTaxonomyResolution.rawValue;
                  const slug = slugify(name);
                  try {
                    if (pendingTaxonomyResolution.kind === "area") {
                      const created = await createAreaMutation.mutateAsync({ name, slug, order: 0 });
                      utils.taxonomy.listAreas.invalidate();
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    } else if (pendingTaxonomyResolution.areaIdForTheme) {
                      const created = await createThemeMutation.mutateAsync({
                        name,
                        slug,
                        areaId: pendingTaxonomyResolution.areaIdForTheme,
                        order: 0,
                      });
                      utils.taxonomy.listAreas.invalidate();
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    }
                  } catch (error) {
                    console.error("Erro ao cadastrar categoria:", error);
                    const message = error instanceof Error ? error.message : "Tente novamente.";
                    toast({
                      title: "Não foi possível cadastrar a categoria",
                      description: message,
                      variant: "destructive",
                    });
                  }
                } else if (chosenTaxonomyId) {
                  const picked = availableTaxonomyOptions.find((o) => o.id === chosenTaxonomyId);
                  if (picked?.id) {
                    closeTaxonomyResolutionDialog({ id: picked.id, slug: picked.value, name: picked.label });
                  }
                }
              }}
            >
              {createAreaMutation.isPending || createThemeMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
