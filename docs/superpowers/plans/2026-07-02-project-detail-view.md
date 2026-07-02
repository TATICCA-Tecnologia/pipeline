# Reforma das telas de detalhes do projeto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Detalhes do projeto" modal and the `/projeto/[id]` page show every field collected by the "Solicitar Projeto" form and the XML import — not just the small subset shown today — while keeping technical/financial diagnostic fields hidden from the `client` role.

**Architecture:** Fix three data-plumbing gaps that silently drop fields between the database and the UI (the `byId` tRPC procedure, the `mapProject` client-side mapper, and `/projeto/[id]`'s data-source priority). Then build one shared component, `ProjectDetailSections`, that renders every field grouped into role-aware sections; both the modal and the page embed this same component instead of hand-rolling their own field lists (which is how the two screens drifted out of sync in the first place).

**Tech Stack:** Next.js 16 (App Router), React 19, tRPC v11, Prisma, Tailwind, shadcn/ui components. No test runner exists in this repo (no jest/vitest) — verification is `npx tsc --noEmit -p tsconfig.json` (must show the same pre-existing 13 unrelated errors, zero new ones) plus `npm run build`, plus a manual QA pass described in the last task.

**Reference spec:** `docs/superpowers/specs/2026-07-02-project-detail-view-design.md`

---

## Task 1: Extend the `Project` type with the technical-diagnostic fields it's missing

**Context:** The `Project` type already has most fields (`additionalInfo`, `hasExistingSystem`, `benefits`, the 5 ratings, etc.) but is missing four fields that the Prisma model and the `byId` tRPC procedure already have: `solutionTypes`, `mainTool`, `executionStrategy`, `architectNotes`. Because of this gap, `/projeto/[id]/page.tsx` currently reads these via `(projectDetails as any)` casts instead of a typed property. This task closes that gap so later tasks can use the real type everywhere.

**Files:**
- Modify: `src/shared/types/index.ts:63-72`

- [ ] **Step 1: Add the four fields to the `Project` interface**

Open `src/shared/types/index.ts`. Find this block (around line 63-72):

```typescript
  // Diagnostico de processo - operacional (cliente)
  peopleInvolved?: number;
  peopleInvolvedDetails?: string;
  taskDurationHours?: number;
  processFrequency?: string;
  currentAnnualHours?: number;
  // Diagnostico de processo - tecnico/financeiro (admin/arquiteto, nunca exposto ao cliente)
  complexity?: string;
  robotSchedule?: string;
  estimatedAnnualSavingBRL?: number;
  createdAt: Date;
  updatedAt: Date;
```

Replace it with:

```typescript
  // Diagnostico de processo - operacional (cliente)
  peopleInvolved?: number;
  peopleInvolvedDetails?: string;
  taskDurationHours?: number;
  processFrequency?: string;
  currentAnnualHours?: number;
  // Diagnostico de processo - tecnico/financeiro (admin/arquiteto, nunca exposto ao cliente)
  complexity?: string;
  robotSchedule?: string;
  estimatedAnnualSavingBRL?: number;
  solutionTypes?: string[];
  mainTool?: string;
  executionStrategy?: string;
  architectNotes?: string;
  createdAt: Date;
  updatedAt: Date;
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (the same pre-existing count as before this change — adding optional fields to an interface never breaks existing consumers).

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add solutionTypes/mainTool/executionStrategy/architectNotes to Project type"
```

---

## Task 2: Make the `byId` tRPC procedure return every field

**Context:** `src/server/trpc/routers/project.router.ts` has two read procedures: `list` (used by the Kanban board) and `byId` (used by `/projeto/[id]`). `list` already returns `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `hasCurrentApplication`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, and the 5 ratings — but `byId` does not, even though the detail page is exactly where all of this should show. This task brings `byId` to parity.

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:117-177` (the `byId` procedure)

- [ ] **Step 1: Add the missing fields to `byId`'s return object**

Open `src/server/trpc/routers/project.router.ts`. Find the `byId` procedure's return statement (starts around line 133):

```typescript
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
        estimatedDeadline: project.deadline ?? undefined,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        peopleInvolved: project.peopleInvolved ?? undefined,
        peopleInvolvedDetails: project.peopleInvolvedDetails ?? undefined,
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
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        tasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
        client: project.client,
        developer: project.developer,
      };
```

Replace it with (adds `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `hasCurrentApplication`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, and the 5 ratings — same field names and same `?? undefined` style already used by `list`, right after `urgency`):

```typescript
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
        estimatedDeadline: project.deadline ?? undefined,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        additionalInfo: project.additionalInfo ?? undefined,
        hasExistingSystem: project.hasExistingSystem ?? undefined,
        existingSystemDetails: project.existingSystemDetails ?? undefined,
        hasCurrentApplication: project.hasCurrentApplication ?? undefined,
        currentApplicationDetails: project.currentApplicationDetails ?? undefined,
        projectNarrative: project.projectNarrative ?? undefined,
        benefits: (project.benefits as string[] | null) ?? undefined,
        benefitsDetails: project.benefitsDetails ?? undefined,
        monthlyHoursSaved: project.monthlyHoursSaved ?? undefined,
        ratingErrorReduction: project.ratingErrorReduction ?? undefined,
        ratingProcessCriticality: project.ratingProcessCriticality ?? undefined,
        ratingInternalImpact: project.ratingInternalImpact ?? undefined,
        ratingExternalImpact: project.ratingExternalImpact ?? undefined,
        ratingCompliance: project.ratingCompliance ?? undefined,
        peopleInvolved: project.peopleInvolved ?? undefined,
        peopleInvolvedDetails: project.peopleInvolvedDetails ?? undefined,
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
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        tasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
        client: project.client,
        developer: project.developer,
      };
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (unchanged — `project.additionalInfo` etc. already exist on the Prisma `Project` model, this is purely additive).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: return all diagnostic fields from project.byId, not just a subset"
```

---

## Task 3: Fix `mapProject` and `addProject` in `projects-context.tsx`

**Context:** `projects-context.tsx` has two separate gaps:
1. `mapProject()` builds the `Project[]` array used by the Kanban board (and passed directly into the "Detalhes do projeto" modal) — but it drops `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `hasCurrentApplication`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, and the 5 ratings, even though the `list` tRPC query (its data source) already returns them. This also silently breaks the project search box in `src/app/(private)/admin/projetos/page.tsx`, which searches `hasExistingSystem`/`hasCurrentApplication` text that's always `undefined` today.
2. `addProject()` (used by both the manual "Solicitar Projeto" form and the XML import, since both call this same function) never sends `hasCurrentApplication` or `currentApplicationDetails` to the `project.create` mutation — so that data is silently discarded before it even reaches the database, regardless of what the user selected.

**Files:**
- Modify: `src/shared/context/projects-context.tsx:39-93` (`mapProject`)
- Modify: `src/shared/context/projects-context.tsx:146-182` (`addProject`)

- [ ] **Step 1: Widen `mapProject`'s parameter type and body**

Open `src/shared/context/projects-context.tsx`. Find the `mapProject` function (lines 39-93):

```typescript
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
  peopleInvolvedDetails?: string | null;
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
    peopleInvolvedDetails: p.peopleInvolvedDetails ?? undefined,
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

Replace it with:

```typescript
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
  additionalInfo?: string | null;
  hasExistingSystem?: string | null;
  existingSystemDetails?: string | null;
  hasCurrentApplication?: string | null;
  currentApplicationDetails?: string | null;
  projectNarrative?: string | null;
  benefits?: string[] | null;
  benefitsDetails?: string | null;
  monthlyHoursSaved?: number | null;
  ratingErrorReduction?: number | null;
  ratingProcessCriticality?: number | null;
  ratingInternalImpact?: number | null;
  ratingExternalImpact?: number | null;
  ratingCompliance?: number | null;
  peopleInvolved?: number | null;
  peopleInvolvedDetails?: string | null;
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
    additionalInfo: p.additionalInfo ?? undefined,
    hasExistingSystem: p.hasExistingSystem ?? undefined,
    existingSystemDetails: p.existingSystemDetails ?? undefined,
    hasCurrentApplication: p.hasCurrentApplication ?? undefined,
    currentApplicationDetails: p.currentApplicationDetails ?? undefined,
    projectNarrative: p.projectNarrative ?? undefined,
    benefits: p.benefits ?? undefined,
    benefitsDetails: p.benefitsDetails ?? undefined,
    monthlyHoursSaved: p.monthlyHoursSaved ?? undefined,
    ratingErrorReduction: p.ratingErrorReduction ?? undefined,
    ratingProcessCriticality: p.ratingProcessCriticality ?? undefined,
    ratingInternalImpact: p.ratingInternalImpact ?? undefined,
    ratingExternalImpact: p.ratingExternalImpact ?? undefined,
    ratingCompliance: p.ratingCompliance ?? undefined,
    peopleInvolved: p.peopleInvolved ?? undefined,
    peopleInvolvedDetails: p.peopleInvolvedDetails ?? undefined,
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

- [ ] **Step 2: Add the two missing fields to `addProject`**

In the same file, find `addProject` (lines 146-182):

```typescript
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
        estimatedDeadline: project.estimatedDeadline,
        targetAudience: project.targetAudience,
        expectedUsers: project.expectedUsers,
        urgency: project.urgency,
        features: project.features,
        additionalInfo: project.additionalInfo,
        hasExistingSystem: project.hasExistingSystem,
        existingSystemDetails: project.existingSystemDetails,
        projectNarrative: project.projectNarrative,
        benefits: project.benefits,
        benefitsDetails: project.benefitsDetails,
        monthlyHoursSaved: project.monthlyHoursSaved,
        ratingErrorReduction: project.ratingErrorReduction,
        ratingProcessCriticality: project.ratingProcessCriticality,
        ratingInternalImpact: project.ratingInternalImpact,
        ratingExternalImpact: project.ratingExternalImpact,
        ratingCompliance: project.ratingCompliance,
        peopleInvolved: project.peopleInvolved,
        peopleInvolvedDetails: project.peopleInvolvedDetails,
        taskDurationHours: project.taskDurationHours,
        processFrequency: project.processFrequency,
      });
      return created.id as string;
    },
    [createProject]
  );
```

Replace it with (adds `hasCurrentApplication` and `currentApplicationDetails` right after `existingSystemDetails`):

```typescript
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
        estimatedDeadline: project.estimatedDeadline,
        targetAudience: project.targetAudience,
        expectedUsers: project.expectedUsers,
        urgency: project.urgency,
        features: project.features,
        additionalInfo: project.additionalInfo,
        hasExistingSystem: project.hasExistingSystem,
        existingSystemDetails: project.existingSystemDetails,
        hasCurrentApplication: project.hasCurrentApplication,
        currentApplicationDetails: project.currentApplicationDetails,
        projectNarrative: project.projectNarrative,
        benefits: project.benefits,
        benefitsDetails: project.benefitsDetails,
        monthlyHoursSaved: project.monthlyHoursSaved,
        ratingErrorReduction: project.ratingErrorReduction,
        ratingProcessCriticality: project.ratingProcessCriticality,
        ratingInternalImpact: project.ratingInternalImpact,
        ratingExternalImpact: project.ratingExternalImpact,
        ratingCompliance: project.ratingCompliance,
        peopleInvolved: project.peopleInvolved,
        peopleInvolvedDetails: project.peopleInvolvedDetails,
        taskDurationHours: project.taskDurationHours,
        processFrequency: project.processFrequency,
      });
      return created.id as string;
    },
    [createProject]
  );
```

**Note:** the `project.create` tRPC procedure's input schema and Prisma `data` mapping already accept `hasCurrentApplication`/`currentApplicationDetails` (added in an earlier commit, `2541d3b`) — confirm this with `grep -n "hasCurrentApplication" src/server/trpc/routers/project.router.ts` before starting; you should see 4 matches (one in `list`'s return, one in `create`'s input schema, one in `create`'s Prisma `data`, one — after Task 2 — in `byId`'s return). If for some reason `create`'s input schema or `data` mapping is missing it, add it there mirroring the existing `hasExistingSystem`/`existingSystemDetails` lines — but as of this plan being written, no change is needed in `project.router.ts` for this task.

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/shared/context/projects-context.tsx
git commit -m "fix: stop dropping hasCurrentApplication and other fields on the way to the board"
```

---

## Task 4: Add a `resolveLabel` helper to `project-taxonomy.ts`

**Context:** Several fields store either a known option key (e.g. `"sim-substituir"`, `"diario"`) or, when the user picked "Outro", the free-text value itself. `resolveLabel` looks up the pretty label for known keys and falls back to showing the raw value for free text — one small pure function, reused by the new detail-sections component for every enum-ish field.

**Files:**
- Modify: `src/shared/constants/project-taxonomy.ts` (append at end of file)

- [ ] **Step 1: Add the function**

Open `src/shared/constants/project-taxonomy.ts`. Add this at the very end of the file:

```typescript
export function resolveLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[]
): string | undefined {
  if (!value) return undefined;
  return options.find((o) => o.value === value)?.label ?? value;
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (unchanged — new exported function, no existing code touched).

- [ ] **Step 3: Commit**

```bash
git add src/shared/constants/project-taxonomy.ts
git commit -m "feat: add resolveLabel helper for displaying option-key fields"
```

---

## Task 5: Create the shared `ProjectDetailSections` component

**Context:** This is the component both the modal and the page will embed. It takes a `Project` and the viewer's role, and renders every field grouped into the 7 sections from the spec, each as its own `Card`. A field with no value still renders, showing "Não informado" (confirmed requirement — do not hide empty fields). The "Diagnóstico técnico" section only renders for `admin`, `developer`, or `super_admin` — never for `client`.

**Files:**
- Create: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Write the component**

Create `src/shared/components/project-detail-sections.tsx`:

```tsx
"use client";

import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { formatDate, formatCurrency } from "@/shared/utils";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  BENEFIT_OPTIONS,
  COMPLEXITY_LEVELS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  MAIN_TOOLS,
  EXECUTION_STRATEGIES,
} from "@/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

type FieldValue = string | number | string[] | null | undefined;

function FieldValueDisplay({ value }: { value: FieldValue }) {
  if (value === null || value === undefined || value === "") {
    return <p className="text-sm italic text-muted-foreground">Não informado</p>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm italic text-muted-foreground">Não informado</p>;
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm">
        {value.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p className="whitespace-pre-wrap text-sm font-medium">{value}</p>;
}

function FieldRow({ label, value }: { label: string; value: FieldValue }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <FieldValueDisplay value={value} />
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function formatRating(value: number | null | undefined): string | undefined {
  return value != null ? `${value}/5` : undefined;
}

export function ProjectDetailSections({
  project,
  viewerRole,
}: {
  project: Project;
  viewerRole: UserRole | undefined;
}) {
  const statusConfig = STATUS_CONFIG[project.status];
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (key) => SOLUTION_TYPES.find((s) => s.value === key)?.label ?? key
  );

  return (
    <div className="space-y-6">
      <DetailSection title="Básico">
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Título" value={project.title} />
        <FieldRow label="Descrição" value={project.description} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={project.companyName} />
        <FieldRow label="Cliente (ID)" value={project.clientId} />
        <FieldRow label="Desenvolvedor (ID)" value={project.developerId} />
        <FieldRow label="Criado em" value={formatDate(project.createdAt)} />
        <FieldRow label="Última atualização" value={formatDate(project.updatedAt)} />
      </DetailSection>

      <DetailSection title="Envolvidos & contexto atual">
        <FieldRow label="Público-alvo" value={project.targetAudience} />
        <FieldRow label="Usuários esperados" value={project.expectedUsers} />
        <FieldRow
          label="Processo/sistema existente"
          value={resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS)}
        />
        <FieldRow label="Detalhes do processo atual" value={project.existingSystemDetails} />
        <FieldRow
          label="Aplicação existente hoje"
          value={resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)}
        />
        <FieldRow
          label="Detalhes da aplicação existente"
          value={project.currentApplicationDetails}
        />
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
        <FieldRow label="Colaboradores envolvidos" value={project.peopleInvolved} />
        <FieldRow label="Detalhes dos colaboradores" value={project.peopleInvolvedDetails} />
        <FieldRow label="Duração por execução (horas)" value={project.taskDurationHours} />
        <FieldRow
          label="Periodicidade"
          value={resolveLabel(project.processFrequency, PROCESS_FREQUENCIES)}
        />
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <DetailSection title="Funcionalidades & benefícios">
        <FieldRow label="Funcionalidades" value={project.features} />
        <FieldRow label="Benefícios esperados" value={benefitLabels} />
        <FieldRow label="Detalhes dos benefícios" value={project.benefitsDetails} />
        <FieldRow label="Horas economizadas por mês" value={project.monthlyHoursSaved} />
      </DetailSection>

      <DetailSection title="Avaliações">
        <FieldRow label="Redução de erros" value={formatRating(project.ratingErrorReduction)} />
        <FieldRow
          label="Criticidade do processo"
          value={formatRating(project.ratingProcessCriticality)}
        />
        <FieldRow label="Impacto interno" value={formatRating(project.ratingInternalImpact)} />
        <FieldRow label="Impacto externo" value={formatRating(project.ratingExternalImpact)} />
        <FieldRow
          label="Atendimento a políticas"
          value={formatRating(project.ratingCompliance)}
        />
      </DetailSection>

      <DetailSection title="Narrativa & prazo">
        <FieldRow label="Narrativa do processo" value={project.projectNarrative} />
        <FieldRow label="Urgência" value={resolveLabel(project.urgency, URGENCY_LEVELS)} />
        <FieldRow
          label="Prazo limite"
          value={project.estimatedDeadline ? formatDate(project.estimatedDeadline) : undefined}
        />
        <FieldRow label="Informações adicionais" value={project.additionalInfo} />
      </DetailSection>

      {canSeeTechnical && (
        <DetailSection title="Diagnóstico técnico">
          <FieldRow
            label="Complexidade"
            value={resolveLabel(project.complexity, COMPLEXITY_LEVELS)}
          />
          <FieldRow label="Ferramenta principal" value={resolveLabel(project.mainTool, MAIN_TOOLS)} />
          <FieldRow
            label="Estratégia de execução"
            value={resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES)}
          />
          <FieldRow label="Notas do arquiteto" value={project.architectNotes} />
          <FieldRow label="Tipos de solução" value={solutionTypeLabels} />
          <FieldRow
            label="Economia anual estimada"
            value={
              project.estimatedAnnualSavingBRL != null
                ? formatCurrency(project.estimatedAnnualSavingBRL)
                : undefined
            }
          />
        </DetailSection>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task5.txt | wc -l`
Expected: `13`. Then run `grep project-detail-sections /tmp/tsc-task5.txt` — expected: no output (no errors in the new file). `formatDate` and `formatCurrency` are both confirmed exports of `src/shared/utils/index.ts:8` and `:26`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx
git commit -m "feat: add ProjectDetailSections shared component"
```

---

## Task 6: Rewrite the "Detalhes do projeto" modal to fetch full data and use the new component

**Context:** The modal currently receives whatever `Project` object the caller already has in memory (from the board's `list`-derived array) and hand-rolls a dozen label/value rows. It's swapped for: (1) a live `project.byId` fetch so the modal always shows the freshest, most complete data regardless of what the caller had cached, and (2) `ProjectDetailSections` for the content. The modal also grows from `md` to `full` size with internal scrolling, since it can now contain ~30 fields.

**Files:**
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx` (full rewrite)
- Modify: `src/app/(private)/admin/projetos/page.tsx` (bump modal `size`)
- Modify: `src/app/(private)/cliente/page.tsx` (bump modal `size`)

- [ ] **Step 1: Rewrite the modal component**

Replace the entire contents of `src/app/(private)/admin/projetos/_components/project-details.modal.tsx` with:

```tsx
"use client";

import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2 } from "lucide-react";

interface ProjectDetailsModalData {
  project: Project;
}

export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  const { user } = useAuth();
  const { data: fullProject, isLoading } = trpc.project.byId.useQuery(
    { id: data?.project.id ?? "" },
    { enabled: !!data?.project.id }
  );

  if (!data) return null;

  const { project: cachedProject } = data;
  const project = (fullProject as Project | undefined) ?? cachedProject;

  return (
    <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-[8px] bg-white">
      <div className="flex items-center justify-between bg-primary px-5 py-5">
        <p className="text-sm font-bold text-white">Detalhes do projeto</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <h2 className="mb-1 text-lg font-bold text-[#0F172A]">{project.title}</h2>
        <p className="mb-5 text-sm text-[#6B7280]">
          {isLoading && !fullProject
            ? "Carregando detalhes completos..."
            : "Todos os dados coletados na solicitação ou na importação de XML."}
        </p>

        {isLoading && !fullProject ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ProjectDetailSections project={project} viewerRole={user?.role} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-4">
        <Button variant="outline" className="cursor-pointer" type="button" onClick={onClose}>
          Fechar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button variant="default" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Note what changed from the original: the "Status", "Prioridade", "Empresa", "Criado em", "ID do projeto", "Cliente (ID)", "Desenvolvedor (ID)", "Última atualização" rows and the icon/avatar header are no longer hand-written here — they're all inside `ProjectDetailSections`'s "Básico" section now. The "Orçamento" row was dropped entirely: neither `list` nor `byId` has ever populated `estimatedBudget` (grep confirms no procedure selects it), so that row always rendered nothing — it wasn't a working feature to preserve.

- [ ] **Step 2: Bump the modal size in `admin/projetos/page.tsx`**

Open `src/app/(private)/admin/projetos/page.tsx`, find `handleProjectClick`:

```typescript
  const handleProjectClick = (project: Project) => {
    openModal(
      `project-details-${project.id}`,
      ProjectDetailsModal,
      { project },
      {
        size: "md",
        position: "center",
      }
    );
  };
```

Change `size: "md"` to `size: "full"`:

```typescript
  const handleProjectClick = (project: Project) => {
    openModal(
      `project-details-${project.id}`,
      ProjectDetailsModal,
      { project },
      {
        size: "full",
        position: "center",
      }
    );
  };
```

- [ ] **Step 3: Bump the modal size in `cliente/page.tsx`**

Open `src/app/(private)/cliente/page.tsx`, find:

```typescript
  const handleProjectClick = (project: Project) => {
    openModal(
      `project-details-${project.id}`,
      ProjectDetailsModal,
      { project },
      {
        size: "md",
        position: "center",
      }
    );
  };
```

Change `size: "md"` to `size: "full"`:

```typescript
  const handleProjectClick = (project: Project) => {
    openModal(
      `project-details-${project.id}`,
      ProjectDetailsModal,
      { project },
      {
        size: "full",
        position: "center",
      }
    );
  };
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task6.txt | wc -l`
Expected: `13`. Then run `grep -E "project-details.modal|admin/projetos/page|cliente/page" /tmp/tsc-task6.txt` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(private\)/admin/projetos/_components/project-details.modal.tsx src/app/\(private\)/admin/projetos/page.tsx src/app/\(private\)/cliente/page.tsx
git commit -m "feat: modal fetches full project data and shows all fields via ProjectDetailSections"
```

---

## Task 7: Rewrite `/projeto/[id]/page.tsx` to prefer full data and use the shared component

**Context:** Two changes here. First, `project = projects.find(...) ?? projectDetails` currently prefers the board's incomplete cached object over the fully-fetched `projectDetails` whenever the project also happens to be in the board list (which is nearly always) — flip that priority. Second, replace the hand-written "Informações" card body with `ProjectDetailSections`, and split the feature checklist (which is interactive — checkboxes, an "Adicionar" button — not just a display field) into its own "Funcionalidades" card so it isn't lost in the swap.

**Files:**
- Modify: `src/app/(private)/projeto/[id]/page.tsx`

- [ ] **Step 1: Add the `Project` type import and `ProjectDetailSections` import**

Open `src/app/(private)/projeto/[id]/page.tsx`. Find the import block (lines 1-45) and add two imports. Change:

```typescript
import { useProjects } from "@/shared/context/projects-context";
import { useAuth } from "@/shared/context/auth-context";
```

to:

```typescript
import { useProjects } from "@/shared/context/projects-context";
import { useAuth } from "@/shared/context/auth-context";
import type { Project } from "@/shared/types";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
```

- [ ] **Step 2: Remove now-unused icon imports**

In the same import block, find:

```typescript
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Building,
  Clock,
  FileText,
  Target,
  Users,
  AlertTriangle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  LayoutList,
} from "lucide-react";
```

Replace with (drops `Calendar`, `DollarSign`, `Target`, `Users`, `AlertTriangle` — only used inside the block being removed in Step 4; `Building`, `Clock`, `FileText`, `User` and the rest stay, they're used elsewhere in the file):

```typescript
import {
  ArrowLeft,
  User,
  Building,
  Clock,
  FileText,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  LayoutList,
} from "lucide-react";
```

Also remove the now-unused `Separator` import (only used inside the block being removed in Step 4). Find:

```typescript
import { Separator } from "@/src/shared/components/ui/separator";
```

Delete that line entirely.

- [ ] **Step 3: Fix the data-source priority and type the `project` variable**

Find (around line 76):

```typescript
  const project = projects.find((p) => p.id === id) ?? (projectDetails as any);
```

Replace with:

```typescript
  const project: Project | undefined =
    (projectDetails as Project | undefined) ?? projects.find((p) => p.id === id);
```

- [ ] **Step 4: Replace the "Informações" card with `ProjectDetailSections` and a separate "Funcionalidades" card**

Find the entire block from the page header through the end of the "Informações" `<Card>` (approximately lines 118-328 — starts at `return (` and ends right before the `{/* Fases de Especificação */}` comment). This is the exact current text to replace:

```tsx
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backUrl}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
          <p className="text-muted-foreground">Detalhes do projeto</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informações do Projeto */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações
                </span>
                <div className="flex gap-2">
                  <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                  <Badge variant="outline" className={priorityConfig.color}>
                    {priorityConfig.label}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Descrição</h4>
                <p className="text-foreground">{project.description}</p>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Tipo</p>
                    <p className="text-sm font-medium">{project.projectType}</p>
                  </div>
                </div>
                {project.estimatedDeadline && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Prazo Estimado</p>
                      <p className="text-sm font-medium">
                        {new Date(project.estimatedDeadline).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                )}
                {project.estimatedBudget && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Orçamento</p>
                      <p className="text-sm font-medium">
                        R$ {project.estimatedBudget.toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Criado em</p>
                    <p className="text-sm font-medium">
                      {new Date(project.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Público, usuários e urgência */}
              {(project.targetAudience || project.expectedUsers || project.urgency) && (
                <>
                  <Separator />
                  <div className="grid gap-4 sm:grid-cols-3">
                    {project.targetAudience && (
                      <div className="flex items-start gap-2">
                        <Target className="h-4 w-4 text-muted-foreground mt-1" />
                        <div>
                          <p className="text-xs text-muted-foreground">Público-alvo</p>
                          <p className="text-sm font-medium">{project.targetAudience}</p>
                        </div>
                      </div>
                    )}
                    {project.expectedUsers && (
                      <div className="flex items-start gap-2">
                        <Users className="h-4 w-4 text-muted-foreground mt-1" />
                        <div>
                          <p className="text-xs text-muted-foreground">Usuários esperados</p>
                          <p className="text-sm font-medium">{project.expectedUsers}</p>
                        </div>
                      </div>
                    )}
                    {project.urgency && (
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground mt-1" />
                        <div>
                          <p className="text-xs text-muted-foreground">Urgência</p>
                          <p className="text-sm font-medium capitalize">{project.urgency}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Funcionalidades / Features */}
              {Array.isArray((projectDetails as any)?.features) &&
                (projectDetails as any).features.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Funcionalidades principais
                        </h4>
                        {user?.role === "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openModal(
                                `project-add-feature-${project.id}`,
                                ProjectAddFeatureModal,
                                { projectId: project.id },
                                { size: "md", position: "center" }
                              )
                            }
                          >
                            Adicionar
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(projectDetails as any).features.map(
                          (feature: {
                            id: string;
                            name: string;
                            completedAt?: string | Date;
                          }) => (
                            <div
                              key={feature.id}
                              className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1"
                            >
                              <span className="text-xs font-medium">
                                {feature.name}
                              </span>
                              {(user?.role === "admin" ||
                                user?.role === "developer") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setSelectedFeature(feature);
                                    openModal(
                                      `project-feature-status-${feature.id}`,
                                      ProjectFeatureStatusModal,
                                      {
                                        projectId: project.id,
                                        featureId: feature.id,
                                        featureName: feature.name,
                                        completedAt: feature.completedAt,
                                      },
                                      { size: "sm", position: "center" }
                                    );
                                  }}
                                >
                                  {feature.completedAt ? (
                                    <CheckSquare className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Square className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </Button>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                )}

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Progresso</span>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                {totalFeatures > 0 && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {completedFeatures} de {totalFeatures} funcionalidades concluídas
                  </p>
                )}
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Fases de Especificação */}
```

Replace it with:

```tsx
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backUrl}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
            <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
            <Badge variant="outline" className={priorityConfig.color}>
              {priorityConfig.label}
            </Badge>
          </div>
          <p className="text-muted-foreground">Detalhes do projeto</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          <ProjectDetailSections project={project} viewerRole={user?.role} />

          {/* Funcionalidades */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Funcionalidades
                </span>
                {user?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openModal(
                        `project-add-feature-${project.id}`,
                        ProjectAddFeatureModal,
                        { projectId: project.id },
                        { size: "md", position: "center" }
                      )
                    }
                  >
                    Adicionar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.isArray((projectDetails as any)?.features) &&
              (projectDetails as any).features.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(projectDetails as any).features.map(
                    (feature: {
                      id: string;
                      name: string;
                      completedAt?: string | Date;
                    }) => (
                      <div
                        key={feature.id}
                        className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1"
                      >
                        <span className="text-xs font-medium">{feature.name}</span>
                        {(user?.role === "admin" || user?.role === "developer") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setSelectedFeature(feature);
                              openModal(
                                `project-feature-status-${feature.id}`,
                                ProjectFeatureStatusModal,
                                {
                                  projectId: project.id,
                                  featureId: feature.id,
                                  featureName: feature.name,
                                  completedAt: feature.completedAt,
                                },
                                { size: "sm", position: "center" }
                              );
                            }}
                          >
                            {feature.completedAt ? (
                              <CheckSquare className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Square className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma funcionalidade cadastrada ainda.
                </p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">Progresso</span>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
                {totalFeatures > 0 && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    {completedFeatures} de {totalFeatures} funcionalidades concluídas
                  </p>
                )}
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Fases de Especificação */}
```

- [ ] **Step 5: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task7.txt | wc -l`
Expected: `13`. Then run `grep "projeto/\[id\]/page" /tmp/tsc-task7.txt` — expected: no output.

If TypeScript complains that `project` is possibly `undefined` in JSX below the `if (!project) { return (...) }` guard (around line 78-91), that guard already exists earlier in the file and narrows the type for everything after it — no change needed there. If it still complains, check that the guard block wasn't accidentally removed by the edit in Step 4 (it shouldn't have been touched — it's before the `return (` we replaced).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/projeto/[id]/page.tsx"
git commit -m "feat: page shows all project fields via ProjectDetailSections, split Funcionalidades into its own card"
```

---

## Task 8: Full verification pass

**Context:** This repo has no automated test suite (confirmed: no jest/vitest config, no `*.test.ts` files, no `"test"` script in `package.json`). Verification is TypeScript + production build + a manual click-through, matching how every other change in this project has been verified this session.

**Files:** None (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-final.txt`
Expected: exactly the same 13 pre-existing errors as before this plan started (in `admin/clientes/page.tsx`, `ui/chart.tsx` x3, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx` x4). Confirm with:

```bash
wc -l < /tmp/tsc-final.txt
```

Expected: `13`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully` and the route table printed with no errors, matching the same route list seen before this plan (`/admin/projetos`, `/cliente`, `/projeto/[id]`, etc.).

- [ ] **Step 3: Discard build artifacts**

The build/typecheck steps regenerate `tsconfig.tsbuildinfo` and `next-env.d.ts` as a side effect — these are generated files, not part of this change:

```bash
git checkout -- tsconfig.tsbuildinfo next-env.d.ts
git status --short
```

Expected: clean (only files from this plan's commits should show, nothing untracked from the build).

- [ ] **Step 4: Manual QA checklist**

Start the dev server (`npm run dev`) and, in a browser, log in as each role and check:

1. **As a client:** open "Meus Projetos", click a project card → modal opens at full width, shows sections "Básico" through "Narrativa & prazo" — **no "Diagnóstico técnico" section**. Every field either shows real data or "Não informado". Click "Ver detalhes" → the `/projeto/[id]` page shows the identical set of fields (same sections, same values). Confirm the feature checklist (if any features exist) and progress bar still render in their own "Funcionalidades" card.
2. **As an admin:** open a project from `/admin/projetos` → modal shows the same sections **plus** "Diagnóstico técnico" (complexity, ferramenta principal, etc., "Não informado" where nothing's been filled in from the architecture tab yet). "Especificação" and "Ver detalhes" buttons both still work.
3. **Create one new project via "Solicitar Projeto"** (manual form, not XML) with `hasCurrentApplication` set to "Sim" and some text in "Detalhes da aplicação existente" — open its detail modal/page afterward and confirm those two values now actually show up (this is the `addProject` fix from Task 3 — before this plan, they were silently dropped).
4. **Import an XML** (reuse a file from earlier in this session, or the template) — open the resulting project's modal and page, confirm sections match what was in the XML, including any fields that fell back to "Outro" with custom text.

- [ ] **Step 5: Report results**

Summarize which of the 4 manual checks passed/failed. If everything passes, this plan is done — no further commit needed for this task (verification-only).
