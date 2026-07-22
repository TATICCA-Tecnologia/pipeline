# Aba "Resumo Executivo" (One Pager) na tela de Priorização (Design)

## Contexto

A aba "Resumo por Área" (adicionada em 2026-07-15) já mostra oportunidades e automações existentes agrupadas por área, com gráfico de saving e de quantidade lado a lado (2026-07-22). Não existe hoje, porém, uma visão única de topo — algo que caiba numa tela só e dê o panorama geral da empresa: quantas oportunidades, quantas automações já entregues, como elas se distribuem por área e por ferramenta principal usada. Essa visão serve pra "vender o escopo" rapidamente (ex: numa call com o cliente), sem entrar em números financeiros ou prazos — que já têm suas próprias abas (Payback, Cronograma).

Layout e estilo dos gráficos foram validados com o usuário via mockup (barra única por área/ferramenta, segmento verde = pipeline, azul = existentes, empilhados, com o número centralizado dentro de cada segmento).

## Requisitos confirmados com o usuário

1. **Escopo**: nova aba dentro de `/admin/empresas/[id]/priorizacao`, adicionada como a **primeira aba** da `TabsList` (visão de entrada da empresa, antes de Ranking).
2. **Conteúdo**: só os 4 blocos pedidos — total de oportunidades, total de automações existentes, resumo por área, resumo por ferramenta. Nada de saving, payback, prazo ou complexidade.
3. **Resumo por área/ferramenta**: pipeline e existentes **separados** (não somados) — uma barra por categoria, com pipeline e existentes como dois segmentos empilhados na mesma barra, cada um com o número centralizado.
4. **Ordenação**: cada gráfico ordenado do maior pro menor pelo total (pipeline + existentes) da categoria — mesma regra "sempre desc" já aplicada nos outros gráficos de resumo.
5. **Limite de linhas**: top 8 categorias por total, o restante agregado numa linha final fixa "Outras" (sempre por último, independente do valor).
6. **Gaps de dado**: mesmo padrão de aviso que já existe na aba Resumo por Área, agora cobrindo também "sem ferramenta definida" (pipeline e existentes), além de "sem área definida".

## Backend

Dois procedures novos em `project.router.ts`, espelhando exatamente `getAreaSummary`/`getExistingAutomationsAreaSummary` mas agrupando por `mainToolId` em vez de `areaId`:

```typescript
getToolSummary: adminProcedure
  .input(z.object({ companyId: z.string().optional() }))
  .query(async ({ ctx, input }) => {
    const grouped = await ctx.db.project.groupBy({
      by: ["mainToolId"],
      _count: true,
      where: {
        mainToolId: { not: null },
        hasCurrentApplication: { not: "sim" },
        status: { notIn: ["DONE", "CANCELLED"] },
        ...(input.companyId ? { companyId: input.companyId } : {}),
      },
    });
    // resolve nomes via ctx.db.mainTool.findMany({ where: { id: { in: ... } } })
    // retorna [{ toolId, toolName, projectCount }], sort desc por projectCount
  }),

getExistingAutomationsToolSummary: adminProcedure
  .input(z.object({ companyId: z.string().optional() }))
  .query(async ({ ctx, input }) => {
    // mesmo groupBy por mainToolId, filtro invertido:
    // OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }]
  }),
```

`getAreaSummaryGaps` ganha dois campos novos, calculados com o mesmo padrão dos dois já existentes (`pipelineWithoutArea`/`deliveredWithoutArea`), só trocando `areaId: null` por `mainToolId: null`:

```typescript
getAreaSummaryGaps: adminProcedure
  .input(z.object({ companyId: z.string() }))
  .query(async ({ ctx, input }) => {
    const [pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool] =
      await Promise.all([
        /* ...os dois já existentes... */
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            mainToolId: null,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
        }),
        ctx.db.project.count({
          where: {
            companyId: input.companyId,
            mainToolId: null,
            OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          },
        }),
      ]);
    return { pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool };
  }),
```

Mudança é aditiva — a aba "Resumo por Área" existente continua lendo só os dois campos que já usava, sem quebrar.

**Sem endpoint novo para os totais gerais.** `totalOpportunities` = soma de `projectCount` em `getAreaSummary` + `gaps.pipelineWithoutArea` (cobre também quem não tem área). `totalExistingAutomations` = soma de `projectCount` em `getExistingAutomationsAreaSummary` + `gaps.deliveredWithoutArea`. Calculado no client, sem round-trip extra.

## Frontend

**Nova aba**, primeira da lista:
```tsx
<TabsList>
  <TabsTrigger value="resumo-executivo">Resumo Executivo</TabsTrigger>
  <TabsTrigger value="ranking">Ranking</TabsTrigger>
  ...
</TabsList>
```
`defaultValue` da `Tabs` passa de `"ranking"` para `"resumo-executivo"`.

**Componente novo** `ExecutiveOnePager` (`src/shared/components/executive-one-pager.tsx`), recebe `companyId` e busca:
- `project.getAreaSummary`, `project.getExistingAutomationsAreaSummary`
- `project.getToolSummary`, `project.getExistingAutomationsToolSummary`
- `project.getAreaSummaryGaps`

Lógica client-side (mesma função helper reaproveitada pra área e pra ferramenta):
1. Merge por `id` da categoria (`areaId`/`toolId`, não pelo nome — evita colisão acidental): `{ id, name, pipelineCount, existingCount }`.
2. Sort desc por `pipelineCount + existingCount`.
3. Top 8 linhas mantidas como estão; o resto colapsado numa linha `{ name: "Outras", pipelineCount: soma, existingCount: soma }` **anexada por último**, mesmo que o total dela supere alguma das top 8 (é sempre a última linha visualmente).

Render:
1. Duas stat cards no topo (`totalOpportunities`, `totalExistingAutomations`), mesmo estilo visual dos números grandes já usado em outros cards do admin.
2. Grid `lg:grid-cols-2`: card "Resumo por área" e card "Resumo por ferramenta". Cada um com um `BarChart` (recharts) `layout="vertical"`, uma linha por categoria (`YAxis dataKey="name"`), dois `<Bar>` com `stackId="a"` (`pipelineCount` verde `--color-chart-1`, `existingCount` azul `--color-chart-2`), cada `<Bar>` com `<LabelList position="center" />` mostrando o número (omite o label quando o valor for 0, pra não sobrepor texto num segmento de largura zero).
3. Rodapé com o aviso de gaps, condicional por contador > 0, estendendo o texto atual da aba Resumo por Área para também citar ferramenta:
   > "X projeto(s) em andamento e Y automação(ões) entregue(s) não têm área definida; A projeto(s) em andamento e B automação(ões) entregue(s) não têm ferramenta definida — não aparecem nos resumos acima."

Sem legenda separada — a cor já é explicada pela ordem dos dois `<Bar>` num tooltip que mostra "Pipeline: N" / "Existentes: N" ao passar o mouse (mesmo padrão de tooltip customizado dos outros gráficos de resumo).

## Fora de escopo

- Qualquer valor em R$, prazo, payback ou complexidade — confirmado explicitamente com o usuário como fora do escopo deste One Pager.
- Exportação em PDF/PPTX do One Pager — não foi pedido; os decks existentes (`/api/empresas/[id]/deck`) continuam sendo o caminho de exportação.
- Nova taxonomia ou edição de área/ferramenta a partir dessa tela — é uma visão só de leitura.
