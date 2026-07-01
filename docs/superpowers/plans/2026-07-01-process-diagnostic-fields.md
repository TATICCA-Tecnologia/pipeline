# Process Diagnostic Data-Capture Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the operational and technical data needed to later reproduce a TATICCA-style RPA diagnostic (periodicidade, colaboradores, duração, horas anuais, complexidade, agendamento do robô, saving estimado) directly on each `Project`, split between the client's "Solicitar Projeto" form (operational fields) and the admin/architect's "Especificação → Configuração técnica" tab (technical/financial fields).

**Architecture:** Add 7 new nullable `Project` columns. Three operational fields (`peopleInvolved`, `taskDurationHours`, `processFrequency`) are entered by the client at request time; a fourth (`currentAnnualHours`) is computed server-side from the other two using a fixed frequency-multiplier table shared between frontend (for live preview) and backend (source of truth). Three technical fields (`complexity`, `robotSchedule`, `estimatedAnnualSavingBRL`) are entered later by admin/architect on the existing "Configuração técnica" card — a screen the client never accesses, which is how the "cliente nunca vê valor em reais" requirement is satisfied. No new tRPC procedures — only extending `project.create`/`project.update`/`project.list`/`project.byId`.

**Tech Stack:** Next.js 16, tRPC v11, Prisma 6 (PostgreSQL), React 19, react-hook-form + Zod, shadcn/ui.

---

## Important notes before starting

