# Categoria de Ferramenta Principal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `MainToolCategory` as an optional parent of `MainTool`, and a new `Project.mainToolCategoryId` field so a project can state just the broad category ("Motor de IA") without being forced into an over-specific product ("Claude").

**Architecture:** New `MainToolCategory` taxonomy (same CRUD pattern as every other taxonomy in this app). `MainTool` gains an optional `categoryId` FK. `Project` gains `mainToolCategoryId` alongside the existing (now-optional-in-spirit) `mainToolId`. A hand-written migration seeds 4 categories and best-effort recategorizes the 6 originally-seeded tools plus any AI-sounding custom tool names, then backfills `Project.mainToolCategoryId` from each project's existing tool. The architecture tab's single "Ferramenta principal" field becomes two: Categoria (the primary field) and Produto (optional refinement, filtered by the chosen category). The one-pager's tool summary/gaps pivot from `mainToolId` to `mainToolCategoryId` so they stay meaningful once most projects only specify a category.

**Tech Stack:** Prisma (PostgreSQL), tRPC v11, Next.js/React, Zod.

**Note on testing:** same as prior plans this session — no automated test runner and no local database in this environment. Verification uses `DATABASE_URL=<dummy> npx prisma validate`/`npx prisma generate` (offline-safe) plus `npx tsc --noEmit`.

---

## File Structure

- **Modify:** `prisma/schema.prisma` — add `model MainToolCategory`, `MainTool.category`/`categoryId`, `Project.mainToolCategory`/`mainToolCategoryId`.
- **Create:** `prisma/migrations/20260722140000_add_main_tool_category/migration.sql`.
- **Modify:** `src/server/trpc/routers/taxonomy.router.ts` — add `MainToolCategory` CRUD; `createMainTool`/`updateMainTool` gain `categoryId`; `listAllMainTools` includes `category`.
- **Modify:** `src/server/trpc/routers/project-import-xml-helpers.ts` — add `findOrCreateMainToolCategory`.
- **Modify:** `src/server/trpc/routers/project.router.ts` — `ARCHITECT_ONLY_FIELDS`, `update`, `byId`, `importXml`, `getToolSummary`, `getExistingAutomationsToolSummary`, `getAreaSummaryGaps`.
- **Modify:** `src/shared/types/index.ts` — `Project.mainToolCategory`/`mainToolCategoryId`.
- **Modify:** `src/app/(private)/admin/configuracoes/categorias/page.tsx` — new "Categorias de Ferramenta" section; "Ferramentas principais" section/dialog gains category.
- **Modify:** `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx` — Categoria + Produto two-step UI.
- **Modify:** `src/shared/components/project-detail-sections.tsx`, `project-request-edit-form.tsx`, `project-executive-slide.tsx` — display category (+ product if set).
- **Modify:** `src/shared/xml/build-projeto-completo-xml.ts`, `src/shared/xml/parse-projeto-completo-xml.ts` — new `<categoriaDaFerramenta>` tag.

`src/shared/components/project-xml-import-export.tsx` needs **no change** — it spreads `parsed.data` generically into the `importXml` mutation call (same reasoning already verified for the urgency-levels plan earlier this session).

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722140000_add_main_tool_category/migration.sql`

- [ ] **Step 1: Add `MainToolCategory` and wire it into `MainTool`**

Find:
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
```

Replace with:
```prisma
model MainToolCategory {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  isActive  Boolean    @default(true)
  order     Int        @default(0)
  tools     MainTool[]
  projects  Project[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@map("main_tool_categories")
}

model MainTool {
  id         String            @id @default(cuid())
  name       String
  slug       String            @unique
  isActive   Boolean           @default(true)
  order      Int               @default(0)
  projects   Project[]
  category   MainToolCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId String?
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  @@map("main_tools")
}
```

- [ ] **Step 2: Add `Project.mainToolCategoryId`**

Find:
```prisma
  mainTool         MainTool?                 @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId       String?
  solutionTypes    ProjectKind[]             @relation("ProjectSolutionTypes")
```

Replace with:
```prisma
  mainTool           MainTool?               @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId         String?
  mainToolCategory   MainToolCategory?       @relation(fields: [mainToolCategoryId], references: [id], onDelete: SetNull)
  mainToolCategoryId String?
  solutionTypes      ProjectKind[]           @relation("ProjectSolutionTypes")
```

- [ ] **Step 3: Validate**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20260722140000_add_main_tool_category/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "main_tool_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_tool_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_tool_categories_slug_key" ON "main_tool_categories"("slug");

-- Seed: 4 categorias iniciais
INSERT INTO "main_tool_categories" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-main-tool-category-rpa', 'RPA', 'rpa', 0, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-motor-ia', 'Motor de IA', 'motor-de-ia', 1, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-linguagem', 'Linguagem de Programação', 'linguagem-de-programacao', 2, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-lowcode', 'Plataforma Low-Code', 'plataforma-low-code', 3, CURRENT_TIMESTAMP);

