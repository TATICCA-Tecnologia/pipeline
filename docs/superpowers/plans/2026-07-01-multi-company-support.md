# Multi-Company Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user belong to multiple companies, let a client pick which company a project request is for, and let an admin manage those company associations and correct a project's company after the fact.

**Architecture:** Replace `User`'s single optional `companyId` with an implicit many-to-many `User <-> Company` Prisma relation (preserving existing data via a hand-written migration). `Project.companyId` (already in the schema, unused until now) starts being read/written by the project create/update flows. Admin manages company membership from `/admin/clientes`; the client picks a company when requesting a project; an admin can set/fix a project's company from the project detail page.

**Tech Stack:** Next.js 16, tRPC v11, Prisma 6 (PostgreSQL), React 19, shadcn/ui, sonner (toasts). No test framework is configured in this repo — verification is `pnpm tsc --noEmit` / `pnpm build` plus manual checks.

---

## Important notes before starting

- This repo has no automated test suite — don't add one. Verify each task with `pnpm tsc --noEmit` (baseline: 10 pre-existing, unrelated errors in `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — ignore those) and, for tasks with UI changes, `pnpm build`.
- **Task 1's migration is the highest-risk step in this plan** — it drops a column (`User.companyId`) after backfilling a new join table. If a reachable `DATABASE_URL` is available when this task runs, prefer letting Prisma generate the migration (`pnpm prisma migrate dev --name add_multi_company_support --create-only`) and only hand-edit it to insert the backfill statement, rather than trusting hand-written DDL blind. If no database is reachable (as has been the case throughout this project's session so far), write the migration file by hand exactly as given in Task 1 — the SQL follows Prisma's documented implicit many-to-many table convention precisely, but double-check column casing and the `@@map` table names (`"users"`, `"companies"`) match `prisma/schema.prisma` before trusting it.
- Deploys in this repo run `prisma migrate deploy` automatically on container start (see `Dockerfile`), so once this migration file is merged and deployed, it applies itself — there is no separate manual migration step for whoever deploys this.
- Commit after every task.

---

### Task 1: Prisma schema — many-to-many User/Company relation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260701190000_add_multi_company_support/migration.sql`

- [ ] **Step 1: Update the schema**

In `prisma/schema.prisma`, change the `User` model's company relation from:

```prisma
  // Relacionamentos
  company          Company?       @relation(fields: [companyId], references: [id])
  companyId        String?
  projects         Project[]      @relation("ProjectClient")
```

to:

```prisma
  // Relacionamentos
  companies        Company[]      @relation("UserCompanies")
  projects         Project[]      @relation("ProjectClient")
```

And change the `Company` model's `users` field from:

```prisma
  // Relacionamentos
  users    User[]
  projects Project[]
```

to:

```prisma
  // Relacionamentos
  users    User[]    @relation("UserCompanies")
  projects Project[]
```

`Project.companyId` and `Project.company` are untouched — they already exist and already support this exact shape (`Company?` optional relation).

- [ ] **Step 2: Regenerate the Prisma client (no DB needed)**

Run: `pnpm prisma generate`
Expected: `✔ Generated Prisma Client` — no errors.

- [ ] **Step 3: Create the migration**

Create `prisma/migrations/20260701190000_add_multi_company_support/migration.sql` with exactly this content:

```sql
-- CreateTable (implicit many-to-many join table for User <-> Company)
CREATE TABLE "_UserCompanies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserCompanies_AB_unique" ON "_UserCompanies"("A", "B");

-- CreateIndex
CREATE INDEX "_UserCompanies_B_index" ON "_UserCompanies"("B");

-- AddForeignKey
ALTER TABLE "_UserCompanies" ADD CONSTRAINT "_UserCompanies_A_fkey" FOREIGN KEY ("A") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserCompanies" ADD CONSTRAINT "_UserCompanies_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: preserve every existing single company assignment as a row in the new join table
INSERT INTO "_UserCompanies" ("A", "B")
SELECT "companyId", "id" FROM "users" WHERE "companyId" IS NOT NULL;

-- DropForeignKey (old single-company relation)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_companyId_fkey";

-- AlterTable (drop the old single-company column, now migrated)
ALTER TABLE "users" DROP COLUMN "companyId";
```

**Why this order matters:** the join table must exist and be populated with every existing `companyId` value *before* that column is dropped, or the data is lost permanently. Do not reorder these statements.

If you have a reachable `DATABASE_URL` available (check for a `.env` file with `DATABASE_URL` set, or ask the user), instead run:

```bash
pnpm prisma migrate dev --name add_multi_company_support --create-only
```

This generates `prisma/migrations/<timestamp>_add_multi_company_support/migration.sql` automatically from the schema diff (it will contain the `CREATE TABLE`/index/FK statements, plus the `DROP COLUMN`). Open that generated file and insert the `INSERT INTO "_UserCompanies" ...` backfill statement (exactly as shown above) between the last `AddForeignKey` statement and the `DropColumn` statement, then run `pnpm prisma migrate dev` (without `--create-only`) to apply and confirm it succeeds against that database. Delete the hand-written folder from Step 3 above if Prisma generated a differently-named one — keep only one migration folder for this change.

