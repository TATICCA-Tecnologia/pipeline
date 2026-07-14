# Recálculo automático de `estimatedAnnualSavingBRL` (Design)

## Contexto

`Project.estimatedAnnualSavingBRL` (economia anual estimada) é o campo financeiro mais importante do sistema — alimenta o ranking de priorização, o resumo por área, o payback e o deck de diagnóstico. Hoje ele **não é um valor derivado**: é só pré-calculado uma única vez, no client-side, na primeira vez que o arquiteto abre a aba de Arquitetura (`architecture-tab.tsx:87-95`, usando `monthlyHoursSaved × 12 × taxa efetiva`), e a partir daí vira um valor estático salvo no banco. Se `monthlyHoursSaved` mudar depois — por exemplo, o cliente editando a solicitação pós-envio, uma feature já existente — `estimatedAnnualSavingBRL` **não se atualiza sozinho**, ficando com um valor desatualizado até alguém abrir a aba de Arquitetura de novo e salvar manualmente.

A taxa horária padrão (`SystemSettings.defaultHourlyRateBRL`, hoje R$90) já existe e já é usada como fallback quando o projeto não tem `hourlyRateBRL` próprio — mas só dentro desse cálculo client-side pontual, nunca de forma persistente/automática.

## Requisitos confirmados com o usuário

1. **Continua editável**: o arquiteto ainda pode digitar um valor manual em `estimatedAnnualSavingBRL` na aba de Arquitetura — isso não muda.
2. **Recalcula automaticamente**: sempre que `monthlyHoursSaved` ou `hourlyRateBRL` mudarem através de `project.update` (venha de onde vier: edição de solicitação pelo cliente, ou o arquiteto mudando a taxa), `estimatedAnnualSavingBRL` é recalculado no servidor — **a menos que** a mesma chamada já inclua um valor explícito para `estimatedAnnualSavingBRL` (é o que a aba de Arquitetura sempre faz ao salvar, então o valor que o arquiteto vê/edita ali sempre prevalece).
3. **Já calculado na criação**: quando um projeto é criado (wizard do cliente ou importação de XML, que passam pela mesma mutation `project.create`) com `monthlyHoursSaved` preenchido, `estimatedAnnualSavingBRL` já vem calculado usando a taxa padrão — não fica `null` esperando o arquiteto abrir a especificação.

## Mudança

### `project.create` (`project.router.ts:308-349`)

Antes de montar o `data` do `ctx.db.project.create`, busca `SystemSettings` (mesma linha já usada em `getPrioritizedRanking`: `ctx.db.systemSettings.findUnique({ where: { id: "default" } })`) e usa `settings?.defaultHourlyRateBRL ?? 90` como taxa. Adiciona ao objeto `data` (ao lado de `currentAnnualHours`, que já é computado da mesma forma):

```ts
estimatedAnnualSavingBRL: computeAnnualSavingBRL(input.monthlyHoursSaved ?? null, defaultHourlyRateBRL),
```

`computeAnnualSavingBRL` (`@/shared/lib/savings.ts`, já existe, já usado por `architecture-tab.tsx`) retorna `null` se `monthlyHoursSaved` for `null`/`undefined` — nenhuma mudança nessa função.

### `project.update` (`project.router.ts:439-612`)

Troca as duas linhas atuais:

```ts
if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
if (rest.estimatedAnnualSavingBRL !== undefined)
  data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
```

Por um bloco que grava `hourlyRateBRL` como sempre, e só recalcula `estimatedAnnualSavingBRL` quando **não** veio um valor explícito na mesma chamada:

```ts
if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
if (rest.estimatedAnnualSavingBRL !== undefined) {
  data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
} else if (rest.monthlyHoursSaved !== undefined || rest.hourlyRateBRL !== undefined) {
  // Recalcula automaticamente sempre que horas ou taxa mudam sem um valor
  // manual explícito nesta mesma chamada — mesmo padrão de currentAnnualHours
  // (sempre derivado), mas aqui o campo final continua editável manualmente
  // quando o arquiteto manda um valor (ramo acima).
  const nextMonthlyHoursSaved =
    rest.monthlyHoursSaved !== undefined ? rest.monthlyHoursSaved : current.monthlyHoursSaved;
  const nextHourlyRateBRL =
    rest.hourlyRateBRL !== undefined ? rest.hourlyRateBRL : current.hourlyRateBRL;
  const settings = await ctx.db.systemSettings.findUnique({ where: { id: "default" } });
  const effectiveRate = nextHourlyRateBRL ?? settings?.defaultHourlyRateBRL ?? 90;
  data.estimatedAnnualSavingBRL = computeAnnualSavingBRL(nextMonthlyHoursSaved, effectiveRate);
}
```

A linha já existente `if (rest.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = rest.monthlyHoursSaved;` (mais abaixo na mesma mutation) não muda — continua gravando o valor normalmente, independente do bloco acima (que só decide o valor de `estimatedAnnualSavingBRL`).

`SystemSettings` só é buscado quando o bloco realmente precisa (dentro do `else if`), então chamadas de `update` que não tocam `monthlyHoursSaved`/`hourlyRateBRL` não pagam essa consulta extra.

### Por que isso cobre os três gatilhos

- **Cliente edita a solicitação** (`monthlyHoursSaved` muda): `project.update` é chamado sem `hourlyRateBRL`/`estimatedAnnualSavingBRL` (campos `ARCHITECT_ONLY_FIELDS`, um cliente nunca consegue enviá-los — a autorização já bloqueia isso hoje). Cai no `else if`, recalcula com a taxa já salva no projeto (ou a padrão).
- **Importação de XML / wizard**: passa por `project.create`, calculado na hora com a taxa padrão.
- **Arquiteto muda a taxa na aba de Arquitetura**: `handleSaveArchitecture` (`architecture-tab.tsx:140-169`) sempre envia `estimatedAnnualSavingBRL` explicitamente (o campo já é recalculado no client-side antes de salvar, via `handleHourlyRateChange`) — cai no primeiro ramo (`if`), valor explícito prevalece. Nenhuma mudança necessária nesse componente.

## Fora de escopo

- Qualquer mudança no schema/formato do XML de entrada, no fluxo de importação (`xml-import.ts`/`zip-import.ts`) ou no prompt de geração (`docs/prompt-geracao-xml.md`) — confirmado explicitamente com o usuário que isso não deve ser tocado.
- Mudar `architecture-tab.tsx` — o comportamento client-side dessa aba já está correto e consistente com o novo comportamento do servidor, sem precisar de alteração.
- Recalcular `estimatedAnnualSavingBRL` para projetos já existentes (backfill) — este design só afeta o cálculo daqui pra frente, em `create`/`update` novos. Se for necessário atualizar projetos antigos, é uma migração de dados separada, fora deste escopo.
