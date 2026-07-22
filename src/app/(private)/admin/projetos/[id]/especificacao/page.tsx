"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Progress } from "@/src/shared/components/ui/progress";
import { Separator } from "@/src/shared/components/ui/separator";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Textarea } from "@/src/shared/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/shared/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { ArchitectureTab } from "./_components/architecture-tab";
import { ProjectMoveStatusBox } from "@/shared/components/project-move-status-box";
import { useAuth } from "@/shared/context/auth-context";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  Trash2,
  Edit2,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  AlertTriangle,
  Layers,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import type { AISuggestedPhase } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function EspecificacaoPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { user } = useAuth();

  const { data: phases, refetch } = trpc.specification.getByProject.useQuery({ projectId });
  const { data: project } = trpc.project.byId.useQuery({ id: projectId });
  const { data: activityLogs = [] } = trpc.activity.byProject.useQuery({ projectId });
  const { data: developers = [] } = trpc.user.listDevelopers.useQuery();

  const createPhase = trpc.specification.createPhase.useMutation({ onSuccess: () => refetch() });
  const updatePhase = trpc.specification.updatePhase.useMutation({ onSuccess: () => refetch() });
  const deletePhase = trpc.specification.deletePhase.useMutation({ onSuccess: () => refetch() });
  const createTask = trpc.specification.createTask.useMutation({ onSuccess: () => refetch() });
  const updateTask = trpc.specification.updateTask.useMutation({ onSuccess: () => refetch() });
  const deleteTask = trpc.specification.deleteTask.useMutation({ onSuccess: () => refetch() });
  const suggestAI = trpc.specification.suggestWithAI.useMutation();
  const acceptSuggestions = trpc.specification.acceptAISuggestions.useMutation({
    onSuccess: () => {
      refetch();
      setAISuggestions(null);
      toast.success("Especificação gerada com sucesso!");
    },
  });

  // Dialogs
  const [phaseDialog, setPhaseDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    phaseId?: string;
    name: string;
    description: string;
    estimatedHours: number;
    assignedToId: string | null;
  }>({
    open: false,
    mode: "create",
    name: "",
    description: "",
    estimatedHours: 0,
    assignedToId: null,
  });

  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    phaseId: string;
    taskId?: string;
    title: string;
    description: string;
    estimatedHours: number;
  }>({ open: false, mode: "create", phaseId: "", title: "", description: "", estimatedHours: 0 });

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [aISuggestions, setAISuggestions] = useState<AISuggestedPhase[] | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);

  const togglePhase = (id: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalEstimated = phases?.reduce((s, p) => s + p.estimatedHours, 0) ?? 0;
  const totalCompleted = phases?.reduce(
    (s, p) => s + p.tasks.filter((t) => t.completedAt).length,
    0
  ) ?? 0;
  const totalTasks = phases?.reduce((s, p) => s + p.tasks.length, 0) ?? 0;
  const overallProgress = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const handleSuggestAI = async () => {
    try {
      const result = await suggestAI.mutateAsync({ projectId });
      setAISuggestions(result.phases);
      setAiDialogOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro ao consultar a IA", { description: msg });
    }
  };

  const handleAcceptSuggestions = async () => {
    if (!aISuggestions) return;
    await acceptSuggestions.mutateAsync({ projectId, phases: aISuggestions });
    setAiDialogOpen(false);
    // Expand all new phases after creation
    const { data: fresh } = await refetch();
    if (fresh) setExpandedPhases(new Set(fresh.map((p) => p.id)));
  };

  const handleSavePhase = async () => {
    if (!phaseDialog.name.trim()) return;
    if (phaseDialog.mode === "create") {
      await createPhase.mutateAsync({
        projectId,
        name: phaseDialog.name,
        description: phaseDialog.description || undefined,
        estimatedHours: phaseDialog.estimatedHours,
        order: phases?.length ?? 0,
        assignedToId: phaseDialog.assignedToId,
      });
      toast.success("Fase criada!");
    } else {
      await updatePhase.mutateAsync({
        id: phaseDialog.phaseId!,
        name: phaseDialog.name,
        description: phaseDialog.description || undefined,
        estimatedHours: phaseDialog.estimatedHours,
        assignedToId: phaseDialog.assignedToId,
      });
      toast.success("Fase atualizada!");
    }
    setPhaseDialog({
      open: false,
      mode: "create",
      name: "",
      description: "",
      estimatedHours: 0,
      assignedToId: null,
    });
  };

  const handleSaveTask = async () => {
    if (!taskDialog.title.trim()) return;
    if (taskDialog.mode === "create") {
      const phase = phases?.find((p) => p.id === taskDialog.phaseId);
      await createTask.mutateAsync({
        phaseId: taskDialog.phaseId,
        title: taskDialog.title,
        description: taskDialog.description || undefined,
        estimatedHours: taskDialog.estimatedHours,
        order: phase?.tasks.length ?? 0,
      });
      toast.success("Tarefa criada!");
    } else {
      await updateTask.mutateAsync({
        id: taskDialog.taskId!,
        title: taskDialog.title,
        description: taskDialog.description || undefined,
        estimatedHours: taskDialog.estimatedHours,
      });
      toast.success("Tarefa atualizada!");
    }
    setTaskDialog({ open: false, mode: "create", phaseId: "", title: "", description: "", estimatedHours: 0 });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border bg-linear-to-br from-primary/6 via-background to-background">
        <div className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-primary to-primary/30" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Link href={`/projeto/${projectId}`}>
                <Button variant="ghost" size="icon" className="shrink-0 -ml-2">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Layers className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link href={`/projeto/${projectId}`} className="hover:text-foreground transition-colors">
                    Projeto
                  </Link>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-foreground font-medium">Especificação</span>
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                  {project?.title ?? "Carregando..."}
                </h1>

                {project && (
                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <Badge variant="secondary" className="text-xs">
                      {STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG]?.label ?? project.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${PRIORITY_CONFIG[project.priority].color}`}
                    >
                      {PRIORITY_CONFIG[project.priority].label}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-normal">
                      {project.projectType}
                    </Badge>
                    {project.estimatedDeadline && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(project.estimatedDeadline)}
                      </span>
                    )}
                  </div>
                )}

                {project &&
                  (user?.role === "admin" ||
                    user?.role === "developer" ||
                    user?.role === "super_admin") && (
                    <div className="pt-2">
                      <ProjectMoveStatusBox projectId={projectId} currentStatus={project.status} />
                    </div>
                  )}
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={handleSuggestAI}
                disabled={suggestAI.isPending}
              >
                {suggestAI.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Sugerir com IA
              </Button>
              <Button
                onClick={() =>
                  setPhaseDialog({ open: true, mode: "create", name: "", description: "", estimatedHours: 0, assignedToId: null })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Fase
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="architecture" className="w-full">
        <TabsList>
          <TabsTrigger value="architecture">Arquitetura</TabsTrigger>
          <TabsTrigger value="details">Detalhes</TabsTrigger>
        </TabsList>

        <TabsContent value="architecture" className="mt-4">
          <ArchitectureTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="details" className="mt-4 space-y-6">
      {/* Resumo */}
      {(phases?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Progresso Geral</p>
              <p className="text-2xl font-bold">{overallProgress}%</p>
              <Progress value={overallProgress} className="h-1.5 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {totalCompleted} de {totalTasks} tarefas concluídas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Total Estimado</p>
              <p className="text-2xl font-bold">{totalEstimated}h</p>
              <p className="text-xs text-muted-foreground mt-1">
                {phases?.length} fases · {totalTasks} tarefas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">Fases</p>
              <p className="text-2xl font-bold">{phases?.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {phases?.filter((p) => p.tasks.every((t) => t.completedAt)).length ?? 0} concluídas
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fases */}
      {(phases?.length ?? 0) === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="rounded-full bg-muted p-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Nenhuma especificação ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use a IA para sugerir fases automaticamente ou crie manualmente.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSuggestAI} disabled={suggestAI.isPending}>
                {suggestAI.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Sugerir com IA
              </Button>
              <Button
                onClick={() =>
                  setPhaseDialog({ open: true, mode: "create", name: "", description: "", estimatedHours: 0, assignedToId: null })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {phases?.map((phase, phaseIndex) => {
            const isExpanded = expandedPhases.has(phase.id);
            const phaseDone = phase.tasks.filter((t) => t.completedAt).length;
            const phaseProgress =
              phase.tasks.length > 0 ? Math.round((phaseDone / phase.tasks.length) * 100) : 0;
            const phaseComplete = phase.tasks.length > 0 && phaseDone === phase.tasks.length;

            return (
              <Card key={phase.id} className={phaseComplete ? "border-emerald-500/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => togglePhase(phase.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex items-center gap-2 flex-1">
                      <Badge variant="outline" className="text-xs font-mono">
                        Fase {phaseIndex + 1}
                      </Badge>
                      <CardTitle
                        className="text-base cursor-pointer hover:text-primary"
                        onClick={() => togglePhase(phase.id)}
                      >
                        {phase.name}
                      </CardTitle>
                      {phaseComplete && (
                        <Badge className="bg-emerald-500/20 text-emerald-600 text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Concluída
                        </Badge>
                      )}
                      {phase.assignedTo && (
                        <Badge variant="outline" className="text-xs">
                          {phase.assignedTo.name}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {phase.estimatedHours}h
                      </span>
                      <span>
                        {phaseDone}/{phase.tasks.length} tarefas
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setPhaseDialog({
                            open: true,
                            mode: "edit",
                            phaseId: phase.id,
                            name: phase.name,
                            description: phase.description ?? "",
                            estimatedHours: phase.estimatedHours,
                            assignedToId: phase.assignedToId ?? null,
                          })
                        }
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={async () => {
                          await deletePhase.mutateAsync({ id: phase.id });
                          toast.success("Fase removida.");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {phase.description && (
                    <p className="text-sm text-muted-foreground ml-7 mt-1">{phase.description}</p>
                  )}
                  <div className="ml-7 mt-2">
                    <Progress value={phaseProgress} className="h-1.5" />
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent>
                    <Separator className="mb-3" />
                    <div className="space-y-2">
                      {phase.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 group"
                        >
                          <div className="mt-0.5">
                            {task.completedAt ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium ${task.completedAt ? "line-through text-muted-foreground" : ""}`}
                            >
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                              <Clock className="h-3 w-3" />
                              {task.estimatedHours}h
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() =>
                                setTaskDialog({
                                  open: true,
                                  mode: "edit",
                                  phaseId: phase.id,
                                  taskId: task.id,
                                  title: task.title,
                                  description: task.description ?? "",
                                  estimatedHours: task.estimatedHours,
                                })
                              }
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => deleteTask.mutate({ id: task.id })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap ml-auto group-hover:hidden">
                            <Clock className="h-3 w-3" />
                            {task.estimatedHours}h
                          </span>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs w-full justify-start text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setTaskDialog({
                          open: true,
                          mode: "create",
                          phaseId: phase.id,
                          title: "",
                          description: "",
                          estimatedHours: 0,
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar tarefa
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
        </TabsContent>
      </Tabs>

      {/* Dialog: criar/editar fase */}
      <Dialog
        open={phaseDialog.open}
        onOpenChange={(open) =>
          !open && setPhaseDialog({ open: false, mode: "create", name: "", description: "", estimatedHours: 0, assignedToId: null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {phaseDialog.mode === "create" ? "Nova Fase" : "Editar Fase"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da fase *</Label>
              <Input
                placeholder="Ex: Levantamento de Requisitos"
                value={phaseDialog.name}
                onChange={(e) => setPhaseDialog((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o objetivo desta fase..."
                value={phaseDialog.description}
                onChange={(e) => setPhaseDialog((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horas estimadas</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={phaseDialog.estimatedHours}
                onChange={(e) =>
                  setPhaseDialog((p) => ({ ...p, estimatedHours: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={phaseDialog.assignedToId ?? "__unassigned__"}
                onValueChange={(v) =>
                  setPhaseDialog((p) => ({
                    ...p,
                    assignedToId: v === "__unassigned__" ? null : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Sem responsável</SelectItem>
                  {developers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseDialog({ open: false, mode: "create", name: "", description: "", estimatedHours: 0, assignedToId: null })}>
              Cancelar
            </Button>
            <Button onClick={handleSavePhase} disabled={createPhase.isPending || updatePhase.isPending}>
              {createPhase.isPending || updatePhase.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: criar/editar tarefa */}
      <Dialog
        open={taskDialog.open}
        onOpenChange={(open) =>
          !open &&
          setTaskDialog({ open: false, mode: "create", phaseId: "", title: "", description: "", estimatedHours: 0 })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {taskDialog.mode === "create" ? "Nova Tarefa" : "Editar Tarefa"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                placeholder="Ex: Mapear entidades do banco de dados"
                value={taskDialog.title}
                onChange={(e) => setTaskDialog((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o que deve ser feito nesta tarefa..."
                value={taskDialog.description}
                onChange={(e) => setTaskDialog((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horas estimadas</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={taskDialog.estimatedHours}
                onChange={(e) =>
                  setTaskDialog((p) => ({ ...p, estimatedHours: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setTaskDialog({ open: false, mode: "create", phaseId: "", title: "", description: "", estimatedHours: 0 })
              }
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveTask} disabled={createTask.isPending || updateTask.isPending}>
              {createTask.isPending || updateTask.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: sugestão da IA */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sugestão da IA
            </DialogTitle>
          </DialogHeader>

          {aISuggestions && (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Aceitar esta sugestão irá <strong>substituir</strong> todas as fases existentes. Revise antes de confirmar.
                </p>
              </div>

              <div className="space-y-3">
                {aISuggestions.map((phase, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          Fase {i + 1}
                        </Badge>
                        <span className="font-medium text-sm">{phase.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {phase.estimatedHours}h
                      </span>
                    </div>
                    {phase.description && (
                      <p className="text-xs text-muted-foreground mb-3">{phase.description}</p>
                    )}
                    <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                      {phase.tasks.map((task, j) => (
                        <div key={j} className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <Circle className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{task.title}</p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.estimatedHours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
                <span>
                  {aISuggestions.length} fases ·{" "}
                  {aISuggestions.reduce((s, p) => s + p.tasks.length, 0)} tarefas
                </span>
                <span className="font-medium">
                  Total: {aISuggestions.reduce((s, p) => s + p.estimatedHours, 0)}h estimadas
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAcceptSuggestions}
              disabled={acceptSuggestions.isPending}
            >
              {acceptSuggestions.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Aceitar e criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma atividade registrada ainda para este projeto.
            </p>
          ) : (
            <ScrollArea className="max-h-56 pr-1 overflow-x-auto">
              <div className="space-y-3">
                {activityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm break-words">
                        <span className="font-medium">{log.action}</span>
                        {log.details && (
                          <>
                            {" "}
                            <span className="text-muted-foreground">• {log.details}</span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.userName} · {new Date(log.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
