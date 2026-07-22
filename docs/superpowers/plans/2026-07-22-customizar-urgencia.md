# Customizar Urgência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hardcoded "Nível de urgência" list into an admin-managed `UrgencyLevel` taxonomy (mirroring `MainTool`), remove the client-facing "Outro"/free-text fallback, and let admins register new levels inline while editing a project.

**Architecture:** New `UrgencyLevel` model with standard CRUD in `taxonomy.router.ts` (no relation to `Project` — `Project.urgency` stays a free `String?`, so no data migration is needed). A new migration creates the table and seeds the 4 existing values. `useTaxonomy()` gains a `urgencyLevels` field (DB-backed, falls back to the existing hardcoded list while loading/empty). Every consumer that read the static `URGENCY_LEVELS` constant switches to this dynamic source; the client request form drops its "Outro" input entirely; the admin edit form gains an inline "create new" combobox.

**Tech Stack:** Prisma (PostgreSQL), tRPC v11, Next.js/React, Zod, react-hook-form.

**Note on testing:** same as prior plans this session — no automated test runner and no local database in this environment. Verification uses `DATABASE_URL=<dummy> npx prisma validate`/`npx prisma generate` (offline-safe, schema-only) plus `npx tsc --noEmit`.

---

## File Structure

- **Modify:** `prisma/schema.prisma` — add `model UrgencyLevel`.
- **Create:** `prisma/migrations/20260722130000_add_urgency_level_taxonomy/migration.sql`.
- **Modify:** `src/server/trpc/routers/taxonomy.router.ts` — add `listUrgencyLevels`/`listAllUrgencyLevels`/`createUrgencyLevel`/`updateUrgencyLevel`/`deleteUrgencyLevel`.
- **Modify:** `src/app/(private)/admin/configuracoes/categorias/page.tsx` — new "Níveis de Urgência" section.
- **Modify:** `src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts` — add `urgencyLevels`.
- **Modify:** `src/app/(private)/cliente/solicitar/page.tsx` — drop "Outro"/`customUrgency`, wire `urgencyLevels`.
- **Modify:** `src/shared/schema/solicitar-projeto.ts` — remove `customUrgency` field + validation.
- **Modify:** `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts` — simplify `urgency` derivation.
- **Modify:** `src/app/(private)/cliente/solicitar/utils/xml-import.ts` — drop the "Outro" fallback for `<urgencia>`, match against a passed-in dynamic list.
- **Modify:** `src/shared/hooks/use-xml-opportunity-importer.ts` — thread `urgencyLevels` through.
- **Modify:** `src/app/(private)/admin/oportunidades/gerar-ia/page.tsx` — thread `urgencyLevels` through.
- **Modify:** `src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx` — dynamic `acceptedValues`.
- **Modify:** `src/shared/components/project-detail-sections.tsx` — resolve label from the live list.
- **Modify:** `src/shared/components/project-request-edit-form.tsx` — `Select` → `CreatableCombobox` with inline create.
- **Modify:** `src/shared/xml/build-projeto-completo-xml.ts`, `src/shared/xml/parse-projeto-completo-xml.ts` — accept `urgencyLevels` as a parameter instead of importing the static constant.
- **Modify:** `src/shared/components/project-xml-import-export.tsx` — fetch `urgencyLevels` via tRPC, pass into build/parse calls.

`src/shared/constants/project-taxonomy.ts`'s `URGENCY_LEVELS` constant is **not deleted** — it stays as the fallback used by `useTaxonomy()` (same role `FALLBACK_AREAS` already plays), same as the codebase's existing pattern for Área.

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260722130000_add_urgency_level_taxonomy/migration.sql`

- [ ] **Step 1: Add the model**

Find (end of the `ProjectKind` model block, right before the `CUSTOS E ESTRUTURA DA EMPRESA` section comment):

```prisma
model ProjectKind {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[] @relation("ProjectSolutionTypes")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("project_kinds")
}

// ==========================================
// CUSTOS E ESTRUTURA DA EMPRESA
// ==========================================
```

Replace with:

```prisma
model ProjectKind {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[] @relation("ProjectSolutionTypes")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("project_kinds")
}

// ==========================================
// TAXONOMIA CONFIGURAVEL (NIVEL DE URGENCIA)
// ==========================================

// Sem relação com Project — Project.urgency continua sendo um campo texto
// livre (sem FK); esta tabela só fornece as opções selecionáveis nas telas.
model UrgencyLevel {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("urgency_levels")
}

// ==========================================
// CUSTOS E ESTRUTURA DA EMPRESA
// ==========================================
```

- [ ] **Step 2: Validate**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`

- [ ] **Step 3: Write the migration**

