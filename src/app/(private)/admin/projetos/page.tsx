"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { toast } from "sonner";
import { Button } from "@/src/shared/components/ui/button";
import { Download } from "lucide-react";
import { ProjectDetailsModal } from "./_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateCSV(date?: Date | string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("pt-BR");
}

function downloadProjectsCSV(projects: Project[]) {
  const headers = [
    "ID",
    "Título",
    "Status",
    "Prioridade",
    "Tipo",
    "Descrição",
    "Público-alvo",
    "Usuários esperados",
    "Urgência",
    "Prazo estimado",
    "Orçamento estimado (R$)",
    "Horas mensais economizadas",
    "Possui sistema existente",
    "Detalhes sistema existente",
    "Possui aplicação existente hoje",
    "Detalhes aplicação existente",
    "Narrativa do projeto",
    "Benefícios",
    "Detalhes dos benefícios",
    "Avaliação: redução de erros",
    "Avaliação: criticidade do processo",
    "Avaliação: impacto interno",
    "Avaliação: impacto externo",
    "Avaliação: compliance",
    "Criado em",
    "Atualizado em",
  ];

  const rows = projects.map((p) => [
    p.id,
    p.title,
    STATUS_CONFIG[p.status]?.label ?? p.status,
    PRIORITY_CONFIG[p.priority]?.label ?? p.priority,
    p.projectType,
    p.description,
    p.targetAudience,
    p.expectedUsers,
    p.urgency,
    formatDateCSV(p.estimatedDeadline),
    p.estimatedBudget,
    p.monthlyHoursSaved,
    p.hasExistingSystem,
    p.existingSystemDetails,
    p.hasCurrentApplication,
    p.currentApplicationDetails,
    p.projectNarrative,
    p.benefits,
    p.benefitsDetails,
    p.ratingErrorReduction,
    p.ratingProcessCriticality,
    p.ratingInternalImpact,
    p.ratingExternalImpact,
    p.ratingCompliance,
    formatDateCSV(p.createdAt),
    formatDateCSV(p.updatedAt),
  ]);

  const csv =
    "﻿" + // BOM para Excel abrir UTF-8 corretamente
    [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `projetos_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const ALL_COLUMNS: ProjectStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
];

export default function AdminProjetosPage() {
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
  const { isDemoMode } = useDemoMode();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const filteredProjects = filterProjectsByCompany(projects, companyFilter);

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    moveProject(projectId, newStatus);
    toast.success("Status do projeto atualizado");
  };

  const handleProjectClick = (project: Project) => {
    openModal(
      `project-details-${project.id}`,
      ProjectDetailsModal,
      { project },
      {
        size: "full",
        position: "center",
      }
    );
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os projetos do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompanyFilter
            projects={projects}
            value={companyFilter}
            onChange={setCompanyFilter}
          />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {filteredProjects.length}{" "}
            {filteredProjects.length === 1 ? "projeto" : "projetos"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadProjectsCSV(filteredProjects);
              toast.success("CSV exportado com sucesso");
            }}
            disabled={filteredProjects.length === 0 || isDemoMode}
            title={isDemoMode ? "Exportação desativada no modo demonstração" : undefined}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </header>

      <KanbanBoard
        projects={filteredProjects}
        onProjectClick={handleProjectClick}
        onMoveProject={handleMoveProject}
        canDrag={true}
        visibleColumns={ALL_COLUMNS}
      />
    </div>
  );
}
