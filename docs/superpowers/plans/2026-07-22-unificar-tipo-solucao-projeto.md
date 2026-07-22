# Unificar Tipo de Solução e Tipo de Projeto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the fixed, single-select-adjacent "Tipo de Solução" checklist and the customizable single-select "Tipo de Projeto" into one multi-select, customizable field ("Tipo de Solução"), backed by the existing `ProjectKind` model turned into a many-to-many relation with `Project`, without losing any existing data.

**Architecture:** `Project.solutionTypes: Json?` (8 hardcoded keys) and `Project.projectKindId` (scalar FK) are replaced by a single implicit many-to-many relation `Project.solutionTypes: ProjectKind[]`. A hand-written migration backfills both old fields into the new join table before dropping them. All ~10 consumers (architecture tab UI, project cards/filters, executive slide, XML round-trip export/import, categorias admin page) are updated to read/write the new shape.

**Tech Stack:** Prisma (PostgreSQL), tRPC v11, Next.js/React, Zod.

**Note on testing:** this repo has no automated test runner and no local database in this environment (confirmed pattern: deploy happens via GitHub Actions running `prisma migrate deploy` against the real DB on push to `main`). Verification here uses `DATABASE_URL=<dummy> npx prisma validate` / `npx prisma generate` (both work fully offline — they only parse `schema.prisma` and emit client code, no DB connection needed) plus `npx tsc --noEmit`, consistent with how earlier work in this session was verified.

---

## File Structure

- **Modify:** `prisma/schema.prisma` — `Project.solutionTypes`/`projectKindId`/`projectKind` fields replaced by `Project.solutionTypes ProjectKind[]`.
- **Create:** `prisma/migrations/20260722120000_unify_solution_types/migration.sql` — junction table + backfill + column drops.
- **Modify:** `src/server/trpc/routers/project.router.ts` — `list`, `byId`, `update`, `importXml` procedures.
- **Modify:** `src/shared/xml/build-projeto-completo-xml.ts`, `src/shared/xml/parse-projeto-completo-xml.ts` — round-trip XML tags.
- **Modify:** `src/shared/types/index.ts` — `Project` type shape.
- **Modify:** `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx` — multi-select checkbox UI + inline "create new" affordance.
- **Modify:** `src/shared/components/project-detail-sections.tsx`, `project-executive-slide.tsx`, `project-request-edit-form.tsx` — read-only label rendering.
- **Modify:** `src/shared/components/project-card.tsx` — badge rendering (single → multiple).
- **Modify:** `src/shared/components/project-kind-filter.tsx`, `src/app/(private)/admin/projetos/page.tsx` — filter matching logic + CSV column.
- **Modify:** `src/app/(private)/admin/configuracoes/categorias/page.tsx` — user-facing text renames only.
- **Modify:** `src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts` — remove `SOLUTION_TYPES` (last task, after all consumers stop importing it).

---

### Task 1: Schema change + migration

**Files:**
- Modify: `prisma/schema.prisma:177` and `prisma/schema.prisma:211-212`
- Create: `prisma/migrations/20260722120000_unify_solution_types/migration.sql`

- [ ] **Step 1: Update the `Project` model**

Find:
```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  solutionTypes     Json? // array de chaves: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro
  executionStrategy String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes    String?
```

Replace with:
```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  executionStrategy String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes    String?
```

Find:
```prisma
  mainTool         MainTool?                 @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId       String?
  projectKind      ProjectKind?              @relation(fields: [projectKindId], references: [id], onDelete: SetNull)
  projectKindId    String?
```

Replace with:
```prisma
  mainTool         MainTool?                 @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId       String?
  solutionTypes    ProjectKind[]             @relation("ProjectSolutionTypes")
```

- [ ] **Step 2: Update the `ProjectKind` model**

Find:
```prisma
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
```

