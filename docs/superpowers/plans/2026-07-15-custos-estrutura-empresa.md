# Custos e Estrutura por Empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma tela "Custos e Estrutura" por empresa (pessoas, licenças, infraestrutura — recorrentes ou pontuais), com uma taxonomia de categorias editável, e somar esses custos na curva de Payback (tela e deck PPTX).

**Architecture:** Duas tabelas novas (`CompanyCostCategory` — taxonomia editável, mesmo padrão de `MainTool`; `CompanyCostItem` — item de custo vinculado a empresa+categoria). CRUD de categoria entra em `taxonomy.router.ts` (padrão idêntico ao de `MainTool`); CRUD de item de custo entra em `company.router.ts`. `src/shared/lib/payback.ts` ganha um parâmetro opcional `structureCosts` que soma ao custo acumulado mês a mês. Os dois consumidores existentes do payback (tela `priorizacao/page.tsx` e o export `build-diagnostic-deck.ts`) passam a buscar e passar os itens de custo da empresa, pra não divergirem.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PostgreSQL) + shadcn/ui + date-fns. Sem framework de teste e sem banco local neste repo — validação é `pnpm exec tsc --noEmit` e `pnpm build`. Deploy automático via push pra `main` (a migration desta feature É aplicada em produção via `prisma migrate deploy` no boot do container — diferente das últimas duas features feitas nesta sessão, que não mexiam em schema).

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260715130000_add_company_cost_structure/migration.sql`

- [ ] **Step 1: Adicionar a relação em Company**

Encontre:
```prisma
  // Relacionamentos
  users      User[]      @relation("UserCompanies")
  projects   Project[]
  interviews Interview[]

  @@map("companies")
}
```
Substitua por:
```prisma
  // Relacionamentos
  users      User[]            @relation("UserCompanies")
  projects   Project[]
  interviews Interview[]
  costItems  CompanyCostItem[]

  @@map("companies")
}
```

- [ ] **Step 2: Adicionar os dois models novos**

Encontre:
```prisma
model MainTool {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("main_tools")
}

// ==========================================
// ENTREVISTAS / REUNIOES DE LEVANTAMENTO
// ==========================================
```
Substitua por:
```prisma
model MainTool {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("main_tools")
}

// ==========================================
// CUSTOS E ESTRUTURA DA EMPRESA
// ==========================================

model CompanyCostCategory {
  id        String            @id @default(cuid())
  name      String
  slug      String            @unique
  isActive  Boolean           @default(true)
  order     Int               @default(0)
  costItems CompanyCostItem[]
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  @@map("company_cost_categories")
}

model CompanyCostItem {
  id         String              @id @default(cuid())
  company    Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId  String
  category   CompanyCostCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  categoryId String
  name       String
  type       String // "recorrente" | "pontual"
  amountBRL  Float
  startDate  DateTime
  endDate    DateTime? // só relevante pra "recorrente"; null = em andamento
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@map("company_cost_items")
}

// ==========================================
// ENTREVISTAS / REUNIOES DE LEVANTAMENTO
// ==========================================
```

- [ ] **Step 3: Validar o schema (sem conexão de banco)**

Run: `npx prisma validate` (se der erro `P1012` sobre `DATABASE_URL` faltando, defina uma dummy: `DATABASE_URL="postgresql://u:p@localhost:5432/d" npx prisma validate` — é só uma checagem de sintaxe do schema, não conecta em nada real)
Expected: `The schema at prisma\schema.prisma is valid`

- [ ] **Step 4: Regenerar o Prisma Client**

Run: `DATABASE_URL="postgresql://u:p@localhost:5432/d" npx prisma generate` (mesma dummy var se necessário)
Expected: `✔ Generated Prisma Client`. Isso torna `ctx.db.companyCostCategory`/`ctx.db.companyCostItem` type-safe pras próximas tasks.

- [ ] **Step 5: Escrever a migration**

Crie `prisma/migrations/20260715130000_add_company_cost_structure/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "company_cost_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_cost_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_cost_categories_slug_key" ON "company_cost_categories"("slug");

