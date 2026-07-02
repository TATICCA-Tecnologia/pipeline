"use client";

import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2 } from "lucide-react";

interface ProjectDetailsModalData {
  project: Project;
}

export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  const { user } = useAuth();
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
        <Button variant="outline" className="cursor-pointer" type="button" onClick={onClose}>
          Fechar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button variant="default" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
