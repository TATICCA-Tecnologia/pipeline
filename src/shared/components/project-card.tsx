"use client";

import { Card, CardContent } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import type { Project } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import { Calendar, ArrowRight, Presentation, Lock } from "lucide-react";
import { useAuth } from "@/shared/context/auth-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useModal } from "@/shared/context/modal-context";
import { ProjectExecutiveSlideModal } from "@/src/app/(private)/admin/projetos/_components/project-executive-slide.modal";
import { isExistingAutomation } from "@/shared/lib/opportunity-classification";

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  lock?: { userId: string; userName: string };
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-muted-foreground/50",
  medium: "bg-amber-400",
  high: "bg-red-500",
  urgent: "bg-red-600",
};

export function ProjectCard({
  project,
  onClick,
  draggable,
  isDragging = false,
  onDragStart,
  lock,
}: ProjectCardProps) {
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const statusConfig = STATUS_CONFIG[project.status];
  const { user } = useAuth();
  const { openModal } = useModal();
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const canSeeSlide =
    user?.role === "admin" || user?.role === "developer" || user?.role === "super_admin";
  const isLockedByOther = !!lock && lock.userId !== user?.id;

  return (
    <Card
      className={[
        "group relative cursor-pointer overflow-hidden border border-border/60 bg-card shadow-sm gap-0 py-0",
        "transition-all duration-200 ease-out",
        "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 w-full min-w-0 max-w-[300px]",
        isDragging ? "card-dragging" : "",
        isLockedByOther
          ? "border-amber-400/70 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5"
          : "",
      ].join(" ")}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {/* Linha de prioridade no topo do card */}
      <div
        className={[
          "absolute top-0 left-3 right-3 h-px rounded-full transition-opacity duration-200",
          PRIORITY_DOT[project.priority] ?? "bg-muted-foreground/30",
          "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      />

      {canSeeSlide && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openModal(
              `project-executive-slide-${project.id}`,
              ProjectExecutiveSlideModal,
              { project },
              { size: "full", position: "center" }
            );
          }}
          className="absolute top-1.5 right-1.5 z-10 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:text-primary group-hover:opacity-100"
          title="Slide Executivo"
        >
          <Presentation className="h-3.5 w-3.5" />
        </button>
      )}

      <CardContent className="space-y-1.5 p-2.5">
        {isLockedByOther && (
          <div className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            <Lock className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">Editando: {lock!.userName}</span>
          </div>
        )}

        {/* Título + descrição */}
        <div className="min-w-0 space-y-0.5">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
            {maskFreeText(project.title)}
          </p>
          {project.description && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground leading-relaxed">
              {maskFreeText(project.description)}
            </p>
          )}
        </div>

        {/* Badges */}
        <div className="flex min-w-0 flex-col items-start gap-1">
          {(project.hasCurrentApplication === "sim" ||
            project.hasCurrentApplication === "nao" ||
            project.status === "completed") && (
            <span
              className={`inline-block rounded px-1.5 py-px text-[9px] font-semibold uppercase ${
                isExistingAutomation(project)
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
              title={
                isExistingAutomation(project)
                  ? "Já existe uma automação/aplicação hoje para este processo, ou o robô já foi entregue"
                  : "Processo do zero, sem automação existente hoje"
              }
            >
              {isExistingAutomation(project) ? "Melhoria" : "Novo"}
            </span>
          )}
          {project.projectType && (
            <span
              className="inline-block max-w-[170px] truncate rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              title={project.projectType}
            >
              {project.projectType}
            </span>
          )}
          {project.solutionTypes?.slice(0, 2).map((k) => (
            <span
              key={k.id}
              className="inline-block max-w-[170px] truncate rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={k.name}
            >
              {k.name}
            </span>
          ))}
          {project.solutionTypes && project.solutionTypes.length > 2 && (
            <span
              className="inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={project.solutionTypes
                .slice(2)
                .map((k) => k.name)
                .join(", ")}
            >
              +{project.solutionTypes.length - 2}
            </span>
          )}
          {project.companyName && (
            <span
              className="inline-block max-w-[170px] truncate text-[10px] text-muted-foreground"
              title={maskCompanyName(project.companyId, project.companyName) ?? undefined}
            >
              {maskCompanyName(project.companyId, project.companyName)}
            </span>
          )}
          <Badge
            variant="outline"
            className={`text-[9px] font-semibold uppercase h-4 px-1.5 ${statusConfig.color}`}
          >
            {statusConfig.label}
          </Badge>
        </div>

        {/* Rodapé: prioridade + data */}
        <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[project.priority] ?? "bg-muted-foreground/50"}`}
            />
            <span className="truncate">{priorityConfig.label}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Calendar className="h-2.5 w-2.5 shrink-0" />
            <span className="whitespace-nowrap">
              {formatDate(project.createdAt)}
            </span>
          </div>
        </div>
      </CardContent>

      {/* Hover reveal — "Ver detalhes" desliza de baixo */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200 ease-out px-2.5 pb-2.5">
        <div className="flex items-center justify-center gap-1 rounded bg-primary/90 py-1 text-[10px] font-semibold text-primary-foreground shadow backdrop-blur-sm">
          Ver detalhes
          <ArrowRight className="h-2.5 w-2.5" />
        </div>
      </div>

      {/* Espaço reservado pra hover reveal não cortar */}
      <div className="h-0 group-hover:h-7 transition-all duration-200" />
    </Card>
  );
}
