# Pessoas de Interesse (entrevistas + oportunidades) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable `Person` registry (non-system-user contacts, optionally linked to a `User`) scoped per company, migrate Entrevistas de Levantamento participants onto it, and let any Oportunidade (Project) tag "Pessoas de Interesse" pulled from that same registry — including system Users of that company.

**Architecture:** New `Person` model plus two many-to-many join tables (`InterviewParticipant`, `ProjectPersonOfInterest`). A new `person.router.ts` exposes a combined "Person + unlinked Company User" list and inline creation; a shared `resolvePersonIds` helper (also in `person.router.ts`) lazily materializes a `Person` row for a selected User the first time they're tagged anywhere. A new `MultiCreatableCombobox` UI primitive (generalized from the existing single-select `CreatableCombobox`) powers both the Entrevistas participant field and a new "Pessoas de interesse" card on the project detail page.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, Prisma 6 (PostgreSQL), Zod, shadcn/ui (`Command`/`Popover`/`Badge`), pnpm. No automated test framework exists in this repo (confirmed: no jest/vitest/mocha dependency, no `*.test.ts` files, no `test` script) — verification in this plan relies on `tsc --noEmit`, `pnpm lint`, and manual walkthroughs instead of automated tests, consistent with how the rest of the codebase is currently verified.

**Spec:** `docs/superpowers/specs/2026-07-21-pessoas-de-interesse-design.md`

---

### Task 1: Extend Prisma schema with `Person` and join tables

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `participants` relation to `Interview`, and the three new models**

In `prisma/schema.prisma`, find the `Interview` model (around line 594):

```prisma
model Interview {
  id              String       @id @default(cuid())
  participantName String
  status          String       @default("realizado") // "realizado" | "agendado" | "cancelado"
  scheduledDate   DateTime
  company         Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId       String
  area            ProjectArea? @relation(fields: [areaId], references: [id], onDelete: SetNull)
  areaId          String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@map("interviews")
}
```

