"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate, formatCurrency } from "@/shared/utils";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
import { RatingRow } from "@/shared/components/rating-row";
import { DetailSection, FieldRow } from "@/shared/components/detail-section";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
  SENSITIVE_DATA_ANSWER_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
import { useTaxonomy } from "@/src/app/(private)/cliente/solicitar/utils/use-taxonomy";
import {
  AutomationInventoryFields,
  buildAutomationInventoryValue,
  toAutomationInventoryInput,
  type AutomationInventoryValue,
} from "@/shared/components/automation-inventory-fields";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toDateInputValue(date: Date | string | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface ProjectRequestEditFormProps {
  project: Project;
  viewerRole: UserRole | undefined;
  onCancel: () => void;
  onSaved: () => void;
}

interface EditFormState {
  title: string;
  description: string;
  areaSlug: string;
  themeSlug: string;
  targetAudience: string;
  expectedUsers: string;
  hasExistingSystem: string;
  existingSystemDetails: string;
  hasCurrentApplication: string;
  currentApplicationDetails: string;
  currentApplicationHosting: string;
  currentApplicationHostingCustom: string;
  currentApplicationAuthor: string;
  currentApplicationOwner: string;
  currentApplicationAccessLocation: string;
  currentApplicationAccessReference: string;
  currentApplicationLiveSince: string;
  currentApplicationAssetId: string;
  currentApplicationOwnerRole: string;
  currentApplicationOwnerAreaId: string;
  currentApplicationDataInput: string;
  currentApplicationDataInputDetails: string;
  currentApplicationDataOutput: string;
  currentApplicationDataOutputDetails: string;
  currentApplicationContingencyActions: string[];
  currentApplicationContingencyDetails: string;
  currentApplicationBackupOwner: string;
  handlesSensitiveData: string;
  sensitiveDataCategories: string[];
  sensitiveDataDetails: string;
  peopleInvolved: string;
  peopleInvolvedDetails: string;
  taskDurationHours: string;
  processFrequency: string;
  benefits: string[];
  benefitsDetails: string;
  monthlyHoursSaved: string;
  ratingErrorReduction: number | null;
  ratingProcessCriticality: number | null;
  ratingInternalImpact: number | null;
  ratingExternalImpact: number | null;
  ratingCompliance: number | null;
  projectNarrative: string;
  urgency: string;
  estimatedDeadline: string;
  additionalInfo: string;
}

export function ProjectRequestEditForm({
  project,
  viewerRole,
  onCancel,
  onSaved,
}: ProjectRequestEditFormProps) {
  const utils = trpc.useUtils();
  const { areas, themesByArea, isLoading: isTaxonomyLoading } = useTaxonomy();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";
  // Só quem passa por `adminProcedure` no servidor (taxonomy.createTargetSystem)
  // pode cadastrar um sistema digitado como entrada permanente do catálogo —
  // mesma regra do wizard (`canRegisterTaxonomy` em cliente/solicitar/page.tsx).
  const isArchitect = viewerRole === "admin" || viewerRole === "super_admin";

  const initialAreaSlug = areas.find((a) => a.id === project.areaId)?.value ?? "";
  const initialThemeSlug =
    (themesByArea[initialAreaSlug] ?? []).find((t) => t.id === project.themeId)?.value ?? "";

  const [form, setForm] = useState<EditFormState>({
    title: project.title,
    description: project.description ?? "",
    areaSlug: initialAreaSlug,
    themeSlug: initialThemeSlug,
    targetAudience: project.targetAudience ?? "",
    expectedUsers: project.expectedUsers ?? "",
    hasExistingSystem: project.hasExistingSystem ?? "",
    existingSystemDetails: project.existingSystemDetails ?? "",
    hasCurrentApplication: project.hasCurrentApplication ?? "",
    currentApplicationDetails: project.currentApplicationDetails ?? "",
    currentApplicationHosting: project.currentApplicationHosting ?? "",
    currentApplicationHostingCustom: project.currentApplicationHostingCustom ?? "",
    currentApplicationAuthor: project.currentApplicationAuthor ?? "",
    currentApplicationOwner: project.currentApplicationOwner ?? "",
    currentApplicationAccessLocation: project.currentApplicationAccessLocation ?? "",
    currentApplicationAccessReference: project.currentApplicationAccessReference ?? "",
    currentApplicationLiveSince: toDateInputValue(project.currentApplicationLiveSince),
    currentApplicationAssetId: project.currentApplicationAssetId ?? "",
    currentApplicationOwnerRole: project.currentApplicationOwnerRole ?? "",
    currentApplicationOwnerAreaId: project.currentApplicationOwnerAreaId ?? "",
    currentApplicationDataInput: project.currentApplicationDataInput ?? "",
    currentApplicationDataInputDetails: project.currentApplicationDataInputDetails ?? "",
    currentApplicationDataOutput: project.currentApplicationDataOutput ?? "",
    currentApplicationDataOutputDetails: project.currentApplicationDataOutputDetails ?? "",
    currentApplicationContingencyActions: project.currentApplicationContingencyActions ?? [],
    currentApplicationContingencyDetails: project.currentApplicationContingencyDetails ?? "",
    currentApplicationBackupOwner: project.currentApplicationBackupOwner ?? "",
    handlesSensitiveData: project.handlesSensitiveData ?? "",
    sensitiveDataCategories: project.sensitiveDataCategories ?? [],
    sensitiveDataDetails: project.sensitiveDataDetails ?? "",
    peopleInvolved: project.peopleInvolved?.toString() ?? "",
    peopleInvolvedDetails: project.peopleInvolvedDetails ?? "",
    taskDurationHours: project.taskDurationHours?.toString() ?? "",
    processFrequency: project.processFrequency ?? "",
    benefits: project.benefits ?? [],
    benefitsDetails: project.benefitsDetails ?? "",
    monthlyHoursSaved: project.monthlyHoursSaved?.toString() ?? "",
    ratingErrorReduction: project.ratingErrorReduction ?? null,
    ratingProcessCriticality: project.ratingProcessCriticality ?? null,
    ratingInternalImpact: project.ratingInternalImpact ?? null,
    ratingExternalImpact: project.ratingExternalImpact ?? null,
    ratingCompliance: project.ratingCompliance ?? null,
    projectNarrative: project.projectNarrative ?? "",
    urgency: project.urgency ?? "",
    estimatedDeadline: toDateInputValue(project.estimatedDeadline),
    additionalInfo: project.additionalInfo ?? "",
  });

  // Hidratada uma única vez, via função nomeada (`buildAutomationInventoryValue`
  // em automation-inventory-fields.tsx) que faz a conversão leitura -> formulário:
  // resolve `projectTargetSystemId` (id estável) para `systemIndex` (posição),
  // usando um Map construído a partir da MESMA lista `project.targetSystems`
  // que alimenta as linhas do formulário. Não precisa de useEffect de
  // ressincronização (ao contrário de área/tema, que dependem de uma query
  // assíncrona): `project` já chega hidratado de `project.byId`, e este
  // formulário é remontado do zero a cada vez que "Editar" é clicado.
  const [automationInventory, setAutomationInventory] = useState<AutomationInventoryValue>(() =>
    buildAutomationInventoryValue(project.targetSystems, project.automationAccounts)
  );

  // Área/Tema são carregados via useTaxonomy(), que começa em isLoading=true e usa
  // dados de fallback (com id: undefined) até o banco responder. O useState acima só
  // roda uma vez, então recalculamos a seleção inicial assim que os dados reais chegam
  // (isLoading passa de true -> false uma única vez no ciclo de vida normal).
  useEffect(() => {
    if (!isTaxonomyLoading) {
      const resolvedAreaSlug = areas.find((a) => a.id === project.areaId)?.value ?? "";
      const resolvedThemeSlug =
        (themesByArea[resolvedAreaSlug] ?? []).find((t) => t.id === project.themeId)?.value ?? "";
      setForm((prev) => ({
        ...prev,
        areaSlug: resolvedAreaSlug,
        themeSlug: resolvedThemeSlug,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTaxonomyLoading]);

  function set<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const urgencyLevelOptions = useMemo(() => {
    const opts = dbUrgencyLevels.map((u) => ({ value: u.slug, label: u.name }));
    if (form.urgency && !opts.some((o) => o.value === form.urgency)) {
      opts.push({ value: form.urgency, label: form.urgency });
    }
    return opts;
  }, [dbUrgencyLevels, form.urgency]);
  const createUrgencyLevel = trpc.taxonomy.createUrgencyLevel.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listUrgencyLevels.invalidate();
      set("urgency", created.slug);
      toast.success(`Nível de urgência "${created.name}" criado`);
    },
    onError: (err) => toast.error("Falha ao criar nível de urgência", { description: err.message }),
  });

  function toggleBenefit(key: string) {
    setForm((prev) => ({
      ...prev,
      benefits: prev.benefits.includes(key)
        ? prev.benefits.filter((b) => b !== key)
        : [...prev.benefits, key],
    }));
  }

  function toggleContingencyAction(key: string) {
    setForm((prev) => ({
      ...prev,
      currentApplicationContingencyActions: prev.currentApplicationContingencyActions.includes(key)
        ? prev.currentApplicationContingencyActions.filter((c) => c !== key)
        : [...prev.currentApplicationContingencyActions, key],
    }));
  }

  function toggleSensitiveDataCategory(key: string) {
    setForm((prev) => ({
      ...prev,
      sensitiveDataCategories: prev.sensitiveDataCategories.includes(key)
        ? prev.sensitiveDataCategories.filter((c) => c !== key)
        : [...prev.sensitiveDataCategories, key],
    }));
  }

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: project.id });
      utils.project.list.invalidate();
      utils.activity.byProject.invalidate({ projectId: project.id });
      toast.success("Solicitação atualizada");
      onSaved();
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível salvar as alterações.");
    },
  });

  function handleSave() {
    const selectedArea = areas.find((a) => a.value === form.areaSlug);
    const selectedTheme = (themesByArea[form.areaSlug] ?? []).find(
      (t) => t.value === form.themeSlug
    );

    updateMutation.mutate({
      id: project.id,
      title: form.title,
      description: form.description,
      areaId: selectedArea?.id ?? null,
      themeId: selectedTheme?.id ?? null,
      targetAudience: form.targetAudience || null,
      expectedUsers: form.expectedUsers || null,
      hasExistingSystem: form.hasExistingSystem || null,
      existingSystemDetails: form.existingSystemDetails || null,
      hasCurrentApplication: form.hasCurrentApplication || null,
      currentApplicationDetails: form.currentApplicationDetails || null,
      currentApplicationHosting: form.currentApplicationHosting || null,
      currentApplicationHostingCustom: form.currentApplicationHostingCustom || null,
      currentApplicationAuthor: form.currentApplicationAuthor || null,
      currentApplicationOwner: form.currentApplicationOwner || null,
      currentApplicationAccessLocation: form.currentApplicationAccessLocation || null,
      currentApplicationAccessReference: form.currentApplicationAccessReference || null,
      currentApplicationLiveSince: form.currentApplicationLiveSince
        ? new Date(form.currentApplicationLiveSince)
        : null,
      currentApplicationAssetId: form.currentApplicationAssetId,
      currentApplicationOwnerRole: form.currentApplicationOwnerRole,
      currentApplicationOwnerAreaId: form.currentApplicationOwnerAreaId,
      currentApplicationDataInput: form.currentApplicationDataInput,
      currentApplicationDataInputDetails: form.currentApplicationDataInputDetails,
      currentApplicationDataOutput: form.currentApplicationDataOutput,
      currentApplicationDataOutputDetails: form.currentApplicationDataOutputDetails,
      currentApplicationContingencyActions: form.currentApplicationContingencyActions,
      currentApplicationContingencyDetails: form.currentApplicationContingencyDetails,
      currentApplicationBackupOwner: form.currentApplicationBackupOwner,
      handlesSensitiveData: form.handlesSensitiveData,
      sensitiveDataCategories: form.sensitiveDataCategories,
      sensitiveDataDetails: form.sensitiveDataDetails,
      automationInventory: toAutomationInventoryInput(automationInventory),
      peopleInvolved: form.peopleInvolved ? parseInt(form.peopleInvolved, 10) : null,
      peopleInvolvedDetails: form.peopleInvolvedDetails || null,
      taskDurationHours: form.taskDurationHours ? parseFloat(form.taskDurationHours) : null,
      processFrequency: form.processFrequency || null,
      benefits: form.benefits,
      benefitsDetails: form.benefitsDetails || null,
      monthlyHoursSaved: form.monthlyHoursSaved ? parseFloat(form.monthlyHoursSaved) : null,
      ratingErrorReduction: form.ratingErrorReduction,
      ratingProcessCriticality: form.ratingProcessCriticality,
      ratingInternalImpact: form.ratingInternalImpact,
      ratingExternalImpact: form.ratingExternalImpact,
      ratingCompliance: form.ratingCompliance,
      projectNarrative: form.projectNarrative || null,
      urgency: form.urgency || null,
      estimatedDeadline: form.estimatedDeadline ? new Date(form.estimatedDeadline) : null,
      additionalInfo: form.additionalInfo || null,
    });
  }

  const statusConfig = STATUS_CONFIG[project.status] ?? {
    label: project.status,
    color: "bg-muted",
  };
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);

  return (
    <div className="space-y-6">
      <DetailSection title="Básico">
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={project.companyName} />
        <FieldRow label="Cliente (ID)" value={project.clientId} />
        <FieldRow label="Desenvolvedor (ID)" value={project.developerId} />
        <FieldRow label="Criado em" value={formatDate(project.createdAt)} />
        <FieldRow label="Última atualização" value={formatDate(project.updatedAt)} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-title">Título</Label>
          <Input
            id="edit-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-description">Descrição</Label>
          <Textarea
            id="edit-description"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Área</Label>
          <Select
            value={form.areaSlug}
            onValueChange={(v) => {
              set("areaSlug", v);
              set("themeSlug", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tema</Label>
          <Select
            value={form.themeSlug}
            onValueChange={(v) => set("themeSlug", v)}
            disabled={!form.areaSlug}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(themesByArea[form.areaSlug] ?? []).map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DetailSection>

      <DetailSection title="Envolvidos & contexto atual">
        <div className="space-y-1.5">
          <Label htmlFor="edit-targetAudience">Público-alvo</Label>
          <Input
            id="edit-targetAudience"
            value={form.targetAudience}
            onChange={(e) => set("targetAudience", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-expectedUsers">Usuários esperados</Label>
          <Input
            id="edit-expectedUsers"
            value={form.expectedUsers}
            onChange={(e) => set("expectedUsers", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Processo/sistema existente</Label>
          <Select
            value={form.hasExistingSystem}
            onValueChange={(v) => set("hasExistingSystem", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {HAS_EXISTING_SYSTEM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-existingSystemDetails">Detalhes do processo atual</Label>
          <Textarea
            id="edit-existingSystemDetails"
            rows={2}
            value={form.existingSystemDetails}
            onChange={(e) => set("existingSystemDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Aplicação existente hoje</Label>
          <Select
            value={form.hasCurrentApplication}
            onValueChange={(v) => set("hasCurrentApplication", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {HAS_CURRENT_APPLICATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationDetails">
            Detalhes da aplicação existente
          </Label>
          <Textarea
            id="edit-currentApplicationDetails"
            rows={2}
            value={form.currentApplicationDetails}
            onChange={(e) => set("currentApplicationDetails", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Sustentação & acessos">
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationAssetId">Identificação do ativo</Label>
          <Input
            id="edit-currentApplicationAssetId"
            value={form.currentApplicationAssetId}
            onChange={(e) => set("currentApplicationAssetId", e.target.value)}
            placeholder="Hostname, IP ou nº de patrimônio"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Onde a automação roda</Label>
          <Select
            value={form.currentApplicationHosting}
            onValueChange={(v) => {
              set("currentApplicationHosting", v);
              if (v !== "outro") set("currentApplicationHostingCustom", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_HOSTING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.currentApplicationHosting === "outro" && (
          <div className="space-y-1.5">
            <Label htmlFor="edit-currentApplicationHostingCustom">Onde roda (outro)</Label>
            <Input
              id="edit-currentApplicationHostingCustom"
              value={form.currentApplicationHostingCustom}
              onChange={(e) => set("currentApplicationHostingCustom", e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationAuthor">Quem desenvolveu</Label>
          <Input
            id="edit-currentApplicationAuthor"
            value={form.currentApplicationAuthor}
            onChange={(e) => set("currentApplicationAuthor", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationOwner">Responsável hoje</Label>
          <Input
            id="edit-currentApplicationOwner"
            value={form.currentApplicationOwner}
            onChange={(e) => set("currentApplicationOwner", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationOwnerRole">Cargo do responsável</Label>
          <Input
            id="edit-currentApplicationOwnerRole"
            value={form.currentApplicationOwnerRole}
            onChange={(e) => set("currentApplicationOwnerRole", e.target.value)}
            placeholder="Ex.: Analista de Processos"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Setor do responsável</Label>
          <Select
            value={form.currentApplicationOwnerAreaId || undefined}
            onValueChange={(v) => set("currentApplicationOwnerAreaId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione, se souber" />
            </SelectTrigger>
            <SelectContent>
              {areas
                .filter((a) => a.id)
                .map((a) => (
                  <SelectItem key={a.id} value={a.id as string}>
                    {a.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationBackupOwner">Responsável substituto</Label>
          <Input
            id="edit-currentApplicationBackupOwner"
            value={form.currentApplicationBackupOwner}
            onChange={(e) => set("currentApplicationBackupOwner", e.target.value)}
            placeholder="Se o responsável sair, quem assume"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Onde ficam os acessos</Label>
          <Select
            value={form.currentApplicationAccessLocation}
            onValueChange={(v) => set("currentApplicationAccessLocation", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationAccessReference">Onde encontrar</Label>
          <Input
            id="edit-currentApplicationAccessReference"
            value={form.currentApplicationAccessReference}
            maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
            onChange={(e) => set("currentApplicationAccessReference", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Só a referência de onde procurar. Nunca senhas, tokens ou chaves.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationLiveSince">Em produção desde</Label>
          <Input
            id="edit-currentApplicationLiveSince"
            type="date"
            value={form.currentApplicationLiveSince}
            onChange={(e) => set("currentApplicationLiveSince", e.target.value)}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            O que fazer se a automação parar de funcionar?
          </Label>
          {CURRENT_APPLICATION_CONTINGENCY_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={form.currentApplicationContingencyActions.includes(option.key)}
                onCheckedChange={() => toggleContingencyAction(option.key)}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-currentApplicationContingencyDetails">Detalhes da contingência</Label>
          <Textarea
            id="edit-currentApplicationContingencyDetails"
            rows={2}
            value={form.currentApplicationContingencyDetails}
            onChange={(e) => set("currentApplicationContingencyDetails", e.target.value)}
            placeholder="Detalhe o passo a passo, se houver"
          />
        </div>

        <div className="sm:col-span-2">
          <AutomationInventoryFields
            section="accounts"
            value={automationInventory}
            onChange={setAutomationInventory}
          />
        </div>
      </DetailSection>

      <DetailSection title="Sistemas e dados">
        <div className="sm:col-span-2">
          <AutomationInventoryFields
            section="systems"
            value={automationInventory}
            onChange={setAutomationInventory}
            canRegisterTaxonomy={isArchitect}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Lida com dados sigilosos</Label>
          <Select
            value={form.handlesSensitiveData}
            onValueChange={(v) => set("handlesSensitiveData", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {SENSITIVE_DATA_ANSWER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Categorias de dados sigilosos
          </Label>
          <div className="space-y-2">
            {SENSITIVE_DATA_CATEGORY_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.sensitiveDataCategories.includes(option.key)}
                  onCheckedChange={() => toggleSensitiveDataCategory(option.key)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-sensitiveDataDetails">Detalhes dos dados sigilosos</Label>
          <Textarea
            id="edit-sensitiveDataDetails"
            rows={2}
            value={form.sensitiveDataDetails}
            onChange={(e) => set("sensitiveDataDetails", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Entrada de dados</Label>
          <Select
            value={form.currentApplicationDataInput}
            onValueChange={(v) => set("currentApplicationDataInput", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationDataInputDetails">Detalhes da entrada de dados</Label>
          <Textarea
            id="edit-currentApplicationDataInputDetails"
            rows={2}
            value={form.currentApplicationDataInputDetails}
            onChange={(e) => set("currentApplicationDataInputDetails", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Saída de dados</Label>
          <Select
            value={form.currentApplicationDataOutput}
            onValueChange={(v) => set("currentApplicationDataOutput", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationDataOutputDetails">Detalhes da saída de dados</Label>
          <Textarea
            id="edit-currentApplicationDataOutputDetails"
            rows={2}
            value={form.currentApplicationDataOutputDetails}
            onChange={(e) => set("currentApplicationDataOutputDetails", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
        <div className="space-y-1.5">
          <Label htmlFor="edit-peopleInvolved">Colaboradores envolvidos</Label>
          <Input
            id="edit-peopleInvolved"
            type="number"
            min={0}
            value={form.peopleInvolved}
            onChange={(e) => set("peopleInvolved", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-peopleInvolvedDetails">Detalhes dos colaboradores</Label>
          <Input
            id="edit-peopleInvolvedDetails"
            value={form.peopleInvolvedDetails}
            onChange={(e) => set("peopleInvolvedDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-taskDurationHours">Duração por execução (horas)</Label>
          <Input
            id="edit-taskDurationHours"
            type="number"
            min={0}
            step="0.1"
            value={form.taskDurationHours}
            onChange={(e) => set("taskDurationHours", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Periodicidade</Label>
          <Select
            value={form.processFrequency}
            onValueChange={(v) => set("processFrequency", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {PROCESS_FREQUENCIES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <DetailSection title="Funcionalidades & benefícios">
        <FieldRow label="Funcionalidades" value={project.features} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Benefícios esperados</Label>
          <div className="space-y-2">
            {BENEFIT_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.benefits.includes(option.key)}
                  onCheckedChange={() => toggleBenefit(option.key)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-benefitsDetails">Detalhes dos benefícios</Label>
          <Textarea
            id="edit-benefitsDetails"
            rows={2}
            value={form.benefitsDetails}
            onChange={(e) => set("benefitsDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-monthlyHoursSaved">Horas economizadas por mês</Label>
          <Input
            id="edit-monthlyHoursSaved"
            type="number"
            min={0}
            step="0.1"
            value={form.monthlyHoursSaved}
            onChange={(e) => set("monthlyHoursSaved", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Avaliações">
        <div className="sm:col-span-2 divide-y divide-border/60">
          <RatingRow
            label="Redução de erros"
            value={form.ratingErrorReduction}
            onChange={(v) => set("ratingErrorReduction", v)}
          />
          <RatingRow
            label="Criticidade do processo"
            value={form.ratingProcessCriticality}
            onChange={(v) => set("ratingProcessCriticality", v)}
          />
          <RatingRow
            label="Impacto interno"
            value={form.ratingInternalImpact}
            onChange={(v) => set("ratingInternalImpact", v)}
          />
          <RatingRow
            label="Impacto externo"
            value={form.ratingExternalImpact}
            onChange={(v) => set("ratingExternalImpact", v)}
          />
          <RatingRow
            label="Atendimento a políticas"
            value={form.ratingCompliance}
            onChange={(v) => set("ratingCompliance", v)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Narrativa & prazo">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-projectNarrative">Narrativa do processo</Label>
          <Textarea
            id="edit-projectNarrative"
            rows={3}
            value={form.projectNarrative}
            onChange={(e) => set("projectNarrative", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Urgência</Label>
          <CreatableCombobox
            options={urgencyLevelOptions}
            value={form.urgency}
            onChange={(v) => set("urgency", v)}
            onCreate={(label) =>
              createUrgencyLevel.mutate({
                name: label,
                slug: slugify(label),
                order: dbUrgencyLevels.length,
              })
            }
            placeholder="Selecione ou crie"
            disabled={createUrgencyLevel.isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-estimatedDeadline">Prazo limite</Label>
          <Input
            id="edit-estimatedDeadline"
            type="date"
            value={form.estimatedDeadline}
            onChange={(e) => set("estimatedDeadline", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-additionalInfo">Informações adicionais</Label>
          <Textarea
            id="edit-additionalInfo"
            rows={2}
            value={form.additionalInfo}
            onChange={(e) => set("additionalInfo", e.target.value)}
          />
        </div>
      </DetailSection>

      {canSeeTechnical && (
        <DetailSection title="Diagnóstico técnico">
          <FieldRow
            label="Complexidade"
            value={resolveLabel(project.complexity, COMPLEXITY_LEVELS)}
          />
          <FieldRow
            label="Ferramenta principal"
            value={
              [project.mainToolCategory?.name, project.mainTool?.name].filter(Boolean).join(" — ") ||
              undefined
            }
          />
          <FieldRow
            label="Estratégia de execução"
            value={resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES)}
          />
          <FieldRow label="Notas do arquiteto" value={project.architectNotes} />
          <FieldRow label="Tipos de solução" value={solutionTypeLabels} />
          <FieldRow
            label="Economia anual estimada"
            value={
              project.estimatedAnnualSavingBRL != null
                ? formatCurrency(project.estimatedAnnualSavingBRL)
                : undefined
            }
          />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Campos técnicos/financeiros continuam só editáveis em
            &quot;Especificação&quot; — não fazem parte deste formulário.
          </p>
        </DetailSection>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={updateMutation.isPending}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
