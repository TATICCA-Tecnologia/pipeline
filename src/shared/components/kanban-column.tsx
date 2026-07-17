"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG } from "@/shared/types";
import { ProjectCard } from "./project-card";

const STATUS_DOT_COLOR: Record<ProjectStatus, string> = {
  backlog: "bg-muted-foreground/50",
  todo: "bg-blue-500",
  "in-progress": "bg-green-500",
  review: "bg-yellow-500",
  completed: "bg-emerald-500",
};

interface KanbanColumnProps {
  status: ProjectStatus;
  projects: Project[];
  activeId: string | null;
  canDrag?: boolean;
  onProjectClick?: (project: Project) => void;
}

export function KanbanColumn({
  status,
  projects,
  activeId,
  canDrag = false,
  onProjectClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrag });
  const config = STATUS_CONFIG[status];
  const dotColor = STATUS_DOT_COLOR[status];

  return (
    <div
      ref={setNodeRef}
      data-column-status={status}
      className={[
        "flex flex-1 flex-col basis-60 min-w-60 rounded-lg transition-colors duration-150",
        isOver
          ? "bg-accent/50 ring-1 ring-primary/30"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="flex items-center justify-between px-1 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          <h3 className="text-sm font-medium text-muted-foreground">
            {config.label}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground/70">
            {projects.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex w-full min-w-0 flex-col gap-2 py-1 min-h-20">
            {projects.map((project, i) =>
              canDrag ? (
                <SortableCard
                  key={project.id}
                  project={project}
                  isActive={activeId === project.id}
                  onClick={() => onProjectClick?.(project)}
                />
              ) : (
                <div
                  key={project.id}
                  className="w-full min-w-0 animate-fade-up"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <ProjectCard
                    project={project}
                    onClick={() => onProjectClick?.(project)}
                  />
                </div>
              ),
            )}

            {projects.length === 0 && (
              <div
                className={[
                  "flex h-20 items-center justify-center text-xs text-muted-foreground/50 select-none rounded-md transition-colors",
                  isOver ? "bg-primary/5 ring-1 ring-dashed ring-primary/30" : "",
                ].join(" ")}
              >
                {isOver ? "Solte aqui" : "Nenhum projeto"}
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

interface SortableCardProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
}

function SortableCard({ project, isActive, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
    opacity: isActive ? 0 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="w-full min-w-0 touch-none"
    >
      <ProjectCard project={project} onClick={onClick} />
    </div>
  );
}