Create `prisma/migrations/20260722130000_add_urgency_level_taxonomy/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "urgency_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urgency_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "urgency_levels_slug_key" ON "urgency_levels"("slug");

-- Seed: the 4 real levels in use today (matches the values already stored in
-- Project.urgency for these slugs — "outro" is intentionally not seeded, it's
-- a UI-only sentinel, same as PROJECT_AREAS never seeds an "outro" Area).
INSERT INTO "urgency_levels" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-urgency-level-baixa', 'Baixa — sem pressa definida', 'baixa', 0, CURRENT_TIMESTAMP),
    ('seed-urgency-level-media', 'Média — próximos 2 a 3 meses', 'media', 1, CURRENT_TIMESTAMP),
    ('seed-urgency-level-alta', 'Alta — próximo mês', 'alta', 2, CURRENT_TIMESTAMP),
    ('seed-urgency-level-urgente', 'Urgente — o mais rápido possível', 'urgente', 3, CURRENT_TIMESTAMP);
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma generate`
Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260722130000_add_urgency_level_taxonomy"
git commit -m "feat: add UrgencyLevel taxonomy model"
```

---

### Task 2: Backend CRUD

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts` (append after the `deleteCostCategory` procedure, at the end of the router)

- [ ] **Step 1: Add the procedures**

Find the exact end of the file:

```typescript
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

Replace with:

```typescript
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // NIVEL DE URGENCIA
  // ==========================================

  listUrgencyLevels: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.urgencyLevel.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllUrgencyLevels: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.urgencyLevel.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createUrgencyLevel: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.urgencyLevel.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe um nível de urgência com este slug" });
      return ctx.db.urgencyLevel.create({ data: input });
    }),

  updateUrgencyLevel: adminProcedure
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
      return ctx.db.urgencyLevel.update({ where: { id }, data });
    }),

  deleteUrgencyLevel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.urgencyLevel.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `taxonomy.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts
git commit -m "feat: add urgency level CRUD procedures"
```

---

### Task 3: Configurações → Categorias UI

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Add the type alias**

Find:

```tsx
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
```

Replace with:

```tsx
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];
type UrgencyLevelItem = RouterOutputs["taxonomy"]["listAllUrgencyLevels"][number];
```

- [ ] **Step 2: Add an icon import**

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
  Layers,
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
  Flame,
} from "lucide-react";
```

- [ ] **Step 3: Add state, mutations, and handlers**

Find (right after the cost-category mutations/handlers block, before the `// — DELETE CONFIRM —` section):

