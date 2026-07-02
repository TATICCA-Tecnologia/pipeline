"use client";

import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectExecutiveSlide } from "@/shared/components/project-executive-slide";
import { trpc } from "@/shared/trpc/client";
import { Loader2, Printer } from "lucide-react";

interface ProjectExecutiveSlideModalData {
  project: Project;
}

export function ProjectExecutiveSlideModal({
  data,
  onClose,
}: ModalProps<ProjectExecutiveSlideModalData>) {
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

  const stillLoading = isLoading && !fullProject;

  return (
    <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-[8px] bg-white">
      <div className="flex items-center justify-between bg-primary px-5 py-4 print:hidden">
        <p className="text-sm font-bold text-white">Slide Executivo</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            disabled={stillLoading}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Imprimir / Exportar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        {stillLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ProjectExecutiveSlide project={project} />
        )}
      </div>
    </div>
  );
}
