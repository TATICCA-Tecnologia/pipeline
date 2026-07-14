# Filtro de população nas queries de oportunidade — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escopar `getPrioritizedRanking` e `getAreaSummary` (`src/server/trpc/routers/project.router.ts`) para só considerarem oportunidades ativas — excluindo projetos marcados como "Melhoria" (`hasCurrentApplication === "sim"`) e projetos `DONE`/`CANCELLED` — de modo que ranking, cronograma, payback, o dashboard admin e o deck de diagnóstico parem de misturar automações já existentes/entregues com oportunidades ainda não construídas.

**Architecture:** Mudança cirúrgica de duas cláusulas `where` do Prisma, sem endpoint novo, sem campo novo no schema, sem mudança de UI. Toda a lógica downstream (cálculo de score, cronograma, payback, gráficos) já opera sobre o array retornado por essas duas queries — reduzir o conjunto de linhas retornado é suficiente para propagar o filtro por toda a cadeia (tela de Priorização, dashboard admin, deck de diagnóstico).

**Tech Stack:** tRPC, Prisma (PostgreSQL).

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest/Playwright) e `npm run lint` não funciona neste ambiente (eslint não instalado, condição pré-existente sem relação com este trabalho). A verificação de cada task é feita via `npx tsc --noEmit` e leitura cuidadosa do diff — sem banco de dados local disponível neste ambiente, a verificação funcional final (Task 3) precisa ser feita manualmente pelo usuário num ambiente com banco.

**Spec:** `docs/superpowers/specs/2026-07-14-filtro-populacao-oportunidades-design.md`

---

### Task 1: Filtrar `getPrioritizedRanking`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:713` (dentro da query `getPrioritizedRanking`)

Esta query alimenta as 3 abas (Ranking, Cronograma, Payback) da tela `/admin/empresas/[id]/priorizacao` e 5 slides do deck de diagnóstico (ranking economia/qualitativo/combinado, cronograma, payback, composição do payback) — nenhum desses consumidores precisa de mudança, todos já operam sobre o array retornado.

- [ ] **Step 1: Adicionar o filtro ao `where` da query**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro de `getPrioritizedRanking`):

```ts
      const [projects, settings] = await Promise.all([
        ctx.db.project.findMany({
          where: { companyId: input.companyId },
          select: {
```

Troque por:

```ts
      const [projects, settings] = await Promise.all([
        ctx.db.project.findMany({
          where: {
            companyId: input.companyId,
            hasCurrentApplication: { not: "sim" },
            status: { notIn: ["DONE", "CANCELLED"] },
          },
          select: {
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts` (os únicos erros esperados no output são pré-existentes e não relacionados, em `src/shared/components/ui/chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "fix: exclude existing/cancelled projects from getPrioritizedRanking"
```

---

### Task 2: Filtrar `getAreaSummary`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:666` (dentro da query `getAreaSummary`)

Esta query alimenta o gráfico `AreaSummaryChart` no dashboard admin (`/admin`, chamado sem `companyId` — soma global) e o slide de resumo por área do deck de diagnóstico (chamado com `companyId`). O filtro novo se aplica igualmente aos dois casos, já que não depende de `companyId` estar presente.

- [ ] **Step 1: Adicionar o filtro ao `where` da query**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro de `getAreaSummary`):

```ts
      const grouped = await ctx.db.project.groupBy({
        by: ["areaId"],
        _count: true,
        _sum: { estimatedAnnualSavingBRL: true, currentAnnualHours: true },
        where: {
          areaId: { not: null },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });
```

Troque por:

```ts
      const grouped = await ctx.db.project.groupBy({
        by: ["areaId"],
        _count: true,
        _sum: { estimatedAnnualSavingBRL: true, currentAnnualHours: true },
        where: {
          areaId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts` (mesma observação da Task 1 sobre os erros pré-existentes não relacionados).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "fix: exclude existing/cancelled projects from getAreaSummary"
```

---

### Task 3: Verificação manual (requer banco de dados)

**Files:** nenhum (só teste manual)

Este ambiente de desenvolvimento não tem `DATABASE_URL`/banco local configurado, então esta task não pode ser executada pelo agente — precisa ser feita pelo usuário num ambiente com banco (local com dados de teste, ou observando o comportamento em produção após o deploy).

- [ ] **Step 1: Confirmar que "Melhoria" some do ranking**

1. Encontre (ou crie) uma empresa com pelo menos um projeto `hasCurrentApplication = "sim"` (badge "Melhoria" no card) e pelo menos um projeto `hasCurrentApplication = "nao"` ou vazio (badge "Novo" ou sem badge).
2. Abra `/admin/empresas/[id]/priorizacao` para essa empresa.
3. Na aba "Ranking", confirme que só o(s) projeto(s) "Novo" aparece(m) na tabela e no gráfico — o(s) projeto(s) "Melhoria" não deve(m) aparecer.

- [ ] **Step 2: Confirmar que projeto Concluído/Cancelado some do ranking**

1. Marque um projeto "Novo" ativo como `Concluído` (ou `Cancelado`).
2. Recarregue a aba "Ranking" da mesma empresa.
3. Confirme que esse projeto desapareceu do ranking, cronograma e payback.

- [ ] **Step 3: Confirmar efeito no resumo por área**

1. Anote o valor total de "Economia estimada" por área mostrado no dashboard admin (`/admin`) antes de ter projetos "Melhoria"/Concluídos com `estimatedAnnualSavingBRL` preenchido.
2. Compare com o valor depois desta mudança — deve ter diminuído (ou ficado igual, se não havia projetos dessa população com saving estimado preenchido).

- [ ] **Step 4: Gerar o deck de diagnóstico e conferir os slides afetados**

1. Em `/admin/empresas`, exporte o deck de diagnóstico da mesma empresa usada nos passos acima.
2. Confira que os slides "Resumo por área", "Ranking por economia/qualitativo/combinado", "Cronograma" e "Payback" não listam o(s) projeto(s) "Melhoria"/Concluído/Cancelado usado(s) no teste.

- [ ] **Step 5: Reportar resultado**

Se algum dos passos acima falhar, anote exatamente o que foi observado (empresa, projeto, tela) para investigação — não é esperado nenhum ajuste de código adicional se as Tasks 1 e 2 foram implementadas corretamente, já que a lógica downstream não muda.
