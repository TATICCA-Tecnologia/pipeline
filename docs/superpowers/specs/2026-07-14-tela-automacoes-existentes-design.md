# Tela "Automações Existentes" (Design)

## Contexto

O sub-projeto anterior (`docs/superpowers/specs/2026-07-14-filtro-populacao-oportunidades-design.md`, já implementado e em produção) escopou `getPrioritizedRanking` e `getAreaSummary` para excluir automações já existentes/entregues (`hasCurrentApplication === "sim"` OU `status === "DONE"`) do funil de desenvolvimento (ranking, cronograma, payback). Isso corrigiu os números, mas essa população excluída não tem hoje **nenhum lugar** para ser vista de forma agregada — só existe, individualmente, na tela "Meus Robôs" do cliente (`/cliente/robos`) e no bloco de edição do admin em "Detalhes do projeto".

Este sub-projeto adiciona essa visão agregada do lado admin: uma tela por empresa, "Automações Existentes", espelhando a estrutura visual da aba "Ranking" da tela de Priorização (`/admin/empresas/[id]/priorizacao`) — resumo por área + ranking ordenável — só que para a população de automações existentes, usando **economia acumulada real** (`Project.accumulatedSavingBRL`, já existente desde a feature "Meus Robôs") em vez de economia estimada.

## Requisitos confirmados com o usuário

1. **Critério de ranking**: duas abas de ordenação — economia acumulada real e score qualitativo (as mesmas 5 avaliações 1-5 já usadas em Priorização). Sem aba "combinado": o score combinado hoje mistura complexidade técnica ("difícil de construir"), que não se aplica a algo já entregue.
2. **Escopo da tela**: por empresa, nova rota ao lado de Priorização (`/admin/empresas/[id]/priorizacao`), não uma visão global.
3. **Detalhe por automação**: reaproveita o "Slide Executivo" já existente (`ProjectExecutiveSlideModal` / `src/shared/components/project-executive-slide.tsx`) — o mesmo componente que já mostra tabela quantitativa + radar de avaliação qualitativa para qualquer projeto, hoje acessível a partir de "Detalhes do projeto". Nenhum componente de radar/tabela novo é necessário.
4. **Sem cronograma, sem payback** — não se aplicam a algo que já existe.

## Backend (`src/server/trpc/routers/project.router.ts`)

Duas queries novas, inseridas logo após `getPrioritizedRanking` (que hoje termina na linha 798, imediatamente antes do `});` de fechamento do `projectRouter` na linha 799) — mesmo padrão de `adminProcedure` (dados sensíveis, nunca expostos ao cliente).

### `getExistingAutomationsRanking`

Espelha `getPrioritizedRanking` (`project.router.ts:706-798`), com estas diferenças:

- **Input**: `{ companyId: z.string(), sortBy: z.enum(["economia", "qualitativo"]) }` — sem `"combinado"`.
- **Where**: `{ companyId: input.companyId, OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }] }` — o inverso exato do filtro do sub-projeto 1.
- **Select**: troca `complexity`/`estimatedAnnualSavingBRL`/`implementationWave`/`waveOrder`/`implementationEffortDays` (não fazem sentido aqui) por `accumulatedSavingBRL`, `operationalStatus`, `operationalStatusUpdatedAt`. Mantém `id`, `title`, `areaId`, `area.name` e os 5 campos de rating.
- **Cálculo**: reaproveita `computeQualitativeScore` (`@/shared/lib/scoring`) sem nenhuma mudança, com os mesmos pesos de `SystemSettings` já buscados em `getPrioritizedRanking`. Reaproveita `computeEconomiaScore` (também sem mudança — a função já é genérica, recebe `(valor: number | null, maxDoConjunto: number)`, não está amarrada a `estimatedAnnualSavingBRL` no nome do campo, só no nome do parâmetro) passando `p.accumulatedSavingBRL` e o maior `accumulatedSavingBRL` do conjunto retornado. **Não** chama `computeComplexityScore` nem `computeCombinedScore`.
- **Retorno por linha**: `{ id, title, areaName, qualitativeScorePercent, accumulatedSavingBRL, economiaScore, operationalStatus }`.
- **Ordenação**: por `economiaScore` ou `qualitativeScorePercent`, conforme `sortBy`.

