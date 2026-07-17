# Tipo de Projeto (ProjectKind) Taxonomia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Tipo de Projeto" (Automação, Agente IA, Dados e BI, Integração entre Sistemas — extensible) as a new DB-backed taxonomy, editable in `/admin/configuracoes/categorias`, selected via a creatable combobox on the architecture tab next to "Ferramenta principal", and surfaced as a badge/filter/sort/CSV-column on the `admin/projetos` Kanban listing.

**Architecture:** New `ProjectKind` Prisma model mirrors the existing `MainTool` pattern exactly (id/name/slug/isActive/order, flat list, no hierarchy). `Project.projectKindId String?` (nullable FK). Named `ProjectKind`/`projectKindId` specifically to avoid colliding with the pre-existing, unrelated `ProjectType` enum (`Project.type`) and the legacy computed `project.projectType` field (`platform ?? type`), which are untouched by this work. Backend CRUD is added to `taxonomy.router.ts`, copying the `mainTool` procedures verbatim in shape. The architecture tab gets a second `CreatableCombobox`, reusing the already-existing component. The admin categorias page gets a new flat "Tipos de Projeto" section copying the "Ferramentas principais" card pattern. The Kanban card gets a second, visually distinct badge. `admin/projetos` gets a new `ProjectKindFilter` (mirrors `CompanyFilter`) plus a sort-by control (createdAt/updatedAt, both already exist on `Project`) and a new CSV column.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PostgreSQL) + shadcn/ui (Radix) + Tailwind. No test framework exists in this repo and there is no local DB — per established project convention, validation is `prisma validate`/`prisma generate` (schema-only, no DB connection), `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`. Never run `prisma migrate dev` or connect to a live DB from this machine. Deploy happens by pushing to `main`; the Docker entrypoint runs `prisma migrate deploy` in production.

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma:203-208` (add `projectKind`/`projectKindId` relation next to `mainTool`/`mainToolId`)
- Modify: `prisma/schema.prisma:506-517` (add new `ProjectKind` model after `MainTool`)
- Create: `prisma/migrations/20260717120000_add_project_kind_taxonomy/migration.sql`

- [ ] **Step 1: Add the FK relation next to mainTool/mainToolId**

In `prisma/schema.prisma`, find:
```prisma
  mainTool     MainTool?        @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId   String?
  features     ProjectFeature[]
```
Replace with:
```prisma
  mainTool     MainTool?        @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId   String?
  projectKind  ProjectKind?     @relation(fields: [projectKindId], references: [id], onDelete: SetNull)
  projectKindId String?
  features     ProjectFeature[]
```

- [ ] **Step 2: Add the ProjectKind model**

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
Add immediately after its closing `}`:
```prisma

// ==========================================
// TAXONOMIA CONFIGURAVEL (TIPO DE PROJETO)
// ==========================================

model ProjectKind {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("project_kinds")
}
```

- [ ] **Step 3: Validate the schema (no DB connection needed)**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 4: Regenerate the Prisma Client**

Run: `npx prisma generate`
Expected: exits 0, prints `Generated Prisma Client ... to .\node_modules\@prisma\client`. This makes `ctx.db.projectKind` and `Project.projectKind`/`projectKindId` type-safe for the following tasks.

- [ ] **Step 5: Write the migration SQL**

Create `prisma/migrations/20260717120000_add_project_kind_taxonomy/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "project_kinds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_kinds_slug_key" ON "project_kinds"("slug");

-- Seed: the 4 initial project kinds
INSERT INTO "project_kinds" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-project-kind-automacao', 'Automação', 'automacao', 0, CURRENT_TIMESTAMP),
    ('seed-project-kind-agente-ia', 'Agente IA', 'agente-ia', 1, CURRENT_TIMESTAMP),
    ('seed-project-kind-dados-bi', 'Dados e BI', 'dados-bi', 2, CURRENT_TIMESTAMP),
    ('seed-project-kind-integracao-sistemas', 'Integração entre Sistemas', 'integracao-sistemas', 3, CURRENT_TIMESTAMP);