- This repo has no automated test suite — don't add one. Verify each task with `pnpm tsc --noEmit` (baseline: 10 pre-existing, unrelated errors in `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — ignore those) and `pnpm build` for tasks with UI changes.
- **Heads-up on pre-existing schema drift (not this plan's concern, but worth knowing):** `prisma/migrations/20260325120000_init_postgresql/migration.sql`'s `projects` table is missing several columns that exist in the current `prisma/schema.prisma` and are actively used in production (`projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, the five `rating*` fields, `solutionTypes`, `mainTool`, `executionStrategy`, `architectNotes`) — and `hasExistingSystem` is `BOOLEAN` in that migration but `String?` in the current schema. This means those columns were added to the live database outside of Prisma's migration history at some point (e.g., via `prisma db push` during earlier development), not through a migration file. This is NOT something this plan needs to fix: `prisma migrate deploy` only applies migration files not yet recorded in the database's `_prisma_migrations` table — it does not diff column-by-column against `schema.prisma` — so a purely additive `ADD COLUMN` migration for brand-new columns (which is all this plan does) applies safely regardless of that pre-existing drift. Flagging it here only so nobody is surprised if they inspect the migration history later.
- Deploys in this repo run `prisma migrate deploy` automatically on container start (see `Dockerfile`), so once the migration in Task 1 is merged and deployed, it applies itself.
- Commit after every task.

---

### Task 1: Prisma schema — 7 new `Project` columns

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260701200000_add_process_diagnostic_fields/migration.sql`

- [ ] **Step 1: Add the operational fields**

In `prisma/schema.prisma`, inside the `model Project` block, change:

```prisma
  // Beneficios e impacto esperado
  benefits          Json?  // array de chaves selecionadas
  benefitsDetails   String?
  monthlyHoursSaved Float?
```

to:

```prisma
  // Beneficios e impacto esperado
  benefits          Json?  // array de chaves selecionadas
  benefitsDetails   String?
  monthlyHoursSaved Float?

  // Diagnostico de processo - operacional (preenchido pelo cliente, opcional)
  peopleInvolved     Int?    // colaboradores envolvidos na execução manual hoje
  taskDurationHours  Float?  // duração total de cada execução (somando todos os envolvidos), em horas
  processFrequency   String? // "diario" | "duas-vezes-semana" | "tres-vezes-semana" | "semanal" | "mensal" | "anual"
  currentAnnualHours Float?  // calculado: taskDurationHours * multiplicador(processFrequency) - horas gastas HOJE no processo manual
```

- [ ] **Step 2: Add the technical/financial fields**

In the same file, change:

```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  solutionTypes      Json?   // array de chaves: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro
  mainTool           String? // python, rocketbot, automation-anywhere, power-automate, power-apps, outro
  executionStrategy  String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes     String?
```

to:

```prisma
  // Arquitetura tecnica (preenchido pelo arquiteto)
  solutionTypes      Json?   // array de chaves: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro
  mainTool           String? // python, rocketbot, automation-anywhere, power-automate, power-apps, outro
  executionStrategy  String? // agendada, manual, trigger-email, trigger-api, tempo-real
  architectNotes     String?

  // Diagnostico de processo - tecnico/financeiro (preenchido pelo arquiteto, nunca exposto ao cliente)
  complexity               String? // "baixa" | "media" | "alta"
  robotSchedule            String? // texto livre curto, ex.: "Hora fixa, uma vez por dia"
  estimatedAnnualSavingBRL Float?  // saving estimado anual em reais
```

- [ ] **Step 3: Regenerate the Prisma client (no DB needed)**

Run: `pnpm prisma generate`
Expected: `✔ Generated Prisma Client` — no errors.

- [ ] **Step 4: Create the migration**

Create `prisma/migrations/20260701200000_add_process_diagnostic_fields/migration.sql` with exactly this content:

```sql
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "peopleInvolved" INTEGER,
ADD COLUMN "taskDurationHours" DOUBLE PRECISION,
ADD COLUMN "processFrequency" TEXT,
ADD COLUMN "currentAnnualHours" DOUBLE PRECISION,
ADD COLUMN "complexity" TEXT,
ADD COLUMN "robotSchedule" TEXT,
ADD COLUMN "estimatedAnnualSavingBRL" DOUBLE PRECISION;
```

This is a purely additive migration (7 new nullable columns, no existing column touched, no data migration needed).

If you have a reachable `DATABASE_URL` available when this task runs, you may instead run `pnpm prisma migrate dev --name add_process_diagnostic_fields --create-only` and compare the generated file against the one above — they should match. Keep only one migration folder for this change.

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: new errors will appear in `project.router.ts` and other files that will read/write these fields in later tasks — this is expected at this point in the plan. Confirm no unrelated new errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add process diagnostic fields to Project schema"
```

---

### Task 2: Shared constants — periodicidade options and multiplier table

**Files:**
- Modify: `src/shared/constants/project-taxonomy.ts`
- Modify: `src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts`

- [ ] **Step 1: Add `PROCESS_FREQUENCIES`, `PROCESS_FREQUENCY_MULTIPLIERS`, and `COMPLEXITY_LEVELS`**

In `src/shared/constants/project-taxonomy.ts`, change:

```ts
export const URGENCY_LEVELS = [
  { value: "baixa", label: "Baixa — sem pressa definida" },
  { value: "media", label: "Média — próximos 2 a 3 meses" },
  { value: "alta", label: "Alta — próximo mês" },
  { value: "urgente", label: "Urgente — o mais rápido possível" },
];
```

to:

```ts
export const URGENCY_LEVELS = [
  { value: "baixa", label: "Baixa — sem pressa definida" },
  { value: "media", label: "Média — próximos 2 a 3 meses" },
  { value: "alta", label: "Alta — próximo mês" },
  { value: "urgente", label: "Urgente — o mais rápido possível" },
];

export const PROCESS_FREQUENCIES = [
  { value: "diario", label: "Diário" },
  { value: "duas-vezes-semana", label: "Duas vezes por semana" },
  { value: "tres-vezes-semana", label: "Três vezes por semana" },
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

// Ocorrências por ano para cada periodicidade — usado para calcular
// currentAnnualHours = taskDurationHours * PROCESS_FREQUENCY_MULTIPLIERS[processFrequency]
export const PROCESS_FREQUENCY_MULTIPLIERS: Record<string, number> = {
  diario: 260,
  "duas-vezes-semana": 104,
  "tres-vezes-semana": 156,
  semanal: 52,
  mensal: 12,
  anual: 1,
};

export const COMPLEXITY_LEVELS = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
];
```

- [ ] **Step 2: Re-export `PROCESS_FREQUENCIES` from the client-facing utils barrel**

In `src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts`, change:

```ts
export {
  DEFAULT_PLATFORM_VALUE,
  PROJECT_AREAS,
  PROJECT_THEMES_BY_AREA,
  buildClienteProjectTypeLabel,
  PLATFORMS,
  URGENCY_LEVELS,
  TARGET_AUDIENCES,
  FEATURE_SUGGESTION_GROUPS,
} from "@/shared/constants/project-taxonomy";
```

to:

```ts
export {
  DEFAULT_PLATFORM_VALUE,
  PROJECT_AREAS,
  PROJECT_THEMES_BY_AREA,
  buildClienteProjectTypeLabel,
  PLATFORMS,
  URGENCY_LEVELS,
  TARGET_AUDIENCES,
  FEATURE_SUGGESTION_GROUPS,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
} from "@/shared/constants/project-taxonomy";
```

(`COMPLEXITY_LEVELS` is only used by the admin-side architecture tab in Task 8, which imports directly from `@/shared/constants/project-taxonomy` — no need to re-export it here.)

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no new errors from either file.

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants/project-taxonomy.ts "src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts"
git commit -m "feat: add process frequency and complexity constants"
```

---

### Task 3: `project.router.ts` — accept, compute, and return the new fields

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Import the multiplier table and add a compute helper**

Change:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import type { FrontendProjectStatus } from "../mappers";

const projectStatusSchema = z.enum([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
  "cancelled",
]);
```

to:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import type { FrontendProjectStatus } from "../mappers";
import { PROCESS_FREQUENCY_MULTIPLIERS } from "@/shared/constants/project-taxonomy";

const projectStatusSchema = z.enum([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
  "cancelled",
]);

const processFrequencySchema = z.enum([
  "diario",
  "duas-vezes-semana",
  "tres-vezes-semana",
  "semanal",
  "mensal",
  "anual",
]);

const complexitySchema = z.enum(["baixa", "media", "alta"]);

function computeCurrentAnnualHours(
  duration: number | null | undefined,
  frequency: string | null | undefined
): number | null {
  if (duration == null || frequency == null) return null;
  const multiplier = PROCESS_FREQUENCY_MULTIPLIERS[frequency];
  if (!multiplier) return null;
  return duration * multiplier;
}
```

- [ ] **Step 2: Include the new fields in `list`'s mapped return**

Change:

```ts
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

to:

```ts
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
        peopleInvolved: p.peopleInvolved ?? undefined,
        taskDurationHours: p.taskDurationHours ?? undefined,
        processFrequency: p.processFrequency ?? undefined,
        currentAnnualHours: p.currentAnnualHours ?? undefined,
        complexity: p.complexity ?? undefined,
        robotSchedule: p.robotSchedule ?? undefined,
        estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
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

- [ ] **Step 3: Include the new fields in `byId`'s return**

Change:

```ts
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
        architectNotes: project.architectNotes ?? undefined,
```

to:

```ts
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        peopleInvolved: project.peopleInvolved ?? undefined,
        taskDurationHours: project.taskDurationHours ?? undefined,
        processFrequency: project.processFrequency ?? undefined,
        currentAnnualHours: project.currentAnnualHours ?? undefined,
        complexity: project.complexity ?? undefined,
        robotSchedule: project.robotSchedule ?? undefined,
        estimatedAnnualSavingBRL: project.estimatedAnnualSavingBRL ?? undefined,
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
        architectNotes: project.architectNotes ?? undefined,
```

- [ ] **Step 4: Accept the operational fields on `create` and compute `currentAnnualHours`**

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
        companyId: z.string().optional(),
        projectType: z.string(),
        estimatedDeadline: z.date().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        urgency: z.string().optional(),
        features: z.array(z.string()).optional(),
        // Campos novos do formulário de solicitação
        additionalInfo: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        projectNarrative: z.string().optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
      })
    )
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
        estimatedDeadline: z.date().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        urgency: z.string().optional(),
        features: z.array(z.string()).optional(),
        // Campos novos do formulário de solicitação
        additionalInfo: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        projectNarrative: z.string().optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
        // Diagnostico de processo - operacional
        peopleInvolved: z.number().int().min(0).optional(),
        taskDurationHours: z.number().min(0).optional(),
        processFrequency: processFrequencySchema.optional(),
      })
    )