-- AlterTable: categoria opcional em main_tools
ALTER TABLE "main_tools" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "main_tools" ADD CONSTRAINT "main_tools_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "main_tool_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recategoriza as 6 ferramentas semeadas originalmente em
-- 20260715120000_add_main_tool_taxonomy — "outro" fica sem categoria de propósito.
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-linguagem' WHERE "slug" = 'python';
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-rpa' WHERE "slug" IN ('rocketbot', 'automation-anywhere', 'power-automate');
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-lowcode' WHERE "slug" = 'power-apps';

-- Best-effort: ferramentas adicionadas manualmente depois que pareçam motores de
-- IA (ex.: "Claude", citado pelo usuário) — qualquer coisa que não bater fica
-- sem categoria, ajustável depois em Configurações → Categorias.
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-motor-ia'
WHERE "categoryId" IS NULL
  AND (
    "name" ILIKE '%claude%' OR "name" ILIKE '%gpt%' OR "name" ILIKE '%openai%'
    OR "name" ILIKE '%gemini%' OR "name" ILIKE '%llama%'
  );

-- AlterTable: categoria escolhida no projeto (novo campo "principal")
ALTER TABLE "projects" ADD COLUMN "mainToolCategoryId" TEXT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_mainToolCategoryId_fkey" FOREIGN KEY ("mainToolCategoryId") REFERENCES "main_tool_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: projeto que já tem uma ferramenta específica herda a categoria dela,
-- se ela tiver uma após os passos acima.
UPDATE "projects" p
SET "mainToolCategoryId" = mt."categoryId"
FROM "main_tools" mt
WHERE p."mainToolId" = mt."id" AND mt."categoryId" IS NOT NULL;
```

- [ ] **Step 5: Regenerate the Prisma client**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260722140000_add_main_tool_category"
git commit -m "feat: add MainToolCategory as an optional parent of MainTool"
```

---

### Task 2: Backend — taxonomy CRUD

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`

- [ ] **Step 1: `listAllMainTools` includes the category, so the admin list can show it**

Find:
```typescript
  listAllMainTools: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      orderBy: { order: "asc" },
    });
  }),
```

Replace with:
```typescript
  listAllMainTools: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { order: "asc" },
    });
  }),
```

- [ ] **Step 2: `createMainTool`/`updateMainTool` accept an optional `categoryId`**

Find:
```typescript
  createMainTool: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.mainTool.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma ferramenta com este slug" });
      return ctx.db.mainTool.create({ data: input });
    }),

  updateMainTool: adminProcedure
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
      return ctx.db.mainTool.update({ where: { id }, data });
    }),
```

Replace with:
```typescript
  createMainTool: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
        categoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.mainTool.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma ferramenta com este slug" });
      return ctx.db.mainTool.create({ data: input });
    }),

  updateMainTool: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
        categoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.mainTool.update({ where: { id }, data });
    }),
```

- [ ] **Step 3: Add the `MainToolCategory` CRUD block**

Find the exact end of the file:
```typescript
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // NIVEL DE URGENCIA
  // ==========================================
```

Replace with:
```typescript
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // CATEGORIA DE FERRAMENTA
  // ==========================================

  listMainToolCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.mainToolCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllMainToolCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainToolCategory.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createMainToolCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.mainToolCategory.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria de ferramenta com este slug" });
      return ctx.db.mainToolCategory.create({ data: input });
    }),

  updateMainToolCategory: adminProcedure
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
      return ctx.db.mainToolCategory.update({ where: { id }, data });
    }),

  deleteMainToolCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainToolCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // NIVEL DE URGENCIA
  // ==========================================
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `taxonomy.router.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts
git commit -m "feat: add MainToolCategory CRUD and categoryId on MainTool mutations"
```

---

### Task 3: Backend — `findOrCreateMainToolCategory`

**Files:**
- Modify: `src/server/trpc/routers/project-import-xml-helpers.ts`

- [ ] **Step 1: Add the helper**

Find (end of file):
```typescript
export async function findOrCreateProjectKind(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectKind.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectKind.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Tipo de projeto "${trimmed}" não encontrado e o slug gerado já está em uso — tipo não alterado.`
    );
    return undefined;
  }
  const created = await db.projectKind.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Tipo de projeto "${trimmed}" não existia e foi criado.`);
  return created;
}
```

Replace with:
```typescript
export async function findOrCreateProjectKind(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectKind.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectKind.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Tipo de projeto "${trimmed}" não encontrado e o slug gerado já está em uso — tipo não alterado.`
    );
    return undefined;
  }
  const created = await db.projectKind.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Tipo de projeto "${trimmed}" não existia e foi criado.`);
  return created;
}

export async function findOrCreateMainToolCategory(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.mainToolCategory.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.mainToolCategory.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Categoria de ferramenta "${trimmed}" não encontrada e o slug gerado já está em uso — categoria não alterada.`
    );
    return undefined;
  }
  const created = await db.mainToolCategory.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Categoria de ferramenta "${trimmed}" não existia e foi criada.`);
  return created;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about this file.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project-import-xml-helpers.ts
git commit -m "feat: add findOrCreateMainToolCategory XML-import helper"
```

---