- [ ] **Step 4: Verify**

Run: `pnpm tsc --noEmit`
Expected: new errors will appear in every file that still references `user.company`/`companyId` as a single value — this is expected at this point in the plan; they get fixed in later tasks. Confirm the errors are all about `company`/`companyId`, nothing else new.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: replace single companyId with many-to-many User-Company relation"
```

---

### Task 2: New `company` router

**Files:**
- Create: `src/server/trpc/routers/company.router.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Create the router**

```ts
import { z } from "zod";
import { router, adminProcedure } from "../trpc";

export const companyRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const companies = await ctx.db.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return companies.map((c) => ({ id: c.id, name: c.name }));
  }),

  create: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.company.create({
        data: { name: input.name.trim() },
      });
      return { id: company.id, name: company.name };
    }),
});
```

- [ ] **Step 2: Register it on the root router**

In `src/server/trpc/root.ts`, change:

```ts
import { taxonomyRouter } from "./routers/taxonomy.router";

export const appRouter = router({
  project: projectRouter,
  user: userRouter,
  auth: authRouter,
  request: requestRouter,
  comment: commentRouter,
  file: fileRouter,
  activity: activityRouter,
  feature: featureRouter,
  specification: specificationRouter,
  taxonomy: taxonomyRouter,
});
```

to:

```ts
import { taxonomyRouter } from "./routers/taxonomy.router";
import { companyRouter } from "./routers/company.router";

export const appRouter = router({
  project: projectRouter,
  user: userRouter,
  auth: authRouter,
  request: requestRouter,
  comment: commentRouter,
  file: fileRouter,
  activity: activityRouter,
  feature: featureRouter,
  specification: specificationRouter,
  taxonomy: taxonomyRouter,
  company: companyRouter,
});
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no new errors from `company.router.ts` or `root.ts` (the pre-existing `company`/`companyId` errors from Task 1 remain, untouched by this task).

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/company.router.ts src/server/trpc/root.ts
git commit -m "feat: add company router (list, create)"
```

---

### Task 3: `user.router.ts` — companies array + membership management

**Files:**
- Modify: `src/server/trpc/routers/user.router.ts`

- [ ] **Step 1: Update `me`, `listClients`, `byId` to return `companies` instead of `company`**

Change:

```ts
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { company: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      company: user.company?.name ?? "",
      createdAt: user.createdAt,
    };
  }),

  listClients: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: "CLIENT" },
      include: { company: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toFrontendRole(u.role),
      company: u.company?.name,
      createdAt: u.createdAt,
    }));
  }),
```

to:

```ts
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { companies: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: user.createdAt,
    };
  }),

  listClients: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: "CLIENT" },
      include: { companies: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toFrontendRole(u.role),
      companies: u.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: u.createdAt,
    }));
  }),
```

Change:

```ts
  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.id },
      include: { company: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: toFrontendRole(user.role),
      company: user.company?.name,
      createdAt: user.createdAt,
    };
  }),
```

to:

```ts
  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.id },
      include: { companies: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: toFrontendRole(user.role),
      companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: user.createdAt,
    };
  }),
```

- [ ] **Step 2: Remove company editing from `updateProfile`**

Change:

```ts
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        companyName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let companyId: string | null = null;
      if (input.companyName != null && input.companyName.trim() !== "") {
        let company = await ctx.db.company.findFirst({
          where: { name: input.companyName.trim() },
        });
        if (!company) {
          company = await ctx.db.company.create({
            data: { name: input.companyName.trim() },
          });
        }
        companyId = company.id;
      }
      const user = await ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
          ...(companyId !== null && { companyId }),
        },
        include: { company: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        company: user.company?.name ?? "",
        createdAt: user.createdAt,
      };
    }),
```

to:

```ts
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
        },
        include: { companies: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),
```

- [ ] **Step 3: Add company-membership procedures**

Add these four new procedures right after `updateProfile` and before `delete`:

```ts
  listMyCompanies: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { companies: true },
    });
    return (user?.companies ?? []).map((c) => ({ id: c.id, name: c.name }));
  }),

  listCompaniesForUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        include: { companies: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      return user.companies.map((c) => ({ id: c.id, name: c.name }));
    }),

  addCompanyToUser: adminProcedure
    .input(z.object({ userId: z.string(), companyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { companies: { connect: { id: input.companyId } } },
      });
      return { success: true };
    }),

  removeCompanyFromUser: adminProcedure
    .input(z.object({ userId: z.string(), companyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { companies: { disconnect: { id: input.companyId } } },
      });
      return { success: true };
    }),
```

- [ ] **Step 4: Add the `adminProcedure` import**

At the top of the file, change:

```ts
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
```