-- Seed: categorias padrão de custo
INSERT INTO "company_cost_categories" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-cost-category-pessoas', 'Pessoas', 'pessoas', 0, CURRENT_TIMESTAMP),
    ('seed-cost-category-licencas', 'Licenças', 'licencas', 1, CURRENT_TIMESTAMP),
    ('seed-cost-category-infraestrutura', 'Infraestrutura', 'infraestrutura', 2, CURRENT_TIMESTAMP),
    ('seed-cost-category-outro', 'Outro', 'outro', 3, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "company_cost_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountBRL" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_cost_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_cost_items" ADD CONSTRAINT "company_cost_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_cost_items" ADD CONSTRAINT "company_cost_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "company_cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260715130000_add_company_cost_structure/migration.sql
git commit -m "feat: add CompanyCostCategory and CompanyCostItem models"
```

## Context

Esta é a Task 1 de um plano de 10 tasks. Não há banco local neste repo (`DATABASE_URL` não existe) — `prisma validate`/`prisma generate` funcionam só lendo o schema, sem conectar em nada; nunca rode `prisma migrate dev`/`db push`. A migration é escrita à mão (mesmo padrão já usado pra `MainTool`, ver `prisma/migrations/20260715120000_add_main_tool_taxonomy/migration.sql`) e só é de fato aplicada em produção quando o container sobe (`prisma migrate deploy` no `CMD` do `Dockerfile`), depois do deploy via GitHub Actions.

`onDelete: Restrict` em `CompanyCostItem.category` é proposital: like `categoryId` é obrigatório (não-nulo), não dá pra usar `SetNull` como acontece com `Project.areaId`/`mainToolId` (que são opcionais) — `Restrict` faz o banco recusar a exclusão de uma categoria que ainda tem itens de custo vinculados, em vez de silenciosamente cascatear a exclusão (perda de dado financeiro) ou deixar o item órfão.

---

## Task 2: Backend — CRUD de categorias de custo em taxonomy.router.ts

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`

- [ ] **Step 1: Adicionar os 5 procedures de categoria de custo**

Encontre o final do arquivo:
```typescript
  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```
Substitua por:
```typescript
  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // CATEGORIAS DE CUSTO DE EMPRESA
  // ==========================================

  listCostCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.companyCostCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllCostCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.companyCostCategory.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createCostCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.companyCostCategory.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria de custo com este slug" });
      return ctx.db.companyCostCategory.create({ data: input });
    }),

  updateCostCategory: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.companyCostCategory.update({ where: { id }, data });
    }),

  deleteCostCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const itemCount = await ctx.db.companyCostItem.count({ where: { categoryId: input.id } });
      if (itemCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Não é possível excluir uma categoria com itens de custo vinculados. Mova ou exclua os itens primeiro.",
        });
      }
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `taxonomy.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts
git commit -m "feat: add CompanyCostCategory CRUD procedures to taxonomy router"
```

## Context

Task 2 de 10. Depende da Task 1 (precisa de `ctx.db.companyCostCategory` já existir no Prisma Client gerado). `z`, `publicProcedure`, `protectedProcedure`, `adminProcedure`, `TRPCError` já estão importados no topo do arquivo — nenhum import novo necessário. Copia o padrão já usado pra `MainTool` neste mesmo arquivo (mesmos códigos de erro, mesma validação de slug), com UMA diferença deliberada: `deleteCostCategory` faz uma checagem prévia (`ctx.db.companyCostItem.count(...)`) antes de excluir, em vez de só chamar `.delete()` direto como `deleteMainTool`/`deleteArea`/`deleteTheme` fazem — porque `CompanyCostItem.categoryId` é uma FK obrigatória com `onDelete: Restrict` (Task 1), então excluir uma categoria em uso sem essa checagem estouraria um erro cru do Postgres (P2003) em vez de uma mensagem amigável. Não remova essa checagem pra "simplificar" e copiar os outros `delete*` ao pé da letra — ela é necessária aqui e não nos outros.

---

## Task 3: Backend — CRUD de itens de custo em company.router.ts

**Files:**
- Modify: `src/server/trpc/routers/company.router.ts`

- [ ] **Step 1: Adicionar os 5 procedures de item de custo**

Encontre o final do arquivo:
```typescript
      const company = await ctx.db.company.update({
        where: { id },
        data: {
          ...rest,
          ...(document !== undefined && { document: document.trim() || null }),
          ...(email !== undefined && { email: email.trim() || null }),
          ...(phone !== undefined && { phone: phone.trim() || null }),
        },
      });
      return { id: company.id, name: company.name };
    }),
});
```
Substitua por:
```typescript
      const company = await ctx.db.company.update({
        where: { id },
        data: {
          ...rest,
          ...(document !== undefined && { document: document.trim() || null }),
          ...(email !== undefined && { email: email.trim() || null }),
          ...(phone !== undefined && { phone: phone.trim() || null }),
        },
      });
      return { id: company.id, name: company.name };
    }),

  // ==========================================
  // CUSTOS E ESTRUTURA (Pessoas, Licenças, etc.)
  // ==========================================

  listCostItems: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.companyCostItem.findMany({
        where: { companyId: input.companyId },
        include: { category: true },
        orderBy: { startDate: "desc" },
      });
    }),

  createCostItem: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        categoryId: z.string(),
        name: z.string().min(1),
        type: z.enum(["recorrente", "pontual"]),
        amountBRL: z.number().min(0),
        startDate: z.date(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.companyCostItem.create({ data: input, include: { category: true } });
    }),

  updateCostItem: adminProcedure
    .input(
      z.object({
        id: z.string(),
        categoryId: z.string().optional(),
        name: z.string().min(1).optional(),
        type: z.enum(["recorrente", "pontual"]).optional(),
        amountBRL: z.number().min(0).optional(),
        startDate: z.date().optional(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.companyCostItem.update({ where: { id }, data, include: { category: true } });
    }),

  deleteCostItem: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.companyCostItem.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getCostSummary: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.companyCostItem.findMany({
        where: { companyId: input.companyId },
      });
      const now = new Date();
      const totalMonthlyRecurring = items
        .filter(
          (i) =>
            i.type === "recorrente" &&
            i.startDate <= now &&
            (i.endDate == null || i.endDate >= now)
        )
        .reduce((sum, i) => sum + i.amountBRL, 0);
      const totalOneTime = items
        .filter((i) => i.type === "pontual" && i.startDate <= now)
        .reduce((sum, i) => sum + i.amountBRL, 0);
      return { totalMonthlyRecurring, totalOneTime };
    }),
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `company.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/company.router.ts
git commit -m "feat: add cost item CRUD and summary procedures to company router"
```

## Context

Task 3 de 10. Depende da Task 1. `z`/`TRPCError`/`adminProcedure` já importados no topo do arquivo (`import { z } from "zod"; import { TRPCError } from "@trpc/server"; import { router, adminProcedure } from "../trpc";`) — nenhum import novo necessário. Todos os procedures são `adminProcedure` (mesmo racional de sensibilidade financeira já documentado em `project.router.ts` pra `getAreaSummary`/`getPrioritizedRanking`).