```

Then change the `project.create` data object:

```ts
          benefits: input.benefits ?? undefined,
          benefitsDetails: input.benefitsDetails ?? null,
          monthlyHoursSaved: input.monthlyHoursSaved ?? null,
          ratingErrorReduction: input.ratingErrorReduction ?? null,
          ratingProcessCriticality: input.ratingProcessCriticality ?? null,
          ratingInternalImpact: input.ratingInternalImpact ?? null,
          ratingExternalImpact: input.ratingExternalImpact ?? null,
          ratingCompliance: input.ratingCompliance ?? null,
          features:
```

to:

```ts
          benefits: input.benefits ?? undefined,
          benefitsDetails: input.benefitsDetails ?? null,
          monthlyHoursSaved: input.monthlyHoursSaved ?? null,
          ratingErrorReduction: input.ratingErrorReduction ?? null,
          ratingProcessCriticality: input.ratingProcessCriticality ?? null,
          ratingInternalImpact: input.ratingInternalImpact ?? null,
          ratingExternalImpact: input.ratingExternalImpact ?? null,
          ratingCompliance: input.ratingCompliance ?? null,
          peopleInvolved: input.peopleInvolved ?? null,
          taskDurationHours: input.taskDurationHours ?? null,
          processFrequency: input.processFrequency ?? null,
          currentAnnualHours: computeCurrentAnnualHours(
            input.taskDurationHours,
            input.processFrequency
          ),
          features:
```

- [ ] **Step 5: Accept all six new fields on `update`, recomputing `currentAnnualHours` when needed**

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

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
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
        peopleInvolved: z.number().int().min(0).nullable().optional(),
        taskDurationHours: z.number().min(0).nullable().optional(),
        processFrequency: processFrequencySchema.nullable().optional(),
        complexity: complexitySchema.nullable().optional(),
        robotSchedule: z.string().nullable().optional(),
        estimatedAnnualSavingBRL: z.number().nullable().optional(),
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
      if (rest.complexity !== undefined) data.complexity = rest.complexity;
      if (rest.robotSchedule !== undefined) data.robotSchedule = rest.robotSchedule;
      if (rest.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;

      if (rest.peopleInvolved !== undefined) data.peopleInvolved = rest.peopleInvolved;
      if (rest.taskDurationHours !== undefined || rest.processFrequency !== undefined) {
        const current = await ctx.db.project.findUnique({
          where: { id },
          select: { taskDurationHours: true, processFrequency: true },
        });
        const nextDuration =
          rest.taskDurationHours !== undefined
            ? rest.taskDurationHours
            : current?.taskDurationHours ?? null;
        const nextFrequency =
          rest.processFrequency !== undefined
            ? rest.processFrequency
            : current?.processFrequency ?? null;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
```

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `project.router.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: read and write process diagnostic fields in project router"
```

---

### Task 4: Shared `Project` type

**Files:**
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Add the 7 new fields to the `Project` interface**

Change:

```ts
  benefits?: string[];
  benefitsDetails?: string;
  monthlyHoursSaved?: number;
  ratingErrorReduction?: number;
  ratingProcessCriticality?: number;
  ratingInternalImpact?: number;
  ratingExternalImpact?: number;
  ratingCompliance?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

to:

```ts
  benefits?: string[];
  benefitsDetails?: string;
  monthlyHoursSaved?: number;
  ratingErrorReduction?: number;
  ratingProcessCriticality?: number;
  ratingInternalImpact?: number;
  ratingExternalImpact?: number;
  ratingCompliance?: number;
  // Diagnostico de processo - operacional (cliente)
  peopleInvolved?: number;
  taskDurationHours?: number;
  processFrequency?: string;
  currentAnnualHours?: number;
  // Diagnostico de processo - tecnico/financeiro (admin/arquiteto, nunca exposto ao cliente)
  complexity?: string;
  robotSchedule?: string;
  estimatedAnnualSavingBRL?: number;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file itself.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add process diagnostic fields to shared Project type"
