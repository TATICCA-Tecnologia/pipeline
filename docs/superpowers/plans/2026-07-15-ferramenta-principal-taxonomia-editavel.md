# Ferramenta Principal Taxonomia Editável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "Ferramenta principal" from a hardcoded TS array + free-text column into a real DB-backed taxonomy (`MainTool`), manageable with full CRUD in `/admin/configuracoes/categorias`, with inline "create new" via a combobox on the architecture tab.

**Architecture:** New `MainTool` Prisma model mirrors the existing `ProjectArea` pattern (id/name/slug/isActive/order). `Project.mainTool String?` becomes `Project.mainToolId String?` + relation, migrated via a hand-written SQL migration that creates the table, seeds the 6 current options, backfills existing projects by matching slug, then drops the old column — same hand-written-migration convention already used in this repo (no local DB, no `prisma migrate dev`). Backend CRUD is added to the existing `taxonomy.router.ts` (`listMainTools`/`listAllMainTools`/`createMainTool`/`updateMainTool`/`deleteMainTool`), copying the `ProjectArea` procedures verbatim in shape. A new reusable `CreatableCombobox` component (built on the already-present but unused `Popover`+`Command` primitives) replaces the plain `<Select>` on the architecture tab, and the admin categorias page gets a new flat "Ferramentas principais" section copying its existing "Sugestões" card pattern.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PostgreSQL) + shadcn/ui (Radix) + Tailwind. No test framework exists in this repo and there is no local DB — per established project convention (confirmed via prior user instruction), validation is `prisma validate`/`prisma generate` (schema-only, no DB connection), `tsc --noEmit`, `pnpm lint`, and `pnpm build`. Never run `prisma migrate dev` or connect to a live DB from this machine. Deploy happens by pushing to `main`; the Docker entrypoint runs `prisma migrate deploy` in production.

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma:173-177` (remove `mainTool` scalar from "Arquitetura tecnica" block)
- Modify: `prisma/schema.prisma:196-213` (add `mainTool`/`mainToolId` relation next to `areaId`/`themeId`)
- Modify: `prisma/schema.prisma:484-498` (add new `MainTool` model after `ProjectTheme`)
- Create: `prisma/migrations/20260715120000_add_main_tool_taxonomy/migration.sql`

- [ ] **Step 1: Remove the old scalar column from the schema**

In `prisma/schema.prisma`, find:
```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  solutionTypes      Json?   // array de chaves: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro
  mainTool           String? // python, rocketbot, automation-anywhere, power-automate, power-apps, outro
  executionStrategy  String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes     String?
```
Replace with:
```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  solutionTypes      Json?   // array de chaves: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro
  executionStrategy  String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes     String?
```

- [ ] **Step 2: Add the FK relation next to areaId/themeId**

In the same file, find:
```prisma
  theme        ProjectTheme?    @relation(fields: [themeId], references: [id], onDelete: SetNull)
  themeId      String?
  features     ProjectFeature[]
```
Replace with:
```prisma
  theme        ProjectTheme?    @relation(fields: [themeId], references: [id], onDelete: SetNull)
  themeId      String?
  mainTool     MainTool?        @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId   String?
  features     ProjectFeature[]
```

- [ ] **Step 3: Add the MainTool model**

Find:
```prisma
model ProjectTheme {
  id        String      @id @default(cuid())
  name      String
  slug      String
  isActive  Boolean     @default(true)
  order     Int         @default(0)
  areaId    String
  area      ProjectArea @relation(fields: [areaId], references: [id], onDelete: Cascade)
  projects  Project[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@unique([slug, areaId])
  @@map("project_themes")
}
```
Add immediately after its closing `}`:
```prisma

// ==========================================
// TAXONOMIA CONFIGURAVEL (FERRAMENTA PRINCIPAL)
// ==========================================

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

- [ ] **Step 4: Validate the schema (no DB connection needed)**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 5: Regenerate the Prisma Client**

Run: `npx prisma generate`
Expected: exits 0, prints `Generated Prisma Client ... to .\node_modules\@prisma\client`. This makes `ctx.db.mainTool` type-safe for the following tasks.

- [ ] **Step 6: Write the migration SQL**