### Task 4: Backend — `project.router.ts` read/write surfaces

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:66-68` (ARCHITECT_ONLY_FIELDS), `:518` (update input), `:608` (update data), `:262,324-325` (byId)

- [ ] **Step 1: `ARCHITECT_ONLY_FIELDS`**

Find:
```typescript
  "solutionTypeIds",
  "mainToolId",
  "executionStrategy",
```

Replace with:
```typescript
  "solutionTypeIds",
  "mainToolId",
  "mainToolCategoryId",
  "executionStrategy",
```

- [ ] **Step 2: `update` input schema**

Find:
```typescript
        solutionTypeIds: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

Replace with:
```typescript
        solutionTypeIds: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        mainToolCategoryId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

- [ ] **Step 3: `update` data assembly**

Find:
```typescript
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

Replace with:
```typescript
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.mainToolCategoryId !== undefined) data.mainToolCategoryId = rest.mainToolCategoryId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

- [ ] **Step 4: `byId` include**

Find:
```typescript
          mainTool: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          tasks: true,
```

Replace with:
```typescript
          mainTool: { select: { id: true, name: true, slug: true } },
          mainToolCategory: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          tasks: true,
```

- [ ] **Step 5: `byId` mapping**

Find:
```typescript
        solutionTypes: project.solutionTypes,
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```

Replace with:
```typescript
        solutionTypes: project.solutionTypes,
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        mainToolCategory: project.mainToolCategory ?? undefined,
        mainToolCategoryId: project.mainToolCategoryId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `project.router.ts` itself (errors will appear in frontend consumers until later tasks — that's expected).

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: project update/byId read and write mainToolCategoryId"
```

---

### Task 5: Backend — `importXml`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:1263` (input), `:1364-1367` (resolution)

- [ ] **Step 1: Import the new helper**

Find:
```typescript
import {
  findOrCreateProjectArea,
  findOrCreateProjectTheme,
  findOrCreateMainTool,
  findOrCreateProjectKind,
} from "./project-import-xml-helpers";
```

Replace with:
```typescript
import {
  findOrCreateProjectArea,
  findOrCreateProjectTheme,
  findOrCreateMainTool,
  findOrCreateMainToolCategory,
  findOrCreateProjectKind,
} from "./project-import-xml-helpers";
```

- [ ] **Step 2: Input schema**

Find:
```typescript
        mainToolName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
```

Replace with:
```typescript
        mainToolName: z.string().optional(),
        mainToolCategoryName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
```

- [ ] **Step 3: Resolve it**

Find:
```typescript
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
```

Replace with:
```typescript
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
      if (input.mainToolCategoryName !== undefined) {
        const category = await findOrCreateMainToolCategory(ctx.db, input.mainToolCategoryName, warnings);
        if (category) data.mainToolCategoryId = category.id;
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `project.router.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: importXml resolves mainToolCategoryName"
```

---

### Task 6: Backend — one-pager tool summary pivots to category

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts` (`getToolSummary`, `getExistingAutomationsToolSummary`, `getAreaSummaryGaps`)

- [ ] **Step 1: `getToolSummary` groups by category**

Find:
```typescript
  // Agregação de projetos por ferramenta principal (contagem), mesmo padrão de
  // getAreaSummary mas agrupado por mainToolId — usado pela aba "Resumo
  // Executivo" da Priorização. adminProcedure pelo mesmo motivo de segurança
  // (contagem por ferramenta é dado interno do diagnóstico).
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

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
```

Replace with:
```typescript
  // Agregação de projetos por categoria de ferramenta (contagem), mesmo
  // padrão de getAreaSummary mas agrupado por mainToolCategoryId — usado pela
  // aba "Resumo Executivo" da Priorização. adminProcedure pelo mesmo motivo
  // de segurança (contagem por ferramenta é dado interno do diagnóstico).
  // Agrupa por CATEGORIA, não pelo produto específico (mainToolId), porque a
  // categoria é o campo "principal" agora — muitos projetos vão ter só ela
  // preenchida, sem produto específico.
  getToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolCategoryId"],
        _count: true,
        where: {
          mainToolCategoryId: { not: null },
          hasCurrentApplication: { not: "sim" },
          status: { notIn: ["DONE", "CANCELLED"] },
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const categoryIds = grouped
        .map((g) => g.mainToolCategoryId)
        .filter((id): id is string => id != null);

      const categories = await ctx.db.mainToolCategory.findMany({
        where: { id: { in: categoryIds } },
      });
      const categoryById = new Map(categories.map((c) => [c.id, c]));

      return grouped
        .filter((g) => g.mainToolCategoryId != null && categoryById.has(g.mainToolCategoryId))
        .map((g) => {
          const category = categoryById.get(g.mainToolCategoryId as string)!;
          return {
            toolId: category.id,
            toolName: category.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
```

- [ ] **Step 2: `getExistingAutomationsToolSummary` groups by category**

Find:
```typescript
  // Resumo por ferramenta das automações já existentes/entregues — mesmo
  // padrão de getToolSummary, com o filtro invertido (igual
  // getExistingAutomationsAreaSummary faz para área).
  getExistingAutomationsToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolId"],
        _count: true,
        where: {
          mainToolId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const toolIds = grouped
        .map((g) => g.mainToolId)
        .filter((id): id is string => id != null);

      const tools = await ctx.db.mainTool.findMany({
        where: { id: { in: toolIds } },
      });
      const toolById = new Map(tools.map((t) => [t.id, t]));

      return grouped
        .filter((g) => g.mainToolId != null && toolById.has(g.mainToolId))
        .map((g) => {
          const tool = toolById.get(g.mainToolId as string)!;
          return {
            toolId: tool.id,
            toolName: tool.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
```

Replace with:
```typescript
  // Resumo por categoria de ferramenta das automações já existentes/entregues
  // — mesmo padrão de getToolSummary, com o filtro invertido (igual
  // getExistingAutomationsAreaSummary faz para área).
  getExistingAutomationsToolSummary: adminProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.db.project.groupBy({
        by: ["mainToolCategoryId"],
        _count: true,
        where: {
          mainToolCategoryId: { not: null },
          OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
          ...(input.companyId ? { companyId: input.companyId } : {}),
        },
      });

      const categoryIds = grouped
        .map((g) => g.mainToolCategoryId)
        .filter((id): id is string => id != null);

      const categories = await ctx.db.mainToolCategory.findMany({
        where: { id: { in: categoryIds } },
      });
      const categoryById = new Map(categories.map((c) => [c.id, c]));

      return grouped
        .filter((g) => g.mainToolCategoryId != null && categoryById.has(g.mainToolCategoryId))
        .map((g) => {
          const category = categoryById.get(g.mainToolCategoryId as string)!;
          return {
            toolId: category.id,
            toolName: category.name,
            projectCount: g._count,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount);
    }),
```

- [ ] **Step 3: `getAreaSummaryGaps` checks category instead of product**

Find:
```typescript
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

Replace with:
```typescript
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolCategoryId: null,
              hasCurrentApplication: { not: "sim" },
              status: { notIn: ["DONE", "CANCELLED"] },
            },
          }),
          ctx.db.project.count({
            where: {
              companyId: input.companyId,
              mainToolCategoryId: null,
              OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }],
            },
          }),
        ]);
      return { pipelineWithoutArea, deliveredWithoutArea, pipelineWithoutTool, deliveredWithoutTool };
    }),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `project.router.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: one-pager tool summary and gaps pivot to mainToolCategoryId"
```