```

---

### Task 5: `projects-context.tsx` — map and pass through the new fields

**Files:**
- Modify: `src/shared/context/projects-context.tsx`

- [ ] **Step 1: Add the new fields to `mapProject`**

Change:

```ts
function mapProject(p: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  clientId: string;
  developerId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  projectType: string;
  estimatedDeadline?: Date | null;
  targetAudience?: string | null;
  expectedUsers?: string | null;
  urgency?: string | null;
  features?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? "",
    status: p.status as ProjectStatus,
    priority: p.priority as Priority,
    clientId: p.clientId,
    developerId: p.developerId ?? undefined,
    companyId: p.companyId ?? undefined,
    companyName: p.companyName ?? undefined,
    projectType: p.projectType,
    estimatedDeadline: p.estimatedDeadline ?? undefined,
    targetAudience: p.targetAudience ?? undefined,
    expectedUsers: p.expectedUsers ?? undefined,
    urgency: p.urgency ?? undefined,
    features: p.features ?? [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

to:

```ts
function mapProject(p: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  clientId: string;
  developerId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  projectType: string;
  estimatedDeadline?: Date | null;
  targetAudience?: string | null;
  expectedUsers?: string | null;
  urgency?: string | null;
  features?: string[] | null;
  peopleInvolved?: number | null;
  taskDurationHours?: number | null;
  processFrequency?: string | null;
  currentAnnualHours?: number | null;
  complexity?: string | null;
  robotSchedule?: string | null;
  estimatedAnnualSavingBRL?: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? "",
    status: p.status as ProjectStatus,
    priority: p.priority as Priority,
    clientId: p.clientId,
    developerId: p.developerId ?? undefined,
    companyId: p.companyId ?? undefined,
    companyName: p.companyName ?? undefined,
    projectType: p.projectType,
    estimatedDeadline: p.estimatedDeadline ?? undefined,
    targetAudience: p.targetAudience ?? undefined,
    expectedUsers: p.expectedUsers ?? undefined,
    urgency: p.urgency ?? undefined,
    features: p.features ?? [],
    peopleInvolved: p.peopleInvolved ?? undefined,
    taskDurationHours: p.taskDurationHours ?? undefined,
    processFrequency: p.processFrequency ?? undefined,
    currentAnnualHours: p.currentAnnualHours ?? undefined,
    complexity: p.complexity ?? undefined,
    robotSchedule: p.robotSchedule ?? undefined,
    estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

- [ ] **Step 2: Pass the three operational fields through `addProject`**

Change:

```ts
        ratingErrorReduction: project.ratingErrorReduction,
        ratingProcessCriticality: project.ratingProcessCriticality,
        ratingInternalImpact: project.ratingInternalImpact,
        ratingExternalImpact: project.ratingExternalImpact,
        ratingCompliance: project.ratingCompliance,
      });
      return created.id as string;
```

to:

```ts
        ratingErrorReduction: project.ratingErrorReduction,
        ratingProcessCriticality: project.ratingProcessCriticality,
        ratingInternalImpact: project.ratingInternalImpact,
        ratingExternalImpact: project.ratingExternalImpact,
        ratingCompliance: project.ratingCompliance,
        peopleInvolved: project.peopleInvolved,
        taskDurationHours: project.taskDurationHours,
        processFrequency: project.processFrequency,
      });
      return created.id as string;
```

`complexity`, `robotSchedule`, and `estimatedAnnualSavingBRL` are intentionally NOT added to `addProject` — they're admin/architect-only fields set later through the "Configuração técnica" tab (Task 8), which calls `trpc.project.update` directly, bypassing this context, the same way `solutionTypes`/`mainTool`/`executionStrategy`/`architectNotes` already do today. `currentAnnualHours` is also not sent — it's computed server-side (Task 3) from the two fields that are sent.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/shared/context/projects-context.tsx
git commit -m "feat: pass process diagnostic fields through projects context"
```