-- AlterTable: add the new FK column (nullable, no backfill — field is new, no prior data)
ALTER TABLE "projects" ADD COLUMN "projectKindId" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_projectKindId_fkey" FOREIGN KEY ("projectKindId") REFERENCES "project_kinds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260717120000_add_project_kind_taxonomy/migration.sql
git commit -m "feat: add ProjectKind taxonomy model and migration"
```

---

## Task 2: Backend CRUD for ProjectKind

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`

- [ ] **Step 1: Add the ProjectKind procedures**

In `src/server/trpc/routers/taxonomy.router.ts`, the `deleteMainTool` mutation is immediately followed by a `// CATEGORIAS DE CUSTO` section comment. Find:
```typescript
  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
      return { success: true };
    }),
```
Replace with (adds a new section right after it, before whatever follows):
```typescript
  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // TIPO DE PROJETO
  // ==========================================

  listProjectKinds: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.projectKind.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllProjectKinds: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.projectKind.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createProjectKind: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.projectKind.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe um tipo de projeto com este slug" });
      return ctx.db.projectKind.create({ data: input });
    }),

  updateProjectKind: adminProcedure
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
      return ctx.db.projectKind.update({ where: { id }, data });
    }),

  deleteProjectKind: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectKind.delete({ where: { id: input.id } });
      return { success: true };
    }),
```

The `// CATEGORIAS DE CUSTO` section and everything after it stays exactly where it was, right after the new "TIPO DE PROJETO" block.

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `taxonomy.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts
git commit -m "feat: add ProjectKind CRUD procedures to taxonomy router"
```

---

## Task 3: project.router.ts — wire projectKindId through list/byId/update

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:48-66` (`ARCHITECT_ONLY_FIELDS`)
- Modify: `src/server/trpc/routers/project.router.ts:150-165` (`list` query `include` + mapping)
- Modify: `src/server/trpc/routers/project.router.ts:224-237` (`byId` query `include`)
- Modify: `src/server/trpc/routers/project.router.ts:289-291` (`byId` return mapping)
- Modify: `src/server/trpc/routers/project.router.ts:464-511` (`update` input schema)
- Modify: `src/server/trpc/routers/project.router.ts:555-567` (`update` data-building)

- [ ] **Step 1: Add projectKindId to ARCHITECT_ONLY_FIELDS**

Find:
```typescript
  "solutionTypes",
  "mainToolId",
  "executionStrategy",
```
Replace with:
```typescript
  "solutionTypes",
  "mainToolId",
  "projectKindId",
  "executionStrategy",
```

- [ ] **Step 2: Include projectKind in the list query and map it in the response**

Find (inside the `list` procedure's `findMany`):
```typescript
          company: {
            select: { id: true, name: true },
          },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });
```
Replace with:
```typescript
          company: {
            select: { id: true, name: true },
          },
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });
```

Find (inside the `list` procedure's `.map`):
```typescript
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
```
Replace with:
```typescript
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        projectKind: p.projectKind ?? undefined,
        projectKindId: p.projectKindId ?? undefined,
