"use client";

import { useEffect, useState } from "react";
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
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "../_constants/architecture";
import { COMPLEXITY_LEVELS } from "@/shared/constants/project-taxonomy";

const UNASSIGNED = "__unassigned__";

interface ArchitectureTabProps {
  projectId: string;
}

export function ArchitectureTab({ projectId }: ArchitectureTabProps) {
  const utils = trpc.useUtils();
  const { data: project } = trpc.project.byId.useQuery({ id: projectId });
  const { data: phases = [] } = trpc.specification.getByProject.useQuery({ projectId });
  const { data: developers = [] } = trpc.user.listDevelopers.useQuery();

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      toast.success("Arquitetura salva");
    },
    onError: (err) => toast.error("Falha ao salvar", { description: err.message }),
  });

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

  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainTool, setMainTool] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
  const [architectNotes, setArchitectNotes] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("");
  const [robotSchedule, setRobotSchedule] = useState<string>("");
  const [estimatedAnnualSavingBRL, setEstimatedAnnualSavingBRL] = useState<string>("");

  useEffect(() => {
    if (project) {
      setSolutionTypes(project.solutionTypes ?? []);
      setMainTool(project.mainTool ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
      setArchitectNotes(project.architectNotes ?? "");
      setComplexity(project.complexity ?? "");
      setRobotSchedule(project.robotSchedule ?? "");
      setEstimatedAnnualSavingBRL(
        project.estimatedAnnualSavingBRL != null
          ? String(project.estimatedAnnualSavingBRL)
          : ""
      );
    }
  }, [project]);

  const toggleSolutionType = (value: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setSolutionTypes((prev) =>
      isChecked ? [...prev, value] : prev.filter((v) => v !== value)
    );
  };

  const handleSaveArchitecture = () => {
    const parsedSaving = parseFloat(estimatedAnnualSavingBRL);
    updateProject.mutate({
      id: projectId,
      solutionTypes,
      mainTool: mainTool || null,
      executionStrategy: executionStrategy || null,
      architectNotes: architectNotes || null,
      complexity: (complexity || null) as "baixa" | "media" | "alta" | null,
      robotSchedule: robotSchedule || null,
      estimatedAnnualSavingBRL: Number.isNaN(parsedSaving) ? null : parsedSaving,
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
              {SOLUTION_TYPES.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                >
                  <Checkbox
                    checked={solutionTypes.includes(opt.value)}
                    onCheckedChange={(v) => toggleSolutionType(opt.value, v)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ferramenta principal</Label>
              <Select value={mainTool} onValueChange={setMainTool}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {MAIN_TOOLS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="grid gap-5 sm:grid-cols-3">
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
                Só aparece nesta tela de administração — nunca é exibido ao cliente.
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
              disabled={updateProject.isPending}
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
