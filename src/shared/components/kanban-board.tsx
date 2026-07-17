"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Project, ProjectStatus } from "@/shared/types";
import { KanbanColumn } from "./kanban-column";
import { ProjectCard } from "./project-card";

const COLUMN_ORDER: ProjectStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
];

interface KanbanBoardProps {
  projects: Project[];
  onMoveProject?: (projectId: string, newStatus: ProjectStatus) => void;
  onProjectClick?: (project: Project) => void;
  canDrag?: boolean;
  visibleColumns?: ProjectStatus[];
}

export function KanbanBoard({
  projects,
  onMoveProject,
  onProjectClick,
  canDrag = false,
  visibleColumns = COLUMN_ORDER,
}: KanbanBoardProps) {
  const [items, setItems] = useState<Project[]>(projects);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId) setItems(projects);
  }, [projects, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeProject = activeId ? items.find((p) => p.id === activeId) ?? null : null;

  const resolveTargetStatus = (overId: string): ProjectStatus | null => {
    if ((visibleColumns as string[]).includes(overId)) {
      return overId as ProjectStatus;
    }
    const overItem = items.find((p) => p.id === overId);
    return overItem ? overItem.status : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over, collisions } = event;
    // DEBUG (temporário) — remover depois de diagnosticar o bug de drag-and-drop
    console.log("[kanban debug] dragOver", {
      overId: over?.id ?? null,
      activeId: active.id,
      activeRect: active.rect.current.translated,
      allCollisions: collisions?.map((c) => c.id) ?? [],
    });
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const activeItem = items.find((p) => p.id === activeIdStr);
    if (!activeItem) return;

    const targetStatus = resolveTargetStatus(overIdStr);
    // DEBUG (temporário)
    console.log("[kanban debug] resolveTargetStatus", {
      overIdStr,
      targetStatus,
      activeItemStatus: activeItem.status,
    });
    if (!targetStatus || targetStatus === activeItem.status) return;

    setItems((prev) =>
      prev.map((p) => (p.id === activeIdStr ? { ...p, status: targetStatus } : p)),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    const movedId = String(active.id);
    setActiveId(null);
    const original = projects.find((p) => p.id === movedId);
    const updated = items.find((p) => p.id === movedId);
    // DEBUG (temporário) — remover depois de diagnosticar o bug de drag-and-drop
    console.log("[kanban debug] dragEnd", {
      movedId,
      originalStatus: original?.status,
      updatedStatus: updated?.status,
      willMove: !!(original && updated && original.status !== updated.status),
    });
    if (original && updated && original.status !== updated.status) {
      onMoveProject?.(movedId, updated.status);
    } else {
      setItems(projects);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setItems(projects);
  };

  const getProjectsByStatus = (status: ProjectStatus) =>
    items.filter((p) => p.status === status);

  if (!canDrag) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleColumns.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            projects={getProjectsByStatus(status)}
            activeId={null}
            canDrag={false}
            onProjectClick={onProjectClick}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleColumns.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            projects={getProjectsByStatus(status)}
            activeId={activeId}
            canDrag
            onProjectClick={onProjectClick}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {activeProject ? (
          <div className="rotate-2 scale-[1.03] shadow-2xl shadow-primary/25 ring-1 ring-primary/30 rounded-xl pointer-events-none">
            <ProjectCard project={activeProject} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
