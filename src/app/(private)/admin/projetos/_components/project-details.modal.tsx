"use client";

import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { Calendar, Clock, FileText } from "lucide-react";
import { formatDate } from "@/shared/utils";

interface ProjectDetailsModalData {
  project: Project;
}

export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  if (!data) return null;

  const { project } = data;
  const statusConfig = STATUS_CONFIG[project.status];
  const priorityConfig = PRIORITY_CONFIG[project.priority];

  return (
    <div className="overflow-hidden rounded-[8px] bg-white">
      <div className="flex items-center justify-between bg-primary px-5 py-5">
        <p className="text-sm font-bold text-white">Detalhes do projeto</p>
        <button
          type="button"
          className="rounded-md p-1 text-white transition-colors hover:bg-white/10"
          aria-label="Fechar modal"
          onClick={onClose}
        >
          <span className="sr-only">Fechar</span>
        </button>
      </div>

      <div className="px-5 py-7 text-center">
        <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-full bg-[#F8FAFC] shadow-sm">
          <FileText className="size-10 text-[#232F63]" />
        </div>

        <p className="mb-1 text-lg font-bold text-[#0F172A]">
          {project.title}
        </p>
        <p className="mx-auto mb-4 max-w-xl text-sm leading-relaxed text-[#6B7280]">
          {project.description || "Nenhuma descrição detalhada foi informada."}
        </p>

        <div className="mx-auto mt-4 flex max-w-md flex-col gap-2 text-left text-sm text-[#4B5563]">
          <div className="flex items-center justify-between">
            <span className="font-medium">Status</span>
            <span className={`rounded-full px-3 py-0.5 text-xs font-semibold text-white ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">Prioridade</span>
            <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${priorityConfig.color}`}>
              {priorityConfig.label}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="h-4 w-4 text-[#6B7280]" />
              Criado em
            </span>
            <span>{formatDate(project.createdAt)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">Tipo</span>
            <span className="text-xs font-medium text-[#111827]">
              {project.projectType}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">ID do projeto</span>
            <span className="text-xs font-mono text-[#111827]">
              {project.id}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">Cliente (ID)</span>
            <span className="text-xs font-mono text-[#111827]">
              {project.clientId}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">Empresa</span>
            <span className="text-xs font-medium text-[#111827]">
              {project.companyName ?? "Sem empresa definida"}
            </span>
          </div>

          {project.developerId && (
            <div className="flex items-center justify-between">
              <span className="font-medium">Desenvolvedor (ID)</span>
              <span className="text-xs font-mono text-[#111827]">
                {project.developerId}
              </span>
            </div>
          )}

          {project.estimatedBudget && (
            <div className="flex items-center justify-between">
              <span className="font-medium">Orçamento</span>
              <span className="text-xs font-medium text-[#111827]">
                R$ {project.estimatedBudget.toLocaleString("pt-BR")}
              </span>
            </div>
          )}

          {project.estimatedDeadline && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-medium">
                <Clock className="h-4 w-4 text-[#6B7280]" />
                Prazo estimado
              </span>
              <span>{formatDate(project.estimatedDeadline)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-medium">Última atualização</span>
            <span className="text-xs font-medium text-[#111827]">
              {formatDate(project.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 border-t p-4 justify-between">
        <Button
          variant="outline"
          className="cursor-pointer"
          type="button"
          onClick={onClose}
        >
          Fechar
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => onClose()}
          >
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button
            variant="default"
            className="cursor-pointer"
            onClick={() => onClose()}
          >
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