---

### Task 7: `shared/types/index.ts`

**Files:**
- Modify: `src/shared/types/index.ts:88-89`

- [ ] **Step 1: Add the fields**

Find:
```typescript
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
```

Replace with:
```typescript
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
  mainToolCategory?: { id: string; name: string; slug: string };
  mainToolCategoryId?: string;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors here — this only widens the type, doesn't break anything (unlike the earlier solution-type change, this is additive, not a shape change).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add mainToolCategory fields to the Project type"
```

---

### Task 8: Configurações → Categorias

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Add the type alias and icon import**

Find:
```tsx
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
type UrgencyLevelItem = RouterOutputs["taxonomy"]["listAllUrgencyLevels"][number];
```

Replace with:
```tsx
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
type UrgencyLevelItem = RouterOutputs["taxonomy"]["listAllUrgencyLevels"][number];
type MainToolCategoryItem = RouterOutputs["taxonomy"]["listAllMainToolCategories"][number];
```

Find:
```tsx
  Wallet,
  Flame,
} from "lucide-react";
```

Replace with:
```tsx
  Wallet,
  Flame,
  Boxes,
} from "lucide-react";
```

- [ ] **Step 2: Add a `NO_CATEGORY_VALUE` sentinel near the top of the file**

Find:
```tsx
function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
```

Replace with:
```tsx
function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const NO_CATEGORY_VALUE = "__none__";
```

- [ ] **Step 3: Add the "Categorias de Ferramenta" state/mutations block, right before "Ferramentas principais"**

Find:
```tsx
  // — FERRAMENTAS PRINCIPAIS —
  const { data: mainTools = [] } = trpc.taxonomy.listAllMainTools.useQuery();
```