```tsx
  function submitCostCategory() {
    if (costCategoryDialog.editing) {
      updateCostCategory.mutate({ id: costCategoryDialog.editing.id, name: costCategoryForm.name, order: costCategoryForm.order });
    } else {
      createCostCategory.mutate({ name: costCategoryForm.name, slug: costCategoryForm.slug, order: costCategoryForm.order });
    }
  }

  // — DELETE CONFIRM —
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

Replace with:

```tsx
  function submitCostCategory() {
    if (costCategoryDialog.editing) {
      updateCostCategory.mutate({ id: costCategoryDialog.editing.id, name: costCategoryForm.name, order: costCategoryForm.order });
    } else {
      createCostCategory.mutate({ name: costCategoryForm.name, slug: costCategoryForm.slug, order: costCategoryForm.order });
    }
  }

  // — NÍVEIS DE URGÊNCIA —
  const { data: urgencyLevels = [] } = trpc.taxonomy.listAllUrgencyLevels.useQuery();
  const [urgencyLevelDialog, setUrgencyLevelDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [urgencyLevelForm, setUrgencyLevelForm] = useState({ name: "", slug: "", order: 0 });

  const createUrgencyLevel = trpc.taxonomy.createUrgencyLevel.useMutation({
    onSuccess: () => { utils.taxonomy.listAllUrgencyLevels.invalidate(); setUrgencyLevelDialog({ open: false }); toast({ title: "Nível de urgência criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateUrgencyLevel = trpc.taxonomy.updateUrgencyLevel.useMutation({
    onSuccess: () => { utils.taxonomy.listAllUrgencyLevels.invalidate(); setUrgencyLevelDialog({ open: false }); toast({ title: "Nível de urgência atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteUrgencyLevel = trpc.taxonomy.deleteUrgencyLevel.useMutation({
    onSuccess: () => { utils.taxonomy.listAllUrgencyLevels.invalidate(); toast({ title: "Nível de urgência removido" }); },
  });
  const toggleUrgencyLevel = trpc.taxonomy.updateUrgencyLevel.useMutation({
    onSuccess: () => utils.taxonomy.listAllUrgencyLevels.invalidate(),
  });

  function openNewUrgencyLevel() {
    setUrgencyLevelForm({ name: "", slug: "", order: urgencyLevels.length });
    setUrgencyLevelDialog({ open: true });
  }
  function openEditUrgencyLevel(level: { id: string; name: string; slug: string; order: number }) {
    setUrgencyLevelForm({ name: level.name, slug: level.slug, order: level.order });
    setUrgencyLevelDialog({ open: true, editing: level });
  }
  function submitUrgencyLevel() {
    if (urgencyLevelDialog.editing) {
      updateUrgencyLevel.mutate({ id: urgencyLevelDialog.editing.id, name: urgencyLevelForm.name, order: urgencyLevelForm.order });
    } else {
      createUrgencyLevel.mutate({ name: urgencyLevelForm.name, slug: urgencyLevelForm.slug, order: urgencyLevelForm.order });
    }
  }

  // — DELETE CONFIRM —
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

- [ ] **Step 4: Add the section JSX**

Find (right after the "Categorias de custo" section's closing `</div>`, before the `{/* Dialog: Área */}` comment):

```tsx
      </div>

      {/* Dialog: Área */}
```

Replace with:

```tsx
      </div>

      {/* Níveis de urgência */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Níveis de Urgência</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Nível de urgência&quot; na solicitação de projeto.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewUrgencyLevel}>
            <Plus className="mr-2 h-4 w-4" />
            Novo nível
          </Button>
        </div>
        {urgencyLevels.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Flame className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum nível de urgência cadastrado</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {urgencyLevels.map((level: UrgencyLevelItem) => (
                <div
                  key={level.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!level.isActive ? "opacity-50" : ""}`}
                >
                  <span>{level.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{level.slug}</Badge>
                  <Switch
                    checked={level.isActive}
                    onCheckedChange={(v) => toggleUrgencyLevel.mutate({ id: level.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditUrgencyLevel(level)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "urgencyLevel", id: level.id, label: level.name })}
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

- [ ] **Step 5: Add the create/edit dialog**

Find (right after the "Dialog: Categoria de custo" dialog's closing `</Dialog>`, before `{/* Confirm delete */}`):

```tsx
      </Dialog>

      {/* Confirm delete */}
```

Replace with:

```tsx
      </Dialog>

      {/* Dialog: Nível de urgência */}
      <Dialog open={urgencyLevelDialog.open} onOpenChange={(o) => setUrgencyLevelDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{urgencyLevelDialog.editing ? "Editar nível de urgência" : "Novo nível de urgência"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={urgencyLevelForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setUrgencyLevelForm((f) => ({
                    ...f,
                    name,
                    slug: urgencyLevelDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Crítica — hoje mesmo"
              />
            </div>
            {!urgencyLevelDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={urgencyLevelForm.slug}
                  onChange={(e) => setUrgencyLevelForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: critica"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={urgencyLevelForm.order}
                onChange={(e) => setUrgencyLevelForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUrgencyLevelDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitUrgencyLevel} disabled={!urgencyLevelForm.name || (!urgencyLevelDialog.editing && !urgencyLevelForm.slug)}>
              {urgencyLevelDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `categorias/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: manage urgency levels from Configurações → Categorias"
```

---

### Task 4: `useTaxonomy()` gains `urgencyLevels`

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts`

- [ ] **Step 1: Import the fallback constant**

Find:

```typescript
import {
  PROJECT_AREAS as FALLBACK_AREAS,
  PROJECT_THEMES_BY_AREA as FALLBACK_THEMES,
  FEATURE_SUGGESTION_GROUPS as FALLBACK_SUGGESTIONS,
} from "@/shared/constants/project-taxonomy";
```

Replace with:

```typescript
import {
  PROJECT_AREAS as FALLBACK_AREAS,
  PROJECT_THEMES_BY_AREA as FALLBACK_THEMES,
  FEATURE_SUGGESTION_GROUPS as FALLBACK_SUGGESTIONS,
  URGENCY_LEVELS as FALLBACK_URGENCY_LEVELS,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 2: Add the query and the resolved list**

Find:

```typescript
  const { data: dbSuggestions } = trpc.taxonomy.listSuggestions.useQuery(
    { areaSlug: undefined },
    { staleTime: 1000 * 60 * 5 }
  );

  // Se o banco ainda não tem dados (não seeded), usa os hardcoded
  const useDb = !isLoading && dbAreas && dbAreas.length > 0;
```

Replace with:

```typescript
  const { data: dbSuggestions } = trpc.taxonomy.listSuggestions.useQuery(
    { areaSlug: undefined },
    { staleTime: 1000 * 60 * 5 }
  );

  const { data: dbUrgencyLevels, isLoading: isLoadingUrgencyLevels } =
    trpc.taxonomy.listUrgencyLevels.useQuery(undefined, {
      staleTime: 1000 * 60 * 5,
    });

  // Se o banco ainda não tem dados (não seeded), usa os hardcoded
  const useDb = !isLoading && dbAreas && dbAreas.length > 0;

  const useDbUrgencyLevels =
    !isLoadingUrgencyLevels && dbUrgencyLevels && dbUrgencyLevels.length > 0;
  const urgencyLevels = useDbUrgencyLevels
    ? dbUrgencyLevels!.map((u) => ({ value: u.slug, label: u.name }))
    : FALLBACK_URGENCY_LEVELS.filter((u) => u.value !== "outro").map((u) => ({
        value: u.value,
        label: u.label,
      }));
```

- [ ] **Step 3: Return it**

Find:

```typescript
  return {
    areas,
    themesByArea,
    suggestionGroups,
    buildTypeLabel,
    isLoading,
  };
}
```

Replace with:

```typescript
  return {
    areas,
    themesByArea,
    suggestionGroups,
    urgencyLevels,
    buildTypeLabel,
    isLoading,
  };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `use-taxonomy.ts`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts"
git commit -m "feat: useTaxonomy exposes DB-backed urgency levels"
```

---

### Task 5: Zod schema — drop `customUrgency`

**Files:**
- Modify: `src/shared/schema/solicitar-projeto.ts`

- [ ] **Step 1: Remove the field**

Find:

```typescript
    projectNarrative: z.string().optional().default(""),
    urgency: z.string().optional().default(""),
    customUrgency: z.string().optional().default(""),
    deadline: z.string().optional().default(""),
```

Replace with:

```typescript
    projectNarrative: z.string().optional().default(""),
    urgency: z.string().optional().default(""),
    deadline: z.string().optional().default(""),
```

- [ ] **Step 2: Remove the conditional validation**

Find:

```typescript
    if (data.processFrequency === "outro" && !data.customProcessFrequency.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customProcessFrequency"],
        message: "Informe a periodicidade",
      });
    }
    if (data.urgency === "outro" && !data.customUrgency.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customUrgency"],
        message: "Informe o nível de urgência",
      });
    }
  });
```

Replace with:

```typescript
    if (data.processFrequency === "outro" && !data.customProcessFrequency.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customProcessFrequency"],
        message: "Informe a periodicidade",
      });
    }
  });
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: this will surface every remaining reference to `customUrgency` as a compile error (in `page.tsx`, `build-project-payload.ts`, `xml-import.ts`) — fixed in the next 3 tasks. Confirm errors are limited to those files (plus the pre-existing unrelated `ui/*` baseline).

