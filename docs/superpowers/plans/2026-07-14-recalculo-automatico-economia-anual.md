# Recálculo automático de economia anual — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `Project.estimatedAnnualSavingBRL` um valor sempre derivado (como `currentAnnualHours` já é) — calculado na criação do projeto e recalculado automaticamente sempre que `monthlyHoursSaved`/`hourlyRateBRL` mudarem via `project.update`, a menos que o arquiteto informe um valor manual explícito na mesma chamada.

**Architecture:** Duas mudanças em `src/server/trpc/routers/project.router.ts` — `project.create` passa a calcular `estimatedAnnualSavingBRL` com a taxa padrão do `SystemSettings`, e `project.update` troca a gravação direta do campo por um bloco que recalcula automaticamente quando faltando um valor explícito na própria chamada. Reaproveita `computeAnnualSavingBRL` (`@/shared/lib/savings.ts`), já existente, sem nenhuma mudança nessa função.

**Tech Stack:** tRPC, Prisma, Zod.

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest) e `npm run lint` não funciona neste ambiente (eslint não instalado). A verificação de cada task é feita via `npx tsc --noEmit`; a verificação funcional final (Task 3) depende de banco de dados, que não existe neste ambiente — fica com o usuário.

**Spec:** `docs/superpowers/specs/2026-07-14-recalculo-automatico-economia-anual-design.md`

---

