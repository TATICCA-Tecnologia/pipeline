"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { ProjectDetailsModal } from "../admin/projetos/_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";

export default function ClienteDashboard() {
  const { projects } = useProjects();
  const { openModal } = useModal();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const clientProjects = filterProjectsByCompany(projects, companyFilter);

  const visibleColumns: ProjectStatus[] = ["backlog", "in-progress", "completed"];

  const stats = {
    total: clientProjects.length,
    backlog: clientProjects.filter((p) => p.status === "backlog").length,
    inProgress: clientProjects.filter((p) => p.status === "in-progress").length,
    completed: clientProjects.filter((p) => p.status === "completed").length,
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

  const statItems = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Backlog", value: stats.backlog, color: "text-muted-foreground" },
    {
      label: "Em desenvolvimento",
      value: stats.inProgress,
      color: "text-amber-500",
    },
    { label: "Concluídos", value: stats.completed, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o andamento dos seus projetos
          </p>
        </div>
        <CompanyFilter
          projects={projects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>

      <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-border/60 py-4">
        {statItems.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.label}
            </dt>
            <dd className={`text-2xl font-semibold tabular-nums ${s.color}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <KanbanBoard
        projects={clientProjects}
        onProjectClick={handleProjectClick}
        canDrag={false}
        visibleColumns={visibleColumns}
      />
    </div>
  );
}
