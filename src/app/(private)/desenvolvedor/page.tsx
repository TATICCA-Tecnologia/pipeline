"use client";

import { useState } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import { Separator } from "@/src/shared/components/ui/separator";
import { Calendar, FileText, Clock, AlertTriangle, LayoutList, MessageSquare, Presentation } from "lucide-react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useModal } from "@/shared/context/modal-context";
import { ProjectExecutiveSlideModal } from "../admin/projetos/_components/project-executive-slide.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";

const DEVELOPER_COLUMNS: ProjectStatus[] = [
  "todo",
  "in-progress",
  "review",
  "completed",
];

export default function DesenvolvedorDashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const scopedProjects = filterProjectsByCompany(projects, companyFilter);

  // Super admin "visualizando como Desenvolvedor" continua logado com o
  // próprio id (não o de um developer real) — filtrar por developerId
  // nesse caso esconderia o backlog e zeraria as estatísticas de todo mundo.
  // Super admin enxerga tudo, independente de estar "atribuído".
  const isAssignedToUser = (p: Project) =>
    isSuperAdmin || (user?.id != null && p.developerId === user.id);

  const assignedBacklog = scopedProjects.filter(
    (p) => p.status === "backlog" && isAssignedToUser(p)
  );

  const hasAssignedBacklog = assignedBacklog.length > 0;
  const visibleColumns: ProjectStatus[] = hasAssignedBacklog
    ? (["backlog", ...DEVELOPER_COLUMNS] as ProjectStatus[])
    : DEVELOPER_COLUMNS;

  const devProjects = [
    ...assignedBacklog,
    ...scopedProjects.filter((p) => p.status !== "backlog"),
  ];

  const stats = {
    assigned: scopedProjects.filter(isAssignedToUser).length,
    inProgress: scopedProjects.filter(
      (p) => isAssignedToUser(p) && p.status === "in-progress"
    ).length,
    review: scopedProjects.filter(
      (p) => isAssignedToUser(p) && p.status === "review"
    ).length,
  };

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    const project = scopedProjects.find((p) => p.id === projectId);

    // Desenvolvedor não pode mover para/de backlog
    if (project?.status === "backlog" || newStatus === "backlog") {
      toast.error("Apenas administradores podem mover projetos do Backlog");
      return;
    }

    moveProject(projectId, newStatus);
    toast.success("Status do projeto atualizado");
  };

  const statItems = [
    { label: "Atribuídos", value: stats.assigned, color: "text-foreground" },
    {
      label: "Em desenvolvimento",
      value: stats.inProgress,
      color: "text-amber-500",
    },
    { label: "Em revisão", value: stats.review, color: "text-purple-500" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie e atualize o status dos projetos
          </p>
        </div>
        <CompanyFilter
          projects={projects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>

      <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-border/60 py-4">
        {statItems.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.label}
            </dt>
            <dd className={`text-2xl font-semibold tabular-nums ${s.color}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500/70" />
        <span>
          Arraste os cards entre as colunas para atualizar o status. A coluna
          Backlog mostra {isSuperAdmin ? "todos os projetos em backlog" : "apenas projetos atribuídos a você"};
          sair do Backlog continua sendo feito pelo administrador.
        </span>
      </p>

      <KanbanBoard
        projects={devProjects}
        onProjectClick={setSelectedProject}
        onMoveProject={handleMoveProject}
        canDrag={true}
        visibleColumns={visibleColumns}
      />

      {/* Modal de detalhes do projeto */}
      <Dialog
        open={!!selectedProject}
        onOpenChange={() => setSelectedProject(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedProject?.title}</DialogTitle>
            <DialogDescription>Detalhes e ações do projeto</DialogDescription>
          </DialogHeader>

          {selectedProject && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Badge
                    variant="secondary"
                    className={STATUS_CONFIG[selectedProject.status].color}
                  >
                    {STATUS_CONFIG[selectedProject.status].label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={PRIORITY_CONFIG[selectedProject.priority].color}
                  >
                    {PRIORITY_CONFIG[selectedProject.priority].label}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Descrição</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedProject.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Data de Criação</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(selectedProject.createdAt)}
                      </p>
                    </div>
                  </div>

                  {selectedProject.estimatedDeadline && (
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Prazo Estimado</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(selectedProject.estimatedDeadline)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Links de navegação */}
                <div className="space-y-2">
                  <Link
                    href={`/desenvolvedor/projetos/${selectedProject.id}/especificacao`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <LayoutList className="h-4 w-4" />
                      Ver especificação e registrar horas
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                  <Link
                    href={`/projeto/${selectedProject.id}`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat do projeto
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const project = selectedProject;
                      setSelectedProject(null);
                      openModal(
                        `project-executive-slide-${project.id}`,
                        ProjectExecutiveSlideModal,
                        { project },
                        { size: "full", position: "center" }
                      );
                    }}
                  >
                    <Presentation className="h-4 w-4" />
                    Slide Executivo
                  </Button>
                </div>

                <Separator />

                {/* Ações rápidas de status */}
                <div>
                  <p className="text-sm font-medium mb-2">Alterar status</p>
                  {selectedProject.status === "backlog" ? (
                    <p className="text-sm text-muted-foreground">
                      Projetos no backlog só avançam quando um administrador
                      alterar o status.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {visibleColumns
                        .filter((s) => s !== selectedProject.status)
                        .filter((s) => s !== "backlog")
                        .map((status) => (
                          <Button
                            key={status}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              handleMoveProject(selectedProject.id, status);
                              setSelectedProject({
                                ...selectedProject,
                                status,
                              });
                            }}
                          >
                            {STATUS_CONFIG[status].label}
                          </Button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
