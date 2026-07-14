# Filtro de população nas queries de oportunidade (Design)

## Contexto

O motor de scoring/priorização, o cronograma de ondas de implementação e a curva de payback (construídos no blueprint "Diagnóstico de Robotização") foram desenhados assumindo que **todo** `Project` de uma empresa é uma oportunidade de automação ainda não construída, disputando prioridade/onda/payback junto com as demais. Isso já não é verdade: o Pipeline passa a rastrear também automações **já existentes** — seja porque o projeto representa uma automação que o cliente já tinha antes de pedir o Pipeline (`hasCurrentApplication === "sim"`, hoje exibido como badge "Melhoria" em `project-card.tsx:111`), seja porque um projeto "Novo" chegou ao fim do funil e está `DONE` (é exatamente o que a feature "Meus Robôs", já implementada, rastreia pós-entrega).

Hoje, duas queries centrais em `src/server/trpc/routers/project.router.ts` buscam projetos **sem nenhum filtro de status ou de origem**:

- `getPrioritizedRanking` (`project.router.ts:704`, query em `project.router.ts:713`) — alimenta a aba "Ranking" (score qualitativo/econômico/combinado), a aba "Cronograma" (`computeWaveSchedule`) e a aba "Payback" da tela `/admin/empresas/[id]/priorizacao`, além de 5 slides do deck de diagnóstico (`build-diagnostic-deck.ts:212-217`: ranking economia/qualitativo/combinado, cronograma, payback, composição do payback).
- `getAreaSummary` (`project.router.ts:663`, query em `project.router.ts:666`) — alimenta o gráfico `AreaSummaryChart` no dashboard admin (`/admin`, `admin/page.tsx:218`) e o slide de resumo por área do deck (`build-diagnostic-deck.ts:211`).

Isso significa que, hoje, uma automação já existente/entregue conta como se fosse uma oportunidade nova disputando priorização, entra no cronograma de ondas como se precisasse ser desenvolvida, e é somada na curva de payback como se tivesse um custo de desenvolvimento a recuperar — todos conceitos que só fazem sentido para uma oportunidade ainda não construída.

## Requisitos confirmados com o usuário

1. **Definição de "oportunidade ativa"** (a população que continua nessas duas queries): `hasCurrentApplication !== "sim"` **E** `status` fora de `DONE`/`CANCELLED`.
   - `hasCurrentApplication` nulo ou `"nao"` continua contando como oportunidade — o padrão implícito hoje já trata "sem essa informação preenchida" como oportunidade nova; só o valor explícito `"sim"` ("Melhoria"/já existe) exclui.
   - `CANCELLED` nunca fez sentido entrar em ranking/cronograma/payback — bug latente incluído no mesmo fix, sem relação direta com "existente vs. novo".
2. **Onde aplicar**: só nas duas queries citadas acima (`getPrioritizedRanking`, `getAreaSummary`). Nenhuma tela nova, nenhum endpoint novo, nenhuma UI nova neste sub-projeto — é puramente a correção do filtro nas queries já existentes.
3. **Fora de escopo**: as telas/gráficos/export dedicados a "automações existentes" (o que sai desse filtro) ficam para dois sub-projetos seguintes, com seus próprios spec → plano → implementação. Este sub-projeto não cria nenhuma query nem tela para a população excluída, só a remove das queries de oportunidade.

## Mudança

### `getPrioritizedRanking` (`project.router.ts:713`)

No `where` do `ctx.db.project.findMany`, hoje:

```ts
where: { companyId: input.companyId },
```

Passa a:

```ts
where: {
  companyId: input.companyId,
  hasCurrentApplication: { not: "sim" },
  status: { notIn: ["DONE", "CANCELLED"] },
},
```

Isso automaticamente escopa também o `select` já retornado (nenhum campo novo é necessário) — o efeito é só reduzir o conjunto de linhas. Toda a lógica downstream (`computeQualitativeScore`, `computeEconomiaScore`, `computeCombinedScore`, `computeWaveSchedule`, `computePaybackCurve`) já opera sobre o array retornado, sem mudança de assinatura.

### `getAreaSummary` (`project.router.ts:666`)

No `where` do `ctx.db.project.groupBy`, hoje:

```ts
where: {
  areaId: { not: null },
  ...(input.companyId ? { companyId: input.companyId } : {}),
},
```

Passa a:

```ts
where: {
  areaId: { not: null },
  hasCurrentApplication: { not: "sim" },
  status: { notIn: ["DONE", "CANCELLED"] },
  ...(input.companyId ? { companyId: input.companyId } : {}),
},
```

`getAreaSummary` já é chamado tanto com `companyId` (deck) quanto sem (dashboard admin global, `AreaSummaryChart` sem prop) — o novo filtro se aplica igualmente aos dois casos, já que não depende de `companyId` estar presente.

## Efeitos observáveis (esperados, não são bugs novos)

- A tela `/admin/empresas/[id]/priorizacao` deixa de listar projetos "Melhoria" ou `DONE`/`CANCELLED` no ranking — eles simplesmente não aparecem mais nas 3 abas (Ranking, Cronograma, Payback). Nenhuma mudança de texto/empty-state é necessária: as mensagens já existentes ("Nenhum projeto encontrado para esta empresa.", "Nenhum robô nas ondas 1/2 ainda.") continuam corretas para o caso de uma empresa só ter projetos fora dessa população.
- O `Select` de atribuição de onda (`handleWaveChange`, `priorizacao/page.tsx:326`) só continua editável para os projetos que aparecem na tabela — nenhuma mudança de código ali, o efeito é automático por consequência de a linha não existir mais no `ranking`.
- O dashboard admin (`/admin`) e o slide de resumo por área do deck passam a somar `estimatedAnnualSavingBRL`/`currentAnnualHours` só das oportunidades ativas — os totais por área ficam menores (mais corretos) se a empresa já tiver automações existentes/entregues registradas.
- O deck de diagnóstico (`buildDiagnosticDeck`) automaticamente reflete o mesmo filtro em todos os 6 slides que dependem dessas duas queries, sem precisar de nenhuma mudança em `build-diagnostic-deck.ts` — ele só consome o retorno já filtrado.

## Fora de escopo

- Qualquer tela, gráfico ou export novo para a população excluída (automações existentes) — sub-projetos 2 e 3, specs separadas.
- Mudar `project.list`/`project.byId` (usadas por Kanban, "Meus Projetos", "Meus Robôs" etc.) — este filtro é específico das duas queries de agregação/ranking de oportunidade, não do CRUD geral de projetos.
- Adicionar um campo/enum novo para marcar "existente" — a distinção já existe via `hasCurrentApplication` + `status`, conforme confirmado com o usuário.