### Task 1: Importar `computeAnnualSavingBRL` e calcular na criação (`project.create`)

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:1-14` (imports)
- Modify: `src/server/trpc/routers/project.router.ts:349-422` (mutation `create`)

- [ ] **Step 1: Adicionar o import**

Em `src/server/trpc/routers/project.router.ts`, localize:

```ts
import {
  computeQualitativeScore,
  computeComplexityScore,
  computeEconomiaScore,
  computeCombinedScore,
  type QualitativeWeights,
  type CombinedScoreWeights,
} from "@/shared/lib/scoring";
```

Troque por:

```ts
import {
  computeQualitativeScore,
  computeComplexityScore,
  computeEconomiaScore,
  computeCombinedScore,
  type QualitativeWeights,
  type CombinedScoreWeights,
} from "@/shared/lib/scoring";
import { computeAnnualSavingBRL } from "@/shared/lib/savings";
```

- [ ] **Step 2: Buscar a taxa padrão e calcular `estimatedAnnualSavingBRL` na criação**

Em `src/server/trpc/routers/project.router.ts`, dentro da mutation `create`, localize:

```ts
      if (input.developerId) {
        const developer = await ctx.db.user.findUnique({ where: { id: input.developerId } });
        if (!developer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Desenvolvedor inválido (developerId não existe). Selecione um desenvolvedor válido.",
          });
        }
      }

      const project = await ctx.db.project.create({
```

Troque por:

```ts
      if (input.developerId) {
        const developer = await ctx.db.user.findUnique({ where: { id: input.developerId } });
        if (!developer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Desenvolvedor inválido (developerId não existe). Selecione um desenvolvedor válido.",
          });
        }
      }

      // Taxa horária padrão para calcular a economia anual estimada já na
      // criação (nenhum campo de taxa/economia existe no formulário de
      // criação — o projeto ainda não passou pelo arquiteto).
      const settingsForCreate = await ctx.db.systemSettings.findUnique({
        where: { id: "default" },
      });
      const defaultHourlyRateBRLForCreate = settingsForCreate?.defaultHourlyRateBRL ?? 90;

      const project = await ctx.db.project.create({
```

- [ ] **Step 3: Adicionar o campo ao `data` da criação**

Em `src/server/trpc/routers/project.router.ts`, localize (ainda dentro do `data` de `ctx.db.project.create`):

```ts
          currentAnnualHours: computeCurrentAnnualHours(
            input.taskDurationHours,
            input.processFrequency
          ),
          features:
```

Troque por:

```ts
          currentAnnualHours: computeCurrentAnnualHours(
            input.taskDurationHours,
            input.processFrequency
          ),
          estimatedAnnualSavingBRL: computeAnnualSavingBRL(
            input.monthlyHoursSaved ?? null,
            defaultHourlyRateBRLForCreate
          ),
          features:
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts` (erros pré-existentes não relacionados em `chart.tsx`/`input-otp.tsx`/`sidebar.tsx`/`toaster.tsx` são esperados).

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: compute estimatedAnnualSavingBRL at project creation using the default hourly rate"
```

---

### Task 2: Recalcular automaticamente em `project.update`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:556-558` (mutation `update`)

- [ ] **Step 1: Substituir a gravação direta por recálculo automático condicional**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro da mutation `update`):

```ts
      if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
      if (rest.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
```

Troque por:

```ts
      if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
      if (rest.estimatedAnnualSavingBRL !== undefined) {
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
      } else if (rest.monthlyHoursSaved !== undefined || rest.hourlyRateBRL !== undefined) {
        // Recalcula automaticamente sempre que horas ou taxa mudam sem um
        // valor manual explícito nesta mesma chamada — mesmo padrão de
        // currentAnnualHours (sempre derivado) alguns blocos abaixo, mas
        // aqui o campo final continua editável manualmente quando o
        // arquiteto manda um valor (ramo acima, `handleSaveArchitecture`
        // sempre envia um).
        const nextMonthlyHoursSaved =
          rest.monthlyHoursSaved !== undefined ? rest.monthlyHoursSaved : current.monthlyHoursSaved;
        const nextHourlyRateBRL =
          rest.hourlyRateBRL !== undefined ? rest.hourlyRateBRL : current.hourlyRateBRL;
        const settings = await ctx.db.systemSettings.findUnique({ where: { id: "default" } });
        const effectiveRate = nextHourlyRateBRL ?? settings?.defaultHourlyRateBRL ?? 90;
        data.estimatedAnnualSavingBRL = computeAnnualSavingBRL(nextMonthlyHoursSaved, effectiveRate);
      }
```

Note: a linha já existente mais abaixo, `if (rest.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = rest.monthlyHoursSaved;`, **não muda** — continua gravando o valor de `monthlyHoursSaved` normalmente, independente deste bloco (que só decide o valor de `estimatedAnnualSavingBRL`).

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: recalculate estimatedAnnualSavingBRL automatically when hours or rate change"
```

---

### Task 3: Verificação manual (requer banco de dados)

**Files:** nenhum (só teste manual)

Este ambiente de desenvolvimento não tem `DATABASE_URL`/banco local configurado, então esta task não pode ser executada pelo agente — precisa ser feita pelo usuário num ambiente com banco.

- [ ] **Step 1: Confirmar o cálculo na criação**

1. Crie um projeto novo (wizard do cliente, com "Horas economizadas por mês" preenchido) sem passar pela aba de Arquitetura ainda.
2. Confirme (via "Detalhes do projeto" como admin, ou consultando o banco) que `estimatedAnnualSavingBRL` já veio preenchido = horas × 12 × taxa padrão configurada em Configurações (padrão R$90, a menos que tenha sido mudada).

- [ ] **Step 2: Confirmar o recálculo quando o cliente edita a solicitação**

1. Como cliente-dono, edite "Horas economizadas por mês" de um projeto ainda ativo (não Concluído/Cancelado) na página `/projeto/[id]`.
2. Confirme que `estimatedAnnualSavingBRL` (visível pro admin em "Detalhes do projeto" ou na Priorização) mudou proporcionalmente, sem que o arquiteto tenha feito nada.

- [ ] **Step 3: Confirmar que o valor manual do arquiteto continua prevalecendo**

1. Como admin, abra a aba de Arquitetura de um projeto e digite um valor de "Economia anual estimada" diferente do calculado automaticamente (ex.: um ajuste manual).
2. Salve. Confirme que o valor manual foi salvo como digitado.
3. Volte na aba de Arquitetura — confirme que o campo mostra o valor manual salvo (não o recalculado).
4. Mude só a taxa horária nesse mesmo projeto e salve de novo — como a aba sempre reenvia `estimatedAnnualSavingBRL` explicitamente (já recalculado no client-side pela mudança de taxa), confirme que o valor muda de acordo com a nova taxa.

- [ ] **Step 4: Reportar resultado**

Se algum passo falhar, anote exatamente o que foi observado (projeto, valores esperados vs. obtidos) para investigação.
