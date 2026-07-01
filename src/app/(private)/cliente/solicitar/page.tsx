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
} from "lucide-react";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
} from "./utils/solicitar.utils";
import { useTaxonomy } from "./utils/use-taxonomy";
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

const BENEFIT_OPTIONS = [
  {
    key: "reducao-trabalho-operacional",
    label: "Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)",
  },
  {
    key: "melhor-relacionamento-cliente",
    label: "Melhor relacionamento com o cliente (experiência, atendimento, rapidez)",
  },
  {
    key: "melhor-relacionamento-fornecedor-parceiro",
    label: "Melhor relacionamento com fornecedores ou parceiros",
  },
  {
    key: "reducao-multas-infracoes",
    label: "Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais)",
  },
  {
    key: "melhoria-qualidade-trabalho",
    label: "Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade)",
  },
  { key: "outro", label: "Outro" },
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
      "existingSystemDetails",
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
    fieldsToValidate: ["urgency", "deadline", "additionalInfo"],
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
  const { user } = useAuth();
  const { addProject } = useProjects();
  const { addFile } = useFiles();
  const router = useRouter();
  const { toast } = useToast();
  const { data: myCompanies = [] } = trpc.user.listMyCompanies.useQuery(
    undefined,
    { enabled: !!user?.id }
  );

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
      description: "",
      targetAudience: "",
      customTargetAudience: "",
      expectedUsers: "",
      hasExistingSystem: "",
      existingSystemDetails: "",
      benefitsDetails: "",
      monthlyHoursSaved: "",
      ratingErrorReduction: null,
      ratingProcessCriticality: null,
      ratingInternalImpact: null,
      ratingExternalImpact: null,
      ratingCompliance: null,
      projectNarrative: "",
      urgency: "",
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
  const targetAudience = watch("targetAudience");

  const [stepIndex, setStepIndex] = useState(0);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isFirstStep = stepIndex === 0;

  useEffect(() => {
    if (myCompanies.length === 1 && !selectedCompanyId) {
      setSelectedCompanyId(myCompanies[0].id);
    }
  }, [myCompanies, selectedCompanyId]);

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

    if (myCompanies.length > 1 && !selectedCompanyId) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha para qual empresa este projeto é.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const areaLabel =
        data.projectArea === "outro"
          ? data.customProjectArea.trim()
          : PROJECT_AREAS.find((a) => a.value === data.projectArea)?.label ?? "";
      const themeLabel =
        data.projectTheme === "outro"
          ? data.customProjectTheme.trim()
          : (PROJECT_THEMES_BY_AREA[data.projectArea] ?? []).find(
              (t) => t.value === data.projectTheme
            )?.label ?? "";
      const typeLabel =
        data.projectArea === "outro" || data.projectTheme === "outro"
          ? [areaLabel, themeLabel].filter(Boolean).join(" - ") || "Outro"
          : buildClienteProjectTypeLabel(data.projectArea, data.projectTheme);

      const platformLabel =
        PLATFORMS.find((p) => p.value === data.platform)?.label ?? data.platform;
      const projectTypeWithPlatform = `${typeLabel} · Plataforma: ${platformLabel}`;

      const targetAudienceValue =
        data.targetAudience === "outro"
          ? data.customTargetAudience.trim()
          : data.targetAudience;

      const monthlyHours = data.monthlyHoursSaved
        ? Number(data.monthlyHoursSaved)
        : undefined;

      const projectId = await addProject({
        title: data.title,
        description: data.description,
        clientId: user.id,
        companyId: selectedCompanyId,
        status: "backlog",
        priority:
          data.urgency === "urgente"
            ? "urgent"
            : data.urgency === "alta"
              ? "high"
              : data.urgency === "baixa"
                ? "low"
                : "medium",
        projectType: projectTypeWithPlatform,
        targetAudience: targetAudienceValue,
        expectedUsers: data.expectedUsers,
        urgency: data.urgency,
        features,
        estimatedDeadline: data.deadline ? new Date(data.deadline) : undefined,
        additionalInfo: data.additionalInfo || undefined,
        hasExistingSystem: data.hasExistingSystem || undefined,
        existingSystemDetails: data.existingSystemDetails || undefined,
        projectNarrative: data.projectNarrative || undefined,
        benefits: benefits.length ? benefits : undefined,
        benefitsDetails: data.benefitsDetails || undefined,
        monthlyHoursSaved: Number.isFinite(monthlyHours) ? monthlyHours : undefined,
        ratingErrorReduction: data.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: data.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: data.ratingInternalImpact ?? undefined,
        ratingExternalImpact: data.ratingExternalImpact ?? undefined,
        ratingCompliance: data.ratingCompliance ?? undefined,
      });

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

                {myCompanies.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="companyId">
                      Empresa{" "}
                      {myCompanies.length > 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    {myCompanies.length === 1 ? (
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        {myCompanies[0].name}
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
                          {myCompanies.map((company) => (
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
                  <Controller
                    control={control}
                    name="platform"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Onde vai funcionar?" />
                        </SelectTrigger>
                        <SelectContent>
                          {PLATFORMS.map((platform) => (
                            <SelectItem key={platform.value} value={platform.value}>
                              {platform.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
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
                  <Controller
                    control={control}
                    name="hasExistingSystem"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nao">Não, projeto do zero</SelectItem>
                          <SelectItem value="sim-substituir">
                            Sim, quero substituir
                          </SelectItem>
                          <SelectItem value="sim-integrar">
                            Sim, quero integrar/migrar dados
                          </SelectItem>
                          <SelectItem value="sim-melhorar">
                            Sim, quero melhorar o existente
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
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
                    <Controller
                      control={control}
                      name="urgency"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
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
    </TooltipProvider>
  );
}
