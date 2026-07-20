"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
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
import { trpc } from "@/shared/trpc/client";
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

  // Polling leve (10s) dos locks de presença ativos — ver
  // docs/superpowers/specs/2026-07-20-lock-visual-card-editando-design.md.
  const { data: activeLocks = [] } = trpc.project.activeLocks.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const locksByProjectId = useMemo(() => {
    const map: Record<string, { userId: string; userName: string }> = {};
    for (const lock of activeLocks) {
      map[lock.projectId] = { userId: lock.userId, userName: lock.userName };
    }
    return map;
  }, [activeLocks]);
  // Posição real do ponteiro, rastreada de forma independente do sistema de
  // colisão do dnd-kit (que não está resolvendo o alvo corretamente durante
  // o arrasto). Usada em handleDragEnd para achar o alvo real via
  // document.elementsFromPoint, em vez de confiar em event.over.
  const pointerPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!activeId) return;
    const handlePointerMove = (e: PointerEvent) => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [activeId]);

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
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const activeItem = items.find((p) => p.id === activeIdStr);
    if (!activeItem) return;

    const targetStatus = resolveTargetStatus(overIdStr);
    if (!targetStatus || targetStatus === activeItem.status) return;

    setItems((prev) =>
      prev.map((p) => (p.id === activeIdStr ? { ...p, status: targetStatus } : p)),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    const movedId = String(active.id);
    setActiveId(null);

    // Não confia em event.over (a resolução de colisão do dnd-kit trava no
    // primeiro alvo detectado e não acompanha o restante do arrasto) — em vez
    // disso, olha o que está de verdade sob o ponteiro no momento em que
    // soltou, via API nativa do navegador. Usa elementsFromPoint (plural) e
    // não elementFromPoint: o elemento do topo nesse ponto é sempre o próprio
    // DragOverlay (o "card fantasma" que segue o cursor), que não tem
    // pointer-events-none no wrapper que o dnd-kit controla — então o
    // elemento do topo nunca é uma coluna. Procura a coluna na pilha inteira.
    const { x, y } = pointerPositionRef.current;
    const elementsAtPoint = document.elementsFromPoint(x, y);
    const columnEl = elementsAtPoint
      .map((el) => el.closest("[data-column-status]"))
      .find((el): el is Element => el !== null);
    const targetStatus = columnEl?.getAttribute("data-column-status") as
      | ProjectStatus
      | null
      | undefined;

    const original = projects.find((p) => p.id === movedId);

    if (original && targetStatus && targetStatus !== original.status) {
      onMoveProject?.(movedId, targetStatus);
    }
    setItems(projects);
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
            locksByProjectId={locksByProjectId}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
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
            locksByProjectId={locksByProjectId}
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