(No change needed — `adminProcedure` is already imported in this file from the earlier Super Admin work. Just confirm it's there; if for any reason it isn't, add it to this import line.)

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `user.router.ts` itself. Errors in frontend files that read `.company` still remain — fixed in later tasks.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/user.router.ts
git commit -m "feat: support multiple companies per user in user router"
```

---

### Task 4: `auth.router.ts` — register with the new relation

**Files:**
- Modify: `src/server/trpc/routers/auth.router.ts`

- [ ] **Step 1: Update `login`**

Change:

```ts
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        include: { company: true },
      });
      if (!user || !user.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      if (user.password && !compareSync(input.password, user.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        company: user.company?.name,
        createdAt: user.createdAt,
      };
    }),
```

to:

```ts
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        include: { companies: true },
      });
      if (!user || !user.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      if (user.password && !compareSync(input.password, user.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),
```

- [ ] **Step 2: Update `register`**

Change:

```ts
      let companyId: string | null = null;
      if (input.company?.trim()) {
        let company = await ctx.db.company.findFirst({
          where: { name: input.company.trim() },
        });
        if (!company) {
          company = await ctx.db.company.create({
            data: { name: input.company.trim() },
          });
        }
        companyId = company.id;
      }
      const hashedPassword = hashSync(input.password, SALT_ROUNDS);
      const user = await ctx.db.user.create({
        data: {
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          password: hashedPassword,
          role: "CLIENT",
          companyId,
          phone: input.phone?.trim() || null,
        },
        include: { company: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        company: user.company?.name,
        createdAt: user.createdAt,
      };
    }),
```

to:

```ts
      let companyId: string | null = null;
      if (input.company?.trim()) {
        let company = await ctx.db.company.findFirst({
          where: { name: input.company.trim() },
        });
        if (!company) {
          company = await ctx.db.company.create({
            data: { name: input.company.trim() },
          });
        }
        companyId = company.id;
      }
      const hashedPassword = hashSync(input.password, SALT_ROUNDS);
      const user = await ctx.db.user.create({
        data: {
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          password: hashedPassword,
          role: "CLIENT",
          phone: input.phone?.trim() || null,
          companies: companyId ? { connect: { id: companyId } } : undefined,
        },
        include: { companies: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `auth.router.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/auth.router.ts
git commit -m "feat: connect registered users to companies via many-to-many relation"
```

---

### Task 5: `project.router.ts` — read/write `companyId`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Include company in `list`**

Change:

```ts
      const projects = await ctx.db.project.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: {
          client: {
            select: { id: true, name: true, email: true, role: true },
          },
          developer: {
            select: { id: true, name: true, email: true },
          },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: toFrontendStatus(p.status),
        priority: p.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: p.clientId,
        developerId: p.developerId ?? undefined,
        projectType: p.platform ?? p.type,
        estimatedDeadline: p.deadline ?? undefined,
        targetAudience: p.targetAudience ?? undefined,
        expectedUsers: p.expectedUsers ?? undefined,
        urgency: p.urgency ?? undefined,
        features: p.features?.map((f) => f.name) ?? [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        client: p.client
          ? {
              id: p.client.id,
              name: p.client.name,
              email: p.client.email,
              role: p.client.role,
            }
          : undefined,
        developer: p.developer
          ? { id: p.developer.id, name: p.developer.name, email: p.developer.email }
          : undefined,
      }));
```

to:

```ts
      const projects = await ctx.db.project.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: {
          client: {
            select: { id: true, name: true, email: true, role: true },
          },
          developer: {
            select: { id: true, name: true, email: true },
          },
          company: {
            select: { id: true, name: true },
          },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: toFrontendStatus(p.status),
        priority: p.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: p.clientId,
        developerId: p.developerId ?? undefined,
        companyId: p.companyId ?? undefined,
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        estimatedDeadline: p.deadline ?? undefined,
        targetAudience: p.targetAudience ?? undefined,
        expectedUsers: p.expectedUsers ?? undefined,
        urgency: p.urgency ?? undefined,
        features: p.features?.map((f) => f.name) ?? [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        client: p.client
          ? {
              id: p.client.id,
              name: p.client.name,
              email: p.client.email,
              role: p.client.role,
            }
          : undefined,
        developer: p.developer
          ? { id: p.developer.id, name: p.developer.name, email: p.developer.email }
          : undefined,
      }));
```

- [ ] **Step 2: Include company in `byId`**

Change:

```ts
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          tasks: true,
          features: true,
        },
      });
      if (!project)
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        projectType: project.platform ?? project.type,
```

to:

```ts
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
      if (!project)
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        companyId: project.companyId ?? undefined,
        companyName: project.company?.name,
        projectType: project.platform ?? project.type,
```

(the rest of `byId`'s return object is unchanged)

- [ ] **Step 3: Accept `companyId` on `create`**

Change:

```ts
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: projectStatusSchema.default("backlog"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        clientId: z.string(),
        developerId: z.string().optional(),
        projectType: z.string(),
```

to:

```ts
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: projectStatusSchema.default("backlog"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        clientId: z.string(),
        developerId: z.string().optional(),
        companyId: z.string().optional(),
        projectType: z.string(),
```

Then change the `project.create` data object:

```ts
      const project = await ctx.db.project.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          type: "OUTRO",
          category: "OUTRO",
          status: toPrismaStatus(input.status as FrontendProjectStatus),
          priority: input.priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          clientId: input.clientId,
          developerId: input.developerId ?? null,
          platform: input.projectType,
```

to:

```ts
      const project = await ctx.db.project.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          type: "OUTRO",
          category: "OUTRO",
          status: toPrismaStatus(input.status as FrontendProjectStatus),
          priority: input.priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          clientId: input.clientId,
          developerId: input.developerId ?? null,
          companyId: input.companyId ?? null,
          platform: input.projectType,
```

- [ ] **Step 4: Accept `companyId` on `update`**

Change:

```ts
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatusSchema.optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        developerId: z.string().nullable().optional(),
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;
```

to:

```ts
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatusSchema.optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        developerId: z.string().nullable().optional(),
        companyId: z.string().nullable().optional(),
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.companyId !== undefined) data.companyId = rest.companyId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;
```

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `project.router.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: read and write project companyId in project router"
```

---

### Task 6: Shared types — `User.companies`, `Project.companyId`/`companyName`

**Files:**
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Update `User`**

Change:

```ts
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  company?: string;
  createdAt: Date;
}
```

to:

```ts
export interface Company {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  companies?: Company[];
  createdAt: Date;
}
```

- [ ] **Step 2: Update `Project`**

Change:

```ts
export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  clientId: string;
  developerId?: string;
  estimatedBudget?: number;
```

to:

```ts
export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  clientId: string;
  developerId?: string;
  companyId?: string;
  companyName?: string;
  estimatedBudget?: number;
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: fewer errors than before (files reading `.company` as a string now correctly error on the renamed field, guiding the remaining tasks); no errors from `shared/types/index.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add Company type, User.companies, Project.companyId/companyName"
```

---

### Task 7: `clients-context.tsx` — map `companies` array

**Files:**
- Modify: `src/shared/context/clients-context.tsx`

- [ ] **Step 1: Update `mapUser`**

Change:

```ts
function mapUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  company?: string;
  createdAt: Date;
}): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as User["role"],
    company: u.company,
    createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt),
  };
}
```

to:

```ts
function mapUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  companies?: { id: string; name: string }[];
  createdAt: Date;
}): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as User["role"],
    companies: u.companies ?? [],
    createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt),
  };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `clients-context.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/context/clients-context.tsx
git commit -m "feat: map companies array in clients context"
```

