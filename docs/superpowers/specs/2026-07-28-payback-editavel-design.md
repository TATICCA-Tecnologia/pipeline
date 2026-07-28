# Aba Payback editável — custos e componentes do custo de desenvolvimento

Data: 2026-07-28

## Problema

A aba **Payback** de `/admin/empresas/[id]/priorizacao` mostra a curva de custo x
economia e uma tabela de composição, mas tudo é somente leitura. Para ajustar
qualquer premissa é preciso sair da tela: taxa diária em `/admin/configuracoes`,
dias úteis e economia na especificação de cada projeto, custos de estrutura em
`/admin/empresas/[id]/custos`. Ajustar o payback vira uma sequência de idas e
voltas, e não dá para ver o efeito de cada mudança na curva.

## Objetivo

Todos os custos que alimentam a curva — e todos os componentes do custo de
desenvolvimento — passam a ser editáveis na própria aba Payback, com a curva
recalculando a cada alteração.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Componentes do custo de dev | Mantém a fórmula `dias úteis × taxa diária`. Sem decomposição em novas parcelas. |
| O que fica editável | Taxa diária, dias úteis por robô, economia anual por robô, itens de custo de estrutura. |
| Escopo da taxa diária | Por empresa, com fallback para o valor global de `SystemSettings`. |
| Persistência | Grava direto no banco. Sem modo simulação. |
| Layout | Edição inline na própria aba, sem drawer nem navegação. |

## Modelo de dados

Uma única mudança de schema:

```prisma
model Company {
  // ...
  developerDailyRateBRL Float?  // null = herda SystemSettings.developerDailyRateBRL
}
```

Migration correspondente em `prisma/migrations/`. Dias úteis
(`Project.implementationEffortDays`), economia anual
(`Project.estimatedAnnualSavingBRL`) e itens de custo (`CompanyCostItem`) já
existem — não mudam.

## Taxa efetiva: fonte única

Novo helper puro em `src/shared/lib/payback.ts`:

```ts
export function resolveDeveloperDailyRate(
  companyRate: number | null | undefined,
  globalRate: number | null | undefined
): number
```

Semântica: `companyRate ?? globalRate ?? 0`.

**`0` na empresa é um valor legítimo e vence o global** — apenas `null`/`undefined`
herdam. Isso permite modelar uma empresa cujo custo de dev não entra na conta,
sem que o valor global reapareça por baixo.

Consumidores obrigatórios do helper (para o deck nunca divergir da tela):

- a aba Payback;
- `src/server/deck/build-diagnostic-deck.ts`, nos dois pontos que hoje leem
  `settings.developerDailyRateBRL ?? 0` (linhas 476 e 559).

## Servidor (tRPC)

Mudanças necessárias:

- `company.update` — aceitar `developerDailyRateBRL: z.number().min(0).nullable().optional()`.
- `company.listAll` — incluir `developerDailyRateBRL` no objeto retornado; o map
  atual não expõe o campo.
- `buildDiagnosticDeck` — carregar a taxa da empresa junto dos settings e
  resolver com `resolveDeveloperDailyRate`.

Sem mudança necessária:

- `project.update` já aceita `implementationEffortDays` e
  `estimatedAnnualSavingBRL`. Passar `estimatedAnnualSavingBRL` explicitamente
  tem precedência sobre o recálculo automático a partir de
  `monthlyHoursSaved × hourlyRateBRL`, então a edição manual feita na tela não é
  sobrescrita.
- O CRUD de `CompanyCostItem` (`createCostItem` / `updateCostItem` /
  `deleteCostItem` / `listCostItems` / `getCostSummary`) já está completo.

## Interface

### Extrações

A aba Payback sai de `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`
(827 linhas hoje) para `src/shared/components/payback-tab.tsx`. Recebe por props
o que a página já calcula: `companyId`, os schedules das ondas 1 e 2, o ranking
exibido e os settings. A página continua dona do cálculo dos schedules, que são
compartilhados com a aba Cronograma.

O CRUD de custos de estrutura sai de
`src/app/(private)/admin/empresas/[id]/custos/page.tsx` para um componente
compartilhado (`src/shared/components/company-cost-items-card.tsx`), consumido
pelas duas telas. Sem isso, a mesma tabela + dialog + confirmação de exclusão
ficariam duplicados.

### Blocos da aba

1. **Premissas de custo** — input da taxa diária da empresa. Vazio mostra o valor
   global como placeholder, com a legenda "vazio = usa o padrão global (R$ X)".
   Salva no blur via `company.update`.
2. **Gráfico + KPIs** — a curva atual, com três indicadores acima:
   - *custo total*: soma do custo de dev de todos os robôs das ondas 1 e 2
     (`dias úteis × taxa efetiva`) mais o custo de estrutura acumulado até o
     último ponto da curva;
   - *economia anual*: soma de `estimatedAnnualSavingBRL` dos mesmos robôs;
   - *payback*: o mesmo número de meses já exibido hoje no cabeçalho do card.
3. **Composição do cálculo** — a tabela existente, com *dias úteis* e
   *economia/ano* como inputs por linha. Salvam no blur via `project.update`.
4. **Custos de estrutura** — o componente compartilhado, com CRUD completo.

## Fluxo de dados e recálculo

Nenhum estado derivado é duplicado. A curva, os schedules e a composição
continuam sendo `useMemo` sobre `ranking + settings + costItems`. Cada mutation
invalida a query correspondente (`project.getPrioritizedRanking`,
`company.listAll`, `company.listCostItems`, `company.getCostSummary`) e o
recálculo acontece por consequência.

Editar dias úteis reordena o cronograma sequencial das ondas e pode deslocar a
curva de forma visível. É o comportamento esperado — sem diálogo de confirmação.

## Tratamento de erros

- Valor inválido, vazio onde é obrigatório, ou negativo: a mutation não é
  disparada, o input reverte para o valor anterior no blur e um toast explica o
  motivo.
- Falha de mutation: toast de erro, seguindo o padrão já usado na tela.
- Como a gravação é direta, toda edição propaga para ranking, cronograma, resumo
  executivo e o deck .pptx. Isso é intencional: uma verdade só, em todo lugar.

## Verificação

O projeto não tem infraestrutura de testes automatizados (sem vitest/jest, sem
script `test` no `package.json`). A verificação é:

- `npx tsc --noEmit` limpo;
- `npm run build` limpo;
- conferência manual: editar cada campo e confirmar que a curva, os KPIs e a
  tabela reagem; confirmar que a taxa da empresa não vaza para outra empresa;
  confirmar que o .pptx exportado usa a mesma taxa da tela.

## Fora de escopo

- Decompor o custo de desenvolvimento em novas parcelas (analista, QA, licenças).
- Taxa diária por robô.
- Modo de simulação / cenários descartáveis.
- Tornar `wave1StartDate` editável na tela (segue global, em Configurações).