- [ ] **Step 3: Validate the schema (no DB needed)**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid`

- [ ] **Step 4: Write the migration**

Create `prisma/migrations/20260722120000_unify_solution_types/migration.sql` (directory + file, following the exact hand-written-migration convention already used by every migration in `prisma/migrations/` in this repo — there is no local DB to run `prisma migrate dev`, so migrations here are always authored by hand and applied via `prisma migrate deploy` in the deploy pipeline):

```sql
-- Seed: solution-type categories referenced by the legacy Project.solutionTypes
-- values (see mapping below) and by the suggested classification list —
-- inserted before the backfill so every join by slug finds a row. Existing
-- "Tipo de Projeto" rows (Automação, Agente IA, Dados e BI, Integração entre
-- Sistemas, seeded in 20260717120000_add_project_kind_taxonomy, plus whatever
-- the admin has added since) are untouched and simply become additional
-- selectable options once the relation below is populated.
INSERT INTO "project_kinds" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-solution-type-rpa', 'RPA', 'rpa', 4, CURRENT_TIMESTAMP),
    ('seed-solution-type-api', 'API', 'api', 5, CURRENT_TIMESTAMP),
    ('seed-solution-type-ia', 'IA', 'ia', 6, CURRENT_TIMESTAMP),
    ('seed-solution-type-ocr', 'OCR', 'ocr', 7, CURRENT_TIMESTAMP),
    ('seed-solution-type-integracao', 'Integração', 'integracao', 8, CURRENT_TIMESTAMP),
    ('seed-solution-type-dashboards', 'Dashboards', 'dashboards', 9, CURRENT_TIMESTAMP),
    ('seed-solution-type-plataformas', 'Plataformas', 'plataformas', 10, CURRENT_TIMESTAMP),
    ('seed-solution-type-chatbots', 'Chatbots', 'chatbots', 11, CURRENT_TIMESTAMP),
    ('seed-solution-type-outros', 'Outros', 'outros', 12, CURRENT_TIMESTAMP),
    ('seed-solution-type-python', 'Python', 'python', 13, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- CreateTable: junction table for the new Project <-> ProjectKind many-to-many.
-- Prisma's implicit-m2m naming: table "_ProjectSolutionTypes" (from the
-- @relation("ProjectSolutionTypes") name), "A" = projects.id, "B" =
-- project_kinds.id ("Project" sorts before "ProjectKind" alphabetically).
CREATE TABLE "_ProjectSolutionTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_ProjectSolutionTypes_AB_unique" ON "_ProjectSolutionTypes"("A", "B");
CREATE INDEX "_ProjectSolutionTypes_B_index" ON "_ProjectSolutionTypes"("B");

ALTER TABLE "_ProjectSolutionTypes" ADD CONSTRAINT "_ProjectSolutionTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProjectSolutionTypes" ADD CONSTRAINT "_ProjectSolutionTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "project_kinds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: each project that had a single "Tipo de Projeto" keeps that
-- exact same value, now as one of possibly several selected solution types.
INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", p."projectKindId" FROM "projects" p WHERE p."projectKindId" IS NOT NULL
ON CONFLICT ("A", "B") DO NOTHING;

