"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ModalProps } from "@/shared/types/modal";
import { Button } from "@/src/shared/components/ui/button";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { useComments } from "@/shared/context/comments-context";
import { useAuth } from "@/shared/context/auth-context";

interface ReportIncidentModalData {
  projectId: string;
  projectTitle: string;
}

export function ReportIncidentModal({
  data,
  onClose,
}: ModalProps<ReportIncidentModalData>) {
  const { user } = useAuth();
  const { addComment } = useComments(data?.projectId);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!data) return null;
  const { projectId, projectTitle } = data;

  async function handleSubmit() {
    if (!content.trim() || !user) return;
    setSubmitting(true);
    try {
      await addComment({
        projectId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        content: content.trim(),
        visibility: "GLOBAL",
        isIncident: true,
      });
      toast.success("Problema reportado com sucesso");
      onClose();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[8px] bg-white p-5">
      <div>
        <h2 className="text-lg font-bold text-[#0F172A]">Reportar problema</h2>
        <p className="text-sm text-[#6B7280]">{projectTitle}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="incident-content">Descreva o problema</Label>
        <Textarea
          id="incident-content"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ex.: o robô parou de rodar desde ontem à noite..."
          autoFocus
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!content.trim() || submitting}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