```

- [ ] **Step 3: Include projectKind in the byId query and map it in the response**

Find:
```typescript
          company: { select: { id: true, name: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
```
Replace with:
```typescript
          company: { select: { id: true, name: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
```

Find:
```typescript
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```
Replace with:
```typescript
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        projectKind: project.projectKind ?? undefined,
        projectKindId: project.projectKindId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```

- [ ] **Step 4: Accept projectKindId in the update mutation input**

Find:
```typescript
        solutionTypes: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```
Replace with:
```typescript
        solutionTypes: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        projectKindId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

- [ ] **Step 5: Persist projectKindId in the update mutation**

Find:
```typescript
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```
Replace with:
```typescript
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.projectKindId !== undefined) data.projectKindId = rest.projectKindId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project.router.ts` (some errors are expected until Task 4 adds `projectKind`/`projectKindId` to the shared `Project` type — if so, proceed to Task 4 before re-checking).

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: wire projectKindId through project list/byId/update"
```

---

## Task 4: Shared Project type

**Files:**
- Modify: `src/shared/types/index.ts:77-79`

- [ ] **Step 1: Add projectKind/projectKindId to the Project interface**

Find:
```typescript
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
  executionStrategy?: string;
```
Replace with:
```typescript
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
  projectKind?: { id: string; name: string; slug: string };
  projectKindId?: string;
  executionStrategy?: string;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (this should clear any errors left over from Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add projectKind/projectKindId to shared Project type"
```

---

## Task 5: Wire the combobox into the architecture tab

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Add the taxonomy query, options memo and create mutation**

Find:
```tsx
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
  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainTools.invalidate();
      setMainToolId(created.id);
      toast.success(`Ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar ferramenta", { description: err.message }),
  });

  const { data: projectKinds = [] } = trpc.taxonomy.listProjectKinds.useQuery();
  const projectKindOptions = useMemo(() => {
    const opts = projectKinds.map((k) => ({ value: k.id, label: k.name }));
    if (project?.projectKind && !opts.some((o) => o.value === project.projectKind!.id)) {
      opts.push({ value: project.projectKind.id, label: project.projectKind.name });
    }
    return opts;
  }, [projectKinds, project?.projectKind]);
  const createProjectKind = trpc.taxonomy.createProjectKind.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listProjectKinds.invalidate();
      setProjectKindId(created.id);
      toast.success(`Tipo de projeto "${created.name}" criado`);
    },
    onError: (err) => toast.error("Falha ao criar tipo de projeto", { description: err.message }),
  });
```

- [ ] **Step 2: Add local state**

Find:
```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```
Replace with:
```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [projectKindId, setProjectKindId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

- [ ] **Step 3: Sync from the loaded project**

Find:
```tsx
      setSolutionTypes(project.solutionTypes ?? []);
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```
Replace with:
```tsx
      setSolutionTypes(project.solutionTypes ?? []);
      setMainToolId(project.mainTool?.id ?? "");
      setProjectKindId(project.projectKind?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

- [ ] **Step 4: Include it in the save payload**

Find:
```tsx
      solutionTypes,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
```
Replace with:
```tsx
      solutionTypes,
      mainToolId: mainToolId || null,
      projectKindId: projectKindId || null,
      executionStrategy: executionStrategy || null,
```

- [ ] **Step 5: Add the combobox to the UI, expanding the grid to 3 columns**

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
              <Select value={executionStrategy} onValueChange={setExecutionStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTION_STRATEGIES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
```
Replace with:
```tsx
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
              <Label>Tipo de projeto</Label>
              <CreatableCombobox
                options={projectKindOptions}
                value={projectKindId}
                onChange={setProjectKindId}
                onCreate={(label) =>
                  createProjectKind.mutate({
                    name: label,
                    slug: slugify(label),
                    order: projectKinds.length,
                  })
                }
                placeholder="Selecione ou crie"
                disabled={createProjectKind.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label>Estratégia de execução</Label>
              <Select value={executionStrategy} onValueChange={setExecutionStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTION_STRATEGIES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `architecture-tab.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: add Tipo de Projeto combobox to architecture tab"
```

- [ ] **Step 8: Manual verification**

Run `pnpm dev`, open a project's especificação page as admin, go to the "Arquitetura" tab. Confirm: a new "Tipo de projeto" combobox appears between "Ferramenta principal" and "Estratégia de execução", shows the 4 seeded options (Automação, Agente IA, Dados e BI, Integração entre Sistemas), typing an unmatched value shows a "Criar ..." row, selecting a value and clicking "Salvar arquitetura" persists it (reload the page and confirm the selection survived).

---

## Task 6: Admin CRUD section in /admin/configuracoes/categorias

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Add the type alias and Layers icon import**

Find:
```tsx
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
```
Replace with:
```tsx
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
type ProjectKindItem = RouterOutputs["taxonomy"]["listAllProjectKinds"][number];
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
```

Find:
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
Replace with:
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
  Layers,
  Merge,
  Wallet,
} from "lucide-react";
```

- [ ] **Step 2: Add state, queries and mutations**

Find:
```tsx
  // — CATEGORIAS DE CUSTO —
  const { data: costCategories = [] } = trpc.taxonomy.listAllCostCategories.useQuery();
```
Replace with:
```tsx
  // — TIPOS DE PROJETO —
  const { data: projectKinds = [] } = trpc.taxonomy.listAllProjectKinds.useQuery();
  const [projectKindDialog, setProjectKindDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [projectKindForm, setProjectKindForm] = useState({ name: "", slug: "", order: 0 });

  const createProjectKind = trpc.taxonomy.createProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de projeto criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de projeto atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteProjectKind = trpc.taxonomy.deleteProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); toast({ title: "Tipo de projeto removido" }); },
  });
  const toggleProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => utils.taxonomy.listAllProjectKinds.invalidate(),
  });

  function openNewProjectKind() {
    setProjectKindForm({ name: "", slug: "", order: projectKinds.length });
    setProjectKindDialog({ open: true });
  }
  function openEditProjectKind(kind: { id: string; name: string; slug: string; order: number }) {
    setProjectKindForm({ name: kind.name, slug: kind.slug, order: kind.order });
    setProjectKindDialog({ open: true, editing: kind });
  }
  function submitProjectKind() {
    if (projectKindDialog.editing) {
      updateProjectKind.mutate({ id: projectKindDialog.editing.id, name: projectKindForm.name, order: projectKindForm.order });
    } else {
      createProjectKind.mutate({ name: projectKindForm.name, slug: projectKindForm.slug, order: projectKindForm.order });
    }
  }

  // — CATEGORIAS DE CUSTO —
  const { data: costCategories = [] } = trpc.taxonomy.listAllCostCategories.useQuery();
```

Find:
```tsx
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
Replace with:
```tsx
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool" | "projectKind" | "costCategory"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "projectKind") deleteProjectKind.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "costCategory") deleteCostCategory.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```

- [ ] **Step 3: Render the new list section**

Find:
```tsx
      </div>

      {/* Categorias de custo */}
```
Replace with:
```tsx
      </div>

      {/* Tipos de Projeto */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tipos de Projeto</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Tipo de projeto&quot; na tela de arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewProjectKind}>
            <Plus className="mr-2 h-4 w-4" />
            Novo tipo
          </Button>
        </div>
        {projectKinds.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum tipo de projeto cadastrado</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {projectKinds.map((kind: ProjectKindItem) => (
                <div
                  key={kind.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!kind.isActive ? "opacity-50" : ""}`}
                >
                  <span>{kind.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{kind.slug}</Badge>
                  <Switch
                    checked={kind.isActive}
                    onCheckedChange={(v) => toggleProjectKind.mutate({ id: kind.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditProjectKind(kind)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "projectKind", id: kind.id, label: kind.name })}
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

      {/* Categorias de custo */}
```

- [ ] **Step 4: Add the create/edit dialog**

Find:
```tsx
      </Dialog>

      {/* Dialog: Categoria de custo */}
```
Replace with:
```tsx
      </Dialog>

      {/* Dialog: Tipo de Projeto */}
      <Dialog open={projectKindDialog.open} onOpenChange={(o) => setProjectKindDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{projectKindDialog.editing ? "Editar tipo de projeto" : "Novo tipo de projeto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={projectKindForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setProjectKindForm((f) => ({
                    ...f,
                    name,
                    slug: projectKindDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Automação"
              />
            </div>
            {!projectKindDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={projectKindForm.slug}
                  onChange={(e) => setProjectKindForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: automacao"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={projectKindForm.order}
                onChange={(e) => setProjectKindForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectKindDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitProjectKind} disabled={!projectKindForm.name || (!projectKindDialog.editing && !projectKindForm.slug)}>
              {projectKindDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Categoria de custo */}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: add Tipos de Projeto CRUD section to admin categorias page"
```

- [ ] **Step 7: Manual verification**

Run `pnpm dev`, open `/admin/configuracoes/categorias` as admin. Confirm a "Tipos de Projeto" section renders with the 4 seeded items, "Novo tipo" opens a dialog that creates a 5th item, the toggle deactivates/reactivates one (and it disappears/reappears from the combobox options in Task 5's screen — deactivated kinds should no longer be selectable for new projects, but should still display correctly on projects that already have them, per the same `isActive` pattern as `mainTool`), edit and delete both work.

---

## Task 7: Badge on the Kanban card

**Files:**
- Modify: `src/shared/components/project-card.tsx:98-138`

- [ ] **Step 1: Add the conditional badge**

Find:
```tsx
          {project.projectType && (
            <span
              className="inline-block max-w-full truncate rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              title={project.projectType}
            >
              {project.projectType}
            </span>
          )}
```
Replace with:
```tsx
          {project.projectType && (
            <span
              className="inline-block max-w-full truncate rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              title={project.projectType}
            >
              {project.projectType}
            </span>
          )}
          {project.projectKind && (
            <span
              className="inline-block max-w-full truncate rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={project.projectKind.name}
            >
              {project.projectKind.name}
            </span>
          )}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project-card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/project-card.tsx
git commit -m "feat: show Tipo de Projeto badge on Kanban card"
```

- [ ] **Step 4: Manual verification**

Run `pnpm dev`, open `/admin/projetos`. Confirm: a project with a Tipo de Projeto set (saved in Task 5) shows a second, visually distinct badge (primary-tinted) below/next to the existing gray `projectType` badge. A project with no Tipo de Projeto set shows no second badge (no empty space, no "undefined" text).

---

## Task 8: Filter, sort and CSV column on admin/projetos

**Files:**
- Create: `src/shared/components/project-kind-filter.tsx`
- Modify: `src/app/(private)/admin/projetos/page.tsx`

- [ ] **Step 1: Create the ProjectKindFilter component**

Create `src/shared/components/project-kind-filter.tsx`:
```tsx
"use client";

import type { Project } from "@/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";

export const ALL_PROJECT_KINDS_VALUE = "all";

interface ProjectKindFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

export function ProjectKindFilter({ projects, value, onChange }: ProjectKindFilterProps) {
  const kinds = Array.from(
    new Map(
      projects
        .filter((p): p is Project & { projectKind: { id: string; name: string } } =>
          Boolean(p.projectKind)
        )
        .map((p) => [p.projectKind!.id, p.projectKind!.name] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  if (kinds.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todos os tipos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROJECT_KINDS_VALUE}>Todos os tipos</SelectItem>
        {kinds.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByKind<T extends { projectKindId?: string }>(
  projects: T[],
  kindFilter: string
): T[] {
  if (kindFilter === ALL_PROJECT_KINDS_VALUE) return projects;
  return projects.filter((p) => p.projectKindId === kindFilter);
}
```

- [ ] **Step 2: Type-check the new file**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project-kind-filter.tsx`.

- [ ] **Step 3: Commit the new component**

```bash
git add src/shared/components/project-kind-filter.tsx
git commit -m "feat: add ProjectKindFilter component"
```

- [ ] **Step 4: Wire the filter and sort control into admin/projetos/page.tsx**

Find:
```tsx
import { Button } from "@/src/shared/components/ui/button";
import { Download } from "lucide-react";
import { ProjectDetailsModal } from "./_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
```
Replace with:
```tsx
import { Button } from "@/src/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { Download } from "lucide-react";
import { ProjectDetailsModal } from "./_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
import {
  ProjectKindFilter,
  filterProjectsByKind,
  ALL_PROJECT_KINDS_VALUE,
} from "@/shared/components/project-kind-filter";

type SortBy = "updatedAt" | "createdAt";
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "updatedAt", label: "Edição mais recente" },
  { value: "createdAt", label: "Criação mais recente" },
];
```

Find:
```tsx
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const filteredProjects = filterProjectsByCompany(projects, companyFilter);
```
Replace with:
```tsx
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);
  const [kindFilter, setKindFilter] = useState(ALL_PROJECT_KINDS_VALUE);
  const [sortBy, setSortBy] = useState<SortBy>("updatedAt");

  const filteredProjects = filterProjectsByKind(
    filterProjectsByCompany(projects, companyFilter),
    kindFilter
  ).sort((a, b) => new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime());
```

Find:
```tsx
          <CompanyFilter
            projects={projects}
            value={companyFilter}
            onChange={setCompanyFilter}
          />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
```
Replace with:
```tsx
          <CompanyFilter
            projects={projects}
            value={companyFilter}
            onChange={setCompanyFilter}
          />
          <ProjectKindFilter
            projects={projects}
            value={kindFilter}
            onChange={setKindFilter}
          />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
```

- [ ] **Step 5: Add the CSV column**

Find:
```tsx
    "Prioridade",
    "Tipo",
    "Descrição",
```
Replace with:
```tsx
    "Prioridade",
    "Tipo",
    "Tipo de Projeto",
    "Descrição",
```

Find:
```tsx
    PRIORITY_CONFIG[p.priority]?.label ?? p.priority,
    p.projectType,
    p.description,
```
Replace with:
```tsx
    PRIORITY_CONFIG[p.priority]?.label ?? p.priority,
    p.projectType,
    p.projectKind?.name ?? "",
    p.description,
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `admin/projetos/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/projetos/page.tsx"
git commit -m "feat: add Tipo de Projeto filter, sort control and CSV column to admin/projetos"
```

- [ ] **Step 8: Manual verification**

Run `pnpm dev`, open `/admin/projetos`. Confirm: a "Todos os tipos" dropdown appears next to the company filter (only if at least one visible project has a kind set — this mirrors `CompanyFilter`'s own empty-state behavior) and filtering by a specific kind shows only matching cards; the sort dropdown defaults to "Edição mais recente" and switching to "Criação mais recente" visibly reorders cards within a column; exporting CSV (outside demo mode) includes a "Tipo de Projeto" column with the right values, empty string for projects without one.

---

## Task 9: Final validation pass

**Files:** none (validation only)

- [ ] **Step 1: Full type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors (pre-existing warnings elsewhere in the repo are fine; nothing new from the files touched in this plan).

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build completes successfully (`✓ Compiled successfully`).

- [ ] **Step 4: Manual review of the migration**

Re-read `prisma/migrations/20260717120000_add_project_kind_taxonomy/migration.sql` end to end once more — this repo has no local DB to dry-run it against, so this file only gets exercised for real when it runs against production via `prisma migrate deploy` on next deploy. Confirm: table creation, seed values match the 4 kinds exactly (slugs `automacao`/`agente-ia`/`dados-bi`/`integracao-sistemas`), new column is nullable with no backfill needed, FK constraint mirrors the `mainToolId` `ON DELETE SET NULL` pattern.

- [ ] **Step 5: Push to trigger deploy**

Per project convention, do not attempt any local migration or DB validation — push to `main` (or open a PR, per user's usual flow) and let GitHub Actions + the Docker entrypoint (`prisma migrate deploy && pnpm start`) apply the migration in production.