---

### Task 6: `solicitar-projeto.ts` Zod schema — 3 new optional fields

**Files:**
- Modify: `src/shared/schema/solicitar-projeto.ts`

- [ ] **Step 1: Add the fields**

Change:

```ts
    hasExistingSystem: z.string().optional().default(""),
    existingSystemDetails: z.string().optional().default(""),
    benefitsDetails: z.string().optional().default(""),
```

to:

```ts
    hasExistingSystem: z.string().optional().default(""),
    existingSystemDetails: z.string().optional().default(""),
    peopleInvolved: z.string().optional().default(""),
    taskDurationHours: z.string().optional().default(""),
    processFrequency: z.string().optional().default(""),
    benefitsDetails: z.string().optional().default(""),
```

These follow the exact same pattern as `monthlyHoursSaved: z.string().optional().default("")` already in this file — numeric form inputs are collected as strings by `register()` and converted to numbers at submit time (Task 7). No `superRefine` validation is added for these — they stay fully optional with no cross-field requirement.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: new errors will appear in `solicitar/page.tsx` (its `defaultValues` object will be missing these 3 keys, which Task 7 fixes) — this is expected. No unrelated new errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/schema/solicitar-projeto.ts
git commit -m "feat: add process diagnostic fields to solicitar-projeto schema"
```

---

### Task 7: "Solicitar Projeto" — operational fields UI

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Import the new constants**

Change:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
} from "./utils/solicitar.utils";
```

to:

```tsx
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
} from "./utils/solicitar.utils";
```

- [ ] **Step 2: Add the 3 fields to `defaultValues`**

Change:

```tsx
      hasExistingSystem: "",
      existingSystemDetails: "",
      benefitsDetails: "",
```

to:

```tsx
      hasExistingSystem: "",
      existingSystemDetails: "",
      peopleInvolved: "",
      taskDurationHours: "",
      processFrequency: "",
      benefitsDetails: "",
```

- [ ] **Step 3: Watch the two fields needed for the live preview**

Change:

```tsx
  const projectArea = watch("projectArea");
  const projectTheme = watch("projectTheme");
  const targetAudience = watch("targetAudience");
```

to:

```tsx
  const projectArea = watch("projectArea");
  const projectTheme = watch("projectTheme");
  const targetAudience = watch("targetAudience");
  const taskDurationHours = watch("taskDurationHours");
  const processFrequency = watch("processFrequency");

  const previewAnnualHours = useMemo(() => {
    const duration = Number(taskDurationHours);
    const multiplier = PROCESS_FREQUENCY_MULTIPLIERS[processFrequency];
    if (!Number.isFinite(duration) || duration <= 0 || !multiplier) return null;
    return duration * multiplier;
  }, [taskDurationHours, processFrequency]);
```

- [ ] **Step 4: Send the 3 fields at submit time**

Change:

```tsx
      const projectId = await addProject({
        title: data.title,
        description: data.description,
        clientId: user.id,
        companyId: selectedCompanyId,
        status: "backlog",
```

to:

```tsx
      const peopleInvolvedValue = data.peopleInvolved
        ? Number(data.peopleInvolved)
        : undefined;
      const taskDurationHoursValue = data.taskDurationHours
        ? Number(data.taskDurationHours)
        : undefined;

      const projectId = await addProject({
        title: data.title,
        description: data.description,
        clientId: user.id,
        companyId: selectedCompanyId,
        status: "backlog",
```

Then, further down in the same `addProject({...})` call, change:

```tsx
        ratingErrorReduction: data.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: data.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: data.ratingInternalImpact ?? undefined,
        ratingExternalImpact: data.ratingExternalImpact ?? undefined,
        ratingCompliance: data.ratingCompliance ?? undefined,
      });
```

to:

