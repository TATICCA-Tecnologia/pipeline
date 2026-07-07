"use client";

import { useState } from "react";
import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
import { useProjects } from "@/shared/context/projects-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";
import { ProjectExecutiveSlideModal } from "./project-executive-slide.modal";

interface ProjectDetailsModalData {
  project: Project;
}

export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  const { user } = useAuth();
  const { deleteProject } = useProjects();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!data?.project.id) return;
    setDeleting(true);
    try {
      await deleteProject(data.project.id);
      toast.success("Projeto excluído");
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir projeto");
    } finally {
      setDeleting(false);
    }
  }

  const { openModal } = useModal();
  const { data: fullProject, isLoading } = trpc.project.byId.useQuery(
    { id: data?.project.id ?? "" },
    { enabled: !!data?.project.id }
  );

  if (!data) return null;

  const { project: cachedProject } = data;
  const project: Project = fullProject
    ? {
        ...(fullProject as unknown as Project),
        features: fullProject.features?.map((f) => f.name) ?? [],
      }
    : cachedProject;

  return (
    <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-[8px] bg-white">
      <div className="flex items-center justify-between bg-primary px-5 py-5">
        <p className="text-sm font-bold text-white">Detalhes do projeto</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <h2 className="mb-1 text-lg font-bold text-[#0F172A]">{project.title}</h2>
        <p className="mb-5 text-sm text-[#6B7280]">
          {isLoading && !fullProject
            ? "Carregando detalhes completos..."
            : "Todos os dados coletados na solicitação ou na importação de XML."}
        </p>

        {isLoading && !fullProject ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ProjectDetailSections project={project} viewerRole={user?.role} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-4">
        <div className="flex gap-2">
          <Button variant="outline" className="cursor-pointer" type="button" onClick={onClose}>
            Fechar
          </Button>
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <Button
              variant="destructive"
              className="cursor-pointer"
              type="button"
              onClick={() => setConfirmOpen(true)}
            >
              Excluir projeto
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {(user?.role === "admin" ||
            user?.role === "developer" ||
            user?.role === "super_admin") && (
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                onClose();
                openModal(
                  `project-executive-slide-${project.id}`,
                  ProjectExecutiveSlideModal,
                  { project },
                  { size: "full", position: "center" }
                );
              }}
            >
              <Presentation className="mr-1.5 h-4 w-4" />
              Slide Executivo
            </Button>
          )}
          <Button variant="outline" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button variant="default" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e remove o projeto, suas tarefas, fases, comentários e
              arquivos. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