### `getExistingAutomationsAreaSummary`

Espelha `getAreaSummary` (`project.router.ts:663-698`), com estas diferenças:

- **Where**: troca a ausência de filtro de status/origem pelo mesmo `OR` acima, mantendo `areaId: { not: null }` e o `companyId` opcional (mesma condicional já existente: `...(input.companyId ? { companyId: input.companyId } : {})`).
- **`_sum`**: `{ accumulatedSavingBRL: true }` em vez de `{ estimatedAnnualSavingBRL: true, currentAnnualHours: true }` — `currentAnnualHours` (horas gastas no processo manual antes da automação) não é uma métrica relevante para o resumo de automações já entregues; a métrica que importa aqui é quanto já foi economizado de fato.
- **Retorno por área**: `{ areaId, areaName, projectCount, totalAccumulatedSavingBRL }`.

## Frontend

### `ExistingAutomationsAreaSummaryChart` (novo componente)

`src/shared/components/existing-automations-area-summary-chart.tsx` — cópia estrutural de `src/shared/components/area-summary-chart.tsx` (mesmo `BarChart`/`Card`/tabela, mesmo padrão de tooltip), trocando a query (`trpc.project.getExistingAutomationsAreaSummary`), o campo somado (`totalAccumulatedSavingBRL`) e o rótulo ("Economia acumulada" em vez de "Economia estimada"). Sem coluna de horas (o dado não existe mais no retorno da query).

### Nova página: `/admin/empresas/[id]/automacoes-existentes`

`src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx` — estrutura idêntica à aba "Ranking" de `priorizacao/page.tsx` (`src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx:383-589`), sem as abas "Cronograma"/"Payback" (não existem nesta tela — não há abas aqui, só a página inteira já é o equivalente da aba Ranking):

- Cabeçalho com nome da empresa (reaproveita o padrão de busca de `company` via `trpc.company.listAll`).
- `ExistingAutomationsAreaSummaryChart` no topo, com `companyId`.
- Dois botões de ordenação (Economia / Qualitativo), reaproveitando `trpc.project.getExistingAutomationsRanking`.
- Gráfico `ComposedChart` (barra de economia acumulada + linha de score ativo) — mesmo padrão visual da aba Ranking de Priorização, com `estimatedAnnualSavingBRL` trocado por `accumulatedSavingBRL` no eixo de barras.
- Tabela: colunas Título, Área, Qualitativo %, Status operacional (badge, reaproveita `ROBOT_OPERATIONAL_STATUS_CONFIG` de `@/shared/types`, mesmo mapeamento usado em `/cliente/robos` e no bloco de edição do admin), Economia acumulada, e uma coluna de ação "Ver detalhes".
- "Ver detalhes" abre `ProjectExecutiveSlideModal` via `useModal()`, passando `{ id: row.id, title: row.title } as unknown as Project` como dado inicial — o modal já busca os dados completos via `project.byId` internamente (mesmo padrão usado em `ProjectDetailsModal`, que também só precisa do `id` para funcionar, o resto é cache/placeholder enquanto carrega).

### Ponto de entrada: `src/app/(private)/admin/empresas/page.tsx`

Novo botão de ícone na linha de ações de cada empresa (`admin/empresas/page.tsx:233-257`, ao lado dos botões já existentes "Priorização" e "Entrevistas"), ícone `Bot` (mesmo ícone já usado no item de sidebar "Meus Robôs" do cliente, mantendo a mesma linguagem visual para o conceito de automação), `title="Automações Existentes"`, link para `/admin/empresas/${company.id}/automacoes-existentes`.

## Fora de escopo

- Export `.pptx` para essa população — sub-projeto 3, spec separada.
- Versão global (todas as empresas) do resumo por área — só a versão por empresa é usada nesta tela, embora a query já aceite `companyId` opcional por espelhar `getAreaSummary`.
- Qualquer mudança em `ProjectExecutiveSlideModal`/`project-executive-slide.tsx` — reaproveitado como está, sem alteração.
- Editar `operationalStatus`/`accumulatedSavingBRL` a partir desta tela nova — continua só no bloco já existente em "Detalhes do projeto" (`ProjectDetailsModal`).