---

### Task 8: `admin/clientes/page.tsx` — "Gerenciar Empresas" + fixed listing

**Files:**
- Create: `src/app/(private)/admin/clientes/_components/manage-companies-dialog.tsx`
- Modify: `src/app/(private)/admin/clientes/page.tsx`

- [ ] **Step 1: Create the manage-companies dialog**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import { toast } from "sonner";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { Badge } from "@/src/shared/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { User } from "@/shared/types";

interface ManageCompaniesDialogProps {
  client: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCompaniesDialog({
  client,
  open,
  onOpenChange,
}: ManageCompaniesDialogProps) {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: userCompanies = [], refetch: refetchUserCompanies } =
    trpc.user.listCompaniesForUser.useQuery(
      { userId: client?.id ?? "" },
      { enabled: open && !!client?.id }
    );
  const { data: allCompanies = [] } = trpc.company.list.useQuery(undefined, {
    enabled: open,
  });

  const addMutation = trpc.user.addCompanyToUser.useMutation({
    onSuccess: () => {
      refetchUserCompanies();
      utils.user.listClients.invalidate();
    },
    onError: (error) => toast.error(`Erro ao vincular empresa: ${error.message}`),
  });

  const removeMutation = trpc.user.removeCompanyFromUser.useMutation({
    onSuccess: () => {
      refetchUserCompanies();
      utils.user.listClients.invalidate();
    },
    onError: (error) => toast.error(`Erro ao remover empresa: ${error.message}`),
  });

  const createMutation = trpc.company.create.useMutation({
    onSuccess: (company) => {
      if (client) addMutation.mutate({ userId: client.id, companyId: company.id });
      utils.company.list.invalidate();
      setSearch("");
    },
    onError: (error) => toast.error(`Erro ao criar empresa: ${error.message}`),
  });

  if (!client) return null;