Create `prisma/migrations/20260715120000_add_main_tool_taxonomy/migration.sql`:
```sql
-- CreateTable
CREATE TABLE "main_tools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_tools_slug_key" ON "main_tools"("slug");

-- Seed: preserve the 6 options previously hardcoded in MAIN_TOOLS (architecture.ts)
INSERT INTO "main_tools" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-main-tool-python', 'Python', 'python', 0, CURRENT_TIMESTAMP),
    ('seed-main-tool-rocketbot', 'Rocketbot', 'rocketbot', 1, CURRENT_TIMESTAMP),
    ('seed-main-tool-automation-anywhere', 'Automation Anywhere', 'automation-anywhere', 2, CURRENT_TIMESTAMP),
    ('seed-main-tool-power-automate', 'Power Automate', 'power-automate', 3, CURRENT_TIMESTAMP),
    ('seed-main-tool-power-apps', 'Power Apps', 'power-apps', 4, CURRENT_TIMESTAMP),
    ('seed-main-tool-outro', 'Outro', 'outro', 5, CURRENT_TIMESTAMP);

-- AlterTable: add the new FK column
ALTER TABLE "projects" ADD COLUMN "mainToolId" TEXT;

-- Backfill: match each project's existing free-text mainTool slug to the new main_tools row
UPDATE "projects" p
SET "mainToolId" = mt."id"
FROM "main_tools" mt
WHERE p."mainTool" = mt."slug";

-- AlterTable: drop the old free-text column, now migrated
ALTER TABLE "projects" DROP COLUMN "mainTool";

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_mainToolId_fkey" FOREIGN KEY ("mainToolId") REFERENCES "main_tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260715120000_add_main_tool_taxonomy/migration.sql
git commit -m "feat: add MainTool taxonomy model and migration"
```

---

## Task 2: Backend CRUD for MainTool

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`

- [ ] **Step 1: Add the MainTool procedures**

In `src/server/trpc/routers/taxonomy.router.ts`, find the closing of the router (the `seedDefaults` mutation followed by `});` at the end of the file):
```prisma
    return { seeded: true };
  }),
});
```
Replace with (adds a new section before the final `});`):
```prisma
    return { seeded: true };
  }),

  // ==========================================
  // FERRAMENTA PRINCIPAL
  // ==========================================

  listMainTools: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllMainTools: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      orderBy: { order: "asc" },
    });
  }),

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

  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
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
git commit -m "feat: add MainTool CRUD procedures to taxonomy router"
```

---

## Task 3: project.router.ts — rename mainTool to mainToolId

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:54` (ARCHITECT_ONLY_FIELDS)
- Modify: `src/server/trpc/routers/project.router.ts:224-236` (byId query `include`)
- Modify: `src/server/trpc/routers/project.router.ts:289` (byId return mapping)
- Modify: `src/server/trpc/routers/project.router.ts:476` (update input schema)
- Modify: `src/server/trpc/routers/project.router.ts:564` (update data assignment)

- [ ] **Step 1: Rename the field in ARCHITECT_ONLY_FIELDS**

Find:
```typescript
  "solutionTypes",
  "mainTool",
  "executionStrategy",
```
Replace with:
```typescript
  "solutionTypes",
  "mainToolId",
  "executionStrategy",
```

- [ ] **Step 2: Include the mainTool relation in the byId query**

Find:
```typescript
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          tasks: true,
          features: true,
        },
      });
```
Replace with:
```typescript
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
        },
      });
```

- [ ] **Step 3: Fix the return mapping**

Find:
```typescript
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```
Replace with:
```typescript
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```
(`project.mainTool` is now the included relation object `{id, name, slug} | null` instead of a string — the field keeps its name but changes shape; `mainToolId` is added alongside as the flat scalar, matching the `areaId`/`themeId` convention already used elsewhere in this same return block.)

- [ ] **Step 4: Rename the update input field**

Find:
```typescript
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```
Replace with:
```typescript
        solutionTypes: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

- [ ] **Step 5: Rename the update data assignment**

Find:
```typescript
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```
Replace with:
```typescript
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project.router.ts`. (Errors will still show in files not yet updated — Tasks 4–9 fix those. It's fine if `shared/types/index.ts` consumers still show errors at this point; just confirm no *new* errors originate from `project.router.ts` itself.)

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: switch project.mainTool to a mainToolId relation"
```

---

## Task 4: Shared Project type

**Files:**
- Modify: `src/shared/types/index.ts:76-77`

- [ ] **Step 1: Update the mainTool field type**

Find:
```typescript
  solutionTypes?: string[];
  mainTool?: string;
  executionStrategy?: string;
```
Replace with:
```typescript
  solutionTypes?: string[];
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
  executionStrategy?: string;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: errors should now surface in the 3 remaining consumer files (`architecture-tab.tsx`, `project-detail-sections.tsx`, `project-request-edit-form.tsx`) — that's expected, fixed in Tasks 6, 8, 9.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: type Project.mainTool as a resolved relation object"
```

---

## Task 5: CreatableCombobox component

**Files:**
- Create: `src/shared/components/ui/creatable-combobox.tsx`

- [ ] **Step 1: Write the component**

