"use client";

import { useProjects } from "@/shared/context/projects-context";
import { STATUS_CONFIG } from "@/shared/types";
import type { ProjectStatus } from "@/shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Progress } from "@/src/shared/components/ui/progress";
import { useCountUp } from "@/shared/hooks/use-count-up";
import { AreaSummaryChart } from "@/shared/components/area-summary-chart";
import {
  FolderKanban,
  Clock,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Users,
} from "lucide-react";

const STATUS_ORDER: ProjectStatus[] = [
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
];

const STATUS_LABELS: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  todo: "Arquitetura",
  "in-progress": "Em Andamento",
  review: "Revisão",
  completed: "Concluído",
};

const STATUS_PROGRESS_COLOR: Record<ProjectStatus, string> = {
  backlog: "bg-muted-foreground/40",
  todo: "bg-blue-500",
  "in-progress": "bg-green-500",
  review: "bg-yellow-500",
  completed: "bg-emerald-500",
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  delay = 0,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ElementType;
  color: string;
  delay?: number;
}) {
  const animated = useCountUp(value, 900);

  return (
    <Card
      className="bg-card overflow-hidden animate-fade-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      <CardContent className="flex items-center justify-between p-4 gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${color}`}>{animated}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </div>
        <div className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-current/10`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { projects, requests } = useProjects();

  const stats = {
    total: projects.length,
    inProgress: projects.filter((p) => p.status === "in-progress").length,
    review: projects.filter((p) => p.status === "review").length,
    completed: projects.filter((p) => p.status === "completed").length,
    pendingRequests: requests.length,
    highPriority: projects.filter((p) => p.priority === "high" || p.priority === "urgent").length,
  };

  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const totalMax = Math.max(stats.total, 1);

  return (
    <div className="space-y-5">
      <div className="animate-fade-up" style={{ animationFillMode: "both" }}>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral dos projetos e métricas</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total de Projetos"
          value={stats.total}
          sub={`${stats.pendingRequests} pendentes`}
          icon={FolderKanban}
          color="text-foreground"
          delay={60}
        />
        <StatCard
          label="Em Desenvolvimento"
          value={stats.inProgress}
          sub={`${stats.review} em revisão`}
          icon={Clock}
          color="text-amber-500"
          delay={120}
        />
        <StatCard
          label="Concluídos"
          value={stats.completed}
          sub={`${completionRate}% de conclusão`}
          icon={CheckCircle}
          color="text-emerald-500"
          delay={180}
        />
        <StatCard
          label="Alta Prioridade"
          value={stats.highPriority}
          sub="requerem atenção"
          icon={AlertCircle}
          color="text-destructive"
          delay={240}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          className="bg-card animate-fade-up"
          style={{ animationDelay: "300ms", animationFillMode: "both" }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Progresso por Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {STATUS_ORDER.map((status) => {
              const count = projects.filter((p) => p.status === status).length;
              const pct = (count / totalMax) * 100;
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {STATUS_LABELS[status]}
                  </span>
                  <div className="relative flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${STATUS_PROGRESS_COLOR[status]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card
          className="bg-card animate-fade-up"
          style={{ animationDelay: "360ms", animationFillMode: "both" }}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {projects.slice(0, 5).map((project, i) => {
                const config = STATUS_CONFIG[project.status] ?? {
                  label: project.status,
                  color: "bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 transition-colors hover:bg-secondary/70 animate-fade-up"
                    style={{ animationDelay: `${400 + i * 50}ms`, animationFillMode: "both" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.projectType}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                );
              })}

              {projects.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6">
                  Nenhum projeto cadastrado
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AreaSummaryChart />
    </div>
  );
}
