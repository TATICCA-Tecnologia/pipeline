"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { Loader2, Plus, Save, Trash2, Wrench, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { EXECUTION_STRATEGIES } from "../_constants/architecture";
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
import { COMPLEXITY_LEVELS } from "@/shared/constants/project-taxonomy";
import { computeAnnualSavingBRL } from "@/shared/lib/savings";
import { formatCurrency } from "@/shared/utils";

const UNASSIGNED = "__unassigned__";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface ArchitectureTabProps {
  projectId: string;
}

export function ArchitectureTab({ projectId }: ArchitectureTabProps) {
  const utils = trpc.useUtils();
  const { data: project } = trpc.project.byId.useQuery({ id: projectId });
  const { data: phases = [] } = trpc.specification.getByProject.useQuery({ projectId });
  const { data: developers = [] } = trpc.user.listDevelopers.useQuery();
  const { data: settings } = trpc.settings.getSettings.useQuery();
  const defaultHourlyRateBRL = settings?.defaultHourlyRateBRL ?? 90;

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      toast.success("Arquitetura salva");
    },
    onError: (err) => toast.error("Falha ao salvar", { description: err.message }),
  });

  const [mainToolCategoryId, setMainToolCategoryId] = useState<string>("");

  const { data: mainToolCategories = [] } = trpc.taxonomy.listMainToolCategories.useQuery();
  const mainToolCategoryOptions = useMemo(() => {
    const opts = mainToolCategories.map((c) => ({ value: c.id, label: c.name }));
    if (
      project?.mainToolCategory &&
      !opts.some((o) => o.value === project.mainToolCategory!.id)
    ) {
      opts.push({ value: project.mainToolCategory.id, label: project.mainToolCategory.name });
    }
    return opts;
  }, [mainToolCategories, project?.mainToolCategory]);
  const createMainToolCategory = trpc.taxonomy.createMainToolCategory.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainToolCategories.invalidate();
      setMainToolCategoryId(created.id);
      toast.success(`Categoria de ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar categoria de ferramenta", { description: err.message }),
  });

  const { data: mainTools = [] } = trpc.taxonomy.listMainTools.useQuery();
  const mainToolOptions = useMemo(() => {
    const filtered = mainTools.filter(
      (t) => !mainToolCategoryId || t.categoryId === mainToolCategoryId
    );
    const opts = filtered.map((t) => ({ value: t.id, label: t.name }));
    if (project?.mainTool && !opts.some((o) => o.value === project.mainTool!.id)) {
      opts.push({ value: project.mainTool.id, label: project.mainTool.name });
    }
    // A ferramenta selecionada AGORA precisa estar sempre entre as opções, ou o
    // combobox não acha o rótulo e renderiza o placeholder — o campo "fica em
    // branco" mesmo com um valor selecionado. Acontecia logo depois de criar
    // uma ferramenta: `setMainToolId` já apontava para ela, mas o filtro por
    // categoria (ou o refetch ainda em voo) a deixava fora de `opts`.
    if (mainToolId && !opts.some((o) => o.value === mainToolId)) {
      const known = mainTools.find((t) => t.id === mainToolId);
      if (known) opts.push({ value: known.id, label: known.name });
    }
    return opts;
  }, [mainTools, mainToolCategoryId, mainToolId, project?.mainTool]);
  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainTools.invalidate();
      setMainToolId(created.id);
      toast.success(`Ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar ferramenta", { description: err.message }),
  });

  const { data: projectKinds = [] } = trpc.taxonomy.listProjectKinds.useQuery();
  const solutionTypeOptions = useMemo(() => {
    const opts = projectKinds.map((k) => ({ value: k.id, label: k.name }));
    for (const st of project?.solutionTypes ?? []) {
      if (!opts.some((o) => o.value === st.id)) {
        opts.push({ value: st.id, label: st.name });
      }
    }
    return opts;
  }, [projectKinds, project?.solutionTypes]);
  const [newSolutionTypeName, setNewSolutionTypeName] = useState("");
  const createProjectKind = trpc.taxonomy.createProjectKind.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listProjectKinds.invalidate();
      setSolutionTypeIds((prev) => [...prev, created.id]);
      setNewSolutionTypeName("");
      toast.success(`Tipo de solução "${created.name}" criado`);
    },
    onError: (err) => toast.error("Falha ao criar tipo de solução", { description: err.message }),
  });
  function handleCreateSolutionType() {
    const trimmed = newSolutionTypeName.trim();
    if (!trimmed) return;
    createProjectKind.mutate({ name: trimmed, slug: slugify(trimmed), order: projectKinds.length });
  }

  const createPhase = trpc.specification.createPhase.useMutation({
    onSuccess: () => utils.specification.getByProject.invalidate({ projectId }),
    onError: (err) => toast.error("Falha ao criar fase", { description: err.message }),
  });
  const updatePhase = trpc.specification.updatePhase.useMutation({
    onSuccess: () => utils.specification.getByProject.invalidate({ projectId }),
    onError: (err) => toast.error("Falha ao atualizar fase", { description: err.message }),
  });
  const deletePhase = trpc.specification.deletePhase.useMutation({
    onSuccess: () => utils.specification.getByProject.invalidate({ projectId }),
    onError: (err) => toast.error("Falha ao excluir fase", { description: err.message }),
  });

  const [solutionTypeIds, setSolutionTypeIds] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
  const [architectNotes, setArchitectNotes] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("");
  const [robotSchedule, setRobotSchedule] = useState<string>("");
  const [hourlyRateBRL, setHourlyRateBRL] = useState<string>("");
  const [estimatedAnnualSavingBRL, setEstimatedAnnualSavingBRL] = useState<string>("");
  const [implementationEffortDays, setImplementationEffortDays] = useState<string>("");
  const [implementationWave, setImplementationWave] = useState<string>("");
  const [waveOrder, setWaveOrder] = useState<string>("");

  useEffect(() => {
    if (project) {
      setSolutionTypeIds((project.solutionTypes ?? []).map((k) => k.id));
      setMainToolCategoryId(project.mainToolCategory?.id ?? "");
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
      setArchitectNotes(project.architectNotes ?? "");
      setComplexity(project.complexity ?? "");
      setRobotSchedule(project.robotSchedule ?? "");
      setHourlyRateBRL(
        project.hourlyRateBRL != null ? String(project.hourlyRateBRL) : ""
      );
      if (project.estimatedAnnualSavingBRL != null) {
        setEstimatedAnnualSavingBRL(String(project.estimatedAnnualSavingBRL));
      } else {
        // Nenhum saving salvo ainda — pré-preenche com o cálculo automático
        // (horas economizadas/mês reportadas × 12 × taxa efetiva), se der pra calcular.
        const rate = project.hourlyRateBRL ?? defaultHourlyRateBRL;
        const computed = computeAnnualSavingBRL(project.monthlyHoursSaved, rate);
        setEstimatedAnnualSavingBRL(computed != null ? String(computed) : "");
      }
      setImplementationEffortDays(
        project.implementationEffortDays != null
          ? String(project.implementationEffortDays)
          : ""
      );
      setImplementationWave(
        project.implementationWave != null ? String(project.implementationWave) : ""
      );
      setWaveOrder(project.waveOrder != null ? String(project.waveOrder) : "");
    }
    // defaultHourlyRateBRL só é usado no fallback (saving ainda não salvo) —
    // recalcula esse fallback quando a taxa padrão chega da query de settings.
  }, [project, defaultHourlyRateBRL]);

  // Taxa horária muda -> recalcula o saving exibido a partir das horas já
  // reportadas no projeto. Editar o campo de saving diretamente ainda
  // sobrescreve manualmente até a taxa mudar de novo.
  const handleHourlyRateChange = (value: string) => {
    setHourlyRateBRL(value);
    if (!project || project.monthlyHoursSaved == null) return;
    const trimmed = value.trim();
    const parsedRate = trimmed !== "" ? parseFloat(trimmed) : defaultHourlyRateBRL;
    if (Number.isNaN(parsedRate) || parsedRate < 0) return;
    const computed = computeAnnualSavingBRL(project.monthlyHoursSaved, parsedRate);
    if (computed != null) setEstimatedAnnualSavingBRL(String(computed));
  };

  const liveEffectiveRate = (() => {
    const trimmed = hourlyRateBRL.trim();
    if (trimmed === "") return defaultHourlyRateBRL;
    const parsed = parseFloat(trimmed);
    return Number.isNaN(parsed) || parsed < 0 ? defaultHourlyRateBRL : parsed;
  })();
  const liveComputedSaving = project
    ? computeAnnualSavingBRL(project.monthlyHoursSaved, liveEffectiveRate)
    : null;

  const toggleSolutionType = (value: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setSolutionTypeIds((prev) =>
      isChecked ? [...prev, value] : prev.filter((v) => v !== value)
    );
  };

  const handleSaveArchitecture = () => {
    const normalizedSaving = estimatedAnnualSavingBRL
      .trim()
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const parsedSaving = parseFloat(normalizedSaving);
    const parsedHourlyRate = parseFloat(hourlyRateBRL.trim().replace(",", "."));
    const parsedEffortDays = parseInt(implementationEffortDays, 10);
    const parsedWave = parseInt(implementationWave, 10);
    const parsedWaveOrder = parseInt(waveOrder, 10);
    updateProject.mutate({
      id: projectId,
      solutionTypeIds,
      mainToolCategoryId: mainToolCategoryId || null,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
      architectNotes: architectNotes || null,
      complexity: (complexity || null) as "baixa" | "media" | "alta" | null,
      robotSchedule: robotSchedule || null,
      hourlyRateBRL:
        !Number.isNaN(parsedHourlyRate) && parsedHourlyRate >= 0 ? parsedHourlyRate : null,
      estimatedAnnualSavingBRL:
        !Number.isNaN(parsedSaving) && parsedSaving >= 0 ? parsedSaving : null,
      implementationEffortDays:
        !Number.isNaN(parsedEffortDays) && parsedEffortDays >= 0 ? parsedEffortDays : null,
      implementationWave:
        !Number.isNaN(parsedWave) && parsedWave >= 0 ? parsedWave : null,
      waveOrder:
        !Number.isNaN(parsedWaveOrder) && parsedWaveOrder >= 0 ? parsedWaveOrder : null,
    });
  };

  const handleAddPhase = () => {
    createPhase.mutate({
      projectId,
      name: "Nova fase",
      estimatedHours: 0,
      order: phases.length,
    });
  };

  return (
    <div className="space-y-6">
      {/* Configuração técnica */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Configuração técnica
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Tipo de solução</Label>
            <p className="text-xs text-muted-foreground">
              Selecione todos que se aplicam.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {solutionTypeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                >
                  <Checkbox
                    checked={solutionTypeIds.includes(opt.value)}
                    onCheckedChange={(v) => toggleSolutionType(opt.value, v)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={newSolutionTypeName}
                onChange={(e) => setNewSolutionTypeName(e.target.value)}
                placeholder="Novo tipo de solução"
                className="h-8 max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCreateSolutionType}
                disabled={!newSolutionTypeName.trim() || createProjectKind.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Categoria de ferramenta</Label>
              <p className="text-xs text-muted-foreground">
                Ex.: &quot;Motor de IA&quot; — já basta escolher a categoria.
              </p>
              <CreatableCombobox
                options={mainToolCategoryOptions}
                value={mainToolCategoryId}
                onChange={(v) => {
                  setMainToolCategoryId(v);
                  const stillValid = mainTools.some(
                    (t) => t.id === mainToolId && t.categoryId === v
                  );
                  if (mainToolId && !stillValid) setMainToolId("");
                }}
                onCreate={(label) =>
                  createMainToolCategory.mutate({
                    name: label,
                    slug: slugify(label),
                    order: mainToolCategories.length,
                  })
                }
                placeholder="Selecione ou crie"
                disabled={createMainToolCategory.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Produto (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Ex.: &quot;Claude&quot; dentro de Motor de IA — só se souber o produto exato.
              </p>
              <CreatableCombobox
                options={mainToolOptions}
                value={mainToolId}
                onChange={setMainToolId}
                onCreate={(label) =>
                  createMainTool.mutate({
                    name: label,
                    slug: slugify(label),
                    order: mainTools.length,
                    categoryId: mainToolCategoryId || null,
                  })
                }
                placeholder="Selecione ou crie (opcional)"
                disabled={createMainTool.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Estratégia de execução</Label>
              <Select value={executionStrategy} onValueChange={setExecutionStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTION_STRATEGIES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Complexidade</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Agendamento do robô</Label>
              <Input
                value={robotSchedule}
                onChange={(e) => setRobotSchedule(e.target.value)}
                placeholder="Ex.: Hora fixa, uma vez por dia"
              />
            </div>

            <div className="space-y-2">
              <Label>Taxa horária do profissional que executa (R$/h)</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={hourlyRateBRL}
                onChange={(e) => handleHourlyRateChange(e.target.value)}
                placeholder={`Padrão: ${defaultHourlyRateBRL}`}
              />
              {/*
                Campo historicamente rotulado só como "Taxa horária", cercado de
                campos técnicos do robô — o que levava a preencher aqui a taxa do
                desenvolvedor e corromper o saving (e, por consequência, o
                payback). O rótulo e o texto abaixo nomeiam de quem é a taxa.
              */}
              <p className="text-xs text-muted-foreground">
                Custo/hora de quem faz esta atividade <strong>manualmente hoje</strong> — é o
                que a empresa deixa de gastar quando o robô assume, e por isso alimenta a
                economia. <strong>Não</strong> é a taxa de quem desenvolve o robô (essa é a
                taxa diária do desenvolvedor, definida por empresa na aba Payback da
                priorização). Vazio = usa a taxa padrão de Configurações (
                {formatCurrency(defaultHourlyRateBRL)}/h).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Saving estimado anual (R$)</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={estimatedAnnualSavingBRL}
                onChange={(e) => setEstimatedAnnualSavingBRL(e.target.value)}
                placeholder="Ex.: 12480"
              />
              <p className="text-xs text-muted-foreground">
                {liveComputedSaving != null
                  ? `Calculado: ${formatCurrency(liveComputedSaving)}/ano (${project?.monthlyHoursSaved}h/mês × 12 × ${formatCurrency(liveEffectiveRate)}/h). Editável manualmente.`
                  : "Sem horas economizadas/mês reportadas — não é possível calcular automaticamente."}{" "}
                Só aparece nesta tela de administração — nunca é exibido ao cliente.
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Esforço de implementação (dias úteis)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={implementationEffortDays}
                onChange={(e) => setImplementationEffortDays(e.target.value)}
                placeholder="Ex.: 10"
              />
            </div>

            <div className="space-y-2">
              <Label>Onda de implementação</Label>
              <Select
                value={implementationWave}
                onValueChange={setImplementationWave}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Onda 1 (priorizada)</SelectItem>
                  <SelectItem value="2">Onda 2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ordem na onda</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={waveOrder}
                onChange={(e) => setWaveOrder(e.target.value)}
                placeholder="Ex.: 1"
              />
              <p className="text-xs text-muted-foreground">
                Ordem de execução dentro da onda (menor = primeiro).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações técnicas do arquiteto</Label>
            <p className="text-xs text-muted-foreground">
              Abordagem técnica, execução, limitações, regras, premissas, dependências
              externas, validações e estrutura esperada da solução.
            </p>
            <Textarea
              value={architectNotes}
              onChange={(e) => setArchitectNotes(e.target.value)}
              placeholder="Detalhe a abordagem técnica, pontos de atenção, premissas e dependências..."
              rows={10}
              className="resize-y"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveArchitecture}
              disabled={
                updateProject.isPending || createMainTool.isPending || createMainToolCategory.isPending
              }
            >
              {updateProject.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar arquitetura
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Planejamento da execução */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Planejamento da execução
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddPhase}
              disabled={createPhase.isPending}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Inserir fase
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {phases.length === 0 ? (
            <div className="border border-dashed rounded-md py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma fase planejada ainda.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Clique em &quot;Inserir fase&quot; para começar.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_120px_220px_40px] gap-2 px-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                <span>Nome da fase</span>
                <span>Horas</span>
                <span>Responsável</span>
                <span></span>
              </div>
              {phases.map((phase) => (
                <PhaseRow
                  key={phase.id}
                  phase={phase}
                  developers={developers}
                  onUpdate={(data) =>
                    updatePhase.mutate({ id: phase.id, ...data })
                  }
                  onDelete={() => deletePhase.mutate({ id: phase.id })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface PhaseRowProps {
  phase: {
    id: string;
    name: string;
    estimatedHours: number;
    assignedToId: string | null;
  };
  developers: Array<{ id: string; name: string }>;
  onUpdate: (data: {
    name?: string;
    estimatedHours?: number;
    assignedToId?: string | null;
  }) => void;
  onDelete: () => void;
}

function PhaseRow({ phase, developers, onUpdate, onDelete }: PhaseRowProps) {
  const [name, setName] = useState(phase.name);
  const [hours, setHours] = useState(String(phase.estimatedHours));

  useEffect(() => {
    setName(phase.name);
    setHours(String(phase.estimatedHours));
  }, [phase.name, phase.estimatedHours]);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== phase.name) {
      onUpdate({ name: trimmed });
    } else if (!trimmed) {
      setName(phase.name);
    }
  };

  const commitHours = () => {
    const parsed = parseFloat(hours);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed !== phase.estimatedHours) {
      onUpdate({ estimatedHours: parsed });
    } else if (Number.isNaN(parsed) || parsed < 0) {
      setHours(String(phase.estimatedHours));
    }
  };

  return (
    <div className="grid grid-cols-[1fr_120px_220px_40px] gap-2 items-center">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="Nome da fase"
      />
      <Input
        type="number"
        min={0}
        step={0.5}
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        onBlur={commitHours}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <Select
        value={phase.assignedToId ?? UNASSIGNED}
        onValueChange={(v) =>
          onUpdate({ assignedToId: v === UNASSIGNED ? null : v })
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
          {developers.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
