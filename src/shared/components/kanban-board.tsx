"use client";

import { useEffect, useRef, useState } from "react";
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
  // DEBUG (temporário) — remover depois de diagnosticar o bug de drag-and-drop
  const lastLoggedOverId = useRef<string | null | undefined>(undefined);
  // Posição real do ponteiro, rastreada de forma independente do sistema de
  // colisão do dnd-kit (que não está resolvendo o alvo corretamente durante
  // o arrasto). Usada em handleDragEnd para achar o alvo real via
  // document.elementFromPoint, em vez de confiar em event.over.
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
    // DEBUG (temporário) — remover depois de diagnosticar o bug de drag-and-drop
    lastLoggedOverId.current = undefined;
    console.log("[kanban debug] START");
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over, delta } = event;
    const overIdNow = over ? String(over.id) : null;
    // DEBUG (temporário) — só loga quando o alvo detectado muda, pra não inundar o console
    if (overIdNow !== lastLoggedOverId.current) {
      lastLoggedOverId.current = overIdNow;
      console.log(
        `[kanban debug] overId mudou para: ${overIdNow ?? "NENHUM"} | mouse moveu dx=${Math.round(delta.x)} dy=${Math.round(delta.y)}`
      );
    }
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
    // soltou, via API nativa do navegador.
    const { x, y } = pointerPositionRef.current;
    const elementAtPoint = document.elementFromPoint(x, y);
    const columnEl = elementAtPoint?.closest("[data-column-status]");
    const targetStatus = columnEl?.getAttribute("data-column-status") as
      | ProjectStatus
      | null
      | undefined;

    const original = projects.find((p) => p.id === movedId);

    // DEBUG (temporário) — remover depois de diagnosticar o bug de drag-and-drop
    console.log(
      `[kanban debug] SOLTOU em (${x}, ${y}) → coluna detectada: ${targetStatus ?? "NENHUMA"} | status atual: ${original?.status}`
    );

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