`getCostSummary` considera "ativo hoje" um item com `startDate <= hoje` E (sem `endDate` OU `endDate >= hoje`) — itens recorrentes que ainda não começaram (`startDate` no futuro, ex: "novo funcionário começa mês que vem") ou já encerrados não entram no total mensal atual; item pontual com `startDate` no futuro também não entra no total acumulado ainda. Isso mantém a consistência com o cálculo de payback (Task 4, `computeStructureCostAt`), que também ignora custos cuja `startDate` ainda não chegou (`if (asOf < item.startDate) continue`) — sem esse mesmo filtro aqui, os cards de resumo desta tela mostrariam um número diferente do que a curva de payback usa pros mesmos dados.

---

## Task 4: Integrar custo de estrutura na curva de Payback

**Files:**
- Modify: `src/shared/lib/payback.ts`

- [ ] **Step 1: Adicionar o tipo `StructureCostItem`**

Encontre:
```typescript
export type PaybackPoint = {
  date: Date;
  cumulativeCost: number;
  cumulativeSaving: number;
};
```
Substitua por:
```typescript
export type PaybackPoint = {
  date: Date;
  cumulativeCost: number;
  cumulativeSaving: number;
};

/** Item de custo de estrutura da empresa (`CompanyCostItem`) — pessoas, licenças, etc. */
export type StructureCostItem = {
  type: "recorrente" | "pontual";
  amountBRL: number;
  startDate: Date;
  endDate: Date | null;
};
```

- [ ] **Step 2: Adicionar a função `computeStructureCostAt`**

Encontre:
```typescript
/**
 * Calcula, num único dia `asOf`, o custo acumulado e a economia acumulada de
 * todo o schedule até aquele ponto.
```
Substitua por:
```typescript
/**
 * Custo de estrutura (pessoas/licenças/infraestrutura — `CompanyCostItem`)
 * acumulado até `asOf`. Item recorrente: soma `(amountBRL * 12 / 365) × dias
 * decorridos entre startDate e min(asOf, endDate ?? asOf)` — mesmo padrão de
 * "anualiza e divide por 365" já usado no lado da economia
 * (`estimatedAnnualSavingBRL / 365`). Item pontual: soma o valor cheio a
 * partir de `startDate` (reconhecido de uma vez, não distribuído).
 * Exportada porque a tela de Priorização usa separadamente pra mostrar o
 * total de estrutura na tabela de composição, fora da curva.
 */
export function computeStructureCostAt(structureCosts: StructureCostItem[], asOf: Date): number {
  let total = 0;
  for (const item of structureCosts) {
    if (asOf < item.startDate) continue;
    if (item.type === "pontual") {
      total += item.amountBRL;
      continue;
    }
    const clampedEnd = item.endDate && item.endDate < asOf ? item.endDate : asOf;
    const days = differenceInCalendarDays(clampedEnd, item.startDate) + 1;
    total += (item.amountBRL * 12 / 365) * Math.max(0, days);
  }
  return total;
}

/**
 * Calcula, num único dia `asOf`, o custo acumulado e a economia acumulada de
 * todo o schedule até aquele ponto.
```

- [ ] **Step 3: Atualizar `computePointAt` pra receber e somar `structureCosts`**

Encontre:
```typescript
function computePointAt(schedule: PaybackScheduleItem[], dailyRateBRL: number, asOf: Date): PaybackPoint {
  let cumulativeCost = 0;
  let cumulativeSaving = 0;

  for (const item of schedule) {
```
Substitua por:
```typescript
function computePointAt(
  schedule: PaybackScheduleItem[],
  dailyRateBRL: number,
  structureCosts: StructureCostItem[],
  asOf: Date
): PaybackPoint {
  let cumulativeCost = computeStructureCostAt(structureCosts, asOf);
  let cumulativeSaving = 0;

  for (const item of schedule) {
```

- [ ] **Step 4: Atualizar `computePaybackCurve` pra aceitar e repassar `structureCosts`**

Encontre:
```typescript
export function computePaybackCurve(
  schedule: PaybackScheduleItem[],
  dailyRateBRL: number
): PaybackPoint[] {
  if (schedule.length === 0) return [];

  const scheduleStart = new Date(Math.min(...schedule.map((item) => item.startDate.getTime())));
  const scheduleEnd = new Date(Math.max(...schedule.map((item) => item.endDate.getTime())));
  const totalDurationDays = Math.max(0, differenceInCalendarDays(scheduleEnd, scheduleStart));
  const windowDays = Math.max(totalDurationDays * 2, MIN_WINDOW_DAYS);
  const windowEnd = addDays(scheduleStart, windowDays);

  const points: PaybackPoint[] = [];
  let cursor = scheduleStart;
  while (cursor <= windowEnd) {
    points.push(computePointAt(schedule, dailyRateBRL, cursor));
    cursor = addDays(cursor, POINT_INTERVAL_DAYS);
  }

  // A régua de 7 em 7 dias raramente cai exatamente em `windowEnd` — adiciona
  // um ponto final exato pra curva não parecer cortada antes do fim da janela
  // calculada.
  const lastPoint = points[points.length - 1];
  if (!lastPoint || differenceInCalendarDays(windowEnd, lastPoint.date) > 0) {
    points.push(computePointAt(schedule, dailyRateBRL, windowEnd));
  }

  return points;
}
```
Substitua por:
```typescript
export function computePaybackCurve(
  schedule: PaybackScheduleItem[],
  dailyRateBRL: number,
  structureCosts: StructureCostItem[] = []
): PaybackPoint[] {
  if (schedule.length === 0) return [];

  const scheduleStart = new Date(Math.min(...schedule.map((item) => item.startDate.getTime())));
  const scheduleEnd = new Date(Math.max(...schedule.map((item) => item.endDate.getTime())));
  const totalDurationDays = Math.max(0, differenceInCalendarDays(scheduleEnd, scheduleStart));
  const windowDays = Math.max(totalDurationDays * 2, MIN_WINDOW_DAYS);
  const windowEnd = addDays(scheduleStart, windowDays);

  const points: PaybackPoint[] = [];
  let cursor = scheduleStart;
  while (cursor <= windowEnd) {
    points.push(computePointAt(schedule, dailyRateBRL, structureCosts, cursor));
    cursor = addDays(cursor, POINT_INTERVAL_DAYS);
  }

  // A régua de 7 em 7 dias raramente cai exatamente em `windowEnd` — adiciona
  // um ponto final exato pra curva não parecer cortada antes do fim da janela
  // calculada.
  const lastPoint = points[points.length - 1];
  if (!lastPoint || differenceInCalendarDays(windowEnd, lastPoint.date) > 0) {
    points.push(computePointAt(schedule, dailyRateBRL, structureCosts, windowEnd));
  }

  return points;
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: erros novos vão aparecer em `priorizacao/page.tsx` e `build-diagnostic-deck.ts` (chamadores de `computePaybackCurve`/`computePointAt` — na verdade `computePointAt` não é exportada, só chamadores de `computePaybackCurve` são afetados, e como o novo parâmetro é opcional com default `[]`, NENHUM chamador deveria quebrar). Confirme que `tsc --noEmit` não aponta nenhum erro em `payback.ts` nem em nenhum outro arquivo — o parâmetro opcional garante retrocompatibilidade total.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/payback.ts
git commit -m "feat: add structure cost input to payback curve calculation"
```