```tsx
        ratingErrorReduction: data.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: data.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: data.ratingInternalImpact ?? undefined,
        ratingExternalImpact: data.ratingExternalImpact ?? undefined,
        ratingCompliance: data.ratingCompliance ?? undefined,
        peopleInvolved:
          peopleInvolvedValue !== undefined && Number.isFinite(peopleInvolvedValue)
            ? peopleInvolvedValue
            : undefined,
        taskDurationHours:
          taskDurationHoursValue !== undefined && Number.isFinite(taskDurationHoursValue)
            ? taskDurationHoursValue
            : undefined,
        processFrequency: data.processFrequency || undefined,
      });
```

- [ ] **Step 5: Add the UI block in the "envolvidos" step**

Change:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="existingSystemDetails">
                    Conte mais sobre o processo atual
                  </Label>
                  <Textarea
                    id="existingSystemDetails"
                    {...register("existingSystemDetails")}
                    placeholder="Como funciona hoje? O que costuma dar errado?"
                    rows={4}
                  />
                </div>
              </div>
            )}

            {currentStep.key === "funcionalidades" && (
```

to:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="existingSystemDetails">
                    Conte mais sobre o processo atual
                  </Label>
                  <Textarea
                    id="existingSystemDetails"
                    {...register("existingSystemDetails")}
                    placeholder="Como funciona hoje? O que costuma dar errado?"
                    rows={4}
                  />
                </div>

                <div className="space-y-2 border-t border-border pt-5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Como esse processo funciona hoje (opcional)
                  </Label>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="peopleInvolved">Colaboradores envolvidos</Label>
                      <Input
                        id="peopleInvolved"
                        type="number"
                        min={0}
                        step="1"
                        {...register("peopleInvolved")}
                        placeholder="Ex.: 2"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="taskDurationHours">
                          Duração total por execução (horas)
                        </Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Some o tempo de todos os envolvidos, não só de uma pessoa.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="taskDurationHours"
                        type="number"
                        min={0}
                        step="any"
                        {...register("taskDurationHours")}
                        placeholder="Ex.: 4"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="processFrequency">Periodicidade do processo</Label>
                    <Controller
                      control={control}
                      name="processFrequency"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="processFrequency">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {PROCESS_FREQUENCIES.map((freq) => (
                              <SelectItem key={freq.value} value={freq.value}>
                                {freq.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  {previewAnnualHours !== null && (
                    <p className="text-xs text-muted-foreground">
                      Tempo gasto hoje: <strong>{previewAnnualHours.toLocaleString("pt-BR")} h/ano</strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {currentStep.key === "funcionalidades" && (
```

- [ ] **Step 6: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: let clients optionally describe how a process runs today"
```

---

### Task 8: "Configuração técnica" — technical/financial fields UI

**Files:**
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Import `COMPLEXITY_LEVELS`**

Change:

```tsx
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "../_constants/architecture";
```

to:

```tsx
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "../_constants/architecture";
import { COMPLEXITY_LEVELS } from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 2: Add local state for the 3 new fields, populated from `project`**

Change:

```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainTool, setMainTool] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
  const [architectNotes, setArchitectNotes] = useState<string>("");

  useEffect(() => {
    if (project) {
      setSolutionTypes(project.solutionTypes ?? []);
      setMainTool(project.mainTool ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
      setArchitectNotes(project.architectNotes ?? "");
    }
  }, [project]);
```

to:

```tsx
  const [solutionTypes, setSolutionTypes] = useState<string[]>([]);
  const [mainTool, setMainTool] = useState<string>("");
  const [executionStrategy, setExecutionStrategy] = useState<string>("");
  const [architectNotes, setArchitectNotes] = useState<string>("");
  const [complexity, setComplexity] = useState<string>("");
  const [robotSchedule, setRobotSchedule] = useState<string>("");
  const [estimatedAnnualSavingBRL, setEstimatedAnnualSavingBRL] = useState<string>("");

  useEffect(() => {
    if (project) {
      setSolutionTypes(project.solutionTypes ?? []);
      setMainTool(project.mainTool ?? "");
      setExecutionStrategy(project.executionStrategy ?? "");
      setArchitectNotes(project.architectNotes ?? "");
      setComplexity(project.complexity ?? "");
      setRobotSchedule(project.robotSchedule ?? "");
      setEstimatedAnnualSavingBRL(
        project.estimatedAnnualSavingBRL != null
          ? String(project.estimatedAnnualSavingBRL)
          : ""
      );
    }
  }, [project]);
```

- [ ] **Step 3: Include the 3 fields in `handleSaveArchitecture`**

Change:

```tsx
  const handleSaveArchitecture = () => {
    updateProject.mutate({
      id: projectId,
      solutionTypes,
      mainTool: mainTool || null,
      executionStrategy: executionStrategy || null,
      architectNotes: architectNotes || null,
    });
  };
```

to:

```tsx
  const handleSaveArchitecture = () => {
    const parsedSaving = parseFloat(estimatedAnnualSavingBRL);
    updateProject.mutate({
      id: projectId,
      solutionTypes,
      mainTool: mainTool || null,
      executionStrategy: executionStrategy || null,
      architectNotes: architectNotes || null,
      complexity: complexity || null,
      robotSchedule: robotSchedule || null,
      estimatedAnnualSavingBRL: Number.isNaN(parsedSaving) ? null : parsedSaving,
    });
  };
```

- [ ] **Step 4: Add the fields to the "Configuração técnica" card**

Change:

```tsx
          <div className="space-y-2">
            <Label>Observações técnicas do arquiteto</Label>
```

to:

```tsx
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Complexidade</Label>
              <Select value={complexity} onValueChange={setComplexity}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_LEVELS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Agendamento do robô</Label>
              <Input
                value={robotSchedule}
                onChange={(e) => setRobotSchedule(e.target.value)}
                placeholder="Ex.: Hora fixa, uma vez por dia"
              />
            </div>

            <div className="space-y-2">
              <Label>Saving estimado anual (R$)</Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={estimatedAnnualSavingBRL}
                onChange={(e) => setEstimatedAnnualSavingBRL(e.target.value)}
                placeholder="Ex.: 12480"
              />
              <p className="text-xs text-muted-foreground">
                Só aparece nesta tela de administração — nunca é exibido ao cliente.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações técnicas do arquiteto</Label>
```

- [ ] **Step 5: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from this file.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: let admins capture complexity, robot schedule, and estimated saving"
```

---

### Task 9: Manual end-to-end verification

Requires a reachable `DATABASE_URL` with the Task 1 migration applied (either directly, or via a deploy since this repo runs `prisma migrate deploy` automatically on container start).

- [ ] **Step 1: Client fills in the operational fields**

Log in as a client. Go to "Solicitar Projeto", fill the required fields through the "Envolvidos" step, and additionally fill "Colaboradores envolvidos: 2", "Duração total por execução (horas): 4", "Periodicidade do processo: Semanal". Confirm the live preview shows "Tempo gasto hoje: 208 h/ano" (4 × 52). Submit the form.

- [ ] **Step 2: Confirm the calculated value was saved correctly**

As admin, open the new project's Especificação page. Confirm (via the project detail or a direct check) that `currentAnnualHours` was stored as `208`, matching the preview shown to the client.

- [ ] **Step 3: Client leaves the fields blank**

Submit a second project from the same client, leaving "Colaboradores envolvidos", "Duração" and "Periodicidade" blank. Confirm submission succeeds normally (nothing blocks it) and no preview text appears.

- [ ] **Step 4: Admin fills in the technical/financial fields**

Open either project's Especificação → Configuração técnica tab as admin. Set Complexidade to "Alta", Agendamento do robô to "Hora fixa, uma vez por dia", and Saving estimado anual to "12480". Save. Reload the page and confirm all three values persisted.

- [ ] **Step 5: Confirm the client never sees the saving value**

Log in as the client who owns that project. Confirm there is no screen accessible to them (project detail, Kanban card, etc.) that shows the R$ value — the only place it appears is the admin-only Especificação tab from Step 4.

No commit for this task (verification only). If any step fails, fix the underlying task before considering this plan complete.