  const linkedIds = new Set(userCompanies.map((c) => c.id));
  const searchLower = search.trim().toLowerCase();
  const matches = allCompanies.filter(
    (c) => !linkedIds.has(c.id) && c.name.toLowerCase().includes(searchLower)
  );
  const exactMatchExists = allCompanies.some(
    (c) => c.name.toLowerCase() === searchLower
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresas de {client.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Empresas vinculadas</p>
          {userCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa vinculada ainda.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {userCompanies.map((company) => (
                <Badge
                  key={company.id}
                  variant="secondary"
                  className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                >
                  {company.name}
                  <button
                    type="button"
                    onClick={() =>
                      removeMutation.mutate({
                        userId: client.id,
                        companyId: company.id,
                      })
                    }
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remover ${company.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium">Vincular empresa</p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ou digitar nome de empresa nova..."
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {matches.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() =>
                  addMutation.mutate({ userId: client.id, companyId: company.id })
                }
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {company.name}
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {searchLower && !exactMatchExists && (
              <button
                type="button"
                onClick={() => createMutation.mutate({ name: search.trim() })}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar empresa &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `admin/clientes/page.tsx`**

Add the import (alongside the other lucide icons and the new dialog):

Change:

```tsx
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Building2,
  FolderKanban,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import type { User } from "@/shared/types";
```

to:

```tsx
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Building2,
  FolderKanban,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import type { User } from "@/shared/types";
import { ManageCompaniesDialog } from "./_components/manage-companies-dialog";
```

Add state for the dialog. Change:

```tsx
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<User | null>(null);
  const [clientToDelete, setClientToDelete] = useState<User | null>(null);
  const [clientToPromote, setClientToPromote] = useState<User | null>(null);
  const [clientToResetPassword, setClientToResetPassword] = useState<User | null>(null);
```

to:

```tsx
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isManageCompaniesOpen, setIsManageCompaniesOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<User | null>(null);
  const [clientToDelete, setClientToDelete] = useState<User | null>(null);
  const [clientToPromote, setClientToPromote] = useState<User | null>(null);
  const [clientToResetPassword, setClientToResetPassword] = useState<User | null>(null);
  const [clientForCompanies, setClientForCompanies] = useState<User | null>(null);
```

Update the search filter — change:

```tsx
  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase()) ||
      client.company?.toLowerCase().includes(search.toLowerCase())
  );
```

to:

```tsx
  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase()) ||
      (client.companies ?? []).some((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
  );
```

Add an open-dialog handler. Change:

```tsx
  const openResetPasswordDialog = (client: User) => {
    setClientToResetPassword(client);
    setNewPassword("");
    setIsResetPasswordDialogOpen(true);
  };
```

to:

```tsx
  const openResetPasswordDialog = (client: User) => {
    setClientToResetPassword(client);
    setNewPassword("");
    setIsResetPasswordDialogOpen(true);
  };

  const openManageCompanies = (client: User) => {
    setClientForCompanies(client);
    setIsManageCompaniesOpen(true);
  };
```

Update the table cell that shows a single company — change:

```tsx
                    <TableCell>
                      {client.company ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-4 w-4" />
                          {client.company}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
```

to:

```tsx
                    <TableCell>
                      {client.companies && client.companies.length > 0 ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {client.companies.map((c) => c.name).join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
```

Add the new menu item — change:

```tsx
                          <DropdownMenuItem
                            onClick={() => openResetPasswordDialog(client)}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Redefinir Senha
                          </DropdownMenuItem>
```

to:

```tsx
                          <DropdownMenuItem
                            onClick={() => openResetPasswordDialog(client)}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Redefinir Senha
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openManageCompanies(client)}
                          >
                            <Building2 className="h-4 w-4 mr-2" />
                            Gerenciar Empresas
                          </DropdownMenuItem>
```

Render the dialog at the end of the component. Change:

```tsx
      </Dialog>
    </div>
  );
}
```

(the very last `</Dialog>` in the file, closing the "Reset Password Dialog") to:

```tsx
      </Dialog>

      <ManageCompaniesDialog
        client={clientForCompanies}
        open={isManageCompaniesOpen}
        onOpenChange={setIsManageCompaniesOpen}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `admin/clientes/page.tsx` or the new dialog file.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/clientes/page.tsx" "src/app/(private)/admin/clientes/_components/manage-companies-dialog.tsx"
git commit -m "feat: let admins manage multiple companies per client"
```

---

### Task 9: Client-facing company selector on "Solicitar Projeto"

**Files:**
- Modify: `src/shared/context/projects-context.tsx`
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Pass `companyId` through `addProject`**

In `src/shared/context/projects-context.tsx`, change:

```ts
  const addProject = useCallback(
    async (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
      const created = await createProject.mutateAsync({
        title: project.title,
        description: project.description,
        status: project.status,
        priority: project.priority === "urgent" ? "urgent" : project.priority,
        clientId: project.clientId,
        developerId: project.developerId,
        projectType: project.projectType?.trim() || "Outro",
```

to:

```ts
  const addProject = useCallback(
    async (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
      const created = await createProject.mutateAsync({
        title: project.title,
        description: project.description,
        status: project.status,
        priority: project.priority === "urgent" ? "urgent" : project.priority,
        clientId: project.clientId,
        developerId: project.developerId,
        companyId: project.companyId,
        projectType: project.projectType?.trim() || "Outro",
```

- [ ] **Step 2: Add the company field to the request form**

In `src/app/(private)/cliente/solicitar/page.tsx`, add the query and a piece of state. Change:

```tsx
import { useToast } from "@/src/shared/hooks/use-toast";
import { useZodForm } from "@/shared/hooks/use-zod-form";
```

to:

```tsx
import { useToast } from "@/src/shared/hooks/use-toast";
import { trpc } from "@/shared/trpc/client";
import { useZodForm } from "@/shared/hooks/use-zod-form";
```

Change:

```tsx
export default function SolicitarProjetoPage() {
  const { user } = useAuth();
  const { addProject } = useProjects();
  const { addFile } = useFiles();
  const router = useRouter();
  const { toast } = useToast();
```

to:

```tsx
export default function SolicitarProjetoPage() {
  const { user } = useAuth();
  const { addProject } = useProjects();
  const { addFile } = useFiles();
  const router = useRouter();
  const { toast } = useToast();
  const { data: myCompanies = [] } = trpc.user.listMyCompanies.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
```

Add state for the selected company right after the existing `useState` calls. Change:

```tsx
  const [stepIndex, setStepIndex] = useState(0);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
```

to:

```tsx
  const [stepIndex, setStepIndex] = useState(0);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
```

Auto-select the company when there's exactly one, using an effect. Add this right after the `const currentStep = ...` block. Change:

```tsx
  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isFirstStep = stepIndex === 0;
```

to:

```tsx
  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isFirstStep = stepIndex === 0;

  useEffect(() => {
    if (myCompanies.length === 1 && !selectedCompanyId) {
      setSelectedCompanyId(myCompanies[0].id);
    }
  }, [myCompanies, selectedCompanyId]);
```

Add `useEffect` to the React import. Change:

```tsx
import { useMemo, useRef, useState } from "react";
```

to:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

Block submission when there are multiple companies and none is chosen. Change:

```tsx
  async function onSubmit(data: SolicitarProjetoFormData) {
    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para solicitar um projeto.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
```

to:

```tsx
  async function onSubmit(data: SolicitarProjetoFormData) {
    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para solicitar um projeto.",
        variant: "destructive",
      });
      return;
    }

    if (myCompanies.length > 1 && !selectedCompanyId) {
      toast({
        title: "Selecione uma empresa",
        description: "Escolha para qual empresa este projeto é.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
```

Pass `companyId` into `addProject`. Change:

```tsx
      const projectId = await addProject({
        title: data.title,
        description: data.description,
        clientId: user.id,
        status: "backlog",
```

to:

```tsx
      const projectId = await addProject({
        title: data.title,
        description: data.description,
        clientId: user.id,
        companyId: selectedCompanyId,
        status: "backlog",
```

Add the visible field in the "Básico" step, right after the title field. Change:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Nome do processo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Ex.: Processo de Vendas"
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">{errors.title.message}</p>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
```

to:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="title">
                    Nome do processo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Ex.: Processo de Vendas"
                  />
                  {errors.title && (
                    <p className="text-xs text-destructive">{errors.title.message}</p>
                  )}
                </div>

                {myCompanies.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="companyId">
                      Empresa{" "}
                      {myCompanies.length > 1 && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    {myCompanies.length === 1 ? (
                      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        {myCompanies[0].name}
                      </div>
                    ) : (
                      <Select
                        value={selectedCompanyId}
                        onValueChange={setSelectedCompanyId}
                      >
                        <SelectTrigger id="companyId">
                          <SelectValue placeholder="Selecione a empresa" />
                        </SelectTrigger>
                        <SelectContent>
                          {myCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `projects-context.tsx` or `cliente/solicitar/page.tsx`.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/shared/context/projects-context.tsx "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: let clients pick which company a project request is for"
```

---

### Task 10: Client settings — read-only companies list

**Files:**
- Modify: `src/app/(private)/cliente/configuracoes/page.tsx`

- [ ] **Step 1: Stop sending `companyName`, stop editing company**

Change:

```tsx
  const updateProfileMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
    },
  });

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        name: profile.name,
        email: profile.email,
        company: profile.company,
        phone: profile.phone,
      });
    } else if (user) {
      setProfileData({
        name: user.name ?? "",
        email: user.email ?? "",
        company: user.company ?? "",
        phone: "",
      });
    }
  }, [profile, user]);
```

to:

```tsx
  const updateProfileMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      utils.user.me.invalidate();
    },
  });

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    if (profile) {
      setProfileData({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
      });
    } else if (user) {
      setProfileData({
        name: user.name ?? "",
        email: user.email ?? "",
        phone: "",
      });
    }
  }, [profile, user]);
```

Change:

```tsx
      await updateProfileMutation.mutateAsync({
        name: profileData.name,
        phone: profileData.phone || undefined,
        companyName: profileData.company || undefined,
      });
```

to:

```tsx
      await updateProfileMutation.mutateAsync({
        name: profileData.name,
        phone: profileData.phone || undefined,
      });
```

- [ ] **Step 2: Replace the editable company `Input` with a read-only list**

Change:

```tsx
              <Field>
                <FieldLabel>Empresa</FieldLabel>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={profileData.company}
                    onChange={(e) =>
                      setProfileData({
                        ...profileData,
                        company: e.target.value,
                      })
                    }
                    placeholder="Nome da empresa"
                    className="pl-10"
                  />
                </div>
              </Field>
```

to:

```tsx
              <Field>
                <FieldLabel>Empresas vinculadas</FieldLabel>
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  {profile && profile.companies.length > 0 ? (
                    <span>{profile.companies.map((c) => c.name).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Nenhuma empresa vinculada — fale com o administrador.
                    </span>
                  )}
                </div>
              </Field>
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `cliente/configuracoes/page.tsx`.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/cliente/configuracoes/page.tsx"
git commit -m "feat: show client's companies as read-only, managed by admin only"
```

---

### Task 11: Show company on project card + quick-details modal

**Files:**
- Modify: `src/shared/components/project-card.tsx`
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`

- [ ] **Step 1: Add a company line to `ProjectCard`**

Change:

```tsx
        {/* Badges */}
        <div className="flex min-w-0 flex-col items-start gap-1">
          {project.projectType && (
            <span
              className="inline-block max-w-full truncate rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              title={project.projectType}
            >
              {project.projectType}
            </span>
          )}
          <Badge
            variant="outline"
            className={`text-[9px] font-semibold uppercase h-4 px-1.5 ${statusConfig.color}`}
          >
            {statusConfig.label}
          </Badge>
        </div>
```

to:

```tsx
        {/* Badges */}
        <div className="flex min-w-0 flex-col items-start gap-1">
          {project.projectType && (
            <span
              className="inline-block max-w-full truncate rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              title={project.projectType}
            >
              {project.projectType}
            </span>
          )}
          {project.companyName && (
            <span
              className="inline-block max-w-full truncate text-[10px] text-muted-foreground"
              title={project.companyName}
            >
              {project.companyName}
            </span>
          )}
          <Badge
            variant="outline"
            className={`text-[9px] font-semibold uppercase h-4 px-1.5 ${statusConfig.color}`}
          >
            {statusConfig.label}
          </Badge>
        </div>
```

- [ ] **Step 2: Add company to the quick-details modal**

Change:

```tsx
          <div className="flex items-center justify-between">
            <span className="font-medium">Cliente (ID)</span>
            <span className="text-xs font-mono text-[#111827]">
              {project.clientId}
            </span>
          </div>

          {project.developerId && (
```

to:

```tsx
          <div className="flex items-center justify-between">
            <span className="font-medium">Cliente (ID)</span>
            <span className="text-xs font-mono text-[#111827]">
              {project.clientId}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-medium">Empresa</span>
            <span className="text-xs font-medium text-[#111827]">
              {project.companyName ?? "Sem empresa definida"}
            </span>
          </div>

          {project.developerId && (
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from either file.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-card.tsx "src/app/(private)/admin/projetos/_components/project-details.modal.tsx"
git commit -m "feat: show project company on the kanban card and quick-details modal"
```

---

### Task 12: Admin "Definir empresa" on the project detail page

**Files:**
- Create: `src/app/(private)/projeto/[id]/_components/project-assign-company.modal.tsx`
- Modify: `src/app/(private)/projeto/[id]/_components/project-modals.tsx`
- Modify: `src/app/(private)/projeto/[id]/hooks/project.hook.ts`
- Modify: `src/app/(private)/projeto/[id]/page.tsx`

- [ ] **Step 1: Create the modal**

```tsx
"use client";

import { useState } from "react";
import type { ModalProps } from "@/shared/types/modal";
import { Button } from "@/src/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { trpc } from "@/shared/trpc/client";
import { useProjectActions } from "../hooks/project.action";

interface AssignCompanyData {
  projectId: string;
  clientId: string;
}

export function ProjectAssignCompanyModal({
  data,
  onClose,
}: ModalProps<AssignCompanyData>) {
  if (!data) return null;

  const { data: companies = [] } = trpc.user.listCompaniesForUser.useQuery({
    userId: data.clientId,
  });
  const { updateProjectMutation } = useProjectActions(data.projectId);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();

  return (
    <div className="w-full max-w-md space-y-4 p-4">
      <h2 className="text-lg font-semibold">Definir empresa do projeto</h2>
      <p className="text-sm text-muted-foreground">
        Escolha a empresa do cliente para a qual este projeto é.
      </p>

      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este cliente não tem nenhuma empresa vinculada. Vincule uma empresa a
          ele em Clientes → Gerenciar Empresas antes de definir aqui.
        </p>
      ) : (
        <Select
          value={selectedCompanyId ?? ""}
          onValueChange={(value) => setSelectedCompanyId(value || undefined)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione uma empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!selectedCompanyId}
          onClick={async () => {
            if (!selectedCompanyId) return;
            await updateProjectMutation.mutateAsync({
              id: data.projectId,
              companyId: selectedCompanyId,
            });
            onClose();
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export it from the barrel**

Change `src/app/(private)/projeto/[id]/_components/project-modals.tsx` from:

```ts
export * from "./project-add-feature.modal";
export * from "./project-feature-status.modal";
export * from "./project-assign-developer.modal";
```

to:

```ts
export * from "./project-add-feature.modal";
export * from "./project-feature-status.modal";
export * from "./project-assign-developer.modal";
export * from "./project-assign-company.modal";
```

- [ ] **Step 3: No change needed to `project.hook.ts`**

`ProjectAssignCompanyModal` fetches its own companies via `trpc.user.listCompaniesForUser` directly (same pattern already used by other modals that need their own data), so `useProject`'s return shape doesn't need to change. Skip this file — it's listed above only so the plan is explicit that it was considered and needs no edit.

- [ ] **Step 4: Wire the button into the Equipe card**

In `src/app/(private)/projeto/[id]/page.tsx`, add the import. Change:

```tsx
import {
  ProjectAddFeatureModal,
  ProjectFeatureStatusModal,
  ProjectAssignDeveloperModal,
} from "./_components/project-modals";
```

to:

```tsx
import {
  ProjectAddFeatureModal,
  ProjectFeatureStatusModal,
  ProjectAssignDeveloperModal,
  ProjectAssignCompanyModal,
} from "./_components/project-modals";
```

Add the button and current-company display next to "Definir responsável". Change:

```tsx
          {/* Equipe */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Equipe
                </span>
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openModal(
                        `project-assign-dev-${project.id}`,
                        ProjectAssignDeveloperModal,
                        { projectId: project.id },
                        { size: "md", position: "center" }
                      );
                    }}
                  >
                    Definir responsável
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {project.developerId ? (
```

to:

```tsx
          {/* Equipe */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Equipe
                </span>
                <div className="flex gap-2">
                  {user?.role === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openModal(
                          `project-assign-company-${project.id}`,
                          ProjectAssignCompanyModal,
                          { projectId: project.id, clientId: project.clientId },
                          { size: "md", position: "center" }
                        );
                      }}
                    >
                      Definir empresa
                    </Button>
                  )}
                  {user?.role === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openModal(
                          `project-assign-dev-${project.id}`,
                          ProjectAssignDeveloperModal,
                          { projectId: project.id },
                          { size: "md", position: "center" }
                        );
                      }}
                    >
                      Definir responsável
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>
                  {(projectDetails as any)?.companyName ?? "Sem empresa definida"}
                </span>
              </div>
              {project.developerId ? (
```

(`Building` is already imported in this file's lucide-react import list, per the existing imports at the top.)

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from these files.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/projeto/[id]/_components/project-assign-company.modal.tsx" "src/app/(private)/projeto/[id]/_components/project-modals.tsx" "src/app/(private)/projeto/[id]/page.tsx"
git commit -m "feat: let admins set or fix a project's company from the detail page"
```

---

### Task 13: Manual end-to-end verification

Requires a reachable `DATABASE_URL` with the Task 1 migration applied (either directly, or via a deploy since this repo now runs `prisma migrate deploy` automatically on container start).

- [ ] **Step 1: Confirm the migration applied cleanly**

After deploy, check that existing users who had a single company before this change still have it — e.g. via `trpc.user.listClients` or by checking `/admin/clientes` shows their company as before.

- [ ] **Step 2: Admin links a second company to a client**

In `/admin/clientes`, open "Gerenciar Empresas" for any client, search for a company name that doesn't exist yet, click "Criar empresa...", confirm it appears as linked immediately. Then link a second, pre-existing company the same way. Confirm both show in the "Empresa" column of the clientes table.

- [ ] **Step 3: Client requests a project with 2 companies**

Log in as that client. Go to "Solicitar Projeto". Confirm the "Empresa" selector appears in the first step and is required (submitting without choosing shows the "Selecione uma empresa" toast). Pick one, complete the form, submit. Confirm the new project shows that company's name on its Kanban card.

- [ ] **Step 4: Client with exactly one company**

Log in as a client with exactly one linked company. Go to "Solicitar Projeto". Confirm the company shows as a non-editable box (not a dropdown) already filled in, and the request submits successfully with that company attached.

- [ ] **Step 5: Client with zero companies**

Log in as a client with no companies linked. Go to "Solicitar Projeto". Confirm no company field appears at all, and the request still submits successfully (with no company attached).

- [ ] **Step 6: Admin fixes a project with no company**

Open the project from Step 5 in `/projeto/[id]`. Confirm the Equipe card shows "Sem empresa definida". Click "Definir empresa", pick one of that client's companies (link one first via `/admin/clientes` if needed), save. Confirm it now shows that company's name.

No commit for this task (verification only). If any step fails, fix the underlying task before considering this plan complete.