- [ ] **Step 4: Commit**

```bash
git add src/shared/schema/solicitar-projeto.ts
git commit -m "feat: drop customUrgency from the request form schema"
```

---

### Task 6: Client request form — drop "Outro", wire dynamic list

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Drop the static import**

Find:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./utils/solicitar.utils";
```

Replace with:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./utils/solicitar.utils";
```

- [ ] **Step 2: Drop `customUrgency` from `fieldsToValidate`**

Find:

```tsx
    fieldsToValidate: ["urgency", "customUrgency", "deadline", "additionalInfo"],
```

Replace with:

```tsx
    fieldsToValidate: ["urgency", "deadline", "additionalInfo"],
```

- [ ] **Step 3: Drop the default value**

Find:

```tsx
      projectNarrative: "",
      urgency: "",
      customUrgency: "",
      deadline: "",
```

Replace with:

```tsx
      projectNarrative: "",
      urgency: "",
      deadline: "",
```

- [ ] **Step 4: Get `urgencyLevels` from `useTaxonomy()`, aliased to the old constant name**

Find:

```tsx
  const {
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    suggestionGroups: FEATURE_SUGGESTION_GROUPS,
    buildTypeLabel: buildClienteProjectTypeLabel,
  } = useTaxonomy();
```

Replace with:

```tsx
  const {
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    suggestionGroups: FEATURE_SUGGESTION_GROUPS,
    urgencyLevels: URGENCY_LEVELS,
    buildTypeLabel: buildClienteProjectTypeLabel,
  } = useTaxonomy();
```

(This keeps every existing `URGENCY_LEVELS.map(...)` reference in this file working unchanged — same trick already used for `PROJECT_AREAS`.)

- [ ] **Step 5: Pass it to the XML batch importer**

Find:

```tsx
  const importer = useXmlOpportunityImporter({
    userId: user?.id,
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    companies: companyOptions,
    buildTypeLabel: buildClienteProjectTypeLabel,
  });
```

Replace with:

```tsx
  const importer = useXmlOpportunityImporter({
    userId: user?.id,
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    urgencyLevels: URGENCY_LEVELS,
    companies: companyOptions,
    buildTypeLabel: buildClienteProjectTypeLabel,
  });
```

- [ ] **Step 6: Remove the now-unused `urgency` watch**

Find:

```tsx
  const urgency = watch("urgency");
```

Delete this line entirely.

(Run `grep -n '\burgency\b' "src/app/(private)/cliente/solicitar/page.tsx"` afterward — the only remaining matches should be `fieldsToValidate`, the default value, the field name in `Controller`/`Label`, and `URGENCY_LEVELS.map`. If `watch` becomes unused elsewhere check is unnecessary — this form watches many other fields too.)

- [ ] **Step 7: Simplify the urgency block, dropping the "Outro" input**

Find:

```tsx
                  <div className="space-y-2">
                    <Label htmlFor="urgency">Nível de urgência</Label>
                    <div className="flex gap-2">
                      <Controller
                        control={control}
                        name="urgency"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              if (value !== "outro") setValue("customUrgency", "");
                            }}
                          >
                            <SelectTrigger
                              className={urgency === "outro" ? "w-32 shrink-0" : "w-full"}
                            >
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {URGENCY_LEVELS.map((level) => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {urgency === "outro" && (
                        <Input
                          id="customUrgency"
                          {...register("customUrgency")}
                          placeholder="Qual urgência?"
                          className="flex-1"
                        />
                      )}
                    </div>
                    {errors.customUrgency && (
                      <p className="text-xs text-destructive">{errors.customUrgency.message}</p>
                    )}
                  </div>
```

Replace with:

```tsx
                  <div className="space-y-2">
                    <Label htmlFor="urgency">Nível de urgência</Label>
                    <Controller
                      control={control}
                      name="urgency"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {URGENCY_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                {level.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about `cliente/solicitar/page.tsx` itself (errors may remain in `build-project-payload.ts`/`xml-import.ts`/`use-xml-opportunity-importer.ts` until the next tasks land).

- [ ] **Step 9: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: request form urgency field drops the Outro/free-text option"
```

---

### Task 7: `build-project-payload.ts` and `xml-import.ts` / `use-xml-opportunity-importer.ts` / `gerar-ia/page.tsx`

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`
- Modify: `src/app/(private)/cliente/solicitar/utils/xml-import.ts`
- Modify: `src/shared/hooks/use-xml-opportunity-importer.ts`
- Modify: `src/app/(private)/admin/oportunidades/gerar-ia/page.tsx`

- [ ] **Step 1: `build-project-payload.ts` — urgency is no longer conditional on "outro"**

Find:

```typescript
  const processFrequencyValue =
    data.processFrequency === "outro"
      ? data.customProcessFrequency.trim()
      : data.processFrequency;
  const urgencyValue = data.urgency === "outro" ? data.customUrgency.trim() : data.urgency;
```

Replace with:

```typescript
  const processFrequencyValue =
    data.processFrequency === "outro"
      ? data.customProcessFrequency.trim()
      : data.processFrequency;
```

Find:

```typescript
    targetAudience: targetAudienceValue,
    expectedUsers: data.expectedUsers,
    urgency: urgencyValue,
    features,
```

Replace with:

```typescript
    targetAudience: targetAudienceValue,
    expectedUsers: data.expectedUsers,
    urgency: data.urgency,
    features,