Replace with:
```tsx
  // — CATEGORIAS DE FERRAMENTA —
  const { data: mainToolCategories = [] } = trpc.taxonomy.listAllMainToolCategories.useQuery();
  const [mainToolCategoryDialog, setMainToolCategoryDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [mainToolCategoryForm, setMainToolCategoryForm] = useState({ name: "", slug: "", order: 0 });

  const createMainToolCategory = trpc.taxonomy.createMainToolCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainToolCategories.invalidate(); setMainToolCategoryDialog({ open: false }); toast({ title: "Categoria de ferramenta criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMainToolCategory = trpc.taxonomy.updateMainToolCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainToolCategories.invalidate(); setMainToolCategoryDialog({ open: false }); toast({ title: "Categoria de ferramenta atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMainToolCategory = trpc.taxonomy.deleteMainToolCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainToolCategories.invalidate(); toast({ title: "Categoria de ferramenta removida" }); },
  });
  const toggleMainToolCategory = trpc.taxonomy.updateMainToolCategory.useMutation({
    onSuccess: () => utils.taxonomy.listAllMainToolCategories.invalidate(),
  });

  function openNewMainToolCategory() {
    setMainToolCategoryForm({ name: "", slug: "", order: mainToolCategories.length });
    setMainToolCategoryDialog({ open: true });
  }
  function openEditMainToolCategory(cat: { id: string; name: string; slug: string; order: number }) {
    setMainToolCategoryForm({ name: cat.name, slug: cat.slug, order: cat.order });
    setMainToolCategoryDialog({ open: true, editing: cat });
  }
  function submitMainToolCategory() {
    if (mainToolCategoryDialog.editing) {
      updateMainToolCategory.mutate({ id: mainToolCategoryDialog.editing.id, name: mainToolCategoryForm.name, order: mainToolCategoryForm.order });
    } else {
      createMainToolCategory.mutate({ name: mainToolCategoryForm.name, slug: mainToolCategoryForm.slug, order: mainToolCategoryForm.order });
    }
  }

  // — FERRAMENTAS PRINCIPAIS —
  const { data: mainTools = [] } = trpc.taxonomy.listAllMainTools.useQuery();
```

- [ ] **Step 4: `mainToolForm` gains `categoryId`, threaded through open/submit**

Find:
```tsx
  const [mainToolDialog, setMainToolDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [mainToolForm, setMainToolForm] = useState({ name: "", slug: "", order: 0 });
```

Replace with:
```tsx
  const [mainToolDialog, setMainToolDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number; categoryId: string | null } }>({ open: false });
  const [mainToolForm, setMainToolForm] = useState({ name: "", slug: "", order: 0, categoryId: "" });
```

Find:
```tsx
  function openNewMainTool() {
    setMainToolForm({ name: "", slug: "", order: mainTools.length });
    setMainToolDialog({ open: true });
  }
  function openEditMainTool(tool: { id: string; name: string; slug: string; order: number }) {
    setMainToolForm({ name: tool.name, slug: tool.slug, order: tool.order });
    setMainToolDialog({ open: true, editing: tool });
  }
  function submitMainTool() {
    if (mainToolDialog.editing) {
      updateMainTool.mutate({ id: mainToolDialog.editing.id, name: mainToolForm.name, order: mainToolForm.order });
    } else {
      createMainTool.mutate({ name: mainToolForm.name, slug: mainToolForm.slug, order: mainToolForm.order });
    }
  }
```

Replace with:
```tsx
  function openNewMainTool() {
    setMainToolForm({ name: "", slug: "", order: mainTools.length, categoryId: "" });
    setMainToolDialog({ open: true });
  }
  function openEditMainTool(tool: { id: string; name: string; slug: string; order: number; categoryId: string | null }) {
    setMainToolForm({ name: tool.name, slug: tool.slug, order: tool.order, categoryId: tool.categoryId ?? "" });
    setMainToolDialog({ open: true, editing: tool });
  }
  function submitMainTool() {
    if (mainToolDialog.editing) {
      updateMainTool.mutate({
        id: mainToolDialog.editing.id,
        name: mainToolForm.name,
        order: mainToolForm.order,
        categoryId: mainToolForm.categoryId || null,
      });
    } else {
      createMainTool.mutate({
        name: mainToolForm.name,
        slug: mainToolForm.slug,
        order: mainToolForm.order,
        categoryId: mainToolForm.categoryId || null,
      });
    }
  }
```

- [ ] **Step 5: `deleteConfirm` type gains `"mainToolCategory"`**

Find:
```tsx
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool" | "projectKind" | "costCategory" | "urgencyLevel"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "projectKind") deleteProjectKind.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "costCategory") deleteCostCategory.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "urgencyLevel") deleteUrgencyLevel.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```

Replace with:
```tsx
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool" | "mainToolCategory" | "projectKind" | "costCategory" | "urgencyLevel"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainToolCategory") deleteMainToolCategory.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "projectKind") deleteProjectKind.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "costCategory") deleteCostCategory.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "urgencyLevel") deleteUrgencyLevel.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```

- [ ] **Step 6: Add the "Categorias de Ferramenta" section JSX, right before "Ferramentas principais"**

