"use client";

import { use, useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { useAuth } from "@/shared/context/auth-context";
import type { Project } from "@/shared/types";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { ProjectChat } from "@/shared/components/project-chat";
import { ProjectFiles } from "@/shared/components/project-files";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { Progress } from "@/src/shared/components/ui/progress";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { trpc } from "@/shared/trpc/client";
import {
  ArrowLeft,
  User,
  Building,
  Clock,
  FileText,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  LayoutList,
} from "lucide-react";
import Link from "next/link";
import { useModal } from "@/shared/context/modal-context";
import {
  ProjectAddFeatureModal,
  ProjectFeatureStatusModal,
  ProjectAssignDeveloperModal,
  ProjectAssignCompanyModal,
} from "./_components/project-modals";
import { useProjectActions } from "./hooks/project.action";
import { useProject } from "./hooks/project.hook";

interface ProjetoPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjetoPage({ params }: ProjetoPageProps) {
  const { id } = use(params);
  const { projects } = useProjects();
  const { user } = useAuth();
  const { projectDetails, activityLogs, developers } = useProject(id);
  const { addFeatureMutation, toggleFeatureMutation, updateProjectMutation } = useProjectActions(id);
  const { openModal } = useModal();

  const [selectedFeature, setSelectedFeature] = useState<
    { id: string; name: string; completedAt?: Date | string } | null
  >(null);

  const { data: phases, refetch: refetchPhases } = trpc.specification.getByProject.useQuery({ projectId: id });
  const toggleTaskComplete = trpc.specification.toggleTaskComplete.useMutation({ onSuccess: () => refetchPhases() });
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const togglePhaseExpand = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const projectFromDetails: Project | undefined = projectDetails
    ? {
        ...(projectDetails as unknown as Project),
        features: projectDetails.features?.map((f) => f.name) ?? [],
      }
    : undefined;
  const project: Project | undefined =
    projectFromDetails ?? projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold text-foreground mb-2">Projeto não encontrado</h1>
        <p className="text-muted-foreground mb-4">O projeto que você procura não existe.</p>
        <Link href={user?.role === "admin" ? "/admin/projetos" : user?.role === "developer" ? "/desenvolvedor" : "/cliente"}>
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[project.status as keyof typeof STATUS_CONFIG];
  const priorityConfig = PRIORITY_CONFIG[project.priority as keyof typeof PRIORITY_CONFIG];

  // Calcular progresso baseado nas funcionalidades concluídas (fallback para status)
  const featureList: Array<{ completedAt?: Date | string }> =
    Array.isArray((projectDetails as any)?.features) ? (projectDetails as any).features : [];
  const totalFeatures = featureList.length;
  const completedFeatures = featureList.filter((f) => f.completedAt).length;

  const progress =
    totalFeatures > 0
      ? Math.round((completedFeatures / totalFeatures) * 100)
      : (() => {
          const progressMap = {
            backlog: 0,
            todo: 20,
            "in-progress": 50,
            review: 80,
            completed: 100,
          };
          return progressMap[project.status as keyof typeof progressMap];
        })();

  const backUrl = user?.role === "admin" ? "/admin/projetos" : user?.role === "developer" ? "/desenvolvedor" : "/cliente";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backUrl}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
            <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
            <Badge variant="outline" className={priorityConfig.color}>
              {priorityConfig.label}
            </Badge>
          </div>
          <p className="text-muted-foreground">Detalhes do projeto</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          <ProjectDetailSections project={project} viewerRole={user?.role} />

          {/* Funcionalidades */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Funcionalidades
                </span>
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openModal(
                        `project-add-feature-${project.id}`,
                        ProjectAddFeatureModal,
                        { projectId: project.id },
                        { size: "md", position: "center" }
                      )
                    }
                  >
                    Adicionar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.isArray((projectDetails as any)?.features) &&
              (projectDetails as any).features.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(projectDetails as any).features.map(
                    (feature: {
                      id: string;
                      name: string;
                      completedAt?: string | Date;
                    }) => (
                      <div
                        key={feature.id}
                        className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1"
                      >
                        <span className="text-xs font-medium">{feature.name}</span>
                        {(user?.role === "admin" || user?.role === "developer") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setSelectedFeature(feature);
                              openModal(
                                `project-feature-status-${feature.id}`,
                                ProjectFeatureStatusModal,
                                {
                                  projectId: project.id,
                                  featureId: feature.id,
                                  featureName: feature.name,
                                  completedAt: feature.completedAt,
                                },
                                { size: "sm", position: "center" }
                              );
                            }}
                          >
                            {feature.completedAt ? (
                              <CheckSquare className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Square className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma funcionalidade cadastrada ainda.
                </p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Progresso</span>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                {totalFeatures > 0 && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {completedFeatures} de {totalFeatures} funcionalidades concluídas
                  </p>
                )}
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Fases de Especificação */}
          {(phases?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <LayoutList className="h-4 w-4" />
                    Fases do Projeto
                  </span>
                  {user?.role === "admin" && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/admin/projetos/${project.id}/especificacao`}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Gerenciar
                      </a>
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const totalTasks = phases!.reduce((s, p) => s + p.tasks.length, 0);
                  const doneTasks = phases!.reduce((s, p) => s + p.tasks.filter((t) => t.completedAt).length, 0);
                  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
                  return (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{doneTasks} de {totalTasks} tarefas concluídas</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  );
                })()}

                {phases!.map((phase, i) => {
                  const isExpanded = expandedPhases.has(phase.id);
                  const phaseDone = phase.tasks.filter((t) => t.completedAt).length;
                  const phaseProgress = phase.tasks.length > 0
                    ? Math.round((phaseDone / phase.tasks.length) * 100)
                    : 0;
                  const phaseComplete = phase.tasks.length > 0 && phaseDone === phase.tasks.length;

                  return (
                    <div key={phase.id} className={`rounded-lg border p-3 ${phaseComplete ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/30"}`}>
                      <button
                        className="w-full flex items-center gap-2 text-left"
                        onClick={() => togglePhaseExpand(phase.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Badge variant="outline" className="text-xs font-mono shrink-0">
                          {i + 1}
                        </Badge>
                        <span className="text-sm font-medium flex-1 truncate">{phase.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {phase.estimatedHours}h
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {phaseDone}/{phase.tasks.length}
                        </span>
                      </button>

                      {isExpanded && phase.tasks.length > 0 && (
                        <div className="mt-2 pl-6 space-y-1.5">
                          {phase.tasks.map((task) => (
                            <div key={task.id} className="flex items-start gap-2">
                              {(user?.role === "developer" || user?.role === "admin") ? (
                                <button
                                  onClick={() =>
                                    toggleTaskComplete.mutateAsync({
                                      id: task.id,
                                      completed: !task.completedAt,
                                    })
                                  }
                                  className="mt-0.5 shrink-0"
                                >
                                  {task.completedAt ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                                  )}
                                </button>
                              ) : (
                                <div className="mt-0.5 shrink-0">
                                  {task.completedAt ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs ${task.completedAt ? "line-through text-muted-foreground" : ""}`}>
                                  {task.title}
                                </p>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {task.estimatedHours}h
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 pl-6">
                        <Progress value={phaseProgress} className="h-1" />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Chat */}
          <ProjectChat projectId={project.id} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Arquivos */}
          <ProjectFiles projectId={project.id} />
          {/* Equipe */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Equipe
                </span>
                <div className="flex gap-2">
                  {user?.role === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openModal(
                          `project-assign-company-${project.id}`,
                          ProjectAssignCompanyModal,
                          { projectId: project.id, clientId: project.clientId },
                          { size: "md", position: "center" }
                        );
                      }}
                    >
                      Definir empresa
                    </Button>
                  )}
                  {user?.role === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openModal(
                          `project-assign-dev-${project.id}`,
                          ProjectAssignDeveloperModal,
                          { projectId: project.id },
                          { size: "md", position: "center" }
                        );
                      }}
                    >
                      Definir responsável
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>
                  {(projectDetails as any)?.companyName ?? "Sem empresa definida"}
                </span>
              </div>
              {project.developerId ? (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-400">
                      DEV
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {(projectDetails as any)?.developer?.name ?? "Desenvolvedor atribuído"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(projectDetails as any)?.developer?.email ?? ""}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum desenvolvedor atribuído ainda.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Atividade Recente */}
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
                            {new Date(log.createdAt).toLocaleString("pt-BR")}
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
      </div>
    </div>
  );
}