Create `src/shared/components/ui/creatable-combobox.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/src/shared/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/shared/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/shared/components/ui/popover";

export interface CreatableComboboxOption {
  value: string;
  label: string;
}

interface CreatableComboboxProps {
  options: CreatableComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  onCreate: (label: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function CreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado.",
  disabled,
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, search]);

  const trimmedSearch = search.trim();
  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCreate = trimmedSearch.length > 0 && !hasExactMatch;

  function handleSelect(optionValue: string) {
    onChange(optionValue);
    setSearch("");
    setOpen(false);
  }

  function handleCreate() {
    onCreate(trimmedSearch);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar ou criar..."
          />
          <CommandList>
            {filtered.length === 0 && !showCreate && (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__${trimmedSearch}`}
                  onSelect={handleCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar &quot;{trimmedSearch}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `creatable-combobox.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/ui/creatable-combobox.tsx
git commit -m "feat: add reusable CreatableCombobox component"
```

---

## Task 6: Wire the combobox into the architecture tab

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Update imports**

Find:
```tsx
import { Loader2, Plus, Save, Trash2, Wrench, ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "../_constants/architecture";
```
Replace with:
```tsx
import { Loader2, Plus, Save, Trash2, Wrench, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { SOLUTION_TYPES, EXECUTION_STRATEGIES } from "../_constants/architecture";
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
```

- [ ] **Step 2: Add a local slugify helper**

Find:
```tsx
const UNASSIGNED = "__unassigned__";
```
Replace with:
```tsx
const UNASSIGNED = "__unassigned__";

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

- [ ] **Step 3: Rename the mainTool state and add the taxonomy query/mutation**

Find:
```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainTool, setMainTool] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```
Replace with:
```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

Find:
```tsx
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      toast.success("Arquitetura salva");
    },
    onError: (err) => toast.error("Falha ao salvar", { description: err.message }),
  });
```
Replace with:
```tsx
  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: projectId });
      toast.success("Arquitetura salva");
    },
    onError: (err) => toast.error("Falha ao salvar", { description: err.message }),
  });

  const { data: mainTools = [] } = trpc.taxonomy.listMainTools.useQuery();
  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listMainTools.invalidate();
      setMainToolId(created.id);
      toast.success(`Ferramenta "${created.name}" criada`);
    },
    onError: (err) => toast.error("Falha ao criar ferramenta", { description: err.message }),
  });
```

- [ ] **Step 4: Update the effect that syncs project data into local state**

Find:
```tsx
      setSolutionTypes(project.solutionTypes ?? []);
      setMainTool(project.mainTool ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```
Replace with:
```tsx
      setSolutionTypes(project.solutionTypes ?? []);
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

- [ ] **Step 5: Update the save payload**

Find:
```tsx
      solutionTypes,
      mainTool: mainTool || null,
      executionStrategy: executionStrategy || null,
```
Replace with:
```tsx
      solutionTypes,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