## Context

Task 4 de 10. Não depende de nenhuma task anterior (é uma lib pura, sem I/O — só usa os tipos `StructureCostItem`, que este mesmo arquivo define). Os dois consumidores reais (`priorizacao/page.tsx`, Task 8; `build-diagnostic-deck.ts`, Task 9) são atualizados em tasks separadas — até lá, `computePaybackCurve` continua funcionando exatamente como antes pra eles (parâmetro novo é opcional, default `[]`), então o Step 5 desta task deve realmente mostrar ZERO erros nos outros arquivos, não é uma quebra temporária esperada como em planos anteriores desta sessão.

---

## Task 5: Frontend — seção "Categorias de custo" em Configurações

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Adicionar o type alias e o ícone Wallet**

Encontre:
```tsx
type RouterOutputs = inferRouterOutputs<AppRouter>;
type AreaItem = RouterOutputs["taxonomy"]["listAllAreas"][number];
type SuggestionItem = RouterOutputs["taxonomy"]["listAllSuggestions"][number];
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
```
Substitua por:
```tsx
type RouterOutputs = inferRouterOutputs<AppRouter>;
type AreaItem = RouterOutputs["taxonomy"]["listAllAreas"][number];
type SuggestionItem = RouterOutputs["taxonomy"]["listAllSuggestions"][number];
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
```

Encontre:
```tsx
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  Lightbulb,
  Database,
  Wrench,
  Merge,
} from "lucide-react";
```
Substitua por:
```tsx
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  Lightbulb,
  Database,
  Wrench,
  Merge,
  Wallet,
} from "lucide-react";
```

- [ ] **Step 2: Adicionar estado, queries e mutations**

Encontre:
```tsx
  // — DELETE CONFIRM —
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```
Substitua por:
```tsx
  // — CATEGORIAS DE CUSTO —
  const { data: costCategories = [] } = trpc.taxonomy.listAllCostCategories.useQuery();
  const [costCategoryDialog, setCostCategoryDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [costCategoryForm, setCostCategoryForm] = useState({ name: "", slug: "", order: 0 });

  const createCostCategory = trpc.taxonomy.createCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); setCostCategoryDialog({ open: false }); toast({ title: "Categoria de custo criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateCostCategory = trpc.taxonomy.updateCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); setCostCategoryDialog({ open: false }); toast({ title: "Categoria de custo atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteCostCategory = trpc.taxonomy.deleteCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); toast({ title: "Categoria de custo removida" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const toggleCostCategory = trpc.taxonomy.updateCostCategory.useMutation({
    onSuccess: () => utils.taxonomy.listAllCostCategories.invalidate(),
  });

  function openNewCostCategory() {
    setCostCategoryForm({ name: "", slug: "", order: costCategories.length });
    setCostCategoryDialog({ open: true });
  }
  function openEditCostCategory(cat: { id: string; name: string; slug: string; order: number }) {
    setCostCategoryForm({ name: cat.name, slug: cat.slug, order: cat.order });
    setCostCategoryDialog({ open: true, editing: cat });
  }
  function submitCostCategory() {
    if (costCategoryDialog.editing) {
      updateCostCategory.mutate({ id: costCategoryDialog.editing.id, name: costCategoryForm.name, order: costCategoryForm.order });
    } else {
      createCostCategory.mutate({ name: costCategoryForm.name, slug: costCategoryForm.slug, order: costCategoryForm.order });
    }
  }

  // — DELETE CONFIRM —
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool" | "costCategory"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "costCategory") deleteCostCategory.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```

- [ ] **Step 3: Renderizar a seção**