```

- [ ] **Step 2: `xml-import.ts` — add `urgencyLevels` to the context type**

Find:

```typescript
export interface XmlImportContext {
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  companies: { id: string; name: string }[];
}
```

Replace with:

```typescript
export interface XmlImportContext {
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  urgencyLevels: { value: string; label: string }[];
  companies: { id: string; name: string }[];
}
```

- [ ] **Step 3: `xml-import.ts` — drop the static import, match against the context list, drop the "Outro" fallback**

Find:

```typescript
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./solicitar.utils";
```

Replace with:

```typescript
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "./solicitar.utils";
```

Find:

```typescript
export function parseSolicitacaoXml(
  xmlText: string,
  context: XmlImportContext
): XmlImportResult {
```

(no change to this line — keeping it here only to anchor the next edit's location; the function already receives `context`)

Find:

```typescript
  // <urgencia> — com fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  let customUrgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    urgency = match ? match.value : "outro";
    customUrgency = match ? "" : urgenciaTag;
    if (!match) {
      warnings.push(
        `<urgencia> com valor '${urgenciaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

Replace with:

```typescript
  // <urgencia>
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, context.urgencyLevels);
    if (match) {
      urgency = match.value;
    } else {
      warnings.push(
        `<urgencia> com valor '${urgenciaTag}' não corresponde a nenhuma opção cadastrada e foi ignorado.`
      );
    }
  }
```

- [ ] **Step 4: `xml-import.ts` — drop `customUrgency` from the returned form data**

Find:

```typescript
    projectNarrative,
    urgency,
    customUrgency,
    deadline,
```

Replace with:

```typescript
    projectNarrative,
    urgency,
    deadline,
```

- [ ] **Step 5: `use-xml-opportunity-importer.ts` — thread `urgencyLevels` through**

Find:

```typescript
export interface XmlOpportunityImporterOptions {
  userId: string | undefined;
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  companies: { id: string; name: string }[];
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
```

Replace with:

```typescript
export interface XmlOpportunityImporterOptions {
  userId: string | undefined;
  areas: { value: string; label: string; id?: string }[];
  themesByArea: Record<string, { value: string; label: string; id?: string }[]>;
  urgencyLevels: { value: string; label: string }[];
  companies: { id: string; name: string }[];
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
```

Find:

```typescript
  const { userId, areas, themesByArea, companies, buildTypeLabel, forcedCompanyId } = options;
```

Replace with:

```typescript
  const { userId, areas, themesByArea, urgencyLevels, companies, buildTypeLabel, forcedCompanyId } = options;
```

Find:

```typescript
    const result = parseSolicitacaoXml(xmlText, { areas, themesByArea, companies });
```

Replace with:

```typescript
    const result = parseSolicitacaoXml(xmlText, { areas, themesByArea, urgencyLevels, companies });
```

- [ ] **Step 6: `gerar-ia/page.tsx` — get `urgencyLevels` from `useTaxonomy()` and thread it through both call sites**

Find:

```tsx
  const { areas: PROJECT_AREAS, themesByArea: PROJECT_THEMES_BY_AREA, buildTypeLabel } = useTaxonomy();
```

Replace with:

```tsx
  const {
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    urgencyLevels: URGENCY_LEVELS,
    buildTypeLabel,
  } = useTaxonomy();
```

Find:

```tsx
  const importer = useXmlOpportunityImporter({
    userId: user?.id,
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    companies,
    buildTypeLabel,
    forcedCompanyId: companyId,
  });
```

Replace with:

```tsx
  const importer = useXmlOpportunityImporter({
    userId: user?.id,
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    urgencyLevels: URGENCY_LEVELS,
    companies,
    buildTypeLabel,
    forcedCompanyId: companyId,
  });
```

Find:

```tsx
        const parsed = parseSolicitacaoXml(xmlText, {
          areas: PROJECT_AREAS,
          themesByArea: PROJECT_THEMES_BY_AREA,
          companies,
        });
```

Replace with:

```tsx
        const parsed = parseSolicitacaoXml(xmlText, {
          areas: PROJECT_AREAS,
          themesByArea: PROJECT_THEMES_BY_AREA,
          urgencyLevels: URGENCY_LEVELS,
          companies,
        });
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about any of the 4 files touched in this task.

- [ ] **Step 8: Commit**

```bash
git add src/app/(private)/cliente/solicitar/utils/build-project-payload.ts src/app/(private)/cliente/solicitar/utils/xml-import.ts src/shared/hooks/use-xml-opportunity-importer.ts "src/app/(private)/admin/oportunidades/gerar-ia/page.tsx"
git commit -m "feat: thread dynamic urgency levels through XML import paths"
```

---

### Task 8: `ajuda-xml/page.tsx` — dynamic accepted values

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx`

- [ ] **Step 1: Drop the static import**

Find:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "../utils/solicitar.utils";
```

Replace with:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  BENEFIT_OPTIONS,
} from "../utils/solicitar.utils";
```

- [ ] **Step 2: Get `urgencyLevels` from the hook**

Find:

```tsx
  const { areas, themesByArea } = useTaxonomy();
```

Replace with:

```tsx
  const { areas, themesByArea, urgencyLevels } = useTaxonomy();
```

- [ ] **Step 3: Use it for the accepted values**

Find:

```tsx
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
```

Replace with:

```tsx
      acceptedValues: urgencyLevels.map((u) => u.label),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about this file.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx"
git commit -m "feat: ajuda-xml page lists accepted urgency values dynamically"
```

---

### Task 9: `project-detail-sections.tsx` — live label resolution

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Add the trpc import**

Find:

```tsx
"use client";

import type { Project, UserRole } from "@/shared/types";
```

Replace with:

```tsx
"use client";

import { trpc } from "@/shared/trpc/client";
import type { Project, UserRole } from "@/shared/types";
```

- [ ] **Step 2: Drop `URGENCY_LEVELS` from the taxonomy import**

Find:

```tsx
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

Replace with:

```tsx
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 3: Query the live list**

Find:

```tsx
  const [isEditing, setIsEditing] = useState(false);
  const { maskFreeText, maskCompanyName } = useDemoMode();
```

Replace with:

```tsx
  const [isEditing, setIsEditing] = useState(false);
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const urgencyLevelOptions = dbUrgencyLevels.map((u) => ({ value: u.slug, label: u.name }));
```

- [ ] **Step 4: Use it in the FieldRow**

Find:

```tsx
        <FieldRow label="Urgência" value={resolveLabel(project.urgency, URGENCY_LEVELS)} />
```

Replace with:

```tsx
        <FieldRow label="Urgência" value={resolveLabel(project.urgency, urgencyLevelOptions)} />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about this file.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx
git commit -m "feat: resolve urgency label from the live taxonomy list"
```

---

### Task 10: `project-request-edit-form.tsx` — inline create

**Files:**
- Modify: `src/shared/components/project-request-edit-form.tsx`

- [ ] **Step 1: Add `useMemo` and the combobox import**

Find:

```tsx
import { useEffect, useState } from "react";
```

Replace with:

```tsx
import { useEffect, useMemo, useState } from "react";
```

Find:

```tsx
import { RatingRow } from "@/shared/components/rating-row";
```

Replace with:

```tsx
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
import { RatingRow } from "@/shared/components/rating-row";
```

- [ ] **Step 2: Drop `URGENCY_LEVELS` from the taxonomy import**

Find:

```tsx
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

Replace with:

```tsx
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 3: Add a local `slugify` helper**

Find:

```tsx
import { useTaxonomy } from "@/src/app/(private)/cliente/solicitar/utils/use-taxonomy";
```

Replace with:

```tsx
import { useTaxonomy } from "@/src/app/(private)/cliente/solicitar/utils/use-taxonomy";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
```

- [ ] **Step 4: Query urgency levels and build the combobox options + create mutation**

Find:

```tsx
  const { areas, themesByArea, isLoading: isTaxonomyLoading } = useTaxonomy();
```

Replace with:

```tsx
  const { areas, themesByArea, isLoading: isTaxonomyLoading } = useTaxonomy();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const urgencyLevelOptions = useMemo(() => {
    const opts = dbUrgencyLevels.map((u) => ({ value: u.slug, label: u.name }));
    if (form.urgency && !opts.some((o) => o.value === form.urgency)) {
      opts.push({ value: form.urgency, label: form.urgency });
    }
    return opts;
  }, [dbUrgencyLevels, form.urgency]);
  const createUrgencyLevel = trpc.taxonomy.createUrgencyLevel.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listUrgencyLevels.invalidate();
      set("urgency", created.slug);
      toast.success(`Nível de urgência "${created.name}" criado`);
    },
    onError: (err) => toast.error("Falha ao criar nível de urgência", { description: err.message }),
  });
