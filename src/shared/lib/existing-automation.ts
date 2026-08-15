/**
 * Regras da Ficha de ambiente — a página técnica do slide de automações que
 * já rodam em produção. Módulo puro de propósito: sem React, sem Prisma, sem
 * pptxgenjs. As duas superfícies que desenham a ficha (o componente React em
 * src/shared/components/slide/environment-sheet-page.tsx e o slide .pptx em
 * src/server/deck/build-existing-automations-deck.ts) mapeiam sua própria
 * fonte para `EnvironmentSheetSource` e consomem o mesmo resultado — é isso
 * que impede as duas de divergirem na regra de omissão.
 *
 * Ver docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md
 */

/**
 * Uma automação "existente" é a que já roda: ou o levantamento disse que há
 * aplicação hoje, ou o projeto foi entregue. Mesmo critério que o
 * `where` de buildExistingAutomationsDeck usa — daí morar aqui e não estar
 * duplicado nos dois lugares.
 */
export function isExistingAutomation(project: {
  hasCurrentApplication?: string | null;
  status?: string | null;
}): boolean {
  return project.hasCurrentApplication === "sim" || project.status === "DONE";
}
