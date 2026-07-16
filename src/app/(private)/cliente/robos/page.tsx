"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { formatCurrency, formatDate } from "@/shared/utils";
import { ROBOT_OPERATIONAL_STATUS_CONFIG } from "@/shared/types";
import type { Project } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useModal } from "@/shared/context/modal-context";
import { ReportIncidentModal } from "./_components/report-incident.modal";

export default function MeusRobosPage() {
  const { projects } = useProjects();
  const { openModal } = useModal();
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const doneProjects = projects.filter((p) => p.status === "completed");
  const visibleProjects = filterProjectsByCompany(doneProjects, companyFilter);
  const distinctCompanies = new Set(
    doneProjects.map((p) => p.companyId).filter(Boolean)
  );
  const showCompanyColumn = distinctCompanies.size > 1;

  function handleReportIncident(project: Project) {
    openModal(
      `report-incident-${project.id}`,
      ReportIncidentModal,
      { projectId: project.id, projectTitle: maskFreeText(project.title) ?? project.title },
      { size: "md", position: "center" }
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Robôs</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os robôs já em operação e a economia acumulada
          </p>
        </div>
        <CompanyFilter
          projects={doneProjects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>

      {visibleProjects.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum robô em operação ainda — assim que um projeto for concluído, ele
          aparece aqui.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Robô</TableHead>
              {showCompanyColumn && <TableHead>Empresa</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Economia acumulada</TableHead>
              <TableHead>Atualizado em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProjects.map((project) => {
              const statusConfig = project.operationalStatus
                ? ROBOT_OPERATIONAL_STATUS_CONFIG[project.operationalStatus]
                : null;
              return (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{maskFreeText(project.title)}</TableCell>
                  {showCompanyColumn && (
                    <TableCell>
                      {maskCompanyName(project.companyId, project.companyName) ?? "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className={statusConfig?.color}>
                      {statusConfig?.label ?? "Sem status"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {project.accumulatedSavingBRL != null
                      ? formatCurrency(project.accumulatedSavingBRL)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {project.operationalStatusUpdatedAt
                      ? formatDate(project.operationalStatusUpdatedAt)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReportIncident(project)}
                    >
                      Reportar problema
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