-- Backfill 2: each legacy fixed "Tipo de Solução" key becomes a link to the
-- matching project_kinds row, per the mapping confirmed with the user.
-- "ia-ocr" maps to both "ia" and "ocr" (two separate links).
INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'rpa' AND p."solutionTypes" @> '["rpa"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'api' AND p."solutionTypes" @> '["api"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'ia' AND p."solutionTypes" @> '["ia-ocr"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'ocr' AND p."solutionTypes" @> '["ia-ocr"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'plataformas' AND p."solutionTypes" @> '["power-platform"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'python' AND p."solutionTypes" @> '["python"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'integracao' AND p."solutionTypes" @> '["integracao"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'dashboards' AND p."solutionTypes" @> '["dashboard"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'outros' AND p."solutionTypes" @> '["outro"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

-- Drop the two old fields now that their data has been migrated.
ALTER TABLE "projects" DROP CONSTRAINT "projects_projectKindId_fkey";
ALTER TABLE "projects" DROP COLUMN "projectKindId";
ALTER TABLE "projects" DROP COLUMN "solutionTypes";
```

- [ ] **Step 5: Regenerate the Prisma client against the new schema**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma generate`
Expected: `✔ Generated Prisma Client` — this updates the local (gitignored) generated client types so the rest of this plan's `tsc --noEmit` checks reflect the new schema. Every subsequent task's type-check step in this plan depends on this having run.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260722120000_unify_solution_types"
git commit -m "feat: merge solution type and project kind into one m2m relation"
```

---

### Task 2: Backend — `list` and `byId` queries

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:178` (list include), `:199-200` (list mapping), `:265` (byId include), `:325,328-329` (byId mapping)

- [ ] **Step 1: Update `list`'s include block**

Find:
```typescript
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
```

Replace with:
```typescript
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
```

- [ ] **Step 2: Update `list`'s mapping**

Find:
```typescript
        area: p.area ?? undefined,
        theme: p.theme ?? undefined,
        projectKind: p.projectKind ?? undefined,
        projectKindId: p.projectKindId ?? undefined,
        estimatedDeadline: p.deadline ?? undefined,
```

Replace with:
```typescript
        area: p.area ?? undefined,
        theme: p.theme ?? undefined,
        solutionTypes: p.solutionTypes,
        estimatedDeadline: p.deadline ?? undefined,
```

- [ ] **Step 3: Update `byId`'s include block**

Find:
```typescript
          mainTool: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
```

Replace with:
```typescript
          mainTool: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          tasks: true,
```

- [ ] **Step 4: Update `byId`'s mapping**

Find:
```typescript
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        projectKind: project.projectKind ?? undefined,
        projectKindId: project.projectKindId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```

Replace with:
```typescript
        solutionTypes: project.solutionTypes,
        mainTool: project.mainTool ?? undefined,
        mainToolId: project.mainToolId ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: remaining errors only mention files not yet touched in this plan (`architecture-tab.tsx`, `project-card.tsx`, etc. — those are fixed in later tasks) plus the pre-existing unrelated `ui/*` errors noted at the top of this plan. No errors about `list`/`byId` themselves.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: return solutionTypes relation from project list/byId"
```

---

### Task 3: Backend — `update` mutation

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:66`, `:68`, `:521`, `:523`, `:610`, `:612`

- [ ] **Step 1: Update `ARCHITECT_ONLY_FIELDS`**

Find:
```typescript
  "companyId",
  "solutionTypes",
  "mainToolId",
```

Replace with:
```typescript
  "companyId",
  "solutionTypeIds",
  "mainToolId",
```

Then find:
```typescript
  "mainToolId",
  "projectKindId",
  "executionStrategy",
```

Replace with:
```typescript
  "mainToolId",
  "executionStrategy",
```

- [ ] **Step 2: Update the `update` input schema**

Find:
```typescript
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        projectKindId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

Replace with:
```typescript
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypeIds: z.array(z.string()).optional(),
        mainToolId: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
```

- [ ] **Step 3: Update the `data` assembly**

Find:
```typescript
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.projectKindId !== undefined) data.projectKindId = rest.projectKindId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

Replace with:
```typescript
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypeIds !== undefined) {
        data.solutionTypes = { set: rest.solutionTypeIds.map((id) => ({ id })) };
      }
      if (rest.mainToolId !== undefined) data.mainToolId = rest.mainToolId;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about the `update` mutation itself.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: update mutation writes solutionTypeIds as a m2m set"
```

---

### Task 4: Backend — `importXml` mutation

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:1268`, `:1275`, `:1346`, `:1374-1377`

- [ ] **Step 1: Update the input schema**

Find:
```typescript
        mainToolName: z.string().optional(),
        projectKindName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
```

Replace with:
```typescript
        mainToolName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
```

Find:
```typescript
        executionStrategy: z.string().optional(),
        solutionTypes: z.array(z.string()).optional(),
        architectNotes: z.string().optional(),
```

Replace with:
```typescript
        executionStrategy: z.string().optional(),
        solutionTypeNames: z.array(z.string()).optional(),
        architectNotes: z.string().optional(),
```

- [ ] **Step 2: Remove the old flat `solutionTypes` assignment**

Find:
```typescript
      if (input.executionStrategy !== undefined) data.executionStrategy = input.executionStrategy;
      if (input.solutionTypes !== undefined) data.solutionTypes = input.solutionTypes;
      if (input.architectNotes !== undefined) data.architectNotes = input.architectNotes;
```

Replace with:
```typescript
      if (input.executionStrategy !== undefined) data.executionStrategy = input.executionStrategy;
      if (input.architectNotes !== undefined) data.architectNotes = input.architectNotes;
```

- [ ] **Step 3: Resolve `solutionTypeNames` into the m2m relation**

Find:
```typescript
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
      if (input.projectKindName !== undefined) {
        const kind = await findOrCreateProjectKind(ctx.db, input.projectKindName, warnings);
        if (kind) data.projectKindId = kind.id;
      }
```

Replace with:
```typescript
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
      if (input.solutionTypeNames !== undefined) {
        const resolvedKinds = [];
        for (const name of input.solutionTypeNames) {
          const kind = await findOrCreateProjectKind(ctx.db, name, warnings);
          if (kind) resolvedKinds.push(kind);
        }
        data.solutionTypes = { set: resolvedKinds.map((k) => ({ id: k.id })) };
      }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors about `importXml`. (`build-projeto-completo-xml.ts`/`parse-projeto-completo-xml.ts` still reference the old shape at this point — they're fixed in Task 5, so their errors are expected until then.)

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: importXml resolves multiple solution type names"
```

---

### Task 5: XML round-trip build/parse

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts:12-15`, `:92`, `:107-113`
- Modify: `src/shared/xml/parse-projeto-completo-xml.ts:10-13`, `:45`, `:52`, `:219`, `:240-241`

- [ ] **Step 1: `build-projeto-completo-xml.ts` — drop the `SOLUTION_TYPES` import, keep `EXECUTION_STRATEGIES`**

Find:
```typescript
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 2: `build-projeto-completo-xml.ts` — drop the old `tipoDeProjeto` tag, resolve solution types from the relation**

Find:
```typescript
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
  lines.push(tag("tipoDeProjeto", project.projectKind?.name));
  lines.push(
```

Replace with:
```typescript
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
  lines.push(
```

Find:
```typescript
  lines.push(
    listTag(
      "tiposDeSolucao",
      "tipo",
      (project.solutionTypes ?? []).map((v) => resolveLabel(v, SOLUTION_TYPES) ?? v)
    )
  );
```

Replace with:
```typescript
  lines.push(
    listTag(
      "tiposDeSolucao",
      "tipo",
      (project.solutionTypes ?? []).map((k) => k.name)
    )
  );
```

- [ ] **Step 3: `parse-projeto-completo-xml.ts` — drop the `SOLUTION_TYPES` import**

Find:
```typescript
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 4: `parse-projeto-completo-xml.ts` — update the `ParsedProjetoCompleto` shape**

Find:
```typescript
  mainToolName?: string;
  projectKindName?: string;
  peopleOfInterestNames?: string[];
```

Replace with:
```typescript
  mainToolName?: string;
  peopleOfInterestNames?: string[];
```

Find:
```typescript
  executionStrategy?: string;
  solutionTypes?: string[];
  architectNotes?: string;
```

Replace with:
```typescript
  executionStrategy?: string;
  solutionTypeNames?: string[];
  architectNotes?: string;
```

- [ ] **Step 5: `parse-projeto-completo-xml.ts` — read the raw tag list, with backward-compat for the old single-tag format**

Find:
```typescript
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.projectKindName = getDirectChildText(root, "tipoDeProjeto");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
```

Replace with:
```typescript
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
```

Find:
```typescript
  const rawSolutionTypes = getListItems(root, "tiposDeSolucao", "tipo");
  data.solutionTypes = rawSolutionTypes?.map((label) => matchValueByLabel(label, SOLUTION_TYPES) ?? label);
```

Replace with:
```typescript
  const rawSolutionTypes = getListItems(root, "tiposDeSolucao", "tipo") ?? [];
  // Compatibilidade com XMLs exportados antes desta mudança, que ainda podem
  // ter a tag antiga <tipoDeProjeto> (um valor único) em vez da lista.
  const legacyProjectKindName = getDirectChildText(root, "tipoDeProjeto");
  data.solutionTypeNames =
    rawSolutionTypes.length > 0 || legacyProjectKindName
      ? [...rawSolutionTypes, ...(legacyProjectKindName ? [legacyProjectKindName] : [])]
      : undefined;
```

- [ ] **Step 6: Check whether `matchValueByLabel` is still used elsewhere in the file**

Run: `grep -n "matchValueByLabel" "src/shared/xml/parse-projeto-completo-xml.ts"`
Expected: no matches remain (its only call site was the block just replaced). If none remain, delete the now-unused `matchValueByLabel` function (defined around line 82-88) — find and remove:
```typescript
function matchValueByLabel(
  label: string,
  options: readonly { value: string; label: string }[]
): string | undefined {
  const normalized = label.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized)?.value;
}

```
(Leave `matchKeyByLabel` — still used for `benefits`.)

- [ ] **Step 7: Confirm the XML import caller needs no change**

`src/shared/components/project-xml-import-export.tsx` (`handleImport`, around line 78) does `const { projetoId: _projetoId, estimatedDeadline, ...rest } = parsed.data; importMutation.mutate({ projectId: project.id, ...rest, ... })` — it spreads every field of `ParsedProjetoCompleto` generically, it doesn't name `projectKindName`/`solutionTypes` explicitly. Since Task 5 Step 4 already renamed the field on that type to `solutionTypeNames`, this spread picks up the new name automatically. Run `grep -n "projectKindName\|solutionTypes" src/shared/components/project-xml-import-export.tsx` to confirm zero matches — no edit needed in this file.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors about the XML build/parse files or `project-xml-import-export.tsx`.

- [ ] **Step 9: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts src/shared/xml/parse-projeto-completo-xml.ts
git commit -m "feat: round-trip XML uses a single tiposDeSolucao list"
```

---

### Task 6: `shared/types/index.ts`

**Files:**
- Modify: `src/shared/types/index.ts:87`, `:90-91`

- [ ] **Step 1: Update the `Project` type**

Find:
```typescript
  solutionTypes?: string[];
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
  projectKind?: { id: string; name: string; slug: string };
  projectKindId?: string;
```

Replace with:
```typescript
  solutionTypes?: { id: string; name: string; slug: string }[];
  mainTool?: { id: string; name: string; slug: string };
  mainToolId?: string;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: this will surface every remaining consumer still using the old shape (`project.projectKind`, `project.solutionTypes` as `string[]`) as compile errors — that's expected, they're fixed in Tasks 7-11. Confirm the errors are limited to: `architecture-tab.tsx`, `project-detail-sections.tsx`, `project-executive-slide.tsx`, `project-request-edit-form.tsx`, `project-card.tsx`, `project-kind-filter.tsx`, `admin/projetos/page.tsx` (plus the pre-existing unrelated `ui/*` ones).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: update Project type for the merged solutionTypes relation"
```

---

### Task 7: Architecture tab — multi-select UI

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Drop the `SOLUTION_TYPES` import**

Find:
```typescript
import { SOLUTION_TYPES, EXECUTION_STRATEGIES } from "../_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "../_constants/architecture";
```

- [ ] **Step 2: Replace the `projectKindOptions`/`createProjectKind` block with the solution-type equivalent**

Find:
```typescript
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

Replace with:
```typescript
  const { data: projectKinds = [] } = trpc.taxonomy.listProjectKinds.useQuery();
  const solutionTypeOptions = useMemo(() => {
    const opts = projectKinds.map((k) => ({ value: k.id, label: k.name }));
    for (const st of project?.solutionTypes ?? []) {
      if (!opts.some((o) => o.value === st.id)) {
        opts.push({ value: st.id, label: st.name });
      }
    }
    return opts;
  }, [projectKinds, project?.solutionTypes]);
  const [newSolutionTypeName, setNewSolutionTypeName] = useState("");
  const createProjectKind = trpc.taxonomy.createProjectKind.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listProjectKinds.invalidate();
      setSolutionTypeIds((prev) => [...prev, created.id]);
      setNewSolutionTypeName("");
      toast.success(`Tipo de solução "${created.name}" criado`);
    },
    onError: (err) => toast.error("Falha ao criar tipo de solução", { description: err.message }),
  });
  function handleCreateSolutionType() {
    const trimmed = newSolutionTypeName.trim();
    if (!trimmed) return;
    createProjectKind.mutate({ name: trimmed, slug: slugify(trimmed), order: projectKinds.length });
  }
```

- [ ] **Step 3: Replace the two separate state variables with one**

Find:
```typescript
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [projectKindId, setProjectKindId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

Replace with:
```typescript
  const [solutionTypeIds, setSolutionTypeIds] = useState<string[]>([]);
  const [mainToolId, setMainToolId] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
```

- [ ] **Step 4: Update the `useEffect` that seeds state from `project`**

Find:
```typescript
      setSolutionTypes(project.solutionTypes ?? []);
      setMainToolId(project.mainTool?.id ?? "");
      setProjectKindId(project.projectKind?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

Replace with:
```typescript
      setSolutionTypeIds((project.solutionTypes ?? []).map((k) => k.id));
      setMainToolId(project.mainTool?.id ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
```

- [ ] **Step 5: Update `toggleSolutionType`**

Find:
```typescript
  const toggleSolutionType = (value: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setSolutionTypes((prev) =>
      isChecked ? [...prev, value] : prev.filter((v) => v !== value)
    );
  };
```

Replace with:
```typescript
  const toggleSolutionType = (value: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setSolutionTypeIds((prev) =>
      isChecked ? [...prev, value] : prev.filter((v) => v !== value)
    );
  };
```

- [ ] **Step 6: Update `handleSaveArchitecture`'s mutation payload**

Find:
```typescript
    updateProject.mutate({
      id: projectId,
      solutionTypes,
      mainToolId: mainToolId || null,
      projectKindId: projectKindId || null,
      executionStrategy: executionStrategy || null,
```

Replace with:
```typescript
    updateProject.mutate({
      id: projectId,
      solutionTypeIds,
      mainToolId: mainToolId || null,
      executionStrategy: executionStrategy || null,
```

- [ ] **Step 7: Update the checkbox grid to use the new options/state, and add the inline "create" affordance**

Find:
```typescript
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SOLUTION_TYPES.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                >
                  <Checkbox
                    checked={solutionTypes.includes(opt.value)}
                    onCheckedChange={(v) => toggleSolutionType(opt.value, v)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
```

Replace with:
```typescript
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {solutionTypeOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                >
                  <Checkbox
                    checked={solutionTypeIds.includes(opt.value)}
                    onCheckedChange={(v) => toggleSolutionType(opt.value, v)}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={newSolutionTypeName}
                onChange={(e) => setNewSolutionTypeName(e.target.value)}
                placeholder="Novo tipo de solução"
                className="h-8 max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCreateSolutionType}
                disabled={!newSolutionTypeName.trim() || createProjectKind.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>
```

- [ ] **Step 8: Remove the "Tipo de projeto" combobox field, and shrink that row's grid from 3 to 2 columns**

Find:
```typescript
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
```

Replace with:
```typescript
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

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about `architecture-tab.tsx`.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: architecture tab uses a single customizable multi-select"
```

---

### Task 8: Read-only label rendering (3 files)

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx:23-26`, `:76-78`
- Modify: `src/shared/components/project-executive-slide.tsx:13-16`, `:239-241`, `:341-347`
- Modify: `src/shared/components/project-request-edit-form.tsx:32-35`, `:211-213`

- [ ] **Step 1: `project-detail-sections.tsx` — drop `SOLUTION_TYPES` import, keep `EXECUTION_STRATEGIES`**

Find:
```typescript
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 2: `project-detail-sections.tsx` — read names directly from the relation**

Find:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (key) => SOLUTION_TYPES.find((s) => s.value === key)?.label ?? key
  );
```

Replace with:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);
```

- [ ] **Step 3: `project-executive-slide.tsx` — drop `SOLUTION_TYPES` import**

Find:
```typescript
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 4: `project-executive-slide.tsx` — read names directly from the relation**

Find:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (v) => SOLUTION_TYPES.find((s) => s.value === v)?.label ?? v
  );
```

Replace with:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);
```

- [ ] **Step 5: `project-executive-slide.tsx` — replace the single `projectKind` pill with one pill per solution type**

Find:
```typescript
            {(project.projectKind || project.mainTool) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.projectKind && (
                  <span className="inline-block rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700">
                    {project.projectKind.name}
                  </span>
                )}
                {project.mainTool && (
```

Replace with:
```typescript
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
```

- [ ] **Step 6: `project-request-edit-form.tsx` — drop `SOLUTION_TYPES` import**

Find:
```typescript
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

Replace with:
```typescript
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

- [ ] **Step 7: `project-request-edit-form.tsx` — read names directly from the relation**

Find:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (key) => SOLUTION_TYPES.find((s) => s.value === key)?.label ?? key
  );
```

Replace with:
```typescript
  const solutionTypeLabels = (project.solutionTypes ?? []).map((k) => k.name);
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about these 3 files.

- [ ] **Step 9: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx src/shared/components/project-executive-slide.tsx src/shared/components/project-request-edit-form.tsx
git commit -m "feat: read solution type labels from the relation, not a constant"
```

---

### Task 9: `project-card.tsx` badges

**Files:**
- Modify: `src/shared/components/project-card.tsx:137-144`

- [ ] **Step 1: Replace the single `projectKind` badge with up to 2 solution-type badges + overflow count**

Find:
```typescript
          {project.projectKind && (
            <span
              className="inline-block max-w-[170px] truncate rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={project.projectKind.name}
            >
              {project.projectKind.name}
            </span>
          )}
```

Replace with:
```typescript
          {project.solutionTypes?.slice(0, 2).map((k) => (
            <span
              key={k.id}
              className="inline-block max-w-[170px] truncate rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={k.name}
            >
              {k.name}
            </span>
          ))}
          {project.solutionTypes && project.solutionTypes.length > 2 && (
            <span
              className="inline-block rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary"
              title={project.solutionTypes
                .slice(2)
                .map((k) => k.name)
                .join(", ")}
            >
              +{project.solutionTypes.length - 2}
            </span>
          )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about `project-card.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/project-card.tsx
git commit -m "feat: project card shows multiple solution type badges"
```

---

### Task 10: Filter + CSV export

**Files:**
- Modify: `src/shared/components/project-kind-filter.tsx`
- Modify: `src/app/(private)/admin/projetos/page.tsx:59`, `:89`

- [ ] **Step 1: `project-kind-filter.tsx` — read the dropdown options from the relation array**

Find:
```typescript
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
```

Replace with:
```typescript
export function ProjectKindFilter({ projects, value, onChange }: ProjectKindFilterProps) {
  const kinds = Array.from(
    new Map(
      projects
        .flatMap((p) => p.solutionTypes ?? [])
        .map((k) => [k.id, k.name] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));
```

- [ ] **Step 2: `project-kind-filter.tsx` — match "contains" instead of "equals"**

Find:
```typescript
export function filterProjectsByKind<T extends { projectKindId?: string }>(
  projects: T[],
  kindFilter: string
): T[] {
  if (kindFilter === ALL_PROJECT_KINDS_VALUE) return projects;
  return projects.filter((p) => p.projectKindId === kindFilter);
}
```

Replace with:
```typescript
export function filterProjectsByKind<T extends { solutionTypes?: { id: string }[] }>(
  projects: T[],
  kindFilter: string
): T[] {
  if (kindFilter === ALL_PROJECT_KINDS_VALUE) return projects;
  return projects.filter((p) => p.solutionTypes?.some((k) => k.id === kindFilter));
}
```

- [ ] **Step 3: `admin/projetos/page.tsx` — update the CSV header and cell**

Find:
```typescript
    "Tipo de Projeto",
```

Replace with:
```typescript
    "Tipo de Solução",
```

Find:
```typescript
    p.projectKind?.name ?? "",
```

Replace with:
```typescript
    (p.solutionTypes ?? []).map((k) => k.name).join("; "),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no more errors about `project-kind-filter.tsx` or `admin/projetos/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/project-kind-filter.tsx "src/app/(private)/admin/projetos/page.tsx"
git commit -m "feat: project list filter and CSV export use solutionTypes"
```

---

### Task 11: Rename in Configurações → Categorias

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

Text-only changes — no logic changes (the CRUD procedures/mutations are untouched, per the design doc).

- [ ] **Step 1: Section heading and subtitle**

Find:
```tsx
            <h2 className="text-lg font-semibold">Tipos de Projeto</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Tipo de projeto&quot; na tela de arquitetura.
            </p>
```

Replace with:
```tsx
            <h2 className="text-lg font-semibold">Tipos de Solução</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Tipo de Solução&quot; na tela de arquitetura.
            </p>
```

- [ ] **Step 2: "New" button and empty state**

Find:
```tsx
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
```

Replace with:
```tsx
          <Button size="sm" variant="outline" onClick={openNewProjectKind}>
            <Plus className="mr-2 h-4 w-4" />
            Novo tipo de solução
          </Button>
        </div>
        {projectKinds.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum tipo de solução cadastrado</p>
          </Card>
```

- [ ] **Step 3: Toast messages**

Find:
```tsx
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de projeto criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de projeto atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteProjectKind = trpc.taxonomy.deleteProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); toast({ title: "Tipo de projeto removido" }); },
```

Replace with:
```tsx
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de solução criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de solução atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteProjectKind = trpc.taxonomy.deleteProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); toast({ title: "Tipo de solução removido" }); },
```

- [ ] **Step 4: Dialog titles**

Find:
```tsx
            <DialogTitle>{projectKindDialog.editing ? "Editar tipo de projeto" : "Novo tipo de projeto"}</DialogTitle>
```

Replace with:
```tsx
            <DialogTitle>{projectKindDialog.editing ? "Editar tipo de solução" : "Novo tipo de solução"}</DialogTitle>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors about this file (it was already type-correct — these are text-only edits).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: rename Tipo de Projeto to Tipo de Solução in categorias admin"
```

---

### Task 12: Remove the now-unused `SOLUTION_TYPES` constant

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts`

- [ ] **Step 1: Confirm no importer remains**

Run: `grep -rn "SOLUTION_TYPES" src --include=*.ts --include=*.tsx`
Expected: zero matches (every consumer was updated in Tasks 5, 7, 8 to stop importing it). If any remain, stop and fix that file first — it was missed.

- [ ] **Step 2: Remove the constant**

Find:
```typescript
export const SOLUTION_TYPES = [
  { value: "rpa", label: "RPA" },
  { value: "api", label: "API" },
  { value: "ia-ocr", label: "IA/OCR" },
  { value: "power-platform", label: "Power Platform" },
  { value: "python", label: "Python" },
  { value: "integracao", label: "Integração" },
  { value: "dashboard", label: "Dashboard" },
  { value: "outro", label: "Outro" },
] as const;

export const EXECUTION_STRATEGIES = [
```

Replace with:
```typescript
export const EXECUTION_STRATEGIES = [
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing unrelated `ui/*` errors remain (the same ones present before this plan started) — nothing about `architecture.ts` or any file that used to import `SOLUTION_TYPES`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts"
git commit -m "feat: remove the now-unused fixed SOLUTION_TYPES list"
```

---

### Task 13: Full verification + manual QA

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: identical error output to the pre-existing baseline captured before this plan started (only `src/shared/components/ui/chart.tsx`, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx`) — zero errors related to any file touched in this plan.

- [ ] **Step 2: Confirm the migration file is well-formed SQL**

Run: `DATABASE_URL="postgresql://user:pass@localhost:5432/pipeline" npx prisma validate`
Expected: schema still valid (this doesn't execute the migration SQL, just re-confirms the Prisma schema side is consistent — there is no local DB in this environment to actually run the migration against; it will run for real via `prisma migrate deploy` in the deploy pipeline on push).

- [ ] **Step 3: Manual QA once deployed**

This repo has no local database/dev-server workflow available in this environment (established pattern — deploy happens via GitHub Actions on push to `main`). After pushing, verify in the real environment:
- Project → Arquitetura tab: "Tipo de solução" shows a checkbox grid populated from the database (including the 4 pre-existing "Tipo de Projeto" values and the newly seeded RPA/API/IA/OCR/Integração/Dashboards/Plataformas/Chatbots/Outros/Python), multi-checkable, with a working "+ novo tipo" inline add.
- A project that previously had a "Tipo de Projeto" set and/or old "Tipo de Solução" checkboxes now shows the equivalent boxes pre-checked (per the migration mapping).
- Project card, project detail view, executive slide, and CSV export all show the (possibly multiple) solution types correctly.
- Projeto → XML import/export round-trips a project's solution types correctly (export, then re-import the same file, no warnings about missing types).
- Configurações → Categorias shows the section renamed to "Tipos de Solução".
- Projects listing page's "Tipo de Projeto" filter dropdown (now sourced from `solutionTypes`) filters correctly.

---

## Self-Review Notes

- **Spec coverage:** schema m2m relation (✅ Task 1), migration mapping table incl. `ia-ocr` → IA+OCR dual link and `python` kept distinct (✅ Task 1 Step 4), existing `ProjectKind` values preserved as extra options (✅ Task 1 backfill 1, no data deleted), backend read/write surfaces (✅ Tasks 2-4), XML round-trip incl. backward-compat for old `<tipoDeProjeto>` tag (✅ Task 5), all ~10 frontend consumers (✅ Tasks 7-11), categorias admin rename (✅ Task 11), constant removed only after all consumers migrated (✅ Task 12, with a grep guard as Step 1).
- **Type consistency:** `solutionTypeIds: string[]` (write path) vs `solutionTypes: {id,name}[]` (read path) naming is kept consistent across every task — the `update`/`importXml` mutations always take `*Ids`/`*Names` (arrays to resolve), while every read path (`list`, `byId`, and all frontend consumers) always receives the resolved `{id, name}` objects.
- **No placeholders:** every step has complete code; no TODOs.
- **Ordering hazard called out explicitly:** Task 12 (deleting `SOLUTION_TYPES`) is last and starts with a grep guard specifically because deleting it earlier would break every consumer task that hasn't run yet.
