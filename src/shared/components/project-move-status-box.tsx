"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { STATUS_CONFIG } from "@/shared/types";
import type { ProjectStatus } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { Label } from "@/src/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";

interface ProjectMoveStatusBoxProps {
  projectId: string;
  // Aceita também "cancelled" porque o status vindo direto de trpc.project.byId
  // é mais largo que ProjectStatus (que só cobre as colunas do Kanban) — um
  // projeto cancelado não tem coluna própria, mas ainda pode chegar aqui.
  currentStatus: ProjectStatus | "cancelled";
}

// Mover projeto entre colunas do Kanban sem precisar arrastar — extraído do
// modal de detalhes pra também poder aparecer nas telas de Arquitetura e
// Especificação, que hoje não tinham nenhuma forma de mudar o status.
export function ProjectMoveStatusBox({ projectId, currentStatus }: ProjectMoveStatusBoxProps) {
  const utils = trpc.useUtils();
  const [pendingMoveStatus, setPendingMoveStatus] = useState<ProjectStatus | undefined>(
    undefined
  );
  const moveProjectMutation = trpc.project.move.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.project.byId.invalidate({ id: projectId });
      toast.success("Projeto movido");
      setPendingMoveStatus(undefined);
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível mover o projeto.");
    },
  });

  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-3">
      <Label htmlFor="move-status" className="text-xs text-muted-foreground">
        Mover para:
      </Label>
      <Select
        value={pendingMoveStatus ?? currentStatus}
        onValueChange={(v) => setPendingMoveStatus(v as ProjectStatus)}
      >
        <SelectTrigger id="move-status" className="h-8 w-44 text-xs">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
            <SelectItem key={value} value={value}>
              {cfg.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-8"
        disabled={
          !pendingMoveStatus ||
          pendingMoveStatus === currentStatus ||
          moveProjectMutation.isPending
        }
        onClick={() =>
          moveProjectMutation.mutate({
            id: projectId,
            status: pendingMoveStatus as ProjectStatus,
          })
        }
      >
        {moveProjectMutation.isPending ? "Movendo..." : "Mover"}
      </Button>
    </div>
  );
}