Find:
```tsx
      {/* Ferramentas principais */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ferramentas principais</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Ferramenta principal&quot; na tela de arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewMainTool}>
            <Plus className="mr-2 h-4 w-4" />
            Nova ferramenta
          </Button>
        </div>
        {mainTools.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Wrench className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma ferramenta cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {mainTools.map((tool: MainToolItem) => (
                <div
                  key={tool.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!tool.isActive ? "opacity-50" : ""}`}
                >
                  <span>{tool.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{tool.slug}</Badge>
```

Replace with:
```tsx
      {/* Categorias de ferramenta */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Categorias de Ferramenta</h2>
            <p className="text-sm text-muted-foreground">
              Agrupam as ferramentas principais (ex.: "Motor de IA" agrupa Claude, GPT...).
              Escolher só a categoria já é suficiente na tela de Arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewMainToolCategory}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </Button>
        </div>
        {mainToolCategories.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Boxes className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma categoria de ferramenta cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {mainToolCategories.map((cat: MainToolCategoryItem) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!cat.isActive ? "opacity-50" : ""}`}
                >
                  <span>{cat.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{cat.slug}</Badge>
                  <Switch
                    checked={cat.isActive}
                    onCheckedChange={(v) => toggleMainToolCategory.mutate({ id: cat.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditMainToolCategory(cat)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "mainToolCategory", id: cat.id, label: cat.name })}
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

      {/* Ferramentas principais */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ferramentas principais</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Ferramenta principal&quot; na tela de arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewMainTool}>
            <Plus className="mr-2 h-4 w-4" />
            Nova ferramenta
          </Button>
        </div>
        {mainTools.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Wrench className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma ferramenta cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {mainTools.map((tool: MainToolItem) => (
                <div
                  key={tool.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!tool.isActive ? "opacity-50" : ""}`}
                >
                  <span>{tool.name}</span>
                  {tool.category && (
                    <Badge variant="outline" className="text-[10px]">{tool.category.name}</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">{tool.slug}</Badge>
```

- [ ] **Step 7: Add the category picker to the "Ferramenta principal" dialog**

Find:
```tsx
            {!mainToolDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={mainToolForm.slug}
                  onChange={(e) => setMainToolForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: uipath"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={mainToolForm.order}
                onChange={(e) => setMainToolForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMainToolDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitMainTool} disabled={!mainToolForm.name || (!mainToolDialog.editing && !mainToolForm.slug)}>
              {mainToolDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tipo de Projeto */}
```

Replace with:
```tsx
            {!mainToolDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={mainToolForm.slug}
                  onChange={(e) => setMainToolForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: uipath"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={mainToolForm.categoryId || NO_CATEGORY_VALUE}
                onValueChange={(v) =>
                  setMainToolForm((f) => ({ ...f, categoryId: v === NO_CATEGORY_VALUE ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY_VALUE}>Sem categoria</SelectItem>
                  {mainToolCategories.map((cat: MainToolCategoryItem) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={mainToolForm.order}
                onChange={(e) => setMainToolForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMainToolDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitMainTool} disabled={!mainToolForm.name || (!mainToolDialog.editing && !mainToolForm.slug)}>
              {mainToolDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Categoria de Ferramenta */}
      <Dialog open={mainToolCategoryDialog.open} onOpenChange={(o) => setMainToolCategoryDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mainToolCategoryDialog.editing ? "Editar categoria de ferramenta" : "Nova categoria de ferramenta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={mainToolCategoryForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setMainToolCategoryForm((f) => ({
                    ...f,
                    name,
                    slug: mainToolCategoryDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Motor de IA"
              />
            </div>
            {!mainToolCategoryDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={mainToolCategoryForm.slug}
                  onChange={(e) => setMainToolCategoryForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: motor-de-ia"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={mainToolCategoryForm.order}
                onChange={(e) => setMainToolCategoryForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMainToolCategoryDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitMainToolCategory} disabled={!mainToolCategoryForm.name || (!mainToolCategoryDialog.editing && !mainToolCategoryForm.slug)}>
              {mainToolCategoryDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tipo de Projeto */}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about this file.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: manage tool categories and assign them to tools in Categorias"
```

---

### Task 9: Architecture tab — Categoria + Produto

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Query categories and build their options (with fallback for the current value)**

Find:
```tsx
  const { data: mainTools = [] } = trpc.taxonomy.listMainTools.useQuery();
  const mainToolOptions = useMemo(() => {
    const opts = mainTools.map((t) => ({ value: t.id, label: t.name }));
    if (project?.mainTool && !opts.some((o) => o.value === project.mainTool!.id)) {
      opts.push({ value: project.mainTool.id, label: project.mainTool.name });
    }
    return opts;
  }, [mainTools, project?.mainTool]);
  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainTools.invalidate();
      setMainToolId(created.id);
      toast.success(`Ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar ferramenta", { description: err.message }),
  });
```

Replace with:
```tsx
  const { data: mainToolCategories = [] } = trpc.taxonomy.listMainToolCategories.useQuery();
  const mainToolCategoryOptions = useMemo(() => {
    const opts = mainToolCategories.map((c) => ({ value: c.id, label: c.name }));
    if (
      project?.mainToolCategory &&
      !opts.some((o) => o.value === project.mainToolCategory!.id)
    ) {
      opts.push({ value: project.mainToolCategory.id, label: project.mainToolCategory.name });
    }
    return opts;
  }, [mainToolCategories, project?.mainToolCategory]);
  const createMainToolCategory = trpc.taxonomy.createMainToolCategory.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainToolCategories.invalidate();
      setMainToolCategoryId(created.id);
      toast.success(`Categoria de ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar categoria de ferramenta", { description: err.message }),
  });

  const { data: mainTools = [] } = trpc.taxonomy.listMainTools.useQuery();
  const mainToolOptions = useMemo(() => {
    const filtered = mainTools.filter(
      (t) => !mainToolCategoryId || t.categoryId === mainToolCategoryId
    );
    const opts = filtered.map((t) => ({ value: t.id, label: t.name }));
    if (project?.mainTool && !opts.some((o) => o.value === project.mainTool!.id)) {
      opts.push({ value: project.mainTool.id, label: project.mainTool.name });
    }
    return opts;
  }, [mainTools, mainToolCategoryId, project?.mainTool]);
  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainTools.invalidate();
      setMainToolId(created.id);
      toast.success(`Ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar ferramenta", { description: err.message }),
  });
```

- [ ] **Step 2: Add `mainToolCategoryId` state**

Find:
```tsx
  const [solutionTypeIds, setSolutionTypeIds] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

Replace with:
```tsx
  const [solutionTypeIds, setSolutionTypeIds] = useState<string[]>([]);
  const [mainToolCategoryId, setMainToolCategoryId] = useState<string>("");
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

- [ ] **Step 3: Seed it from `project` in the `useEffect`**

Find:
```tsx
      setSolutionTypeIds((project.solutionTypes ?? []).map((k) => k.id));
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

Replace with:
```tsx
      setSolutionTypeIds((project.solutionTypes ?? []).map((k) => k.id));
      setMainToolCategoryId(project.mainToolCategory?.id ?? "");
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

- [ ] **Step 4: Send it on save**

Find:
```tsx
    updateProject.mutate({
      id: projectId,
      solutionTypeIds,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
```

Replace with:
```tsx
    updateProject.mutate({
      id: projectId,
      solutionTypeIds,
      mainToolCategoryId: mainToolCategoryId || null,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
```

- [ ] **Step 5: Split the "Ferramenta principal" field into Categoria + Produto**

Find:
```tsx
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ferramenta principal</Label>
              <CreatableCombobox
                options={mainToolOptions}
                value={mainToolId}
                onChange={setMainToolId}
                onCreate={(label) =>
                  createMainTool.mutate({
                    name: label,
                    slug: slugify(label),
                    order: mainTools.length,
                  })
                }
                placeholder="Selecione ou crie"
                disabled={createMainTool.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Estratégia de execução</Label>
```

Replace with:
```tsx
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Categoria de ferramenta</Label>
              <p className="text-xs text-muted-foreground">
                Ex.: "Motor de IA" — já basta escolher a categoria.
              </p>
              <CreatableCombobox
                options={mainToolCategoryOptions}
                value={mainToolCategoryId}
                onChange={(v) => {
                  setMainToolCategoryId(v);
                  const stillValid = mainTools.some(
                    (t) => t.id === mainToolId && t.categoryId === v
                  );
                  if (mainToolId && !stillValid) setMainToolId("");
                }}
                onCreate={(label) =>
                  createMainToolCategory.mutate({
                    name: label,
                    slug: slugify(label),
                    order: mainToolCategories.length,
                  })
                }
                placeholder="Selecione ou crie"
                disabled={createMainToolCategory.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Produto (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Ex.: "Claude" dentro de Motor de IA — só se souber o produto exato.
              </p>
              <CreatableCombobox
                options={mainToolOptions}
                value={mainToolId}
                onChange={setMainToolId}
                onCreate={(label) =>
                  createMainTool.mutate({
                    name: label,
                    slug: slugify(label),
                    order: mainTools.length,
                    categoryId: mainToolCategoryId || null,
                  })
                }
                placeholder="Selecione ou crie (opcional)"
                disabled={createMainTool.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Estratégia de execução</Label>
```

- [ ] **Step 6: Include the new mutation in the save button's `disabled` check**

Find:
```tsx
            <Button
              onClick={handleSaveArchitecture}
              disabled={updateProject.isPending || createMainTool.isPending}
            >
```

Replace with:
```tsx
            <Button
              onClick={handleSaveArchitecture}
              disabled={
                updateProject.isPending || createMainTool.isPending || createMainToolCategory.isPending
              }
            >
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about this file.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: architecture tab splits ferramenta into categoria + produto opcional"
```

---

### Task 10: Read-only display (3 files)

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx:173`
- Modify: `src/shared/components/project-request-edit-form.tsx:555`
- Modify: `src/shared/components/project-executive-slide.tsx:336-352`

- [ ] **Step 1: `project-detail-sections.tsx`**

Find:
```tsx
          <FieldRow label="Ferramenta principal" value={project.mainTool?.name} />
```

Replace with:
```tsx
          <FieldRow
            label="Ferramenta principal"
            value={
              [project.mainToolCategory?.name, project.mainTool?.name].filter(Boolean).join(" — ") ||
              undefined
            }
          />
```

- [ ] **Step 2: `project-request-edit-form.tsx`**

Find:
```tsx
          <FieldRow label="Ferramenta principal" value={project.mainTool?.name} />
```

Replace with:
```tsx
          <FieldRow
            label="Ferramenta principal"
            value={
              [project.mainToolCategory?.name, project.mainTool?.name].filter(Boolean).join(" — ") ||
              undefined
            }
          />
```

- [ ] **Step 3: `project-executive-slide.tsx` — pill badge**

Find:
```tsx
            {((project.solutionTypes && project.solutionTypes.length > 0) || project.mainTool) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.solutionTypes?.map((k) => (
                  <span
                    key={k.id}
                    className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"
                  >
                    {k.name}
                  </span>
                ))}
                {project.mainTool && (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {project.mainTool.name}
                  </span>
                )}
              </div>
            )}
```

Replace with:
```tsx
            {((project.solutionTypes && project.solutionTypes.length > 0) ||
              project.mainToolCategory) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.solutionTypes?.map((k) => (
                  <span
                    key={k.id}
                    className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700"
                  >
                    {k.name}
                  </span>
                ))}
                {project.mainToolCategory && (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                    {project.mainTool
                      ? `${project.mainToolCategory.name} — ${project.mainTool.name}`
                      : project.mainToolCategory.name}
                  </span>
                )}
              </div>
            )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about these 3 files.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx src/shared/components/project-request-edit-form.tsx src/shared/components/project-executive-slide.tsx
git commit -m "feat: display tool category alongside the specific product"
```

---

### Task 11: XML "projeto completo" round-trip

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts:90`
- Modify: `src/shared/xml/parse-projeto-completo-xml.ts:40,216`

- [ ] **Step 1: `build-projeto-completo-xml.ts` — add the category tag**

Find:
```typescript
  lines.push(tag("informacoesAdicionais", project.additionalInfo));
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
```

Replace with:
```typescript
  lines.push(tag("informacoesAdicionais", project.additionalInfo));
  lines.push(tag("categoriaDaFerramenta", project.mainToolCategory?.name));
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
```

- [ ] **Step 2: `parse-projeto-completo-xml.ts` — add the field to the parsed-data type**

Find:
```typescript
  mainToolName?: string;
  peopleOfInterestNames?: string[];
```

Replace with:
```typescript
  mainToolName?: string;
  mainToolCategoryName?: string;
  peopleOfInterestNames?: string[];
```

- [ ] **Step 3: `parse-projeto-completo-xml.ts` — read the tag**

Find:
```typescript
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
```

Replace with:
```typescript
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.mainToolCategoryName = getDirectChildText(root, "categoriaDaFerramenta");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about either file.

- [ ] **Step 5: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts src/shared/xml/parse-projeto-completo-xml.ts
git commit -m "feat: projeto-completo XML round-trips the tool category"
```

---

### Task 12: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: identical baseline to before this plan started (only `src/shared/components/ui/chart.tsx`, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx`) — zero errors related to any file touched in this plan.

- [ ] **Step 2: Confirm no stray references remain**

Run: `grep -rn "mainToolId: null" src --include=*.ts`
Expected: zero matches (both `getAreaSummaryGaps` occurrences were switched to `mainToolCategoryId: null` in Task 6).

- [ ] **Step 3: Schema check**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: schema valid.

- [ ] **Step 4: Manual QA once deployed**

No local DB/dev server in this environment — verify after deploy:
- Configurações → Categorias: "Categorias de Ferramenta" shows RPA/Motor de IA/Linguagem de Programação/Plataforma Low-Code; "Ferramentas principais" shows each tool's category badge (Python→Linguagem de Programação, Rocketbot/Automation Anywhere/Power Automate→RPA, Power Apps→Plataforma Low-Code, and — if a "Claude"-like tool exists — Motor de IA); tools that didn't match anything show no category badge, confirming they need manual assignment.
- Aba Arquitetura de um projeto: escolher só a Categoria salva e aparece corretamente; escolher Categoria + Produto também funciona; trocar a Categoria depois de já ter um Produto selecionado limpa o Produto se ele não pertencer à nova categoria; criar uma categoria ou produto novo inline funciona e aparece na lista.
- Detalhe do projeto / formulário de edição mostram "Categoria — Produto" (ou só a categoria, sem produto).
- Slide executivo mostra o pill combinado.
- Resumo Executivo (One Pager) da Priorização: "Resumo por ferramenta" agora mostra as categorias, incluindo projetos que só têm a categoria preenchida (sem produto).
- Exportar/reimportar o XML "projeto completo" de um projeto com categoria+produto preserva os dois.

---

## Self-Review Notes

- **Spec coverage:** `MainToolCategory` taxonomy with full CRUD (✅ Task 2, 8), `MainTool.categoryId` optional (✅ Task 1, 2, 8), `Project.mainToolCategoryId` as the new "principal" field alongside the existing optional `mainToolId` (✅ Task 1, 4, 9), migration recategorizes the 6 seeded tools + best-effort AI-name matching, nothing lost (✅ Task 1), knock-on fix to `getToolSummary`/`getExistingAutomationsToolSummary`/`getAreaSummaryGaps` so the One Pager stays meaningful (✅ Task 6), Categoria+Produto two-step UI with category-change clearing an invalid product (✅ Task 9), all read-only display surfaces (✅ Task 10), XML round-trip (✅ Task 11).
- **Type consistency:** `mainToolCategoryId`/`mainToolCategory` naming is consistent across schema, tRPC input/output, and the `Project` type everywhere it's touched.
- **No placeholders:** every step has full code; the "Fora de escopo" items from the spec (linking to Tipo de Solução, forcing recategorization, multi-tool-per-project) are intentionally not present anywhere in this plan.