Replace it with (adds the `participants` relation only — `participantName` stays for now, it's removed in Task 5 after the data is backfilled):

```prisma
model Interview {
  id              String       @id @default(cuid())
  participantName String
  status          String       @default("realizado") // "realizado" | "agendado" | "cancelado"
  scheduledDate   DateTime
  company         Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId       String
  area            ProjectArea? @relation(fields: [areaId], references: [id], onDelete: SetNull)
  areaId          String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  participants InterviewParticipant[]

  @@map("interviews")
}

model Person {
  id        String   @id @default(cuid())
  name      String
  role      String?
  companyId String
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  interviewLinks InterviewParticipant[]
  projectLinks   ProjectPersonOfInterest[]

  @@unique([companyId, userId])
  @@map("people")
}

model InterviewParticipant {
  interviewId String
  personId    String
  interview   Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  person      Person    @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([interviewId, personId])
  @@map("interview_participants")
}

model ProjectPersonOfInterest {
  projectId String
  personId  String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  person    Person  @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([projectId, personId])
  @@map("project_people_of_interest")
}
```

- [ ] **Step 2: Add the reverse relation on `Company`**

Find (around line 115):

```prisma
  // Relacionamentos
  users      User[]            @relation("UserCompanies")
  projects   Project[]
  interviews Interview[]
  costItems  CompanyCostItem[]

  @@map("companies")
```

Replace with:

```prisma
  // Relacionamentos
  users      User[]            @relation("UserCompanies")
  projects   Project[]
  interviews Interview[]
  costItems  CompanyCostItem[]
  people     Person[]

  @@map("companies")
```

- [ ] **Step 3: Add the reverse relation on `Project`**

Find (around line 216, inside the `Project` model's relations block):

```prisma
  features     ProjectFeature[]
  phases       ProjectPhase[]
  tasks        Task[]
  comments     Comment[]
  files        ProjectFile[]
  activityLogs ActivityLog[]
  projectLock  ProjectLock?

  @@map("projects")
```

Replace with:

```prisma
  features         ProjectFeature[]
  phases           ProjectPhase[]
  tasks            Task[]
  comments         Comment[]
  files            ProjectFile[]
  activityLogs     ActivityLog[]
  projectLock      ProjectLock?
  peopleOfInterest ProjectPersonOfInterest[]

  @@map("projects")
```

- [ ] **Step 4: Add the reverse relation on `User`**

Find (around line 43, inside the `User` model's relations block):

```prisma
  sessions         Session[]
  accounts         Account[]

  @@map("users")
```

Replace with:

```prisma
  sessions         Session[]
  accounts         Account[]
  personLinks      Person[]

  @@map("users")
```

- [ ] **Step 5: Format and generate the client**

Run:
```
pnpm exec prisma format
pnpm exec prisma generate
```
Expected: both commands exit 0; `prisma format` may realign column spacing (that's fine, it's cosmetic).

- [ ] **Step 6: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (existing routers don't reference the new models yet, so this should be a clean pass).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Person model and interview/project join tables"
```

---

### Task 2: Create and apply the migration (with data backfill)

**Files:**
- Create: `prisma/migrations/<timestamp>_add_person_and_people_links/migration.sql` (Prisma generates the filename/timestamp)

- [ ] **Step 1: Generate the migration without applying it**

Run:
```
pnpm exec prisma migrate dev --name add_person_and_people_links --create-only
```
Expected: creates `prisma/migrations/<timestamp>_add_person_and_people_links/migration.sql` containing `CREATE TABLE` statements for `people`, `interview_participants`, `project_people_of_interest`, a `CREATE UNIQUE INDEX` for `people(companyId, userId)`, and the matching `ALTER TABLE ... ADD CONSTRAINT` foreign keys — mirroring the models added in Task 1. Does NOT apply to the database yet.

- [ ] **Step 2: Append the data backfill to the generated file**

Open the generated `migration.sql` and add this block at the very end of the file:

```sql
-- DataMigration: backfill Person + interview_participants a partir de
-- interviews.participantName (texto livre), preservando os dados existentes
-- antes dessa coluna ser removida numa migration seguinte (Task 5). O id da
-- Person é derivado deterministicamente de (companyId, nome normalizado) via
-- md5, assim a segunda instrução consegue apontar pro mesmo id sem precisar
-- de join nem de gerar uuid — sem depender de nenhuma extensão do Postgres.
INSERT INTO "people" ("id", "name", "companyId", "createdAt", "updatedAt")
SELECT DISTINCT
  md5(i."companyId" || '|' || LOWER(TRIM(i."participantName"))),
  TRIM(i."participantName"),
  i."companyId",
  NOW(),
  NOW()
FROM "interviews" i
WHERE TRIM(i."participantName") <> '';

INSERT INTO "interview_participants" ("interviewId", "personId")
SELECT i."id", md5(i."companyId" || '|' || LOWER(TRIM(i."participantName")))
FROM "interviews" i
WHERE TRIM(i."participantName") <> '';
```

- [ ] **Step 3: Apply the migration**

Run:
```
pnpm exec prisma migrate dev
```
Expected: applies the pending migration (including the backfill), exits 0, and reruns `prisma generate`.

- [ ] **Step 4: Spot-check the backfill**

Run `pnpm exec prisma studio`, open the `people` and `interview_participants` tables, and confirm: one `Person` row per distinct participant name per company that existed in `interviews.participantName`, and one `interview_participants` row per existing interview. Close Prisma Studio when done.

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations
git commit -m "feat: add migration for Person tables with participantName backfill"
```

---

### Task 3: Add the `person` tRPC router

**Files:**
- Create: `src/server/trpc/routers/person.router.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Create the router**

Create `src/server/trpc/routers/person.router.ts`:

```ts
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";

const UNLINKED_USER_PREFIX = "user:";

export async function resolvePersonForUser(db: PrismaClient, companyId: string, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });
  return db.person.upsert({
    where: { companyId_userId: { companyId, userId } },
    update: {},
    create: { companyId, userId, name: user.name },
  });
}

export async function resolvePersonIds(
  db: PrismaClient,
  companyId: string,
  rawIds: string[]
): Promise<string[]> {
  const resolved: string[] = [];
  for (const rawId of rawIds) {
    if (rawId.startsWith(UNLINKED_USER_PREFIX)) {
      const userId = rawId.slice(UNLINKED_USER_PREFIX.length);
      const person = await resolvePersonForUser(db, companyId, userId);
      resolved.push(person.id);
    } else {
      resolved.push(rawId);
    }
  }
  return resolved;
}

export const personRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [people, users] = await Promise.all([
        ctx.db.person.findMany({
          where: { companyId: input.companyId },
          orderBy: { name: "asc" },
        }),
        ctx.db.user.findMany({
          where: { companies: { some: { id: input.companyId } } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);

      const linkedUserIds = new Set(
        people.filter((p) => p.userId).map((p) => p.userId as string)
      );

      const personOptions = people.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role ?? undefined,
        userId: p.userId ?? undefined,
        isUnlinkedUser: false,
      }));

      const unlinkedUserOptions = users
        .filter((u) => !linkedUserIds.has(u.id))
        .map((u) => ({
          id: `${UNLINKED_USER_PREFIX}${u.id}`,
          name: u.name,
          role: undefined,
          userId: u.id,
          isUnlinkedUser: true,
        }));

      return [...personOptions, ...unlinkedUserOptions];
    }),

  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        name: z.string().trim().min(1),
        role: z.string().trim().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.person.create({
        data: {
          companyId: input.companyId,
          name: input.name.trim(),
          role: input.role?.trim() || null,
        },
      });
    }),
});
```

- [ ] **Step 2: Register the router**

In `src/server/trpc/root.ts`, add the import next to the other router imports:

```ts
import { interviewRouter } from "./routers/interview.router";
```
becomes:
```ts
import { interviewRouter } from "./routers/interview.router";
import { personRouter } from "./routers/person.router";
```

And add `person: personRouter,` to the `appRouter` object, next to `interview: interviewRouter,`:

```ts
  interview: interviewRouter,
  person: personRouter,
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/person.router.ts src/server/trpc/root.ts
git commit -m "feat: add person router with combined Person+User listing"
```

---

### Task 4: Switch `interview.router.ts` to `personIds`

**Files:**
- Modify: `src/server/trpc/routers/interview.router.ts`

- [ ] **Step 1: Replace the file**

Replace the full contents of `src/server/trpc/routers/interview.router.ts` with:

```ts
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { resolvePersonIds } from "./person.router";

