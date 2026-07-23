import {
  escapeXml,
  buildProjetoCompletoXmlFields,
  type ProjetoCompletoXmlData,
} from "./build-projeto-completo-xml";

export interface EmpresaAgregadoAreaGroup {
  name: string;
  projects: ProjetoCompletoXmlData[];
}

// Gera um XML com todos os projetos de uma empresa, agrupados por área
// (grupos já vêm ordenados por quem chama esta função — ver
// /api/empresas/[id]/xml-agregado/route.ts, que ordena por ProjectArea.order
// e joga projetos sem área para um grupo "Sem área" no final).
// Reaproveita exatamente as mesmas tags por projeto do export individual
// (buildProjetoCompletoXmlFields), só aninhadas dentro de <area>/<projeto>.
export function buildEmpresaAgregadoXml(
  company: { id: string; name: string },
  areaGroups: EmpresaAgregadoAreaGroup[],
  urgencyLevels: { value: string; label: string }[]
): string {
  const totalProjetos = areaGroups.reduce((sum, group) => sum + group.projects.length, 0);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<dadosAgregadosEmpresa>");
  lines.push(`  <empresaId>${escapeXml(company.id)}</empresaId>`);
  lines.push(`  <empresaNome>${escapeXml(company.name)}</empresaNome>`);
  lines.push(`  <totalProjetos>${totalProjetos}</totalProjetos>`);
  lines.push("  <areas>");
  for (const group of areaGroups) {
    lines.push("    <area>");
    lines.push(`      <areaNome>${escapeXml(group.name)}</areaNome>`);
    lines.push(`      <totalProjetosNaArea>${group.projects.length}</totalProjetosNaArea>`);
    lines.push("      <projetos>");
    for (const project of group.projects) {
      lines.push("        <projeto>");
      for (const fieldLine of buildProjetoCompletoXmlFields(project, urgencyLevels)) {
        lines.push(`  ${fieldLine}`);
      }
      lines.push("        </projeto>");
    }
    lines.push("      </projetos>");
    lines.push("    </area>");
  }
  lines.push("  </areas>");
  lines.push("</dadosAgregadosEmpresa>");
  return lines.join("\n");
}
