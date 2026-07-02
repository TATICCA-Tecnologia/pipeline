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
import { cn } from "@/shared/utils";

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
  const { user, isSuperAdmin } = useAuth();
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
    formData: SolicitarProjetoFormData;
    features: string[];
    benefits: string[];
    rawCompanyName: string;
  } | null>(null);
  const [chosenCompanyId, setChosenCompanyId] = useState<string | undefined>();
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

  async function createProjectFromXml(
    parsed: { formData: SolicitarProjetoFormData; features: string[]; benefits: string[] },
    companyId: string | undefined
  ) {
    if (!user?.id) return;
    setIsSubmitting(true);
    try {
      const payload = buildProjectPayload({
        data: parsed.formData,
        features: parsed.features,
        benefits: parsed.benefits,
        clientId: user.id,
        companyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);

      setXmlImportOutcome({
        ok: true,
        title: "Solicitação enviada",
        message: `O processo "${parsed.formData.title}" foi criado e está no backlog.`,
      });
    } catch {
      setXmlImportOutcome({
        ok: false,
        title: "Erro ao salvar",
        message: "Não foi possível criar o processo. Tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
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

    const xmlText = await file.text();
    const result = parseSolicitacaoXml(xmlText, {
      areas: PROJECT_AREAS,
      themesByArea: PROJECT_THEMES_BY_AREA,
      companies: companyOptions,
    });

    if (!result.ok) {
      setXmlImportOutcome({
        ok: false,
        title: "Erro ao importar XML",
        message: result.error,
      });
      return;
    }

    if (result.companyUnresolved) {
      if (companyOptions.length === 0) {
        setXmlImportOutcome({
          ok: false,
          title: "Erro ao importar XML",
          message: result.rawCompanyName
            ? `A tag <empresa> tem o valor '${result.rawCompanyName}', mas não há nenhuma empresa disponível para associar este processo.`
            : "Não há nenhuma empresa disponível para associar este processo.",
        });
        return;
      }
      setPendingXmlImport({
        formData: result.formData,
        features: result.features,
        benefits: result.benefits,
        rawCompanyName: result.rawCompanyName,
      });
      setChosenCompanyId(companyOptions.length === 1 ? companyOptions[0].id : undefined);
      return;
    }

    await createProjectFromXml(
      { formData: result.formData, features: result.features, benefits: result.benefits },
      result.companyId
    );
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
      const payload = buildProjectPayload({
        data,
        features,
        benefits,
        clientId: user.id,
        companyId: selectedCompanyId,
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
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível criar o processo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

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
            accept=".xml,text/xml"
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
          if (!open) {
            setPendingXmlImport(null);
            setChosenCompanyId(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
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
            <Button
              variant="outline"
              onClick={() => {
                setPendingXmlImport(null);
                setChosenCompanyId(undefined);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!chosenCompanyId || isSubmitting}
              onClick={async () => {
                if (!pendingXmlImport || !chosenCompanyId) return;
                const parsed = pendingXmlImport;
                setPendingXmlImport(null);
                await createProjectFromXml(parsed, chosenCompanyId);
                setChosenCompanyId(undefined);
              }}
            >
              Confirmar e criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
