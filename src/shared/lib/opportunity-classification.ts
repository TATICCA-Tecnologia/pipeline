// Um projeto conta como "melhoria" (automação de algo que já roda hoje) quando
// o cliente já indicou isso na solicitação OU quando o robô já foi entregue —
// mesma regra usada em getAreaSummary/getExistingAutomationsAreaSummary
// (server/trpc/routers/project.router.ts) pra separar oportunidades de
// automações existentes. Centralizado aqui pra o badge do card do Kanban e o
// filtro da tela de Projetos usarem sempre a mesma classificação.
export function isExistingAutomation(project: {
  hasCurrentApplication?: string;
  status: string;
}): boolean {
  return project.hasCurrentApplication === "sim" || project.status === "completed";
}