```

- [ ] **Step 6: Replace the Select with the combobox**

Find:
```tsx
            <div className="space-y-2">
              <Label>Ferramenta principal</Label>
              <Select value={mainTool} onValueChange={setMainTool}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {MAIN_TOOLS.map((opt) => (
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
            <div className="space-y-2">
              <Label>Ferramenta principal</Label>
              <CreatableCombobox
                options={mainTools.map((t) => ({ value: t.id, label: t.name }))}
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
```

- [ ] **Step 7: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `architecture-tab.tsx`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: replace main-tool select with creatable combobox on architecture tab"
```

---

## Task 7: Remove MAIN_TOOLS from the constants file

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts`

- [ ] **Step 1: Delete the MAIN_TOOLS export**

Find:
```typescript
export const MAIN_TOOLS = [
  { value: "python", label: "Python" },
  { value: "rocketbot", label: "Rocketbot" },
  { value: "automation-anywhere", label: "Automation Anywhere" },
  { value: "power-automate", label: "Power Automate" },
  { value: "power-apps", label: "Power Apps" },
  { value: "outro", label: "Outro" },
] as const;

export const EXECUTION_STRATEGIES = [
```
Replace with:
```typescript
export const EXECUTION_STRATEGIES = [
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from this file. (`project-detail-sections.tsx` / `project-request-edit-form.tsx` will still error until Tasks 8–9 land — expected at this point.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts"
git commit -m "chore: remove hardcoded MAIN_TOOLS constant"
```

---

## Task 8: Fix display in project-detail-sections.tsx

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Remove MAIN_TOOLS from the import**

Find:
```tsx
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```
Replace with:
```tsx
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 2: Fix the field display**

Find:
```tsx
          <FieldRow label="Ferramenta principal" value={resolveLabel(project.mainTool, MAIN_TOOLS)} />
```
Replace with:
```tsx
          <FieldRow label="Ferramenta principal" value={project.mainTool?.name} />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `project-detail-sections.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx
git commit -m "fix: display main tool via resolved relation instead of hardcoded list"
```

---

## Task 9: Fix display in project-request-edit-form.tsx

**Files:**
- Modify: `src/shared/components/project-request-edit-form.tsx`

- [ ] **Step 1: Remove MAIN_TOOLS from the import**

Find:
```tsx
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```
Replace with:
```tsx
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 2: Fix the field display**

Find:
```tsx
          <FieldRow label="Ferramenta principal" value={resolveLabel(project.mainTool, MAIN_TOOLS)} />
```
Replace with:
```tsx
          <FieldRow label="Ferramenta principal" value={project.mainTool?.name} />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors in the whole project now (this was the last consumer of the old `mainTool: string` shape).

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-request-edit-form.tsx
git commit -m "fix: display main tool via resolved relation instead of hardcoded list"
```

---

## Task 10: Admin CRUD section in /admin/configuracoes/categorias

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Add the type alias and Wrench icon import**

Find:
```tsx
type RouterOutputs = inferRouterOutputs<AppRouter>;
type AreaItem = RouterOutputs["taxonomy"]["listAllAreas"][number];
type SuggestionItem = RouterOutputs["taxonomy"]["listAllSuggestions"][number];
```
Replace with:
```tsx
type RouterOutputs = inferRouterOutputs<AppRouter>;
type AreaItem = RouterOutputs["taxonomy"]["listAllAreas"][number];
type SuggestionItem = RouterOutputs["taxonomy"]["listAllSuggestions"][number];
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
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
} from "lucide-react";
```

- [ ] **Step 2: Add state, queries and mutations**

Find:
```tsx
  // — DELETE CONFIRM —
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }
```
Replace with:
```tsx
  // — FERRAMENTAS PRINCIPAIS —
  const { data: mainTools = [] } = trpc.taxonomy.listAllMainTools.useQuery();
  const [mainToolDialog, setMainToolDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [mainToolForm, setMainToolForm] = useState({ name: "", slug: "", order: 0 });

  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); setMainToolDialog({ open: false }); toast({ title: "Ferramenta criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMainTool = trpc.taxonomy.updateMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); setMainToolDialog({ open: false }); toast({ title: "Ferramenta atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMainTool = trpc.taxonomy.deleteMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); toast({ title: "Ferramenta removida" }); },
  });
  const toggleMainTool = trpc.taxonomy.updateMainTool.useMutation({
    onSuccess: () => utils.taxonomy.listAllMainTools.invalidate(),
  });

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

- [ ] **Step 3: Render the new section**

Find the end of the areas list block (right before the "Dialog: Área" comment):
```tsx
        </div>
      )}

      {/* Dialog: Área */}
```
Replace with:
```tsx
        </div>
      )}

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
                  <Switch
                    checked={tool.isActive}
                    onCheckedChange={(v) => toggleMainTool.mutate({ id: tool.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditMainTool(tool)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "mainTool", id: tool.id, label: tool.name })}
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

- [ ] **Step 4: Add the create/edit dialog**

Find the end of the "Dialog: Sugestão" block (right before the "Confirm delete" comment):
```tsx
      </Dialog>

      {/* Confirm delete */}
```
Replace with:
```tsx
      </Dialog>

      {/* Dialog: Ferramenta principal */}
      <Dialog open={mainToolDialog.open} onOpenChange={(o) => setMainToolDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mainToolDialog.editing ? "Editar ferramenta" : "Nova ferramenta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={mainToolForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setMainToolForm((f) => ({
                    ...f,
                    name,
                    slug: mainToolDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: UiPath"
              />
            </div>
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

      {/* Confirm delete */}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: add main-tool CRUD section to admin categorias page"
```

---

## Task 11: Final validation pass

**Files:** none (validation only)

- [ ] **Step 1: Full type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors (warnings pre-existing elsewhere in the repo are fine; nothing new from the files touched in this plan).

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build completes successfully (`✓ Compiled successfully`). This also exercises `prisma generate` via the `postinstall`/build pipeline if configured, and catches any remaining type or import errors across the app.

- [ ] **Step 4: Manual review of the migration**

Re-read `prisma/migrations/20260715120000_add_main_tool_taxonomy/migration.sql` end to end once more — this repo has no local DB to dry-run it against, so this file only gets exercised for real when it runs against production via `prisma migrate deploy` on next deploy. Confirm: table creation, seed values match the 6 original `MAIN_TOOLS` entries exactly (slugs unchanged), backfill `UPDATE` joins on the right columns, old column drop happens only after backfill, FK constraint mirrors the `areaId`/`themeId` `ON DELETE SET NULL` pattern.

- [ ] **Step 5: Push to trigger deploy**

Per project convention, do not attempt any local migration or DB validation — push to `main` (or open a PR, per user's usual flow) and let GitHub Actions + the Docker entrypoint (`prisma migrate deploy && pnpm start`) apply the migration in production.