const interviewStatusSchema = z.enum(["realizado", "agendado", "cancelado"]);

export const interviewRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.interview.findMany({
        where: { companyId: input.companyId },
        include: { area: true, participants: { include: { person: true } } },
        orderBy: { scheduledDate: "desc" },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        personIds: z.array(z.string()).min(1),
        status: interviewStatusSchema.default("realizado"),
        scheduledDate: z.coerce.date(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resolvedIds = Array.from(
        new Set(await resolvePersonIds(ctx.db, input.companyId, input.personIds))
      );
      return ctx.db.interview.create({
        data: {
          companyId: input.companyId,
          status: input.status,
          scheduledDate: input.scheduledDate,
          areaId: input.areaId || null,
          participants: { create: resolvedIds.map((personId) => ({ personId })) },
        },
        include: { area: true, participants: { include: { person: true } } },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        personIds: z.array(z.string()).min(1).optional(),
        status: interviewStatusSchema.optional(),
        scheduledDate: z.coerce.date().optional(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, personIds, ...data } = input;
      if (personIds) {
        const interview = await ctx.db.interview.findUniqueOrThrow({
          where: { id },
          select: { companyId: true },
        });
        const resolvedIds = Array.from(
          new Set(await resolvePersonIds(ctx.db, interview.companyId, personIds))
        );
        await ctx.db.interviewParticipant.deleteMany({ where: { interviewId: id } });
        await ctx.db.interviewParticipant.createMany({
          data: resolvedIds.map((personId) => ({ interviewId: id, personId })),
        });
      }
      return ctx.db.interview.update({
        where: { id },
        data: {
          ...data,
          ...(data.areaId !== undefined && { areaId: data.areaId || null }),
        },
        include: { area: true, participants: { include: { person: true } } },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.interview.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

Note: `list`/`create`/`update` return raw Prisma rows here (no separate mapper, matching this file's existing convention) — the frontend consumes them via tRPC type inference, same as before.

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: errors will appear in `src/app/(private)/admin/empresas/[id]/entrevistas/page.tsx` (still references `participantName`) — that's expected, fixed in Task 7. Confirm there are no errors anywhere else (e.g. in `interview.router.ts` itself or `src/server/deck/build-diagnostic-deck.ts`, which references `interview.list`'s inferred type).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/interview.router.ts
git commit -m "feat: interview participants use Person relation instead of free text"
```

---

### Task 5: Drop `Interview.participantName`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Remove the field**

In the `Interview` model, remove the `participantName String` line:

```prisma
model Interview {
  id              String       @id @default(cuid())
  participantName String
  status          String       @default("realizado") // "realizado" | "agendado" | "cancelado"
```

becomes:

```prisma
model Interview {
  id              String       @id @default(cuid())
  status          String       @default("realizado") // "realizado" | "agendado" | "cancelado"
```

- [ ] **Step 2: Generate and apply the migration**

Run:
```
pnpm exec prisma migrate dev --name remove_interview_participant_name
```
Expected: generates and applies a migration containing `ALTER TABLE "interviews" DROP COLUMN "participantName";`, exits 0.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: same pre-existing errors as after Task 4 (entrevistas page still not updated — fixed in Task 7), no new ones.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: drop Interview.participantName after backfill to Person"
```

---

### Task 6: Build `MultiCreatableCombobox`

**Files:**
- Create: `src/shared/components/ui/multi-creatable-combobox.tsx`

- [ ] **Step 1: Create the component**

Generalizes the existing single-select `src/shared/components/ui/creatable-combobox.tsx` into a multi-select variant: selecting an item toggles it instead of closing the popover, selections render as removable `Badge` chips above the trigger.

Create `src/shared/components/ui/multi-creatable-combobox.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/src/shared/components/ui/button";
import { Badge } from "@/src/shared/components/ui/badge";
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

export interface MultiCreatableComboboxOption {
  value: string;
  label: string;
  meta?: { isUnlinkedUser?: boolean };
}

interface MultiCreatableComboboxProps {
  options: MultiCreatableComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onCreate: (label: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function MultiCreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado.",
  disabled,
}: MultiCreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiCreatableComboboxOption => !!o);

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

  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

  function remove(optionValue: string) {
    onChange(value.filter((v) => v !== optionValue));
  }

  function handleCreate() {
    onCreate(trimmedSearch);
    setSearch("");
  }

  return (
    <div className="space-y-2">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1 pr-1">
              {option.label}
              {option.meta?.isUnlinkedUser && (
                <span className="text-[10px] opacity-70">(usuário)</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(option.value)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
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
            <span className="text-muted-foreground">{placeholder}</span>
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
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                    {option.meta?.isUnlinkedUser && (
                      <span className="ml-auto text-[10px] text-muted-foreground">usuário</span>
                    )}
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem value={`__create__${trimmedSearch}`} onSelect={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar &quot;{trimmedSearch}&quot;
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/ui/multi-creatable-combobox.tsx
git commit -m "feat: add MultiCreatableCombobox UI primitive"
```

---

### Task 7: Wire the participant combobox into the Entrevistas page

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/entrevistas/page.tsx`

- [ ] **Step 1: Import the combobox**

Find:
```tsx
import { ArrowLeft, Plus, Pencil, Trash2, Users } from "lucide-react";
```
Replace with:
```tsx
import { ArrowLeft, Plus, Pencil, Trash2, Users } from "lucide-react";
import {
  MultiCreatableCombobox,
  type MultiCreatableComboboxOption,
} from "@/src/shared/components/ui/multi-creatable-combobox";
```

- [ ] **Step 2: Replace `participantName` with `personIds` in `EMPTY_FORM`**

Find:
```tsx
const EMPTY_FORM: {
  participantName: string;
  status: InterviewStatus;
  scheduledDate: string;
  areaId: string;
} = {
  participantName: "",
  status: "realizado",
  scheduledDate: toLocalDateInputValue(new Date()),
  areaId: AREA_NONE,
};
```
Replace with:
```tsx
const EMPTY_FORM: {
  personIds: string[];
  status: InterviewStatus;
  scheduledDate: string;
  areaId: string;
} = {
  personIds: [],
  status: "realizado",
  scheduledDate: toLocalDateInputValue(new Date()),
  areaId: AREA_NONE,
};
```

- [ ] **Step 3: Load Person options and add the create-person mutation**

Find:
```tsx
  const { data: areas = [] } = trpc.taxonomy.listAreas.useQuery();

  const { data: interviews = [], isLoading } = trpc.interview.list.useQuery({ companyId });
```
Replace with:
```tsx
  const { data: areas = [] } = trpc.taxonomy.listAreas.useQuery();
  const { data: personOptions = [] } = trpc.person.list.useQuery({ companyId });

  const { data: interviews = [], isLoading } = trpc.interview.list.useQuery({ companyId });

  const createPersonMutation = trpc.person.create.useMutation({
    onSuccess: (person) => {
      utils.person.list.invalidate({ companyId });
      setForm((f) => ({ ...f, personIds: [...f.personIds, person.id] }));
    },
    onError: (error) => {
      toast.error("Erro ao criar pessoa", { description: error.message });
    },
  });

  const comboboxOptions: MultiCreatableComboboxOption[] = personOptions.map((p) => ({
    value: p.id,
    label: p.name,
    meta: { isUnlinkedUser: p.isUnlinkedUser },
  }));
```

- [ ] **Step 4: Fix `openEdit`**

Find:
```tsx
  function openEdit(interview: (typeof interviews)[number]) {
    setForm({
      participantName: interview.participantName,
      status: interview.status as InterviewStatus,
      scheduledDate: toLocalDateInputValue(new Date(interview.scheduledDate)),
      areaId: interview.areaId ?? AREA_NONE,
    });
    setDialog({ open: true, editingId: interview.id });
  }
```
Replace with:
```tsx
  function openEdit(interview: (typeof interviews)[number]) {
    setForm({
      personIds: interview.participants.map((p) => p.personId),
      status: interview.status as InterviewStatus,
      scheduledDate: toLocalDateInputValue(new Date(interview.scheduledDate)),
      areaId: interview.areaId ?? AREA_NONE,
    });
    setDialog({ open: true, editingId: interview.id });
  }
```

- [ ] **Step 5: Fix `submit`**

Find:
```tsx
  function submit() {
    const payload = {
      participantName: form.participantName,
      status: form.status,
      scheduledDate: parseLocalDateInputValue(form.scheduledDate),
      areaId: form.areaId === AREA_NONE ? null : form.areaId,
    };
```
Replace with:
```tsx
  function submit() {
    const payload = {
      personIds: form.personIds,
      status: form.status,
      scheduledDate: parseLocalDateInputValue(form.scheduledDate),
      areaId: form.areaId === AREA_NONE ? null : form.areaId,
    };
```

- [ ] **Step 6: Fix the table's "Participante" cell**

Find:
```tsx
                    <TableCell className="font-medium">
                      {maskPersonName(interview.id, interview.participantName, "cliente")}
                    </TableCell>
```
Replace with:
```tsx
                    <TableCell className="font-medium">
                      <div className="flex flex-wrap gap-1">
                        {interview.participants.map((p) => (
                          <Badge key={p.personId} variant="secondary">
                            {maskPersonName(p.personId, p.person.name, "cliente")}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
```

- [ ] **Step 7: Fix the delete-confirm label**

Find:
```tsx
                              label:
                                maskPersonName(interview.id, interview.participantName, "cliente") ??
                                interview.participantName,
```
Replace with:
```tsx
                              label: interview.participants
                                .map(
                                  (p) =>
                                    maskPersonName(p.personId, p.person.name, "cliente") ??
                                    p.person.name
                                )
                                .join(", "),
```

- [ ] **Step 8: Replace the "Participante" form field with the combobox**

Find:
```tsx
            <div className="space-y-1.5">
              <Label>Participante</Label>
              <Input
                value={form.participantName}
                onChange={(e) => setForm((f) => ({ ...f, participantName: e.target.value }))}
                placeholder="Nome do participante"
              />
            </div>
```
Replace with:
```tsx
            <div className="space-y-1.5">
              <Label>Participantes</Label>
              <MultiCreatableCombobox
                options={comboboxOptions}
                value={form.personIds}
                onChange={(personIds) => setForm((f) => ({ ...f, personIds }))}
                onCreate={(name) => createPersonMutation.mutate({ companyId, name })}
                placeholder="Selecionar ou criar pessoa..."
                emptyText="Nenhuma pessoa encontrada."
              />
            </div>
```

- [ ] **Step 9: Fix the submit button's disabled condition**

Find:
```tsx
              disabled={
                !form.participantName.trim() ||
                !form.scheduledDate ||
                createMutation.isPending ||
                updateMutation.isPending
              }
```
Replace with:
```tsx
              disabled={
                form.personIds.length === 0 ||
                !form.scheduledDate ||
                createMutation.isPending ||
                updateMutation.isPending
              }
```

- [ ] **Step 10: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors anywhere in the project now (this was the last file still referencing `participantName`).

- [ ] **Step 11: Manual check**

Run `pnpm dev`, sign in as an admin, open `/admin/empresas/<id>/entrevistas` for a company that has existing interviews, and confirm:
- Existing interviews show their migrated participant(s) as chips in the "Participante" column.
- "Nova entrevista" lets you pick existing people from the combobox and type a new name to create one inline (it appears as a chip immediately).
- Editing an existing interview pre-fills its current participants.

- [ ] **Step 12: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/entrevistas/page.tsx"
git commit -m "feat: entrevistas page uses Person multi-select instead of free text"
```

---

### Task 8: Add `peopleOfInterest` to the project router

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Import `resolvePersonIds`**

Find (near the top of the file):
```ts
import { toFrontendStatus, toPrismaStatus } from "../mappers";
```
Replace with:
```ts
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import { resolvePersonIds } from "./person.router";
```

- [ ] **Step 2: Include `peopleOfInterest` in the `list` query**

Find:
```ts
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });
```
Replace with:
```ts
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
```

- [ ] **Step 3: Map `peopleOfInterest` in the `list` result**

Find:
```ts
        features: p.features?.map((f) => f.name) ?? [],
        hasExistingSystem: p.hasExistingSystem ?? undefined,
```
Replace with:
```ts
        features: p.features?.map((f) => f.name) ?? [],
        peopleOfInterest: p.peopleOfInterest.map((link) => ({
          id: link.person.id,
          name: link.person.name,
          role: link.person.role ?? undefined,
          userId: link.person.userId ?? undefined,
        })),
        hasExistingSystem: p.hasExistingSystem ?? undefined,
```

- [ ] **Step 4: Include `peopleOfInterest` in the `byId` query**

Find:
```ts
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
        },
      });
```
Replace with:
```ts
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
      });
```

- [ ] **Step 5: Map `peopleOfInterest` in the `byId` result**

Find:
```ts
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        tasks: project.tasks.map((t) => ({
```
Replace with:
```ts
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        peopleOfInterest: project.peopleOfInterest.map((link) => ({
          id: link.person.id,
          name: link.person.name,
          role: link.person.role ?? undefined,
          userId: link.person.userId ?? undefined,
        })),
        tasks: project.tasks.map((t) => ({
```

- [ ] **Step 6: Add the `updatePeopleOfInterest` mutation**

Find the end of the file:
```ts
      return { pipelineWithoutArea, deliveredWithoutArea };
    }),
});
```
Replace with (adds the new mutation before the closing `});` of the router):
```ts
      return { pipelineWithoutArea, deliveredWithoutArea };
    }),

  updatePeopleOfInterest: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        personIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }
      if (!current.companyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Projeto sem empresa vinculada não pode ter pessoas de interesse.",
        });
      }

      const caller = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      const isArchitect = caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN";
      const isOwner = current.clientId === ctx.userId;
      if (!isArchitect) {
        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para editar este projeto.",
          });
        }
        if (current.status === "DONE" || current.status === "CANCELLED") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Este projeto já foi concluído ou cancelado. Peça a um administrador para reabrir a edição.",
          });
        }
      }

      const resolvedIds = Array.from(
        new Set(await resolvePersonIds(ctx.db, current.companyId, input.personIds))
      );
      await ctx.db.projectPersonOfInterest.deleteMany({ where: { projectId: input.projectId } });
      await ctx.db.projectPersonOfInterest.createMany({
        data: resolvedIds.map((personId) => ({ projectId: input.projectId, personId })),
      });

      return { success: true };
    }),
});
```

- [ ] **Step 7: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `src/shared/types/index.ts`-dependent files may appear because `Project.peopleOfInterest` isn't declared on the frontend `Project` type yet — fixed in Task 9. No other new errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add updatePeopleOfInterest mutation and include Person links on project queries"
```

---

### Task 9: Add `Person`/`peopleOfInterest` to the frontend `Project` type

**Files:**
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Add the `PersonOfInterest` type and extend `Project`**

Find:
```ts
  projectType: string;
  targetAudience?: string;
  expectedUsers?: string;
  urgency?: string;
  features?: string[];
```
Replace with:
```ts
  projectType: string;
  targetAudience?: string;
  expectedUsers?: string;
  urgency?: string;
  features?: string[];
  peopleOfInterest?: PersonOfInterest[];
```

Then, directly above the `export interface Project {` declaration, add:
```ts
export interface PersonOfInterest {
  id: string;
  name: string;
  role?: string;
  userId?: string;
}

```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add PersonOfInterest type to Project"
```

---

### Task 10: Add the "Pessoas de interesse" card to the project detail page

**Files:**
- Create: `src/shared/components/project-people-of-interest-card.tsx`
- Modify: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Create the card component**

Create `src/shared/components/project-people-of-interest-card.tsx`:

```tsx
"use client";

import { trpc } from "@/shared/trpc/client";
import { DetailSection } from "@/shared/components/detail-section";
import {
  MultiCreatableCombobox,
  type MultiCreatableComboboxOption,
} from "@/src/shared/components/ui/multi-creatable-combobox";
import { Badge } from "@/src/shared/components/ui/badge";
import type { Project } from "@/shared/types";

export function ProjectPeopleOfInterestCard({
  project,
  canEdit,
}: {
  project: Project;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const companyId = project.companyId;

  const { data: options = [] } = trpc.person.list.useQuery(
    { companyId: companyId ?? "" },
    { enabled: !!companyId }
  );

  const updateMutation = trpc.project.updatePeopleOfInterest.useMutation({
    onSuccess: () => utils.project.byId.invalidate({ id: project.id }),
  });

  const createMutation = trpc.person.create.useMutation({
    onSuccess: (person) => {
      utils.person.list.invalidate({ companyId: companyId ?? "" });
      updateMutation.mutate({ projectId: project.id, personIds: [...currentIds, person.id] });
    },
  });

  const currentIds = (project.peopleOfInterest ?? []).map((p) => p.id);

  const comboboxOptions: MultiCreatableComboboxOption[] = options.map((o) => ({
    value: o.id,
    label: o.name,
    meta: { isUnlinkedUser: o.isUnlinkedUser },
  }));

  if (!companyId) return null;

  if (!canEdit) {
    return (
      <DetailSection title="Pessoas de interesse">
        <div className="sm:col-span-2">
          {currentIds.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Não informado</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(project.peopleOfInterest ?? []).map((person) => (
                <Badge key={person.id} variant="secondary">
                  {person.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Pessoas de interesse">
      <div className="sm:col-span-2">
        <MultiCreatableCombobox
          options={comboboxOptions}
          value={currentIds}
          onChange={(personIds) => updateMutation.mutate({ projectId: project.id, personIds })}
          onCreate={(name) => createMutation.mutate({ companyId, name })}
          placeholder="Adicionar pessoa..."
          emptyText="Nenhuma pessoa encontrada."
          disabled={updateMutation.isPending || createMutation.isPending}
        />
      </div>
    </DetailSection>
  );
}
```

- [ ] **Step 2: Wire it into `ProjectDetailSections`**

Find:
```tsx
import { ProjectRequestEditForm } from "@/shared/components/project-request-edit-form";
```
Replace with:
```tsx
import { ProjectRequestEditForm } from "@/shared/components/project-request-edit-form";
import { ProjectPeopleOfInterestCard } from "@/shared/components/project-people-of-interest-card";
```

Find:
```tsx
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <DetailSection title="Funcionalidades & benefícios">
```
Replace with:
```tsx
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <ProjectPeopleOfInterestCard project={project} canEdit={canEdit} />

      <DetailSection title="Funcionalidades & benefícios">
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no new errors/warnings.

- [ ] **Step 5: Manual check**

Run `pnpm dev`, open a project's detail page (`/projeto/<id>`) as its client owner (or as admin), and confirm:
- A "Pessoas de interesse" card appears between "Diagnóstico operacional" and "Funcionalidades & benefícios".
- The combined dropdown shows both existing `Person` records for that project's company and any system Users of that company (tagged "usuário"), lets you pick several, and lets you type a new name to create a person inline.
- Selecting a system User for the first time works (no error) and persists after a page reload.
- Reloading the page shows the same selected chips.
- As a role that can't edit the project (e.g. a different client, or a completed project), the card renders read-only chips with no combobox.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/project-people-of-interest-card.tsx src/shared/components/project-detail-sections.tsx
git commit -m "feat: add Pessoas de interesse card to project detail page"
```

---

### Task 11: Final verification pass

- [ ] **Step 1: Full type-check**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: exits 0.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: production build succeeds.

- [ ] **Step 4: End-to-end manual walkthrough**

With `pnpm dev` running:
1. As admin, open Entrevistas de Levantamento for a company, confirm previously-existing interviews still show their correct (migrated) participants.
2. Create a new interview tagging 2 participants: one existing `Person`, one brand-new name typed inline.
3. Open a project belonging to the same company, add both of those same people plus a system User as "Pessoas de interesse".
4. Reload the project page — confirm all three persist.
5. Remove one chip from the project's "Pessoas de interesse" and confirm it's gone after reload.
6. Confirm the same person tagged in both the interview and the project is the *same* underlying record (e.g. rename their `role` isn't tested here, but at minimum confirm no duplicate entries with slightly different ids appear in the combobox for that name).
