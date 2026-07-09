"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { useAuth } from "@/shared/context/auth-context";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Progress } from "@/src/shared/components/ui/progress";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Timer,
  BarChart3,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  params: Promise<{ id: string }>;
}

export default function DevEspecificacaoPage({ params }: Props) {
  const { id: projectId } = use(params);
  const { user, isSuperAdmin } = useAuth();
  const canCreateSpecification = isSuperAdmin || user?.role === "admin";

  const { data: phases, refetch } = trpc.specification.getByProject.useQuery({ projectId });
  const { data: project } = trpc.project.byId.useQuery({ id: projectId });

  const toggleTask = trpc.specification.toggleTaskComplete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Tarefa atualizada!");
    },
  });

  const logHours = trpc.specification.logHours.useMutation({
    onSuccess: () => {
      refetch();
      setHoursDialog(null);
      toast.success("Horas registradas!");
    },
    onError: (e) => toast.error(e.message),
  });

  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [hoursDialog, setHoursDialog] = useState<{ taskId: string; title: string; current: number } | null>(null);
  const [hoursInput, setHoursInput] = useState("");

  function togglePhase(phaseId: string) {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  }

  function openHoursDialog(task: { id: string; title: string; hoursWorked: number }) {
    setHoursDialog({ taskId: task.id, title: task.title, current: task.hoursWorked });
    setHoursInput(String(task.hoursWorked > 0 ? task.hoursWorked : ""));
  }

  function submitHours() {
    if (!hoursDialog) return;
    const val = parseFloat(hoursInput);
    if (isNaN(val) || val < 0) {
      toast.error("Informe um número válido de horas.");
      return;
    }
    logHours.mutate({ id: hoursDialog.taskId, hoursWorked: val });
  }

  // Métricas globais
  const allTasks = phases?.flatMap((p) => p.tasks) ?? [];
  const completedTasks = allTasks.filter((t) => t.completedAt);
  const totalEstimated = phases?.reduce((s, p) => s + p.estimatedHours, 0) ?? 0;
  const totalWorked = allTasks.reduce((s, t) => s + (t.hoursWorked ?? 0), 0);
  const overallProgress = allTasks.length > 0 ? Math.round((completedTasks.length / allTasks.length) * 100) : 0;

  // Tarefas atribuídas ao dev logado
  const myTasks = allTasks.filter((t) => t.assigneeId === user?.id);

  if (!phases) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Carregando especificação...
      </div>
    );
  }

  if (phases.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/desenvolvedor">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{project?.title ?? "Projeto"}</h1>
            <p className="text-sm text-muted-foreground">Especificação de desenvolvimento</p>
          </div>
        </div>
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Especificação ainda não criada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canCreateSpecification
              ? "Crie as fases e tarefas do projeto (manualmente ou com IA)."
              : "O administrador precisa criar as fases e tarefas do projeto."}
          </p>
          {canCreateSpecification && (
            <Link href={`/admin/projetos/${projectId}/especificacao`} className="mt-4">
              <Button>Criar especificação</Button>
            </Link>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/desenvolvedor">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project?.title ?? "Projeto"}</h1>
          <p className="text-sm text-muted-foreground">Especificação de desenvolvimento</p>
        </div>
        {canCreateSpecification && (
          <Link href={`/admin/projetos/${projectId}/especificacao`}>
            <Button variant="outline" size="sm">Editar fases e tarefas</Button>
          </Link>
        )}
      </div>

      {/* Cards de métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Progresso geral</p>
            <p className="text-2xl font-bold">{overallProgress}%</p>
            <Progress value={overallProgress} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tarefas concluídas</p>
            <p className="text-2xl font-bold">
              {completedTasks.length}
              <span className="text-sm text-muted-foreground font-normal">/{allTasks.length}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Horas estimadas</p>
            <p className="text-2xl font-bold">{totalEstimated}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Horas trabalhadas</p>
            <p className="text-2xl font-bold">{totalWorked}h</p>
            {totalEstimated > 0 && (
              <p className={`text-xs mt-1 ${totalWorked > totalEstimated ? "text-destructive" : "text-muted-foreground"}`}>
                {totalWorked > totalEstimated
                  ? `${(totalWorked - totalEstimated).toFixed(1)}h acima do previsto`
                  : `${(totalEstimated - totalWorked).toFixed(1)}h restantes`}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Minhas tarefas (se houver atribuição) */}
      {myTasks.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Minhas tarefas ({myTasks.filter((t) => t.completedAt).length}/{myTasks.length} concluídas)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myTasks.map((task) => {
              const isDone = !!task.completedAt;
              return (
                <div key={task.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                  <button
                    onClick={() => toggleTask.mutate({ id: task.id, completed: !isDone })}
                    disabled={toggleTask.isPending}
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </span>
                  <button
                    onClick={() => openHoursDialog({ id: task.id, title: task.title, hoursWorked: task.hoursWorked ?? 0 })}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Timer className="h-3 w-3" />
                    {task.hoursWorked > 0 ? `${task.hoursWorked}h` : "registrar"}
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Fases */}
      <div className="space-y-3">
        {phases.map((phase, idx) => {
          const phaseTasks = phase.tasks;
          const phaseCompleted = phaseTasks.filter((t) => t.completedAt).length;
          const phaseProgress = phaseTasks.length > 0 ? Math.round((phaseCompleted / phaseTasks.length) * 100) : 0;
          const phaseWorked = phaseTasks.reduce((s, t) => s + (t.hoursWorked ?? 0), 0);
          const isOpen = expandedPhases[phase.id] ?? idx === 0;

          return (
            <Card key={phase.id}>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-muted-foreground tabular-nums w-6">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="font-semibold flex-1">{phase.name}</span>
                    <Badge
                      variant={phaseProgress === 100 ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {phaseCompleted}/{phaseTasks.length}
                    </Badge>
                  </button>
                  <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {phase.estimatedHours}h est.
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {phaseWorked}h real
                    </span>
                  </div>
                </div>
                <Progress value={phaseProgress} className="h-1 mt-1 ml-10" />
              </CardHeader>

              {isOpen && (
                <CardContent className="px-4 pb-4">
                  {phase.description && (
                    <p className="text-sm text-muted-foreground mb-3 ml-10">{phase.description}</p>
                  )}
                  <div className="space-y-2 ml-10">
                    {phaseTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma tarefa nesta fase.</p>
                    ) : (
                      phaseTasks.map((task) => {
                        const isDone = !!task.completedAt;
                        return (
                          <div key={task.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5 group hover:bg-muted/30 transition-colors">
                            <button
                              onClick={() => toggleTask.mutate({ id: task.id, completed: !isDone })}
                              disabled={toggleTask.isPending}
                              className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              ) : (
                                <Circle className="h-4 w-4" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                              {task.assignee && (
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {task.assignee.name}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {task.estimatedHours}h
                              </span>
                              <button
                                onClick={() => openHoursDialog({ id: task.id, title: task.title, hoursWorked: task.hoursWorked ?? 0 })}
                                className={`flex items-center gap-1 rounded px-1.5 py-0.5 border transition-colors hover:bg-muted ${
                                  task.hoursWorked > 0
                                    ? task.hoursWorked > task.estimatedHours
                                      ? "text-destructive border-destructive/30"
                                      : "text-primary border-primary/30"
                                    : "border-transparent"
                                }`}
                              >
                                <Timer className="h-3 w-3" />
                                {task.hoursWorked > 0 ? `${task.hoursWorked}h real` : "registrar horas"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Dialog: registrar horas */}
      <Dialog open={!!hoursDialog} onOpenChange={(o) => !o && setHoursDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar horas trabalhadas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{hoursDialog?.title}</p>
          <div className="space-y-1.5">
            <Label>Horas trabalhadas</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={hoursInput}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder="Ex: 3.5"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submitHours()}
            />
            {hoursDialog && hoursDialog.current > 0 && (
              <p className="text-xs text-muted-foreground">
                Registrado anteriormente: {hoursDialog.current}h
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoursDialog(null)}>Cancelar</Button>
            <Button onClick={submitHours} disabled={logHours.isPending}>
              {logHours.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