Encontre o final da seção "Ferramentas principais" (logo antes do comentário "Dialog: Área"):
```tsx
      </div>

      {/* Dialog: Área */}
```
Substitua por:
```tsx
      </div>

      {/* Categorias de custo */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Categorias de custo</h2>
            <p className="text-sm text-muted-foreground">
              Categorias usadas nos itens de custo em &quot;Custos e Estrutura&quot; de cada empresa.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewCostCategory}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </Button>
        </div>
        {costCategories.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Wallet className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma categoria de custo cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {costCategories.map((cat: CostCategoryItem) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!cat.isActive ? "opacity-50" : ""}`}
                >
                  <span>{cat.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{cat.slug}</Badge>
                  <Switch
                    checked={cat.isActive}
                    onCheckedChange={(v) => toggleCostCategory.mutate({ id: cat.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditCostCategory(cat)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "costCategory", id: cat.id, label: cat.name })}
                    className="text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Área */}
```

- [ ] **Step 4: Adicionar o diálogo de criar/editar**

Encontre o final do diálogo de Ferramenta principal (logo antes do comentário "Confirm delete"):
```tsx
      </Dialog>

      {/* Confirm delete */}
```
Substitua por:
```tsx
      </Dialog>

      {/* Dialog: Categoria de custo */}
      <Dialog open={costCategoryDialog.open} onOpenChange={(o) => setCostCategoryDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{costCategoryDialog.editing ? "Editar categoria de custo" : "Nova categoria de custo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={costCategoryForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCostCategoryForm((f) => ({
                    ...f,
                    name,
                    slug: costCategoryDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Suporte técnico"
              />
            </div>
            {!costCategoryDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={costCategoryForm.slug}
                  onChange={(e) => setCostCategoryForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: suporte-tecnico"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={costCategoryForm.order}
                onChange={(e) => setCostCategoryForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostCategoryDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitCostCategory} disabled={!costCategoryForm.name || (!costCategoryDialog.editing && !costCategoryForm.slug)}>
              {costCategoryDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `categorias/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: add cost category CRUD section to admin categorias page"
```

## Context

Task 5 de 10. Depende da Task 2 (precisa de `taxonomy.listAllCostCategories`/`createCostCategory`/`updateCostCategory`/`deleteCostCategory` já existirem no backend). Cópia exata do padrão de "Ferramentas principais" já existente neste mesmo arquivo, só trocando o nome das variáveis/mutations e o texto da UI.

---

## Task 6: Frontend — botão "Custos e Estrutura" em /admin/empresas

**Files:**
- Modify: `src/app/(private)/admin/empresas/page.tsx`

- [ ] **Step 1: Adicionar o ícone Wallet ao import**

Encontre:
```tsx
import { Bot, Building2, Plus, Search, Pencil, ListOrdered, Users, Download } from "lucide-react";
```
Substitua por:
```tsx
import { Bot, Building2, Plus, Search, Pencil, ListOrdered, Users, Download, Wallet } from "lucide-react";
```

- [ ] **Step 2: Adicionar o botão na linha de cada empresa**

Encontre:
```tsx
                        <Link href={`/admin/empresas/${company.id}/entrevistas`}>
                          <Button size="icon" variant="ghost" title="Entrevistas">
                            <Users className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
```
Substitua por:
```tsx
                        <Link href={`/admin/empresas/${company.id}/entrevistas`}>
                          <Button size="icon" variant="ghost" title="Entrevistas">
                            <Users className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/empresas/${company.id}/custos`}>
                          <Button size="icon" variant="ghost" title="Custos e Estrutura">
                            <Wallet className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `empresas/page.tsx`. Nota: o link aponta pra uma rota (`/admin/empresas/[id]/custos`) que só é criada na Task 7 — isso é só um `<Link href>`, não uma importação, então não quebra o build mesmo antes da Task 7 existir (Next.js só resolve a rota em runtime/navegação, não em build-time para links simples).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/empresas/page.tsx"
git commit -m "feat: add Custos e Estrutura button to empresas list"
```

## Context

Task 6 de 10. Não depende de nenhuma task de backend — é só um link novo, mesmo padrão visual dos três já existentes (Priorização/Automações Existentes/Entrevistas).

---

## Task 7: Frontend — tela /admin/empresas/[id]/custos

**Files:**
- Create: `src/app/(private)/admin/empresas/[id]/custos/page.tsx`

- [ ] **Step 1: Criar a página**

Crie `src/app/(private)/admin/empresas/[id]/custos/page.tsx`:
```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { useToast } from "@/src/shared/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Wallet } from "lucide-react";
import { formatCurrency, formatDate } from "@/shared/utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CostItem = RouterOutputs["company"]["listCostItems"][number];

interface Props {
  params: Promise<{ id: string }>;
}

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function CustosEstruturaPage({ params }: Props) {
  const { id: companyId } = use(params);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const { data: items = [], isLoading } = trpc.company.listCostItems.useQuery({ companyId });
  const { data: categories = [] } = trpc.taxonomy.listCostCategories.useQuery();
  const { data: summary } = trpc.company.getCostSummary.useQuery({ companyId });

  const [dialog, setDialog] = useState<{ open: boolean; editing?: CostItem }>({ open: false });
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    type: "recorrente" as "recorrente" | "pontual",
    amountBRL: "",
    startDate: toDateInputValue(new Date()),
    endDate: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id?: string; label?: string }>({
    open: false,
  });

  const invalidateAll = () => {
    utils.company.listCostItems.invalidate({ companyId });
    utils.company.getCostSummary.invalidate({ companyId });
  };

  const createMutation = trpc.company.createCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo criado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMutation = trpc.company.updateCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo atualizado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = trpc.company.deleteCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Item de custo removido" });
    },
  });

  function openNew() {
    setForm({
      name: "",
      categoryId: "",
      type: "recorrente",
      amountBRL: "",
      startDate: toDateInputValue(new Date()),
      endDate: "",
    });
    setDialog({ open: true });
  }
  function openEdit(item: CostItem) {
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      type: item.type as "recorrente" | "pontual",
      amountBRL: String(item.amountBRL),
      startDate: toDateInputValue(item.startDate),
      endDate: toDateInputValue(item.endDate),
    });
    setDialog({ open: true, editing: item });
  }
  function submit() {
    const payload = {
      categoryId: form.categoryId,
      name: form.name,
      type: form.type,
      amountBRL: parseFloat(form.amountBRL) || 0,
      startDate: new Date(form.startDate),
      endDate: form.type === "recorrente" && form.endDate ? new Date(form.endDate) : null,
    };
    if (dialog.editing) {
      updateMutation.mutate({ id: dialog.editing.id, ...payload });
    } else {
      createMutation.mutate({ companyId, ...payload });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos e Estrutura</h1>
          <p className="text-muted-foreground">{company?.name ?? "Carregando..."}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo recorrente mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary?.totalMonthlyRecurring ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo pontual acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary?.totalOneTime ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Itens de custo</CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item de custo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Nenhum item de custo cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category.name}</TableCell>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.amountBRL)}
                      {item.type === "recorrente" ? "/mês" : ""}
                    </TableCell>
                    <TableCell>{formatDate(item.startDate)}</TableCell>
                    <TableCell>{item.endDate ? formatDate(item.endDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm({ open: true, id: item.id, label: item.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editing ? "Editar item de custo" : "Novo item de custo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Analista RPA - João"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as "recorrente" | "pontual" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente (mensal)</SelectItem>
                  <SelectItem value="pontual">Pontual (único)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.type === "recorrente" ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amountBRL}
                onChange={(e) => setForm((f) => ({ ...f, amountBRL: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            {form.type === "recorrente" && (
              <div className="space-y-1.5">
                <Label>Data de fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Vazio = custo em andamento.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={!form.name || !form.categoryId || !form.amountBRL || !form.startDate}
            >
              {dialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm.label}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm.id) deleteMutation.mutate({ id: deleteConfirm.id });
                setDeleteConfirm({ open: false });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `custos/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/custos/page.tsx"
git commit -m "feat: add Custos e Estrutura page for company cost items"
```

## Context

Task 7 de 10 — a maior task deste plano. Depende das Tasks 2 e 3 (usa `taxonomy.listCostCategories` e todos os 5 procedures de `company.*CostItem*`/`getCostSummary`). Segue o mesmo padrão visual/estrutural de `priorizacao/page.tsx` (header com voltar + nome da empresa via `use(params)`) e o mesmo padrão de diálogo CRUD já usado em `categorias/page.tsx`.

`toDateInputValue` é uma cópia local da mesma função já usada em `project-request-edit-form.tsx` (não vale extrair pra um util compartilhado nesta task — são só 2 usos em arquivos não relacionados, YAGNI). O campo "Data de fim" só aparece no formulário quando `type === "recorrente"` — pra item pontual, a data de início já é a única data relevante (reconhecida de uma vez, ver Task 4).

---

## Task 8: Frontend — integrar custo de estrutura na aba Payback

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`

- [ ] **Step 1: Importar `StructureCostItem`**

Encontre:
```tsx
import { computePaybackCurve, findPaybackDate } from "@/shared/lib/payback";
```
Substitua por:
```tsx
import {
  computePaybackCurve,
  computeStructureCostAt,
  findPaybackDate,
  type StructureCostItem,
} from "@/shared/lib/payback";
```

- [ ] **Step 2: Buscar os itens de custo da empresa e mapear pro tipo da lib**

Encontre:
```tsx
  const developerDailyRateBRL = settings?.developerDailyRateBRL ?? 0;

  const paybackCurve = useMemo(
    () => computePaybackCurve(paybackSchedule, developerDailyRateBRL),
    [paybackSchedule, developerDailyRateBRL]
  );
```
Substitua por:
```tsx
  const developerDailyRateBRL = settings?.developerDailyRateBRL ?? 0;

  const { data: costItems = [] } = trpc.company.listCostItems.useQuery({ companyId });

  const structureCosts: StructureCostItem[] = useMemo(
    () =>
      costItems.map((item) => ({
        type: item.type as "recorrente" | "pontual",
        amountBRL: item.amountBRL,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    [costItems]
  );

  const paybackCurve = useMemo(
    () => computePaybackCurve(paybackSchedule, developerDailyRateBRL, structureCosts),
    [paybackSchedule, developerDailyRateBRL, structureCosts]
  );
```

- [ ] **Step 3: Adicionar o total de estrutura na tabela de composição**

Encontre:
```tsx
  const paybackMonths = useMemo(() => {
    if (!paybackDate) return null;
    const days = differenceInCalendarDays(paybackDate, scheduleStartDate);
    return Math.max(0, Math.round(days / 30.44));
  }, [paybackDate, scheduleStartDate]);
```
Substitua por:
```tsx
  const paybackMonths = useMemo(() => {
    if (!paybackDate) return null;
    const days = differenceInCalendarDays(paybackDate, scheduleStartDate);
    return Math.max(0, Math.round(days / 30.44));
  }, [paybackDate, scheduleStartDate]);

  // Total de custo de estrutura já acumulado até hoje (fora da curva
  // projetada) — mostrado como uma linha própria na tabela de composição,
  // separado do custo de dev por robô que já é mostrado linha a linha.
  const structureCostToDate = useMemo(
    () => computeStructureCostAt(structureCosts, new Date()),
    [structureCosts]
  );
```

- [ ] **Step 4: Adicionar a linha "Estrutura" na tabela de composição do cálculo**

Encontre:
```tsx
                  {paybackComposition.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Nenhum robô nas ondas 1/2 ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paybackComposition.map((item) => (
                      <TableRow
                        key={item.projectId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => goToProject(item.projectId)}
                      >
                        <TableCell className="font-medium max-w-[260px] truncate hover:text-primary hover:underline">
                          {item.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">Onda {item.wave}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(item.endDate, "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.businessDays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.developmentCostBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.monthlySavingBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.annualSavingBRL)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
```
Substitua por:
```tsx
                  {paybackComposition.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Nenhum robô nas ondas 1/2 ainda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paybackComposition.map((item) => (
                      <TableRow
                        key={item.projectId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => goToProject(item.projectId)}
                      >
                        <TableCell className="font-medium max-w-[260px] truncate hover:text-primary hover:underline">
                          {item.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">Onda {item.wave}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(item.endDate, "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.businessDays}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.developmentCostBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.monthlySavingBRL)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(item.annualSavingBRL)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {structureCostToDate > 0 && (
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-medium" colSpan={4}>
                        Estrutura (pessoas/licenças) acumulada até hoje
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium" colSpan={3}>
                        {formatCurrency(structureCostToDate)}
                      </TableCell>
                    </TableRow>
                  )}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `priorizacao/page.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx"
git commit -m "feat: include company structure cost in payback tab"
```

## Context

Task 8 de 10. Depende das Tasks 3 e 4. `companyId` já está em escopo no componente (`const { id: companyId } = use(params);`, topo da função). `differenceInCalendarDays`, `format`, `formatCurrency`, `Table*` já estão importados neste arquivo — nenhum import novo além do que o Step 1 já cobre. A linha de "Estrutura" na tabela só aparece se `structureCostToDate > 0` (empresa sem nenhum custo de estrutura ainda não polui a tabela com uma linha de R$ 0,00).

---

## Task 9: Backend — integrar custo de estrutura no deck PPTX

**Files:**
- Modify: `src/server/deck/build-diagnostic-deck.ts`

- [ ] **Step 1: Buscar os itens de custo junto com o resto dos dados da empresa**

Encontre:
```typescript
  const [
    areaSummary,
    rankingEconomia,
    rankingQualitativo,
    rankingCombinado,
    settings,
    interviews,
    projects,
  ] = await Promise.all([
    caller.project.getAreaSummary({ companyId }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "economia" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "qualitativo" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "combinado" }),
    caller.settings.getSettings(),
    caller.interview.list({ companyId }),
```
Substitua por:
```typescript
  const [
    areaSummary,
    rankingEconomia,
    rankingQualitativo,
    rankingCombinado,
    settings,
    interviews,
    projects,
    costItems,
  ] = await Promise.all([
    caller.project.getAreaSummary({ companyId }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "economia" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "qualitativo" }),
    caller.project.getPrioritizedRanking({ companyId, sortBy: "combinado" }),
    caller.settings.getSettings(),
    caller.interview.list({ companyId }),
    caller.company.listCostItems({ companyId }),
```

Encontre (mais abaixo, ainda dentro do mesmo array — é o último item antes do `]`):
```typescript
    db.project.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        architectNotes: true,
        benefits: true,
        processFrequency: true,
        robotSchedule: true,
        peopleInvolved: true,
        taskDurationHours: true,
        currentAnnualHours: true,
        monthlyHoursSaved: true,
        ratingErrorReduction: true,
        ratingProcessCriticality: true,
        ratingInternalImpact: true,
        ratingExternalImpact: true,
        ratingCompliance: true,
      },
    }),
  ]);
```
Substitua por:
```typescript
    db.project.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        architectNotes: true,
        benefits: true,
        processFrequency: true,
        robotSchedule: true,
        peopleInvolved: true,
        taskDurationHours: true,
        currentAnnualHours: true,
        monthlyHoursSaved: true,
        ratingErrorReduction: true,
        ratingProcessCriticality: true,
        ratingInternalImpact: true,
        ratingExternalImpact: true,
        ratingCompliance: true,
      },
    }),
  ]);

  const structureCosts: StructureCostItem[] = costItems.map((item) => ({
    type: item.type as "recorrente" | "pontual",
    amountBRL: item.amountBRL,
    startDate: item.startDate,
    endDate: item.endDate,
  }));
```

- [ ] **Step 2: Passar `structureCosts` pras duas funções de slide de payback**

Encontre:
```typescript
  addPaybackSlide(pres, rankingCombinado, settings);
  addPaybackCompositionSlide(pres, rankingCombinado, settings);
```
Substitua por:
```typescript
  addPaybackSlide(pres, rankingCombinado, settings, structureCosts);
  addPaybackCompositionSlide(pres, rankingCombinado, settings, structureCosts);
```

- [ ] **Step 3: Atualizar a assinatura e o corpo de `addPaybackSlide`**

Encontre:
```typescript
function addPaybackSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null }
): void {
  const slide = addTitledSlide(pres, "Payback / ROI acumulado");
  const { wave1, wave2, startDate } = computeWaveSchedules(ranking, settings.wave1StartDate);

  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );

  const paybackSchedule = [...wave1, ...wave2].map((item) => ({
    projectId: item.projectId,
    startDate: item.startDate,
    endDate: item.endDate,
    estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
  }));

  const dailyRate = settings.developerDailyRateBRL ?? 0;
  const curve = computePaybackCurve(paybackSchedule, dailyRate);
  const paybackDate = findPaybackDate(curve);
```
Substitua por:
```typescript
function addPaybackSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null },
  structureCosts: StructureCostItem[]
): void {
  const slide = addTitledSlide(pres, "Payback / ROI acumulado");
  const { wave1, wave2, startDate } = computeWaveSchedules(ranking, settings.wave1StartDate);

  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );

  const paybackSchedule = [...wave1, ...wave2].map((item) => ({
    projectId: item.projectId,
    startDate: item.startDate,
    endDate: item.endDate,
    estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
  }));

  const dailyRate = settings.developerDailyRateBRL ?? 0;
  const curve = computePaybackCurve(paybackSchedule, dailyRate, structureCosts);
  const paybackDate = findPaybackDate(curve);
```

- [ ] **Step 4: Atualizar a assinatura de `addPaybackCompositionSlide` e adicionar a linha de estrutura na tabela**

Encontre:
```typescript
function addPaybackCompositionSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null }
): void {
  const { wave1, wave2 } = computeWaveSchedules(ranking, settings.wave1StartDate);
  const withWave = [
    ...wave1.map((item) => ({ ...item, wave: 1 as const })),
    ...wave2.map((item) => ({ ...item, wave: 2 as const })),
  ];

  if (withWave.length === 0) return;

  const slide = addTitledSlide(pres, "Composição do payback");
  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );
  const dailyRate = settings.developerDailyRateBRL ?? 0;
```
Substitua por:
```typescript
function addPaybackCompositionSlide(
  pres: PptxGenJS,
  ranking: Ranking,
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null },
  structureCosts: StructureCostItem[]
): void {
  const { wave1, wave2 } = computeWaveSchedules(ranking, settings.wave1StartDate);
  const withWave = [
    ...wave1.map((item) => ({ ...item, wave: 1 as const })),
    ...wave2.map((item) => ({ ...item, wave: 2 as const })),
  ];

  if (withWave.length === 0) return;

  const slide = addTitledSlide(pres, "Composição do payback");
  const savingByProjectId = new Map(
    ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])
  );
  const dailyRate = settings.developerDailyRateBRL ?? 0;
  const structureCostToDate = computeStructureCostAt(structureCosts, new Date());
```

Encontre:
```typescript
  const rows: TableRow[] = withWave.map((item) => {
    const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
    const developmentCostBRL = businessDays * dailyRate;
    const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
    return [
      { text: item.title },
      { text: `Onda ${item.wave}` },
      { text: formatDate(item.endDate) },
      { text: String(businessDays) },
      { text: formatCurrency(developmentCostBRL) },
      { text: formatCurrency(annualSavingBRL / 12) },
      { text: formatCurrency(annualSavingBRL) },
    ];
  });

  addSlideTable(slide, [header, ...rows], [4.1, 1.1, 1.5, 1.1, 1.6, 1.5, 1.4]);
}
```
Substitua por:
```typescript
  const rows: TableRow[] = withWave.map((item) => {
    const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
    const developmentCostBRL = businessDays * dailyRate;
    const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
    return [
      { text: item.title },
      { text: `Onda ${item.wave}` },
      { text: formatDate(item.endDate) },
      { text: String(businessDays) },
      { text: formatCurrency(developmentCostBRL) },
      { text: formatCurrency(annualSavingBRL / 12) },
      { text: formatCurrency(annualSavingBRL) },
    ];
  });

  if (structureCostToDate > 0) {
    rows.push([
      { text: "Estrutura (pessoas/licenças) acumulada até hoje", options: { colspan: 5 } },
      { text: formatCurrency(structureCostToDate) },
      { text: "" },
    ]);
  }

  addSlideTable(slide, [header, ...rows], [4.1, 1.1, 1.5, 1.1, 1.6, 1.5, 1.4]);
}
```

A linha de estrutura usa `colspan: 5` na primeira célula (cobrindo as colunas Processo/Onda/Entrega/Dias úteis/Custo de dev., cujas larguras somadas são `4.1+1.1+1.5+1.1+1.6`), com o valor total na coluna "Economia/mês" (largura `1.5`) e a última célula (`Economia/ano`, largura `1.4`) vazia — soma das larguras bate exatamente com as 7 definidas em `addSlideTable`, então a tabela renderiza sem distorcer as colunas das linhas normais acima.

- [ ] **Step 5: Importar `computeStructureCostAt`/`StructureCostItem` no topo do arquivo**

Encontre:
```typescript
  computePaybackCurve,
  findPaybackDate,
```
Substitua por:
```typescript
  computePaybackCurve,
  computeStructureCostAt,
  findPaybackDate,
  type StructureCostItem,
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `build-diagnostic-deck.ts`. `colspan` é uma opção real e válida em `TableCellOpts` do `pptxgenjs` (confirmado em `node_modules/pptxgenjs/types/index.d.ts`), então o `rows.push(...)` do Step 4 deve type-checkar sem ajuste.

- [ ] **Step 7: Commit**

```bash
git add src/server/deck/build-diagnostic-deck.ts
git commit -m "feat: include company structure cost in exported payback deck slides"
```

## Context

Task 9 de 10. Depende das Tasks 3 e 4. `formatCurrency` já está importado neste arquivo (usado nas outras linhas da mesma tabela).

---

## Task 10: Validação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Type-check completo**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos (os erros pré-existentes em `chart.tsx`/`input-otp.tsx`/`sidebar.tsx`/`toaster.tsx` continuam, não são deste plano).

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Revisão manual da migration**

Releia `prisma/migrations/20260715130000_add_company_cost_structure/migration.sql` (Task 1) de ponta a ponta. Confirme: as duas tabelas são criadas na ordem certa (`company_cost_categories` antes de `company_cost_items`, já que a segunda referencia a primeira); as 4 categorias padrão têm slugs únicos e batem com os nomes (`pessoas`, `licencas`, `infraestrutura`, `outro`); a FK de `companyId` usa `ON DELETE CASCADE` (excluir uma empresa remove seus itens de custo) e a de `categoryId` usa `ON DELETE RESTRICT` (não deixa excluir uma categoria em uso).

- [ ] **Step 4: Revisão manual da integração com payback**

Confirme em `src/shared/lib/payback.ts`: o parâmetro `structureCosts` é opcional com default `[]` em `computePaybackCurve` (retrocompatibilidade); `computeStructureCostAt` é exportada e usada tanto internamente (`computePointAt`) quanto externamente (`priorizacao/page.tsx` e `build-diagnostic-deck.ts`, pra mostrar o total "até hoje" na tabela de composição, fora da curva projetada). Confirme que os dois consumidores (tela e deck) calculam a mesma coisa a partir dos mesmos dados (`company.listCostItems`), pra não divergirem.

- [ ] **Step 5: Não fazer push automaticamente**

Reporte os resultados — o controlador decide quando dar push pra `main`.
