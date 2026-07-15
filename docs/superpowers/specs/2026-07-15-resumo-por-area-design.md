# Aba "Resumo por Área" na tela de Priorização (Design)

## Contexto

Hoje a única visão de "todas as automações rankeadas uma por uma" de uma empresa é a aba Ranking de `/admin/empresas/[id]/priorizacao`, que lista projeto por projeto. Não existe uma visão consolidada por área de negócio dentro dessa tela.

Já existem dois componentes prontos que fazem exatamente esse tipo de consolidação, mas nunca foram usados juntos nem dentro da tela de Priorização:
- `AreaSummaryChart` (`src/shared/components/area-summary-chart.tsx`) — consome `project.getAreaSummary`, soma projetos em pipeline (`hasCurrentApplication !== "sim"`, `status not in [DONE, CANCELLED]`) por área: contagem, saving anual estimado, horas/ano. Hoje só aparece no dashboard admin global (`/admin`), sem filtro de empresa.
- `ExistingAutomationsAreaSummaryChart` (`src/shared/components/existing-automations-area-summary-chart.tsx`) — consome `project.getExistingAutomationsAreaSummary`, soma automações já entregues (`hasCurrentApplication === "sim"` ou `status === "DONE"`) por área: contagem, economia acumulada real. Hoje só aparece em `/admin/empresas/[id]/automacoes-existentes`.

Ambos os procedures já aceitam `companyId` opcional — quando passado, filtram pra uma empresa só. Isso já é exatamente o que a tela de Priorização precisa, já que ela é sempre no contexto de uma empresa (`companyId` vem do parâmetro de rota).

**Nota sobre dado incompleto**: `Project.areaId` é uma FK nullable adicionada em 2026-07-07, e projetos criados antes disso nunca foram migrados — ficam com `areaId = null`. Os dois procedures acima filtram `areaId: { not: null }`, então projetos sem área ficam **silenciosamente excluídos** dos totais. Isso já é um comportamento pré-existente dos dois componentes, não introduzido por esta feature — mas na nova aba vale deixar isso visível pro usuário, pra não parecer que os números batem com o total de projetos da empresa quando na verdade não batem.

## Requisitos confirmados com o usuário

1. **Escopo**: por empresa (não uma tela global nova) — vira uma 4ª aba dentro de `/admin/empresas/[id]/priorizacao`, ao lado de Ranking, Cronograma e Payback.
2. **Métricas**: as duas visões lado a lado (empilhadas) — pipeline (saving estimado, quantos projetos) e entregue (saving acumulado real, quantas automações).
3. **Nota de dado incompleto**: mostrar quantos projetos da empresa não têm área definida (excluídos dos dois resumos acima), separando pipeline de entregue já que são conjuntos de projetos diferentes.

## Backend

**Nenhuma mudança nos dois procedures existentes** (`getAreaSummary`, `getExistingAutomationsAreaSummary`) — continuam exatamente como estão, só passam a ser chamados com o `companyId` da rota a partir da nova aba.

Um novo procedure pequeno, `project.getAreaSummaryGaps`, calcula a contagem de "sem área" pros dois conjuntos (pipeline e entregue) de uma empresa:

```typescript
getAreaSummaryGaps: adminProcedure
  .input(z.object({ companyId: z.string() }))
  .query(async ({ ctx, input }) => {
    const [pipelineWithoutArea, deliveredWithoutArea] = await Promise.all([
      ctx.db.project.count({
        where: {
          companyId: input.companyId,
          areaId: null,
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      }),
      ctx.db.project.count({
        where: {
          companyId: input.companyId,
          areaId: null,
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
        },
      }),
    ]);
    return { pipelineWithoutArea, deliveredWithoutArea };
  }),
```

Mesmos filtros exatos de `getPrioritizedRanking`/`getExistingAutomationsRanking`, só invertendo `areaId: { not: null }` pra `areaId: null`. `adminProcedure` pelo mesmo motivo de segurança dos outros dois (dado sensível de saving/contagem).

## Frontend

**Nova aba** em `/admin/empresas/[id]/priorizacao/page.tsx`:
```tsx
<TabsTrigger value="resumo-area">Resumo por Área</TabsTrigger>
```
adicionada à `TabsList` existente (linha com `ranking`/`cronograma`/`payback`).

**Conteúdo da aba** (`<TabsContent value="resumo-area">`):
1. `<AreaSummaryChart companyId={companyId} />`
2. `<ExistingAutomationsAreaSummaryChart companyId={companyId} />`
3. Um texto pequeno abaixo, alimentado por `project.getAreaSummaryGaps.useQuery({ companyId })`, só renderizado se algum dos dois contadores for > 0:
   > "X projeto(s) em andamento e Y automação(ões) entregue(s) desta empresa não têm área definida e não aparecem nos resumos acima."

Ambos os componentes já são responsivos e self-contained (fazem sua própria query, tratam loading/empty state) — a aba nova só precisa importá-los e empilhar, sem lógica adicional.

## Fora de escopo

- Tela global "Resumo por Área" (todas as empresas) — o usuário confirmou que quer só a versão por empresa, dentro da Priorização.
- Migrar/popular `areaId` retroativamente nos projetos antigos — fora de escopo, é um problema de dado histórico, não desta feature.
- Métricas novas além de contagem/saving (ex: score qualitativo médio por área, distribuição de complexidade por área, breakdown por onda) — os dois componentes existentes já cobrem "savings" e "número de processos", que foi o pedido explícito; extras ficam pra um pedido futuro se fizer falta.