```

(Confirmed: the local state is declared as `const [form, setForm] = useState<EditFormState>({...})` around line 93 — `form.urgency` above is correct.)

- [ ] **Step 5: Replace the Select with the combobox**

Find:

```tsx
        <div className="space-y-1.5">
          <Label>Urgência</Label>
          <Select value={form.urgency} onValueChange={(v) => set("urgency", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {URGENCY_LEVELS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

Replace with:

```tsx
        <div className="space-y-1.5">
          <Label>Urgência</Label>
          <CreatableCombobox
            options={urgencyLevelOptions}
            value={form.urgency}
            onChange={(v) => set("urgency", v)}
            onCreate={(label) =>
              createUrgencyLevel.mutate({
                name: label,
                slug: slugify(label),
                order: dbUrgencyLevels.length,
              })
            }
            placeholder="Selecione ou crie"
            disabled={createUrgencyLevel.isPending}
          />
        </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about this file. If the state variable isn't actually named `form`, fix the references (see Step 4's note) and re-run.

- [ ] **Step 7: Commit**

```bash
git add src/shared/components/project-request-edit-form.tsx
git commit -m "feat: admin can create a new urgency level inline while editing"
```

---

### Task 11: XML "projeto completo" round-trip

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts`
- Modify: `src/shared/xml/parse-projeto-completo-xml.ts`
- Modify: `src/shared/components/project-xml-import-export.tsx`

- [ ] **Step 1: `build-projeto-completo-xml.ts` — accept `urgencyLevels` as a parameter**

Find:

```typescript
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

Replace with:

```typescript
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

Find:

```typescript
export function buildProjetoCompletoXml(project: Project): string {
```

Replace with:

```typescript
export function buildProjetoCompletoXml(
  project: Project,
  urgencyLevels: { value: string; label: string }[]
): string {
```

Find:

```typescript
  lines.push(tag("urgencia", resolveLabel(project.urgency, URGENCY_LEVELS)));
```

Replace with:

```typescript
  lines.push(tag("urgencia", resolveLabel(project.urgency, urgencyLevels)));
```

- [ ] **Step 2: `parse-projeto-completo-xml.ts` — accept `urgencyLevels` as a parameter**

Find:

```typescript
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
```

Replace with:

```typescript
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
```

Find:

```typescript
export function parseProjetoCompletoXml(xmlText: string): ParseProjetoCompletoResult {
```

Replace with:

```typescript
export function parseProjetoCompletoXml(
  xmlText: string,
  urgencyLevels: { value: string; label: string }[]
): ParseProjetoCompletoResult {
```

Find:

```typescript
  data.urgency = resolveEnum(getDirectChildText(root, "urgencia"), URGENCY_LEVELS, "Urgência", warnings);
```

Replace with:

```typescript
  data.urgency = resolveEnum(getDirectChildText(root, "urgencia"), urgencyLevels, "Urgência", warnings);
```

- [ ] **Step 3: `project-xml-import-export.tsx` — fetch the list and pass it through**

Find:

```tsx
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import type { Project } from "@/shared/types";
import { buildProjetoCompletoXml } from "@/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "@/shared/xml/parse-projeto-completo-xml";
```

Replace with:

```tsx
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import type { Project } from "@/shared/types";
import { buildProjetoCompletoXml } from "@/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "@/shared/xml/parse-projeto-completo-xml";

function toUrgencyOptions(levels: { name: string; slug: string }[]) {
  return levels.map((l) => ({ value: l.slug, label: l.name }));
}
```

Find:

```tsx
export function ProjectXmlImportExport({ project }: { project: Project }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
```

Replace with:

```tsx
export function ProjectXmlImportExport({ project }: { project: Project }) {
  const utils = trpc.useUtils();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
```

Find:

```tsx
  function handleExport() {
    const xml = buildProjetoCompletoXml(project);
```

Replace with:

```tsx
  function handleExport() {
    const xml = buildProjetoCompletoXml(project, toUrgencyOptions(dbUrgencyLevels));
```

Find:

```tsx
    const text = await file.text();
    const parsed = parseProjetoCompletoXml(text);
```

Replace with:

```tsx
    const text = await file.text();
    const parsed = parseProjetoCompletoXml(text, toUrgencyOptions(dbUrgencyLevels));
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about any of the 3 files.

- [ ] **Step 5: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts src/shared/xml/parse-projeto-completo-xml.ts src/shared/components/project-xml-import-export.tsx
git commit -m "feat: projeto-completo XML round-trip resolves urgency dynamically"
```

---

### Task 12: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: identical baseline to before this plan started (only the pre-existing `src/shared/components/ui/chart.tsx`, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx` errors) — zero errors related to any file touched in this plan.

- [ ] **Step 2: Confirm no stray references remain**

Run: `grep -rn "customUrgency" src --include=*.ts --include=*.tsx`
Expected: zero matches.

Run: `grep -rn "URGENCY_LEVELS" src --include=*.ts --include=*.tsx`
Expected: only `src/shared/constants/project-taxonomy.ts` (the definition) and `src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts` (imported as `FALLBACK_URGENCY_LEVELS`) — every consumer should now go through `useTaxonomy().urgencyLevels` or a query, not the raw constant.

- [ ] **Step 3: Schema check**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: schema valid.

- [ ] **Step 4: Manual QA once deployed**

No local DB/dev server in this environment (same established limitation as prior plans) — verify after deploy:
- Configurações → Categorias shows "Níveis de Urgência" with the 4 seeded values, and create/edit/deactivate/delete work.
- `cliente/solicitar`: the urgency Select shows only cadastrados values, no "Outro" input.
- Editing an existing project (admin): the urgência combobox lets you pick an existing value or type a new one to create it inline; the new value then shows up in Configurações → Categorias and in the client's request form.
- Project detail view shows the correct urgency label.
- Export a project's XML, confirm `<urgencia>` has the resolved label; re-import the same file and confirm no warnings.
- `cliente/solicitar/ajuda-xml` page's accepted-values list for `<urgencia>` matches whatever is currently cadastrado.

---

## Self-Review Notes

- **Spec coverage:** new admin-managed taxonomy with full CRUD (✅ Tasks 1-3), no `Project` migration needed (✅ Task 1 — no relation added), client form drops "Outro"/free text (✅ Tasks 5-6), admin inline-create (✅ Task 10), all read paths (detail view, XML round-trip, ajuda-xml) resolve dynamically with graceful fallback to raw text for unmatched legacy values (✅ Tasks 9, 11, 8 — via `resolveLabel`'s existing fallback-to-raw behavior, unchanged).
- **Type consistency:** `{ value: string; label: string }[]` is the consistent shape threaded through `useTaxonomy().urgencyLevels`, `XmlImportContext.urgencyLevels`, `XmlOpportunityImporterOptions.urgencyLevels`, and the two XML build/parse function parameters — matching the shape `resolveLabel`/`resolveEnum`/`matchByLabel` already expect.
- **No placeholders:** every step has full code, verified against the actual file contents (e.g. Task 10 confirms the edit form's state variable is named `form`, not guessed).
