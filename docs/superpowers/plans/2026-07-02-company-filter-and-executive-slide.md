# Company Filter + Slide Executivo do Projeto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company filter above each Kanban board, and a new "Slide Executivo" view per project — a 16:9 presentation-style summary with a radar chart of the 5 qualitative ratings, reachable from the project details modal and from a Kanban card icon, visible only to admin/developer/super_admin.

**Architecture:** The company filter is a small reusable component (`CompanyFilter`) plus a pure helper (`filterProjectsByCompany`) that derives its option list from the already-loaded `projects` array — no new backend query. The Slide Executivo is a standalone, presentational component (`ProjectExecutiveSlide`) that only takes a `Project` as input (no data-fetching, no modal dependency) so it can be reused later in a multi-project combined report; it's hosted for now inside a "full" modal (`ProjectExecutiveSlideModal`) that fetches complete project data via `trpc.project.byId`, mirroring the existing `ProjectDetailsModal` pattern. The radar chart is hand-drawn inline SVG (not `recharts`) — `recharts`'s existing `Chart` wrapper in this codebase is broken (`RechartsPrimitive.Responsive` doesn't exist, a pre-existing/unrelated TS error), and the approved design needs precise per-vertex coloring (real vs. defaulted rating) and custom short axis labels that don't map cleanly onto `recharts`'s API — plain SVG matches the approved mockup exactly and prints cleanly.

**Tech Stack:** Next.js 16 (App Router), React 19, tRPC v11, Tailwind v4, shadcn/ui `Select`. No test runner exists in this repo (no jest/vitest) — verification is `npx tsc --noEmit -p tsconfig.json` (must show the same pre-existing 13 unrelated errors, zero new) plus `npm run build`, plus a manual QA pass described in the last task.

**Reference spec:** `docs/superpowers/specs/2026-07-02-slide-executivo-design.md` (the company filter was not separately brainstormed — user asked for it directly as a simple addition alongside this plan).

---

## Part A: Company filter above the Kanban boards

### Task 1: Create the `CompanyFilter` component and `filterProjectsByCompany` helper

**Context:** None of the three pages that render `<KanbanBoard>` (`admin/projetos`, `cliente`, `desenvolvedor`) have any filter UI today — they just pass their already-scoped `projects` array straight through. This task adds one small, reusable dropdown that derives its own option list from whatever `projects` array it's given (no new tRPC query, no new permission concerns — it only ever shows companies that already appear in projects the current user can already see).

**Files:**
- Create: `src/shared/components/company-filter.tsx`

- [ ] **Step 1: Write the component**

Create `src/shared/components/company-filter.tsx`:

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

export const ALL_COMPANIES_VALUE = "all";

interface CompanyFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

export function CompanyFilter({ projects, value, onChange }: CompanyFilterProps) {
  const companies = Array.from(
    new Map(
      projects
        .filter((p): p is Project & { companyId: string; companyName: string } =>
          Boolean(p.companyId && p.companyName)
        )
        .map((p) => [p.companyId, p.companyName] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  if (companies.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todas as empresas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_COMPANIES_VALUE}>Todas as empresas</SelectItem>
        {companies.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByCompany<T extends { companyId?: string }>(
  projects: T[],
  companyFilter: string
): T[] {
  if (companyFilter === ALL_COMPANIES_VALUE) return projects;
  return projects.filter((p) => p.companyId === companyFilter);
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (the pre-existing baseline — this is a new, self-contained file). These 13 errors are pre-existing and unrelated to your change (they're in `admin/clientes/page.tsx`, `ui/chart.tsx`, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx`) — do not try to fix them.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/company-filter.tsx
git commit -m "feat: add CompanyFilter component for Kanban boards"
```

---

### Task 2: Wire the company filter into `admin/projetos/page.tsx`

**Context:** This page shows every project in the system to admins, with a header (title + project count + "Exportar CSV" button) above the Kanban board. The filter dropdown goes in that header, and the filtered project list should also drive the count and the CSV export — not just the board — so the whole view stays consistent.

**Files:**
- Modify: `src/app/(private)/admin/projetos/page.tsx`

- [ ] **Step 1: Add the new imports and filter state**

Find (near the top of the file):

```typescript
"use client";

import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { toast } from "sonner";
import { Button } from "@/src/shared/components/ui/button";
import { Download } from "lucide-react";
import { ProjectDetailsModal } from "./_components/project-details.modal";
```

Replace with:

```typescript
"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { toast } from "sonner";
import { Button } from "@/src/shared/components/ui/button";
import { Download } from "lucide-react";
import { ProjectDetailsModal } from "./_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
```

- [ ] **Step 2: Compute the filtered list and use it everywhere `projects` was used for display**

Find:

```typescript
export default function AdminProjetosPage() {
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    moveProject(projectId, newStatus);
    toast.success("Status do projeto atualizado");
  };

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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os projetos do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {projects.length}{" "}
            {projects.length === 1 ? "projeto" : "projetos"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadProjectsCSV(projects);
              toast.success("CSV exportado com sucesso");
            }}
            disabled={projects.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </header>

      <KanbanBoard
        projects={projects}
        onProjectClick={handleProjectClick}
        onMoveProject={handleMoveProject}
        canDrag={true}
        visibleColumns={ALL_COLUMNS}
      />
    </div>
  );
}
```

Replace with:

```typescript
export default function AdminProjetosPage() {
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const filteredProjects = filterProjectsByCompany(projects, companyFilter);

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    moveProject(projectId, newStatus);
    toast.success("Status do projeto atualizado");
  };

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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os projetos do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompanyFilter
            projects={projects}
            value={companyFilter}
            onChange={setCompanyFilter}
          />
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {filteredProjects.length}{" "}
            {filteredProjects.length === 1 ? "projeto" : "projetos"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadProjectsCSV(filteredProjects);
              toast.success("CSV exportado com sucesso");
            }}
            disabled={filteredProjects.length === 0}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </header>

      <KanbanBoard
        projects={filteredProjects}
        onProjectClick={handleProjectClick}
        onMoveProject={handleMoveProject}
        canDrag={true}
        visibleColumns={ALL_COLUMNS}
      />
    </div>
  );
}
```

Note: `CompanyFilter` is given the full, unfiltered `projects` (not `filteredProjects`) so the dropdown always lists every company, even the one currently selected — passing the filtered list would make the dropdown shrink to one option once a company is selected.

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task2.txt | wc -l`
Expected: `13`. Then run `grep "admin/projetos/page" /tmp/tsc-task2.txt` — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/projetos/page.tsx"
git commit -m "feat: add company filter to admin Kanban board"
```

---

### Task 3: Wire the company filter into `cliente/page.tsx`

**Context:** Same pattern as Task 2. This page shows a client's own projects with a small stats row (Total/Backlog/Em desenvolvimento/Concluídos) above the board. Most individual clients only ever see one company's projects, but some clients are linked to multiple companies, so the filter still has value here.

**Files:**
- Modify: `src/app/(private)/cliente/page.tsx`

- [ ] **Step 1: Add imports, filter state, and use the filtered list for stats + board**

Find the entire file content:

```typescript
"use client";

import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { ProjectDetailsModal } from "../admin/projetos/_components/project-details.modal";

export default function ClienteDashboard() {
  const { projects } = useProjects();
  const { openModal } = useModal();

  const clientProjects = projects;

  const visibleColumns: ProjectStatus[] = ["backlog", "in-progress", "completed"];

  const stats = {
    total: clientProjects.length,
    backlog: clientProjects.filter((p) => p.status === "backlog").length,
    inProgress: clientProjects.filter((p) => p.status === "in-progress").length,
    completed: clientProjects.filter((p) => p.status === "completed").length,
  };

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

  const statItems = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Backlog", value: stats.backlog, color: "text-muted-foreground" },
    {
      label: "Em desenvolvimento",
      value: stats.inProgress,
      color: "text-amber-500",
    },
    { label: "Concluídos", value: stats.completed, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o andamento dos seus projetos
        </p>
      </header>

      <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-border/60 py-4">
        {statItems.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.label}
            </dt>
            <dd className={`text-2xl font-semibold tabular-nums ${s.color}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <KanbanBoard
        projects={clientProjects}
        onProjectClick={handleProjectClick}
        canDrag={false}
        visibleColumns={visibleColumns}
      />
    </div>
  );
}
```

Replace with:

```typescript
"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { ProjectDetailsModal } from "../admin/projetos/_components/project-details.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";

export default function ClienteDashboard() {
  const { projects } = useProjects();
  const { openModal } = useModal();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const clientProjects = filterProjectsByCompany(projects, companyFilter);

  const visibleColumns: ProjectStatus[] = ["backlog", "in-progress", "completed"];

  const stats = {
    total: clientProjects.length,
    backlog: clientProjects.filter((p) => p.status === "backlog").length,
    inProgress: clientProjects.filter((p) => p.status === "in-progress").length,
    completed: clientProjects.filter((p) => p.status === "completed").length,
  };

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

  const statItems = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Backlog", value: stats.backlog, color: "text-muted-foreground" },
    {
      label: "Em desenvolvimento",
      value: stats.inProgress,
      color: "text-amber-500",
    },
    { label: "Concluídos", value: stats.completed, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o andamento dos seus projetos
          </p>
        </div>
        <CompanyFilter
          projects={projects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>

      <dl className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-border/60 py-4">
        {statItems.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.label}
            </dt>
            <dd className={`text-2xl font-semibold tabular-nums ${s.color}`}>
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <KanbanBoard
        projects={clientProjects}
        onProjectClick={handleProjectClick}
        canDrag={false}
        visibleColumns={visibleColumns}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task3.txt | wc -l`
Expected: `13`. Then run `grep "cliente/page" /tmp/tsc-task3.txt` — expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/cliente/page.tsx"
git commit -m "feat: add company filter to client Kanban board"
```

---

### Task 4: Wire the company filter into `desenvolvedor/page.tsx`

**Context:** Same pattern again. This page has its own stats row and an assigned-backlog concept (`assignedBacklog`, `devProjects`) computed from the raw `projects` array — the filter needs to be applied before those derivations so everything downstream (stats, backlog list, board) reflects the selected company.

**Files:**
- Modify: `src/app/(private)/desenvolvedor/page.tsx`

- [ ] **Step 1: Add imports and filter state, apply filter before existing derivations**

Find (near the top of the file):

```typescript
"use client";

import { useState } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import { Separator } from "@/src/shared/components/ui/separator";
import { Calendar, FileText, Clock, AlertTriangle, LayoutList, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
```

Replace with:

```typescript
"use client";

import { useState } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
import type { Project, ProjectStatus } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import { Separator } from "@/src/shared/components/ui/separator";
import { Calendar, FileText, Clock, AlertTriangle, LayoutList, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
```

- [ ] **Step 2: Apply the filter and add the dropdown to the header**

Find:

```typescript
export default function DesenvolvedorDashboard() {
  const { user } = useAuth();
  const { projects, moveProject } = useProjects();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const assignedBacklog = projects.filter(
```

Replace with:

```typescript
export default function DesenvolvedorDashboard() {
  const { user } = useAuth();
  const { projects, moveProject } = useProjects();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const scopedProjects = filterProjectsByCompany(projects, companyFilter);

  const assignedBacklog = scopedProjects.filter(
```

Then find the remaining uses of the bare `projects` array in this component's derivations (stats and `devProjects`) — everything below the line you just changed, up through the `stats` object. Find:

```typescript
  const devProjects = [
    ...assignedBacklog,
    ...projects.filter((p) => p.status !== "backlog"),
  ];

  const stats = {
    assigned: projects.filter((p) => p.developerId === user?.id).length,
    inProgress: projects.filter(
      (p) => p.developerId === user?.id && p.status === "in-progress"
    ).length,
    review: projects.filter(
      (p) => p.developerId === user?.id && p.status === "review"
    ).length,
  };

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    const project = projects.find((p) => p.id === projectId);
```

Replace with:

```typescript
  const devProjects = [
    ...assignedBacklog,
    ...scopedProjects.filter((p) => p.status !== "backlog"),
  ];

  const stats = {
    assigned: scopedProjects.filter((p) => p.developerId === user?.id).length,
    inProgress: scopedProjects.filter(
      (p) => p.developerId === user?.id && p.status === "in-progress"
    ).length,
    review: scopedProjects.filter(
      (p) => p.developerId === user?.id && p.status === "review"
    ).length,
  };

  const handleMoveProject = (projectId: string, newStatus: ProjectStatus) => {
    const project = scopedProjects.find((p) => p.id === projectId);
```

Then find the page header JSX:

```typescript
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie e atualize o status dos projetos
        </p>
      </header>
```

Replace with:

```typescript
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie e atualize o status dos projetos
          </p>
        </div>
        <CompanyFilter
          projects={projects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>
```

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task4.txt | wc -l`
Expected: `13`. Then run `grep "desenvolvedor/page" /tmp/tsc-task4.txt` — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/desenvolvedor/page.tsx"
git commit -m "feat: add company filter to developer Kanban board"
```

---

## Part B: Slide Executivo do Projeto

### Task 5: Add print styles to `globals.css`

**Context:** The Slide Executivo needs a "print just this element, full-bleed, landscape" behavior when the user clicks "Imprimir / Exportar PDF" (which calls `window.print()`). Tailwind's `print:` variant can hide/show individual elements, but isolating one element from an entire modal-portal page (hiding literally everything else, including the modal overlay) needs one global CSS rule. This repo has no existing print styles — this is the first one.

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append the print rules**

Open `src/app/globals.css`. Add this at the very end of the file:

```css

@media print {
  @page {
    size: landscape;
  }
  body * {
    visibility: hidden;
  }
  .executive-slide-print-root,
  .executive-slide-print-root * {
    visibility: visible;
  }
  .executive-slide-print-root {
    position: fixed;
    inset: 0;
    margin: 0;
    box-shadow: none;
    max-width: none;
    aspect-ratio: auto;
  }
}
```

- [ ] **Step 2: Verify with typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | wc -l`
Expected: `13` (CSS changes don't affect TypeScript, this just confirms nothing else broke).

Run: `npm run build`
Expected: `✓ Compiled successfully` — this confirms the CSS is syntactically valid and Tailwind's build step accepts it.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add print stylesheet for Slide Executivo full-bleed export"
```

---

### Task 6: Create the `ProjectExecutiveSlide` component

**Context:** This is the core deliverable — a pure, presentational component that renders one project's data as a 16:9 executive summary slide with a radar chart of the 5 qualitative ratings. It takes only a `project: Project` prop; it does not fetch data, does not know about modals, and does not import anything role-related — the caller (a later task) decides whether to show it at all. This isolation is deliberate: the user wants to eventually combine several of these into one printed report, and an isolated component is what makes that possible without a rewrite. The exact visual layout below was validated with the user through 6 rounds of mockup iteration (see the design spec) — implement it as specified, not from first principles.

**Files:**
- Create: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Write the component**

Create `src/shared/components/project-executive-slide.tsx`:

```tsx
"use client";

import type { Project } from "@/shared/types";
import {
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

type RatingKey =
  | "ratingErrorReduction"
  | "ratingProcessCriticality"
  | "ratingInternalImpact"
  | "ratingExternalImpact"
  | "ratingCompliance";

const RATING_AXES: { key: RatingKey; label: string }[] = [
  { key: "ratingErrorReduction", label: "Redução de erros" },
  { key: "ratingProcessCriticality", label: "Criticidade" },
  { key: "ratingInternalImpact", label: "Impacto interno" },
  { key: "ratingExternalImpact", label: "Impacto externo" },
  { key: "ratingCompliance", label: "Políticas" },
];

const DEFAULT_RATING = 3;
const RADAR_CENTER = { x: 230, y: 150 };
const RADAR_UNIT = 20; // pixels per rating point (1-5 scale => 20-100px radius from center)

function pointAt(radius: number, axisIndex: number): { x: number; y: number } {
  const angle = ((-90 + 72 * axisIndex) * Math.PI) / 180;
  return {
    x: RADAR_CENTER.x + radius * Math.cos(angle),
    y: RADAR_CENTER.y + radius * Math.sin(angle),
  };
}

const CATEGORY_LABEL_POS: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}[] = [
  { x: 230, y: 18, anchor: "middle" },
  { x: 368, y: 109, anchor: "start" },
  { x: 315, y: 271, anchor: "middle" },
  { x: 145, y: 271, anchor: "middle" },
  { x: 92, y: 109, anchor: "end" },
];

function RatingRadarChart({ project }: { project: Project }) {
  const values = RATING_AXES.map((axis) => {
    const raw = project[axis.key];
    return { ...axis, value: raw ?? DEFAULT_RATING, isDefault: raw == null };
  });
  const hasAnyDefault = values.some((v) => v.isDefault);

  const gridRings = [1, 2, 3, 4, 5].map((ring) =>
    RATING_AXES.map((_, i) => {
      const p = pointAt(ring * RADAR_UNIT, i);
      return `${p.x},${p.y}`;
    }).join(" ")
  );

  const dataPolygonPoints = values
    .map((v, i) => {
      const p = pointAt(v.value * RADAR_UNIT, i);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 460 300" className="w-full max-w-[360px]">
        {gridRings.map((points, i) => (
          <polygon key={i} points={points} fill="none" stroke="#e5e5ef" strokeWidth={1} />
        ))}
        {RATING_AXES.map((_, i) => {
          const outer = pointAt(5 * RADAR_UNIT, i);
          return (
            <line
              key={i}
              x1={RADAR_CENTER.x}
              y1={RADAR_CENTER.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#d8d8e5"
            />
          );
        })}
        <polygon
          points={dataPolygonPoints}
          fill="#6366f1"
          fillOpacity={0.32}
          stroke="#4f46e5"
          strokeWidth={2.5}
        />
        {values.map((v, i) => (
          <text
            key={`label-${i}`}
            x={CATEGORY_LABEL_POS[i].x}
            y={CATEGORY_LABEL_POS[i].y}
            fontSize={13}
            fontWeight={600}
            fill="#4b4b5e"
            textAnchor={CATEGORY_LABEL_POS[i].anchor}
          >
            {v.label}
          </text>
        ))}
        {values.map((v, i) => {
          const p = pointAt(v.value * RADAR_UNIT, i);
          const color = v.isDefault ? "#9ca3af" : "#4f46e5";
          return (
            <g key={`badge-${i}`}>
              <circle cx={p.x} cy={p.y} r={14} fill="#ffffff" stroke={color} strokeWidth={2} />
              <text
                x={p.x}
                y={p.y + 5}
                fontSize={14}
                fontWeight={800}
                fill={color}
                textAnchor="middle"
              >
                {v.value}
              </text>
            </g>
          );
        })}
      </svg>
      {hasAnyDefault && (
        <p className="mt-2 text-xs text-muted-foreground">
          Notas em cinza: valor padrão (3), ainda não avaliado.
        </p>
      )}
    </div>
  );
}

function StatCell({
  value,
  label,
  valueClassName,
}: {
  value: string | number | undefined | null;
  label: string;
  valueClassName?: string;
}) {
  if (value === undefined || value === null || value === "") return <div />;
  return (
    <div className="text-center">
      <div className={`text-3xl font-extrabold leading-none ${valueClassName ?? "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export function ProjectExecutiveSlide({ project }: { project: Project }) {
  const areaEntrevistada = project.projectType.split(" · Plataforma")[0];

  const situacaoAtualParts = [
    resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
    resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
    project.targetAudience,
  ].filter((v): v is string => Boolean(v));

  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (v) => SOLUTION_TYPES.find((s) => s.value === v)?.label ?? v
  );
  const construcaoParts = [
    ...solutionTypeLabels,
    resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES),
  ].filter((v): v is string => Boolean(v));

  const benefitLabels = (project.benefits ?? []).map(
    (key) => BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key
  );

  const periodicidadeLabel = resolveLabel(project.processFrequency, PROCESS_FREQUENCIES);

  return (
    <div className="executive-slide-print-root mx-auto aspect-[16/9] max-w-5xl bg-white p-10 text-[#1a1a2e] shadow-sm">
      <div className="mb-6">
        {project.companyName && (
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {project.companyName}
          </div>
        )}
        <h1 className="max-w-[85%] text-3xl font-extrabold leading-tight tracking-tight">
          {project.title}
        </h1>
        {areaEntrevistada && (
          <p className="mt-1.5 text-sm text-muted-foreground">
            Área entrevistada —{" "}
            <span className="font-semibold text-foreground">{areaEntrevistada}</span>
          </p>
        )}
      </div>

      <div className="flex gap-10">
        <div className="flex flex-1 flex-col gap-5">
          {project.description && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O processo hoje
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{project.description}</p>
            </div>
          )}
          {situacaoAtualParts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Situação atual
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {situacaoAtualParts.join(" · ")}
              </p>
            </div>
          )}
          {construcaoParts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Construção
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {construcaoParts.join(" · ")}
              </p>
            </div>
          )}
          {benefitLabels.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Benefícios esperados
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {benefitLabels.join(" · ")}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col">
          <div className="mb-6 grid grid-cols-2 gap-4">
            <StatCell
              value={project.currentAnnualHours != null ? `${project.currentAnnualHours}h` : undefined}
              label="gastas por ano hoje"
            />
            <StatCell value={periodicidadeLabel} label="periodicidade" />
            <StatCell value={project.peopleInvolved} label="colaboradores envolvidos" />
            <StatCell
              value={project.monthlyHoursSaved != null ? `${project.monthlyHoursSaved}h/mês` : undefined}
              label="economia estimada"
              valueClassName="text-emerald-600"
            />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <RatingRadarChart project={project} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task6.txt | wc -l`
Expected: `13`. Then run `grep project-executive-slide /tmp/tsc-task6.txt` — expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/project-executive-slide.tsx
git commit -m "feat: add ProjectExecutiveSlide component with radar chart"
```

---

### Task 7: Create the `ProjectExecutiveSlideModal` wrapper

**Context:** This hosts `ProjectExecutiveSlide` inside the app's existing modal system, following the exact same "fetch full data via `trpc.project.byId`, fall back to whatever the caller already had while loading" pattern already used by `ProjectDetailsModal` (`src/app/(private)/admin/projetos/_components/project-details.modal.tsx`) — including the same `features` shape fix (the `byId` procedure returns `features` as `{id, name, completedAt}[]` objects, but `Project.features` is `string[]`; a bare cast would crash any array-rendering code, exactly as was found and fixed in that file previously).

**Files:**
- Create: `src/app/(private)/admin/projetos/_components/project-executive-slide.modal.tsx`

- [ ] **Step 1: Write the modal**

Create `src/app/(private)/admin/projetos/_components/project-executive-slide.modal.tsx`:

```tsx
"use client";

import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectExecutiveSlide } from "@/shared/components/project-executive-slide";
import { trpc } from "@/shared/trpc/client";
import { Loader2, Printer } from "lucide-react";

interface ProjectExecutiveSlideModalData {
  project: Project;
}

export function ProjectExecutiveSlideModal({
  data,
  onClose,
}: ModalProps<ProjectExecutiveSlideModalData>) {
  const { data: fullProject, isLoading } = trpc.project.byId.useQuery(
    { id: data?.project.id ?? "" },
    { enabled: !!data?.project.id }
  );

  if (!data) return null;

  const { project: cachedProject } = data;
  const project: Project = fullProject
    ? {
        ...(fullProject as unknown as Project),
        features: fullProject.features?.map((f) => f.name) ?? [],
      }
    : cachedProject;

  const stillLoading = isLoading && !fullProject;

  return (
    <div className="flex max-h-[90vh] flex-col overflow-hidden rounded-[8px] bg-white">
      <div className="flex items-center justify-between bg-primary px-5 py-4 print:hidden">
        <p className="text-sm font-bold text-white">Slide Executivo</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            disabled={stillLoading}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Imprimir / Exportar PDF
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
        {stillLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ProjectExecutiveSlide project={project} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task7.txt | wc -l`
Expected: `13`. Then run `grep project-executive-slide.modal /tmp/tsc-task7.txt` — expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/admin/projetos/_components/project-executive-slide.modal.tsx"
git commit -m "feat: add ProjectExecutiveSlideModal wrapper"
```

---

### Task 8: Add the "Slide Executivo" entry point to `ProjectDetailsModal`

**Context:** This is the first of the two required entry points, and it's admin/developer/super_admin-only — a `client`-role user must never see this button. `ProjectDetailsModal` already imports `useAuth` and has `user` available.

**Files:**
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`

- [ ] **Step 1: Add imports**

Find:

```tsx
import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2 } from "lucide-react";
```

Replace with:

```tsx
import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2, Presentation } from "lucide-react";
import { ProjectExecutiveSlideModal } from "./project-executive-slide.modal";
```

- [ ] **Step 2: Add the `useModal` hook call and the button**

Find:

```tsx
export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  const { user } = useAuth();
  const { data: fullProject, isLoading } = trpc.project.byId.useQuery(
    { id: data?.project.id ?? "" },
    { enabled: !!data?.project.id }
  );
```

Replace with:

```tsx
export function ProjectDetailsModal({
  data,
  onClose,
}: ModalProps<ProjectDetailsModalData>) {
  const { user } = useAuth();
  const { openModal } = useModal();
  const { data: fullProject, isLoading } = trpc.project.byId.useQuery(
    { id: data?.project.id ?? "" },
    { enabled: !!data?.project.id }
  );
```

Then find the button row:

```tsx
        <div className="flex gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button variant="default" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
```

Replace with:

```tsx
        <div className="flex gap-2">
          {(user?.role === "admin" ||
            user?.role === "developer" ||
            user?.role === "super_admin") && (
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => {
                onClose();
                openModal(
                  `project-executive-slide-${project.id}`,
                  ProjectExecutiveSlideModal,
                  { project },
                  { size: "full", position: "center" }
                );
              }}
            >
              <Presentation className="mr-1.5 h-4 w-4" />
              Slide Executivo
            </Button>
          )}
          <Button variant="outline" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/admin/projetos/${project.id}/especificacao`}>Especificação</Link>
          </Button>
          <Button variant="default" className="cursor-pointer" onClick={() => onClose()}>
            <Link href={`/projeto/${project.id}`}>Ver detalhes</Link>
          </Button>
        </div>
```

Note: `onClose()` is called before `openModal(...)` so the "Detalhes do projeto" modal fully closes before the Slide Executivo modal opens, rather than stacking two full-size modals on top of each other.

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task8.txt | wc -l`
Expected: `13`. Then run `grep project-details.modal /tmp/tsc-task8.txt` — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/projetos/_components/project-details.modal.tsx"
git commit -m "feat: add Slide Executivo button to project details modal"
```

---

### Task 9: Add the Kanban card icon entry point to `ProjectCard`

**Context:** The second required entry point — a small icon directly on the Kanban card, so admin/developer/super_admin can open the slide without opening the details modal first. `ProjectCard` is used by every Kanban board (admin, client, developer, and the drag overlay) and currently has no awareness of auth or modals — this task adds both, self-contained, so no prop threading is needed through `KanbanBoard`/`KanbanColumn`/the three pages.

**Files:**
- Modify: `src/shared/components/project-card.tsx`

- [ ] **Step 1: Add imports**

Find:

```tsx
"use client";

import { Card, CardContent } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import type { Project } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import { Calendar, ArrowRight } from "lucide-react";
```

Replace with:

```tsx
"use client";

import { Card, CardContent } from "@/src/shared/components/ui/card";
import { Badge } from "@/src/shared/components/ui/badge";
import type { Project } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate } from "@/shared/utils";
import { Calendar, ArrowRight, Presentation } from "lucide-react";
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
import { ProjectExecutiveSlideModal } from "@/src/app/(private)/admin/projetos/_components/project-executive-slide.modal";
```

- [ ] **Step 2: Add the hooks and the icon button**

Find:

```tsx
export function ProjectCard({
  project,
  onClick,
  draggable,
  isDragging = false,
  onDragStart,
}: ProjectCardProps) {
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const statusConfig = STATUS_CONFIG[project.status];

  return (
    <Card
      className={[
        "group relative cursor-pointer overflow-hidden border border-border/60 bg-card shadow-sm gap-0 py-0",
        "transition-all duration-200 ease-out",
        "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 max-w-[300px]",
        isDragging ? "card-dragging" : "",
      ].join(" ")}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {/* Linha de prioridade no topo do card */}
      <div
        className={[
          "absolute top-0 left-3 right-3 h-px rounded-full transition-opacity duration-200",
          PRIORITY_DOT[project.priority] ?? "bg-muted-foreground/30",
          "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      />
```

Replace with:

```tsx
export function ProjectCard({
  project,
  onClick,
  draggable,
  isDragging = false,
  onDragStart,
}: ProjectCardProps) {
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const statusConfig = STATUS_CONFIG[project.status];
  const { user } = useAuth();
  const { openModal } = useModal();
  const canSeeSlide =
    user?.role === "admin" || user?.role === "developer" || user?.role === "super_admin";

  return (
    <Card
      className={[
        "group relative cursor-pointer overflow-hidden border border-border/60 bg-card shadow-sm gap-0 py-0",
        "transition-all duration-200 ease-out",
        "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 max-w-[300px]",
        isDragging ? "card-dragging" : "",
      ].join(" ")}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {/* Linha de prioridade no topo do card */}
      <div
        className={[
          "absolute top-0 left-3 right-3 h-px rounded-full transition-opacity duration-200",
          PRIORITY_DOT[project.priority] ?? "bg-muted-foreground/30",
          "opacity-0 group-hover:opacity-100",
        ].join(" ")}
      />

      {canSeeSlide && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openModal(
              `project-executive-slide-${project.id}`,
              ProjectExecutiveSlideModal,
              { project },
              { size: "full", position: "center" }
            );
          }}
          className="absolute top-1.5 right-1.5 z-10 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:text-primary group-hover:opacity-100"
          title="Slide Executivo"
        >
          <Presentation className="h-3.5 w-3.5" />
        </button>
      )}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task9.txt | wc -l`
Expected: `13`. Then run `grep project-card.tsx /tmp/tsc-task9.txt` — expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-card.tsx
git commit -m "feat: add Slide Executivo icon to Kanban card"
```

---

### Task 10: Add the "Slide Executivo" entry point to the developer's project dialog

**Context:** `desenvolvedor/page.tsx` doesn't use `ProjectDetailsModal` — it has its own inline `Dialog` for project details (with links to "Ver especificação" and "Chat do projeto"). Since this whole page is developer-only, no role check is needed here — add the button unconditionally, next to the two existing links.

**Files:**
- Modify: `src/app/(private)/desenvolvedor/page.tsx`

- [ ] **Step 1: Add imports**

Find (this is the import block as it stands after Task 4):

```typescript
import { Calendar, FileText, Clock, AlertTriangle, LayoutList, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
```

Replace with:

```typescript
import { Calendar, FileText, Clock, AlertTriangle, LayoutList, MessageSquare, Presentation } from "lucide-react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useModal } from "@/shared/context/modal-context";
import { ProjectExecutiveSlideModal } from "../admin/projetos/_components/project-executive-slide.modal";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
```

- [ ] **Step 2: Get `openModal` from `useModal()`**

Find:

```typescript
export default function DesenvolvedorDashboard() {
  const { user } = useAuth();
  const { projects, moveProject } = useProjects();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);
```

Replace with:

```typescript
export default function DesenvolvedorDashboard() {
  const { user } = useAuth();
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);
```

- [ ] **Step 3: Add the button next to the existing navigation links**

Find:

```tsx
                {/* Links de navegação */}
                <div className="space-y-2">
                  <Link
                    href={`/desenvolvedor/projetos/${selectedProject.id}/especificacao`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <LayoutList className="h-4 w-4" />
                      Ver especificação e registrar horas
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                  <Link
                    href={`/projeto/${selectedProject.id}`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat do projeto
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                </div>
```

Replace with:

```tsx
                {/* Links de navegação */}
                <div className="space-y-2">
                  <Link
                    href={`/desenvolvedor/projetos/${selectedProject.id}/especificacao`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <LayoutList className="h-4 w-4" />
                      Ver especificação e registrar horas
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                  <Link
                    href={`/projeto/${selectedProject.id}`}
                    onClick={() => setSelectedProject(null)}
                  >
                    <Button variant="outline" className="w-full gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat do projeto
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      const project = selectedProject;
                      setSelectedProject(null);
                      openModal(
                        `project-executive-slide-${project.id}`,
                        ProjectExecutiveSlideModal,
                        { project },
                        { size: "full", position: "center" }
                      );
                    }}
                  >
                    <Presentation className="h-4 w-4" />
                    Slide Executivo
                  </Button>
                </div>
```

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-task10.txt | wc -l`
Expected: `13`. Then run `grep desenvolvedor/page /tmp/tsc-task10.txt` — expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/desenvolvedor/page.tsx"
git commit -m "feat: add Slide Executivo button to developer project dialog"
```

---

## Task 11: Full verification pass

**Context:** This repo has no automated test suite (confirmed: no jest/vitest config, no `*.test.ts` files, no `"test"` script in `package.json`). Verification is TypeScript + production build + a manual click-through, matching how every prior change in this project has been verified.

**Files:** None (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | tee /tmp/tsc-final.txt`
Expected: exactly the same 13 pre-existing errors as before this plan started (in `admin/clientes/page.tsx`, `ui/chart.tsx` ×3, `ui/input-otp.tsx`, `ui/sidebar.tsx`, `ui/toaster.tsx` ×4). Confirm with:

```bash
wc -l < /tmp/tsc-final.txt
```

Expected: `13`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully` and the route table printed with no errors, matching the same route list seen in prior verification passes (`/admin/projetos`, `/cliente`, `/desenvolvedor`, `/projeto/[id]`, etc.).

- [ ] **Step 3: Discard build artifacts**

```bash
git checkout -- tsconfig.tsbuildinfo next-env.d.ts
git status --short
```

Expected: clean (only files from this plan's commits should show, nothing untracked from the build).

- [ ] **Step 4: Manual QA checklist**

Start the dev server (`npm run dev`) and, in a browser, check:

1. **Company filter, as admin:** open `/admin/projetos`. If there are projects across more than one company, the dropdown lists every company plus "Todas as empresas". Selecting one company narrows the board (and the project count, and the CSV export) to just that company's projects; selecting "Todas as empresas" restores the full list.
2. **Company filter, as client:** open `/cliente`. Same behavior, scoped to the client's own projects.
3. **Company filter, as developer:** open `/desenvolvedor`. Same behavior.
4. **Slide Executivo, as client:** open `/cliente`, click a project card → the "Slide Executivo" icon must NOT appear on the card, and the "Detalhes do projeto" modal must NOT show a "Slide Executivo" button.
5. **Slide Executivo, as admin:** open `/admin/projetos`. Hover a card → a small presentation icon appears top-right; clicking it opens the Slide Executivo modal directly. Separately, click the card itself → the details modal opens, showing a "Slide Executivo" button next to "Especificação"/"Ver detalhes"; clicking it closes the details modal and opens the slide.
6. **Slide content:** confirm the slide shows company name (small, top), title (large), "Área entrevistada" line, the 2×2 stats grid (only for fields that have data), the radar chart with 5 short axis labels and a numeric badge on each vertex, and the left-column text sections (only for fields that have data). If a project has fewer than 5 ratings filled in, confirm the missing ones render as a gray badge with value 3, and the "Notas em cinza..." caption appears below the chart.
7. **Print:** click "Imprimir / Exportar PDF" and confirm the browser's print preview shows only the slide content (no modal header, no browser chrome bleeding through) in landscape orientation.
8. **Slide Executivo, as developer:** open `/desenvolvedor`, click a project card → the inline dialog now has a third button, "Slide Executivo", which opens the same modal.

- [ ] **Step 5: Report results**

Summarize which of the 8 manual checks passed/failed. If everything passes, this plan is done — no further commit needed for this task (verification-only).
