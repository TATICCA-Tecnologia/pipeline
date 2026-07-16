# Modo Demonstração Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global "modo demonstração" toggle (eye icon, top of every private screen) that masks company names, person names, contact fields, and free-text explanatory fields across the app, so the Pipeline platform can be shown to someone outside the company without leaking real client data.

**Architecture:** A single client-side React context (`DemoModeContext`) exposes `isDemoMode` plus mask helper functions (`maskFreeText`, `maskCompanyName`, `maskPersonName`, `maskContact`). Each helper is a pass-through when the mode is off, and returns a deterministic sequential label (or a fixed generic placeholder for free text/contacts) when it's on. No backend/schema changes — real data still reaches the browser normally; only what gets rendered changes. Call sites across the app wrap the relevant field read (e.g. `project.title` → `maskFreeText(project.title)`) with the matching helper.

**Tech Stack:** Next.js App Router, React (client components), TypeScript, tRPC, Tailwind. No test framework exists in this repo (no vitest/jest configured) — verification per task is `npx tsc --noEmit` (type safety) plus a final manual smoke test with the dev server.

**Reference spec:** `docs/superpowers/specs/2026-07-16-modo-demonstracao-design.md`

---

## Before you start

Read `docs/superpowers/specs/2026-07-16-modo-demonstracao-design.md` for the full rationale (why client-side only, why sequential labels, what's explicitly out of scope). This plan implements that spec, with one refinement discovered during planning: instead of separate `<DemoCompanyName>`/`<DemoPersonName>`/`<DemoMaskedText>` JSX components, the context exposes plain functions (`maskFreeText`, `maskCompanyName`, `maskPersonName`, `maskContact`) that return strings. Most render sites in this codebase are simple string interpolations (`{project.title}`, `{company.name}`), so a function call (`{maskFreeText(project.title)}`) is a smaller, more direct edit than wrapping in a new component — same behavior, less code.

Run `npx tsc --noEmit` once before starting to confirm a clean baseline:

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this work — note them so you don't confuse them with something you introduced).

---

## Part A — Foundation

### Task 1: Demo mode context

**Files:**
- Create: `src/shared/context/demo-mode-context.tsx`

- [ ] **Step 1: Write the context file**

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const DEMO_MODE_STORAGE_KEY = "pipeline:demoMode";
const MASKED_TEXT_PLACEHOLDER = "Oculto no modo demonstração";

type SequentialLabelKind = "empresa" | "cliente" | "desenvolvedor";

const SEQUENTIAL_LABEL_PREFIX: Record<SequentialLabelKind, string> = {
  empresa: "Empresa",
  cliente: "Cliente",
  desenvolvedor: "Desenvolvedor",
};

type ContactType = "email" | "phone" | "document" | "address" | "website";

const MASKED_CONTACT: Record<ContactType, string> = {
  email: "contato@empresa.demo",
  phone: "(00) 0000-0000",
  document: "00.000.000/0000-00",
  address: "Endereço oculto",
  website: "empresa.demo.com.br",
};

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  maskFreeText: (value: string | null | undefined) => string | null | undefined;
  maskCompanyName: (
    companyId: string | null | undefined,
    companyName: string | null | undefined
  ) => string | null | undefined;
  maskPersonName: (
    personId: string | null | undefined,
    personName: string | null | undefined,
    role: "cliente" | "desenvolvedor"
  ) => string | null | undefined;
  maskContact: (
    value: string | null | undefined,
    type: ContactType
  ) => string | null | undefined;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(undefined);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);
  // Mapa id-real -> número sequencial, por categoria. Vive só em memória (useRef),
  // reinicia a cada reload de página — aceitável pra uma sessão de demonstração ao vivo.
  const sequentialLabels = useRef<Map<SequentialLabelKind, Map<string, number>>>(
    new Map()
  );

  useEffect(() => {
    const stored = localStorage.getItem(DEMO_MODE_STORAGE_KEY);
    if (stored === "true") setIsDemoMode(true);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((current) => {
      const next = !current;
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const getSequentialLabel = useCallback(
    (kind: SequentialLabelKind, id: string): string => {
      let byId = sequentialLabels.current.get(kind);
      if (!byId) {
        byId = new Map();
        sequentialLabels.current.set(kind, byId);
      }
      let n = byId.get(id);
      if (n === undefined) {
        n = byId.size + 1;
        byId.set(id, n);
      }
      return `${SEQUENTIAL_LABEL_PREFIX[kind]} ${n}`;
    },
    []
  );

  const maskFreeText = useCallback(
    (value: string | null | undefined) => {
      if (!isDemoMode) return value;
      if (value === null || value === undefined || value === "") return value;
      return MASKED_TEXT_PLACEHOLDER;
    },
    [isDemoMode]
  );

  const maskCompanyName = useCallback(
    (companyId: string | null | undefined, companyName: string | null | undefined) => {
      if (!isDemoMode) return companyName;
      if (!companyName) return companyName;
      return getSequentialLabel("empresa", companyId ?? companyName);
    },
    [isDemoMode, getSequentialLabel]
  );

  const maskPersonName = useCallback(
    (
      personId: string | null | undefined,
      personName: string | null | undefined,
      role: "cliente" | "desenvolvedor"
    ) => {
      if (!isDemoMode) return personName;
      if (!personName) return personName;
      return getSequentialLabel(role, personId ?? personName);
    },
    [isDemoMode, getSequentialLabel]
  );

  const maskContact = useCallback(
    (value: string | null | undefined, type: ContactType) => {
      if (!isDemoMode) return value;
      if (!value) return value;
      return MASKED_CONTACT[type];
    },
    [isDemoMode]
  );

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        toggleDemoMode,
        maskFreeText,
        maskCompanyName,
        maskPersonName,
        maskContact,
      }}
    >
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error("useDemoMode deve ser usado dentro de um DemoModeProvider");
  }
  return context;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this file isn't imported anywhere yet, so it can only fail on its own syntax/types).

- [ ] **Step 3: Commit**

```bash
git add src/shared/context/demo-mode-context.tsx
git commit -m "feat: add demo mode context with masking helpers"
```

---

### Task 2: Demo mode toggle bar

**Files:**
- Create: `src/shared/components/demo-mode-bar.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Button } from "@/src/shared/components/ui/button";
import { cn } from "@/shared/utils";
import { Eye, EyeOff } from "lucide-react";

export function DemoModeBar() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm",
        isDemoMode
          ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : "border-border/60 bg-background text-muted-foreground"
      )}
    >
      <span className="font-medium">
        {isDemoMode
          ? "Modo demonstração ativo — dados sensíveis ocultos"
          : "Modo demonstração"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        onClick={toggleDemoMode}
      >
        {isDemoMode ? (
          <>
            <EyeOff className="h-3.5 w-3.5" />
            Desativar
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            Ativar
          </>
        )}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/demo-mode-bar.tsx
git commit -m "feat: add demo mode toggle bar"
```

---

### Task 3: Wire provider and bar into the private layout

**Files:**
- Modify: `src/app/(private)/layout.tsx`

- [ ] **Step 1: Add the imports**

Replace:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { AppSidebar } from "@/shared/components";
import { ImpersonationBanner } from "@/shared/components/impersonation-banner";
import { useRouter } from "next/navigation";
```

With:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { AppSidebar } from "@/shared/components";
import { ImpersonationBanner } from "@/shared/components/impersonation-banner";
import { DemoModeBar } from "@/shared/components/demo-mode-bar";
import { DemoModeProvider } from "@/shared/context/demo-mode-context";
import { useRouter } from "next/navigation";
```

- [ ] **Step 2: Wrap the return with `DemoModeProvider` and render the bar**

Replace:
```tsx
  return (
    <ModalProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <main className="ml-64">
          <ImpersonationBanner />
          <div className="p-6">{children}</div>
        </main>
      </div>
    </ModalProvider>
  );
```

With:
```tsx
  return (
    <DemoModeProvider>
      <ModalProvider>
        <div className="min-h-screen bg-background">
          <AppSidebar />
          <main className="ml-64">
            <DemoModeBar />
            <ImpersonationBanner />
            <div className="p-6">{children}</div>
          </main>
        </div>
      </ModalProvider>
    </DemoModeProvider>
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run `npm run dev`, log in, and confirm the "Modo demonstração" bar appears at the top of every private page, the eye button toggles between "Ativar"/"Desativar" with the amber highlight, and the state survives a page reload (localStorage).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/layout.tsx"
git commit -m "feat: wire demo mode provider and toggle bar into private layout"
```

---

## Part B — Core shared components (highest leverage: used by most screens)

### Task 4: Project card

**Files:**
- Modify: `src/shared/components/project-card.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
```

With:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useModal } from "@/shared/context/modal-context";
```

- [ ] **Step 2: Get the mask helpers**

Replace:
```tsx
  const { user } = useAuth();
  const { openModal } = useModal();
```

With:
```tsx
  const { user } = useAuth();
  const { openModal } = useModal();
  const { maskFreeText, maskCompanyName } = useDemoMode();
```

- [ ] **Step 3: Mask title, description, company name**

Replace:
```tsx
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
            {project.title}
          </p>
          {project.description && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground leading-relaxed">
              {project.description}
            </p>
          )}
```

With:
```tsx
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">
            {maskFreeText(project.title)}
          </p>
          {project.description && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground leading-relaxed">
              {maskFreeText(project.description)}
            </p>
          )}
```

Replace:
```tsx
          {project.companyName && (
            <span
              className="inline-block max-w-full truncate text-[10px] text-muted-foreground"
              title={project.companyName}
            >
              {project.companyName}
            </span>
          )}
```

With:
```tsx
          {project.companyName && (
            <span
              className="inline-block max-w-full truncate text-[10px] text-muted-foreground"
              title={maskCompanyName(project.companyId, project.companyName) ?? undefined}
            >
              {maskCompanyName(project.companyId, project.companyName)}
            </span>
          )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run `npm run dev`, open any Kanban board (admin/cliente/desenvolvedor), activate demo mode, confirm every card shows a masked title/description/company name, and that the same company always shows the same "Empresa N" across different cards.

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/project-card.tsx
git commit -m "feat: mask sensitive project card fields in demo mode"
```

---

### Task 5: Project detail sections

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
```

With:
```tsx
import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";
```

- [ ] **Step 2: Get the mask helpers**

Replace:
```tsx
  const [isEditing, setIsEditing] = useState(false);
```

With:
```tsx
  const [isEditing, setIsEditing] = useState(false);
  const { maskFreeText, maskCompanyName } = useDemoMode();
```

- [ ] **Step 3: Mask the "Básico" section fields**

Replace:
```tsx
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Título" value={project.title} />
        <FieldRow label="Descrição" value={project.description} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={project.companyName} />
```

With:
```tsx
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Título" value={maskFreeText(project.title)} />
        <FieldRow label="Descrição" value={maskFreeText(project.description)} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={maskCompanyName(project.companyId, project.companyName)} />
```

- [ ] **Step 4: Mask "Envolvidos & contexto atual" free-text fields**

Replace:
```tsx
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
```

With:
```tsx
        <FieldRow label="Público-alvo" value={maskFreeText(project.targetAudience)} />
        <FieldRow label="Usuários esperados" value={project.expectedUsers} />
        <FieldRow
          label="Processo/sistema existente"
          value={resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS)}
        />
        <FieldRow label="Detalhes do processo atual" value={maskFreeText(project.existingSystemDetails)} />
        <FieldRow
          label="Aplicação existente hoje"
          value={resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)}
        />
        <FieldRow
          label="Detalhes da aplicação existente"
          value={maskFreeText(project.currentApplicationDetails)}
        />
```

- [ ] **Step 5: Mask "Diagnóstico operacional" free text**

Replace:
```tsx
        <FieldRow label="Colaboradores envolvidos" value={project.peopleInvolved} />
        <FieldRow label="Detalhes dos colaboradores" value={project.peopleInvolvedDetails} />
```

With:
```tsx
        <FieldRow label="Colaboradores envolvidos" value={project.peopleInvolved} />
        <FieldRow label="Detalhes dos colaboradores" value={maskFreeText(project.peopleInvolvedDetails)} />
```

- [ ] **Step 6: Mask "Funcionalidades & benefícios" free text**

Replace:
```tsx
        <FieldRow label="Detalhes dos benefícios" value={project.benefitsDetails} />
```

With:
```tsx
        <FieldRow label="Detalhes dos benefícios" value={maskFreeText(project.benefitsDetails)} />
```

- [ ] **Step 7: Mask "Narrativa & prazo" free text**

Replace:
```tsx
        <FieldRow label="Narrativa do processo" value={project.projectNarrative} />
```

With:
```tsx
        <FieldRow label="Narrativa do processo" value={maskFreeText(project.projectNarrative)} />
```

Replace:
```tsx
        <FieldRow label="Informações adicionais" value={project.additionalInfo} />
```

With:
```tsx
        <FieldRow label="Informações adicionais" value={maskFreeText(project.additionalInfo)} />
```

- [ ] **Step 8: Mask "Diagnóstico técnico" free text**

Replace:
```tsx
          <FieldRow label="Notas do arquiteto" value={project.architectNotes} />
```

With:
```tsx
          <FieldRow label="Notas do arquiteto" value={maskFreeText(project.architectNotes)} />
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Manual check**

Open a project detail (`/projeto/[id]` or the "Detalhes do projeto" modal from the Kanban board) with demo mode on — confirm título, descrição, empresa, and every free-text field listed above show masked values, while ID, status, priority, ratings, and dates stay visible.

- [ ] **Step 11: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx
git commit -m "feat: mask sensitive fields in project detail sections"
```

---

### Task 6: Project executive slide

**Files:**
- Modify: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
```

With:
```tsx
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
import { useDemoMode } from "@/shared/context/demo-mode-context";
```

- [ ] **Step 2: Get the mask helpers and mask the fields read into the labeled-lines builders**

Replace:
```tsx
export function ProjectExecutiveSlide({ project }: { project: Project }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scale = useFitToSlide(contentRef, project.id);

  const areaEntrevistada = project.projectType.split(" · Plataforma")[0];

  const situacaoAtualLines = buildLabeledLinesWithDetail([
    {
      label: "Abordagem",
      value: resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
      detail: project.existingSystemDetails,
    },
    {
      label: "Aplicação existente hoje",
      value: resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
      detail: project.currentApplicationDetails,
    },
    { label: "Público-alvo", value: project.targetAudience },
  ]);
```

With:
```tsx
export function ProjectExecutiveSlide({ project }: { project: Project }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scale = useFitToSlide(contentRef, project.id);
  const { maskFreeText, maskCompanyName } = useDemoMode();

  const areaEntrevistada = project.projectType.split(" · Plataforma")[0];

  const situacaoAtualLines = buildLabeledLinesWithDetail([
    {
      label: "Abordagem",
      value: resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
      detail: maskFreeText(project.existingSystemDetails) ?? undefined,
    },
    {
      label: "Aplicação existente hoje",
      value: resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
      detail: maskFreeText(project.currentApplicationDetails) ?? undefined,
    },
    { label: "Público-alvo", value: maskFreeText(project.targetAudience) ?? undefined },
  ]);
```

- [ ] **Step 3: Mask `robotSchedule`**

Replace:
```tsx
    ...buildLabeledLines([
      { label: "Periodicidade do processo", value: periodicidadeLabel },
      { label: "Rodagem do bot", value: project.robotSchedule },
    ]),
```

With:
```tsx
    ...buildLabeledLines([
      { label: "Periodicidade do processo", value: periodicidadeLabel },
      { label: "Rodagem do bot", value: maskFreeText(project.robotSchedule) ?? undefined },
    ]),
```

- [ ] **Step 4: Mask the company name / title / description header block**

Replace:
```tsx
            {project.companyName && (
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {project.companyName}
              </div>
            )}
            <h1 className="max-w-[85%] text-3xl font-extrabold leading-tight tracking-tight">
              {project.title}
            </h1>
```

With:
```tsx
            {project.companyName && (
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {maskCompanyName(project.companyId, project.companyName)}
              </div>
            )}
            <h1 className="max-w-[85%] text-3xl font-extrabold leading-tight tracking-tight">
              {maskFreeText(project.title)}
            </h1>
```

- [ ] **Step 5: Mask the description paragraph**

Replace:
```tsx
            {project.description && (
              <div>
                <SectionLabel>O processo hoje</SectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {project.description}
                </p>
              </div>
            )}
```

With:
```tsx
            {project.description && (
              <div>
                <SectionLabel>O processo hoje</SectionLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {maskFreeText(project.description)}
                </p>
              </div>
            )}
```

- [ ] **Step 6: Mask `architectNotes`**

Replace:
```tsx
            {project.architectNotes && (
              <div className="rounded-r-md border-l-4 border-teal-500 bg-slate-50 px-4 py-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
                  Principais ações da automação
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {project.architectNotes}
                </p>
              </div>
            )}
```

With:
```tsx
            {project.architectNotes && (
              <div className="rounded-r-md border-l-4 border-teal-500 bg-slate-50 px-4 py-3">
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
                  Principais ações da automação
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">
                  {maskFreeText(project.architectNotes)}
                </p>
              </div>
            )}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual check**

Open "Slide Executivo" for any project (button on a project card or in the details modal) with demo mode on — confirm company name, title, description, "Situação atual" lines (including the detail sub-lines), "Rodagem do bot", and the architect notes callout are all masked. Financial/quantitative numbers (economia estimada, horas, ratings) must stay visible.

- [ ] **Step 9: Commit**

```bash
git add src/shared/components/project-executive-slide.tsx
git commit -m "feat: mask sensitive fields in executive slide"
```

---

### Task 7: Project details modal title

**Files:**
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
```

With:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useModal } from "@/shared/context/modal-context";
```

- [ ] **Step 2: Get the mask helper**

Replace:
```tsx
  const { user } = useAuth();
  const { deleteProject } = useProjects();
```

With:
```tsx
  const { user } = useAuth();
  const { maskFreeText } = useDemoMode();
  const { deleteProject } = useProjects();
```

- [ ] **Step 3: Mask the title**

Replace:
```tsx
        <h2 className="mb-1 text-lg font-bold text-[#0F172A]">{project.title}</h2>
```

With:
```tsx
        <h2 className="mb-1 text-lg font-bold text-[#0F172A]">{maskFreeText(project.title)}</h2>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/projetos/_components/project-details.modal.tsx"
git commit -m "feat: mask project title in details modal"
```

---

### Task 8: Company filter dropdown

**Files:**
- Modify: `src/shared/components/company-filter.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import type { Project } from "@/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
```

With:
```tsx
import type { Project } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
```

- [ ] **Step 2: Mask the company names in the dropdown**

Replace:
```tsx
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
```

With:
```tsx
export function CompanyFilter({ projects, value, onChange }: CompanyFilterProps) {
  const { maskCompanyName } = useDemoMode();
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
            {maskCompanyName(id, name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Note: the `<Select>` still filters by the real `companyId` (`value={id}`) — only the displayed label changes. Filtering behavior is unaffected.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/company-filter.tsx
git commit -m "feat: mask company names in company filter dropdown"
```

---

## Part C — Company & client admin screens

### Task 9: Admin empresas list

**Files:**
- Modify: `src/app/(private)/admin/empresas/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useToast } from "@/src/shared/hooks/use-toast";
import { Bot, Building2, Plus, Search, Pencil, ListOrdered, Users, Download, Wallet } from "lucide-react";
import Link from "next/link";
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { slugifyFilename } from "@/shared/utils";
```

With:
```tsx
import { useToast } from "@/src/shared/hooks/use-toast";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Bot, Building2, Plus, Search, Pencil, ListOrdered, Users, Download, Wallet } from "lucide-react";
import Link from "next/link";
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { slugifyFilename } from "@/shared/utils";
```

- [ ] **Step 2: Get the mask helpers**

Replace:
```tsx
export default function EmpresasPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: companies = [], isLoading } = trpc.company.listAll.useQuery();
```

With:
```tsx
export default function EmpresasPage() {
  const { toast } = useToast();
  const { maskCompanyName, maskContact } = useDemoMode();
  const utils = trpc.useUtils();
  const { data: companies = [], isLoading } = trpc.company.listAll.useQuery();
```

- [ ] **Step 3: Mask the table row**

Replace:
```tsx
                filtered.map((company) => (
                  <TableRow key={company.id} className={!company.isActive ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.document || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.email || company.phone ? (
                        <div className="space-y-0.5">
                          {company.email && <p className="truncate">{company.email}</p>}
                          {company.phone && <p>{company.phone}</p>}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
```

With:
```tsx
                filtered.map((company) => (
                  <TableRow key={company.id} className={!company.isActive ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{maskCompanyName(company.id, company.name)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.document ? maskContact(company.document, "document") : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.email || company.phone ? (
                        <div className="space-y-0.5">
                          {company.email && (
                            <p className="truncate">{maskContact(company.email, "email")}</p>
                          )}
                          {company.phone && <p>{maskContact(company.phone, "phone")}</p>}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Open `/admin/empresas` with demo mode on — confirm every row shows a sequential "Empresa N" name and masked document/email/phone, and that toggling demo mode off restores the real values immediately.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/empresas/page.tsx"
git commit -m "feat: mask company data in admin empresas list"
```

---

### Task 10: Admin clientes list

**Files:**
- Modify: `src/app/(private)/admin/clientes/page.tsx`

Scope note: this task masks the persistent table listing (client name/email, linked company badges). Transient toast messages and the delete/promote/reset-password confirmation dialogs (which quote the client's name) are intentionally left unmasked — they only appear after an admin deliberately performs a destructive/administrative action, which isn't part of a normal "browse the platform" demo. If that turns out to matter in practice, it's a small follow-up (same `maskPersonName` helper, applied to the ~6 additional interpolations).

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useClients, type CreatableRole } from "@/shared/context/clients-context";
import { useProjects } from "@/shared/context/projects-context";
import { trpc } from "@/shared/trpc/client";
```

With:
```tsx
import { useClients, type CreatableRole } from "@/shared/context/clients-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useProjects } from "@/shared/context/projects-context";
import { trpc } from "@/shared/trpc/client";
```

- [ ] **Step 2: Get the mask helpers**

Replace:
```tsx
export default function ClientesPage() {
  const { clients, addClient, updateClient, deleteClient, refetch } = useClients();
  const { projects } = useProjects();
```

With:
```tsx
export default function ClientesPage() {
  const { clients, addClient, updateClient, deleteClient, refetch } = useClients();
  const { projects } = useProjects();
  const { maskPersonName, maskContact, maskCompanyName } = useDemoMode();
```

- [ ] **Step 3: Mask the client row**

Replace:
```tsx
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
             <span className="text-sm font-medium text-primary">
               {client.name.charAt(0).toUpperCase()}
             </span>
           </div>
           <div>
             <p className="font-medium">{client.name}</p>
             <p className="text-sm text-muted-foreground flex items-center gap-1">
               <Mail className="h-3 w-3" />
               {client.email}
             </p>
```

With:
```tsx
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
             <span className="text-sm font-medium text-primary">
               {client.name.charAt(0).toUpperCase()}
             </span>
           </div>
           <div>
             <p className="font-medium">{maskPersonName(client.id, client.name, "cliente")}</p>
             <p className="text-sm text-muted-foreground flex items-center gap-1">
               <Mail className="h-3 w-3" />
               {maskContact(client.email, "email")}
             </p>
```

Note: keep `client.name.charAt(0).toUpperCase()` (the avatar initial) reading the REAL name — a single letter doesn't identify anyone, and deriving it from a masked "Cliente 3" string would show a meaningless "C" for every client. Not worth the extra complexity.

- [ ] **Step 4: Mask the linked company list**

Replace:
```tsx
           <span className="truncate">
             {client.companies.map((c) => c.name).join(", ")}
           </span>
```

With:
```tsx
           <span className="truncate">
             {client.companies.map((c) => maskCompanyName(c.id, c.name)).join(", ")}
           </span>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual check**

Open `/admin/clientes` with demo mode on — confirm every row shows a sequential "Cliente N" name, masked email, and masked company badges.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/clientes/page.tsx"
git commit -m "feat: mask client data in admin clientes list"
```

---

### Task 11: Manage companies dialog

**Files:**
- Modify: `src/app/(private)/admin/clientes/_components/manage-companies-dialog.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { Badge } from "@/src/shared/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { User } from "@/shared/types";
```

With:
```tsx
import { Badge } from "@/src/shared/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { User } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";
```

- [ ] **Step 2: Get the mask helpers**

Call `useDemoMode()` at the top of the function, alongside the other hooks (not after the `if (!client) return null;` guard further down — hooks can't be called conditionally/after an early return). Below that guard, `client` is narrowed to non-null by TypeScript, so use plain `client.id`/`client.name` (not `client?.`) in the steps that follow. Replace:
```tsx
export function ManageCompaniesDialog({
  client,
  open,
  onOpenChange,
}: ManageCompaniesDialogProps) {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
```

With:
```tsx
export function ManageCompaniesDialog({
  client,
  open,
  onOpenChange,
}: ManageCompaniesDialogProps) {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { maskPersonName, maskCompanyName } = useDemoMode();
```

- [ ] **Step 3: Mask the dialog title**

Replace:
```tsx
  <DialogTitle>Empresas de {client.name}</DialogTitle>
```

With:
```tsx
  <DialogTitle>Empresas de {maskPersonName(client.id, client.name, "cliente")}</DialogTitle>
```

- [ ] **Step 4: Mask the linked company badges**

Replace:
```tsx
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
```

With:
```tsx
              {userCompanies.map((company) => (
                <Badge
                  key={company.id}
                  variant="secondary"
                  className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                >
                  {maskCompanyName(company.id, company.name)}
                  <button
                    type="button"
                    onClick={() =>
                      removeMutation.mutate({
                        userId: client.id,
                        companyId: company.id,
                      })
                    }
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remover ${maskCompanyName(company.id, company.name)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
```

- [ ] **Step 5: Mask the searchable company matches**

Replace:
```tsx
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
```

With (the search matching itself, further up in the file, keeps comparing against the real `company.name`/`c.name` — only this rendered label changes):
```tsx
            {matches.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() =>
                  addMutation.mutate({ userId: client.id, companyId: company.id })
                }
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {maskCompanyName(company.id, company.name)}
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/clientes/_components/manage-companies-dialog.tsx"
git commit -m "feat: mask names in manage companies dialog"
```

---

## Part D — Dashboards and project screens

### Task 12: Admin dashboard recent projects

**Files:**
- Modify: `src/app/(private)/admin/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useProjects } from "@/shared/context/projects-context";
import { STATUS_CONFIG } from "@/shared/types";
```

With:
```tsx
import { useProjects } from "@/shared/context/projects-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { STATUS_CONFIG } from "@/shared/types";
```

- [ ] **Step 2: Get the mask helper**

Replace:
```tsx
export default function AdminDashboard() {
  const { projects, requests } = useProjects();
```

With:
```tsx
export default function AdminDashboard() {
  const { projects, requests } = useProjects();
  const { maskFreeText } = useDemoMode();
```

- [ ] **Step 3: Mask the project title**

Replace:
```tsx
                 <div className="min-w-0 flex-1">
                   <p className="truncate text-sm font-medium">{project.title}</p>
                   <p className="truncate text-xs text-muted-foreground">
                     {project.projectType}
                   </p>
```

With:
```tsx
                 <div className="min-w-0 flex-1">
                   <p className="truncate text-sm font-medium">{maskFreeText(project.title)}</p>
                   <p className="truncate text-xs text-muted-foreground">
                     {project.projectType}
                   </p>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/page.tsx"
git commit -m "feat: mask project titles in admin dashboard"
```

---

### Task 13: Cliente "Meus Robôs"

**Files:**
- Modify: `src/app/(private)/cliente/robos/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useModal } from "@/shared/context/modal-context";
import { ReportIncidentModal } from "./_components/report-incident.modal";
```

With:
```tsx
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useModal } from "@/shared/context/modal-context";
import { ReportIncidentModal } from "./_components/report-incident.modal";
```

- [ ] **Step 2: Get the mask helper and mask the title passed into the report-incident modal**

Replace:
```tsx
export default function MeusRobosPage() {
  const { projects } = useProjects();
  const { openModal } = useModal();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const doneProjects = projects.filter((p) => p.status === "completed");
  const visibleProjects = filterProjectsByCompany(doneProjects, companyFilter);
  const distinctCompanies = new Set(
    doneProjects.map((p) => p.companyId).filter(Boolean)
  );
  const showCompanyColumn = distinctCompanies.size > 1;

  function handleReportIncident(project: Project) {
    openModal(
      `report-incident-${project.id}`,
      ReportIncidentModal,
      { projectId: project.id, projectTitle: project.title },
      { size: "md", position: "center" }
    );
  }
```

With:
```tsx
export default function MeusRobosPage() {
  const { projects } = useProjects();
  const { openModal } = useModal();
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const [companyFilter, setCompanyFilter] = useState(ALL_COMPANIES_VALUE);

  const doneProjects = projects.filter((p) => p.status === "completed");
  const visibleProjects = filterProjectsByCompany(doneProjects, companyFilter);
  const distinctCompanies = new Set(
    doneProjects.map((p) => p.companyId).filter(Boolean)
  );
  const showCompanyColumn = distinctCompanies.size > 1;

  function handleReportIncident(project: Project) {
    openModal(
      `report-incident-${project.id}`,
      ReportIncidentModal,
      { projectId: project.id, projectTitle: maskFreeText(project.title) ?? project.title },
      { size: "md", position: "center" }
    );
  }
```

- [ ] **Step 3: Mask the table row**

Replace:
```tsx
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.title}</TableCell>
                  {showCompanyColumn && (
                    <TableCell>{project.companyName ?? "—"}</TableCell>
                  )}
```

With:
```tsx
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{maskFreeText(project.title)}</TableCell>
                  {showCompanyColumn && (
                    <TableCell>
                      {maskCompanyName(project.companyId, project.companyName) ?? "—"}
                    </TableCell>
                  )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/robos/page.tsx"
git commit -m "feat: mask project title/company in Meus Robos"
```

---

### Task 14: Admin solicitações

**Files:**
- Modify: `src/app/(private)/admin/solicitacoes/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { trpc } from "@/shared/trpc/client";
import { FileText, Mail, Building2, Calendar, CheckCircle, X } from "lucide-react";
```

With:
```tsx
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { FileText, Mail, Building2, Calendar, CheckCircle, X } from "lucide-react";
```

- [ ] **Step 2: Get the mask helpers**

Replace:
```tsx
export default function AdminSolicitacoesPage() {
  const [acting, setActing] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const { data: requests = [], isLoading } = trpc.request.list.useQuery();
```

With:
```tsx
export default function AdminSolicitacoesPage() {
  const { maskPersonName, maskContact, maskCompanyName, maskFreeText } = useDemoMode();
  const [acting, setActing] = useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const { data: requests = [], isLoading } = trpc.request.list.useQuery();
```

- [ ] **Step 3: Mask the requester name/email/company and the description**

Replace:
```tsx
                    <CardTitle className="text-base sm:text-lg">{request.name}</CardTitle>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {request.email}
                      </span>
                      {request.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {request.company}
                        </span>
                      )}
                    </div>
```

With:
```tsx
                    <CardTitle className="text-base sm:text-lg">
                      {maskPersonName(request.id, request.name, "cliente")}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        {maskContact(request.email, "email")}
                      </span>
                      {request.company && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {maskCompanyName(request.company, request.company)}
                        </span>
                      )}
                    </div>
```

(`request.company` is a raw string, not a relation — there's no separate id, so it's used as its own key, same idea as the `companyId ?? companyName` fallback already built into `maskCompanyName`.)

Replace:
```tsx
                <div>
                  <p className="text-sm font-medium mb-1">Descrição</p>
                  <p className="text-sm text-muted-foreground">
                    {request.description}
                  </p>
                </div>
```

With:
```tsx
                <div>
                  <p className="text-sm font-medium mb-1">Descrição</p>
                  <p className="text-sm text-muted-foreground">
                    {maskFreeText(request.description)}
                  </p>
                </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/solicitacoes/page.tsx"
git commit -m "feat: mask requester data in admin solicitacoes"
```

---

### Task 15: Desenvolvedor project details dialog

**Files:**
- Modify: `src/app/(private)/desenvolvedor/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useProjects } from "@/shared/context/projects-context";
```

With:
```tsx
import { useAuth } from "@/shared/context/auth-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { useProjects } from "@/shared/context/projects-context";
```

- [ ] **Step 2: Get the mask helper**

Replace:
```tsx
export default function DesenvolvedorDashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { projects, moveProject } = useProjects();
```

With:
```tsx
export default function DesenvolvedorDashboard() {
  const { user, isSuperAdmin } = useAuth();
  const { projects, moveProject } = useProjects();
  const { maskFreeText } = useDemoMode();
```

- [ ] **Step 3: Mask the dialog title and description**

Replace:
```tsx
          <DialogHeader>
            <DialogTitle>{selectedProject?.title}</DialogTitle>
            <DialogDescription>Detalhes e ações do projeto</DialogDescription>
          </DialogHeader>
```

With:
```tsx
          <DialogHeader>
            <DialogTitle>{maskFreeText(selectedProject?.title)}</DialogTitle>
            <DialogDescription>Detalhes e ações do projeto</DialogDescription>
          </DialogHeader>
```

Replace:
```tsx
                    <div>
                      <p className="text-sm font-medium">Descrição</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedProject.description}
                      </p>
                    </div>
```

With:
```tsx
                    <div>
                      <p className="text-sm font-medium">Descrição</p>
                      <p className="text-sm text-muted-foreground">
                        {maskFreeText(selectedProject.description)}
                      </p>
                    </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/desenvolvedor/page.tsx"
git commit -m "feat: mask project title/description in developer dialog"
```

---

### Task 16: Project detail page header (company + developer)

**Files:**
- Modify: `src/app/(private)/projeto/[id]/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { ProjectChat } from "@/shared/components/project-chat";
```

With:
```tsx
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { ProjectChat } from "@/shared/components/project-chat";
```

- [ ] **Step 2: Get the mask helpers**

Replace this exact line (it appears once in the file):
```tsx
  const { projectDetails, activityLogs, developers } = useProject(id);
```

With:
```tsx
  const { projectDetails, activityLogs, developers } = useProject(id);
  const { maskFreeText, maskCompanyName, maskPersonName, maskContact } = useDemoMode();
```

- [ ] **Step 3: Mask the page title**

Replace:
```tsx
            <h1 className="text-2xl font-bold text-foreground">{project.title}</h1>
```

With:
```tsx
            <h1 className="text-2xl font-bold text-foreground">{maskFreeText(project.title)}</h1>
```

- [ ] **Step 4: Mask company name and developer name/email in the sidebar card**

Replace:
```tsx
              <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>
                  {(projectDetails as any)?.companyName ?? "Sem empresa definida"}
                </span>
              </div>
              {project.developerId ? (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-400">
                      DEV
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {(projectDetails as any)?.developer?.name ?? "Desenvolvedor atribuído"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(projectDetails as any)?.developer?.email ?? ""}
                    </p>
                  </div>
                </div>
              ) : (
```

With:
```tsx
              <div className="flex items-center gap-2 rounded-lg bg-secondary/30 p-2 text-sm">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span>
                  {maskCompanyName(project.companyId, (projectDetails as any)?.companyName) ??
                    "Sem empresa definida"}
                </span>
              </div>
              {project.developerId ? (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                  <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-400">
                      DEV
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {maskPersonName(
                        project.developerId,
                        (projectDetails as any)?.developer?.name,
                        "desenvolvedor"
                      ) ?? "Desenvolvedor atribuído"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {maskContact((projectDetails as any)?.developer?.email, "email") ?? ""}
                    </p>
                  </div>
                </div>
              ) : (
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual check**

Open `/projeto/[id]` for a project that has a company and a developer assigned, with demo mode on — confirm the page title, the company card, and the developer name/email are all masked, while the embedded `ProjectDetailSections` (from Task 5) also shows masked values.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/projeto/[id]/page.tsx"
git commit -m "feat: mask company and developer info in project detail header"
```

---

## Part E — Empresa sub-pages (priorização, custos, automações existentes, entrevistas)

### Task 17: Priorização page (ranking, chart, timeline, payback)

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
```

With:
```tsx
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
```

- [ ] **Step 2: Get the mask helpers and build a masked copy of `ranking`**

Replace:
```tsx
  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });
```

With:
```tsx
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const { data: ranking = [], isLoading } = trpc.project.getPrioritizedRanking.useQuery({
    companyId,
    sortBy,
  });
  // Cópia com o título mascarado — usada em todo lugar abaixo que exibe o ranking
  // (gráfico, tooltip, tabela, cronograma, payback), pra masquear uma vez só na fonte
  // em vez de em cada ponto de renderização.
  const displayRanking = useMemo(
    () => ranking.map((row) => ({ ...row, title: maskFreeText(row.title) ?? row.title })),
    [ranking, maskFreeText]
  );
```

- [ ] **Step 3: Feed the chart, table, and wave schedules from `displayRanking` instead of `ranking`**

Replace:
```tsx
  const chartData = useMemo(
    () =>
      ranking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [ranking, sortBy]
  );
```

With:
```tsx
  const chartData = useMemo(
    () =>
      displayRanking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [displayRanking, sortBy]
  );
```

Replace:
```tsx
  const wave1Projects = useMemo(
    () => ranking.filter((row) => row.implementationWave === 1),
    [ranking]
  );
  const wave2Projects = useMemo(
    () => ranking.filter((row) => row.implementationWave === 2),
    [ranking]
  );
```

With:
```tsx
  const wave1Projects = useMemo(
    () => displayRanking.filter((row) => row.implementationWave === 1),
    [displayRanking]
  );
  const wave2Projects = useMemo(
    () => displayRanking.filter((row) => row.implementationWave === 2),
    [displayRanking]
  );
```

Replace:
```tsx
  const areaNameByProjectId = useMemo(
    () => new Map(ranking.map((row) => [row.id, row.areaName])),
    [ranking]
  );
```

With:
```tsx
  const areaNameByProjectId = useMemo(
    () => new Map(displayRanking.map((row) => [row.id, row.areaName])),
    [displayRanking]
  );
```

Replace:
```tsx
  const savingByProjectId = useMemo(
    () => new Map(ranking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])),
    [ranking]
  );
```

With:
```tsx
  const savingByProjectId = useMemo(
    () => new Map(displayRanking.map((row) => [row.id, row.estimatedAnnualSavingBRL ?? 0])),
    [displayRanking]
  );
```

Note: leave the `Math.max(0, ...ranking.filter(...).map(...))` inside the wave-assignment handler (the one computing `nextOrder`) reading the original `ranking` — that's pure numeric business logic (computing the next free `waveOrder`), not a display, and `displayRanking` has identical numeric fields.

- [ ] **Step 4: Mask the table row title**

Replace:
```tsx
                  ) : (
                    ranking.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium max-w-[260px] truncate">
                          <Link
                            href={`/admin/projetos/${row.id}/especificacao`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.title}
                          </Link>
                        </TableCell>
```

With:
```tsx
                  ) : (
                    displayRanking.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium max-w-[260px] truncate">
                          <Link
                            href={`/admin/projetos/${row.id}/especificacao`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.title}
                          </Link>
                        </TableCell>
```

Also update the loading/empty check just above it — replace `) : ranking.length === 0 ? (` with `) : displayRanking.length === 0 ? (` (same array, just keeping the variable consistent; `ranking` and `displayRanking` always have the same length).

- [ ] **Step 5: Mask the company name subtitle**

Replace:
```tsx
            {company?.name ?? "Carregando..."} — ranking reordenável por critério
```

With:
```tsx
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."} — ranking reordenável por critério
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Manual check**

Open `/admin/empresas/[id]/priorizacao` with demo mode on. Confirm: the subtitle shows a masked company name; the ranking table shows masked titles; hovering the chart bars shows a masked title in the tooltip; the "Cronograma" tab's wave timeline bars show masked titles; the "Payback" tab's composition table shows masked titles. This is the widest-reaching single file in this plan (title flows through chart, tooltip, table, timeline, and payback via `displayRanking` → `wave1Schedule`/`wave2Schedule` → `paybackComposition`) — check all four tabs, not just Ranking.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx"
git commit -m "feat: mask project titles and company name in priorizacao page"
```

---

### Task 18: Custos e Estrutura page

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/custos/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { trpc } from "@/shared/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
```

With:
```tsx
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import type { inferRouterOutputs } from "@trpc/server";
```

- [ ] **Step 2: Get the mask helper**

Replace this exact line (it appears once in the file, inside the page component):
```tsx
  const company = companies.find((c) => c.id === companyId);
```

With:
```tsx
  const company = companies.find((c) => c.id === companyId);
  const { maskCompanyName } = useDemoMode();
```

- [ ] **Step 3: Mask the subtitle**

Replace:
```tsx
          <h1 className="text-2xl font-bold text-foreground">Custos e Estrutura</h1>
          <p className="text-muted-foreground">{company?.name ?? "Carregando..."}</p>
```

With:
```tsx
          <h1 className="text-2xl font-bold text-foreground">Custos e Estrutura</h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."}
          </p>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/custos/page.tsx"
git commit -m "feat: mask company name in custos page"
```

---

### Task 19: Automações existentes page

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
```

With:
```tsx
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
```

- [ ] **Step 2: Get the mask helpers and build a masked copy of `ranking`**

Replace:
```tsx
  const { data: ranking = [], isLoading } = trpc.project.getExistingAutomationsRanking.useQuery({
    companyId,
    sortBy,
  });
```

With:
```tsx
  const { maskFreeText, maskCompanyName } = useDemoMode();
  const { data: ranking = [], isLoading } = trpc.project.getExistingAutomationsRanking.useQuery({
    companyId,
    sortBy,
  });
  const displayRanking = useMemo(
    () => ranking.map((row) => ({ ...row, title: maskFreeText(row.title) ?? row.title })),
    [ranking, maskFreeText]
  );
```

- [ ] **Step 3: Feed the chart from `displayRanking`**

Replace:
```tsx
  const chartData = useMemo(
    () =>
      ranking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [ranking, sortBy]
  );
```

With:
```tsx
  const chartData = useMemo(
    () =>
      displayRanking.map((row) => ({
        ...row,
        activeScore: activeScoreOf(row, sortBy),
        shortTitle: truncate(row.title, 18),
      })),
    [displayRanking, sortBy]
  );
```

- [ ] **Step 4: Mask the table row and the loading/empty check**

Replace:
```tsx
              ) : ranking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhuma automação existente encontrada para esta empresa.
                  </TableCell>
                </TableRow>
              ) : (
                ranking.map((row, index) => {
                  const statusConfig = row.operationalStatus
                    ? ROBOT_OPERATIONAL_STATUS_CONFIG[row.operationalStatus]
                    : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate">
                        {row.title}
                      </TableCell>
```

With:
```tsx
              ) : displayRanking.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhuma automação existente encontrada para esta empresa.
                  </TableCell>
                </TableRow>
              ) : (
                displayRanking.map((row, index) => {
                  const statusConfig = row.operationalStatus
                    ? ROBOT_OPERATIONAL_STATUS_CONFIG[row.operationalStatus]
                    : null;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium max-w-[260px] truncate">
                        {row.title}
                      </TableCell>
```

(`row.title` itself doesn't need to change — it's already masked because it now comes from `displayRanking`.)

- [ ] **Step 5: Mask the company name subtitle**

Replace:
```tsx
            {company?.name ?? "Carregando..."} — automações já entregues/existentes, fora do
            funil de desenvolvimento
```

With:
```tsx
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."} — automações já
            entregues/existentes, fora do funil de desenvolvimento
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Manual check**

Open `/admin/empresas/[id]/automacoes-existentes` with demo mode on — confirm subtitle, chart tooltip, and table all show masked titles/company name.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx"
git commit -m "feat: mask project titles and company name in automacoes existentes page"
```

---

### Task 20: Entrevistas page

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/entrevistas/page.tsx`

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
```

With:
```tsx
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
```

- [ ] **Step 2: Get the mask helpers**

Replace this exact line (it appears once in the file, inside `EntrevistasPage`):
```tsx
  const company = companies.find((c) => c.id === companyId);
```

With:
```tsx
  const company = companies.find((c) => c.id === companyId);
  const { maskCompanyName, maskPersonName } = useDemoMode();
```

- [ ] **Step 3: Mask the subtitle**

Replace:
```tsx
          <p className="text-muted-foreground">
            {company?.name ?? "Carregando..."} — participantes, área, data e status das
            entrevistas realizadas
          </p>
```

With:
```tsx
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."} — participantes,
            área, data e status das entrevistas realizadas
          </p>
```

- [ ] **Step 4: Mask the participant name**

Replace:
```tsx
                    <TableCell className="font-medium">{interview.participantName}</TableCell>
```

With:
```tsx
                    <TableCell className="font-medium">
                      {maskPersonName(interview.id, interview.participantName, "cliente")}
                    </TableCell>
```

(There's no separate participant id in this data — each interview has one participant, so `interview.id` is used as the label key. This means two different interviews with the same person still get different sequential labels; acceptable, since interviews are the unit being listed here, not a client directory.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/entrevistas/page.tsx"
git commit -m "feat: mask company name and participant name in entrevistas page"
```

---

## Part F — Close an export leak

### Task 21: Disable CSV export while demo mode is on

**Files:**
- Modify: `src/app/(private)/admin/projetos/page.tsx`

Context: `downloadProjectsCSV` builds a CSV file straight from the raw `Project[]` (title, description, targetAudience, existingSystemDetails, currentApplicationDetails, projectNarrative, benefitsDetails — the exact fields this plan masks on screen) and triggers a browser download. On-screen masking does nothing to stop that download, so it's a real leak path that's cheap to close: disable the button while demo mode is active.

- [ ] **Step 1: Add the import**

Replace:
```tsx
import { useProjects } from "@/shared/context/projects-context";
import { KanbanBoard } from "@/shared/components";
```

With:
```tsx
import { useProjects } from "@/shared/context/projects-context";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { KanbanBoard } from "@/shared/components";
```

- [ ] **Step 2: Get `isDemoMode`**

Replace:
```tsx
export default function AdminProjetosPage() {
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
```

With:
```tsx
export default function AdminProjetosPage() {
  const { projects, moveProject } = useProjects();
  const { openModal } = useModal();
  const { isDemoMode } = useDemoMode();
```

- [ ] **Step 3: Disable the export button**

Replace:
```tsx
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
```

With:
```tsx
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadProjectsCSV(filteredProjects);
              toast.success("CSV exportado com sucesso");
            }}
            disabled={filteredProjects.length === 0 || isDemoMode}
            title={isDemoMode ? "Exportação desativada no modo demonstração" : undefined}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar CSV
          </Button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/admin/projetos/page.tsx"
git commit -m "feat: disable CSV export while demo mode is active"
```

---

## Part G — Final verification

### Task 22: Full manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Baseline typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors introduced by this plan (pre-existing errors/warnings unrelated to the files touched above are fine — this repo has no test suite, so this is the closest thing to a full-project check).

- [ ] **Step 3: Walk through every masked screen with demo mode ON**

Log in and visit, in order, confirming every sensitive field is masked and every non-sensitive field (status, dates, financial values, ratings) stays visible:
1. `/admin` — recent projects list
2. `/admin/projetos` — Kanban cards, a project's "Detalhes do projeto" modal, its "Slide Executivo"
3. `/admin/empresas` — company table
4. `/admin/empresas/[id]/priorizacao` — all four tabs (Ranking, Cronograma, Payback, and the area-summary tab, which needs no masking since it has no name fields)
5. `/admin/empresas/[id]/custos`
6. `/admin/empresas/[id]/automacoes-existentes`
7. `/admin/empresas/[id]/entrevistas`
8. `/admin/clientes` — table + "Empresas de..." dialog
9. `/admin/solicitacoes`
10. `/cliente` (as a client user) — Kanban cards
11. `/cliente/robos`
12. `/cliente/solicitar` — company dropdown label
13. `/desenvolvedor` — Kanban cards + project details dialog
14. `/projeto/[id]` — header, detail sections, chat/files are NOT masked (documented below)

- [ ] **Step 4: Confirm the toggle itself**

Reload the page with demo mode ON — bar stays amber and "Desativar". Click "Desativar" — every screen above reverts to real data immediately, no stale masked values left anywhere (there's no caching beyond the in-memory sequential-label map, which is fine to keep between toggles within the same session).

- [ ] **Step 5: Confirm the CSV export guard**

On `/admin/projetos`, with demo mode ON, confirm "Exportar CSV" is disabled with a tooltip. Turn demo mode OFF — button re-enables.

- [ ] **Step 6: Record what's explicitly NOT covered**

No code change in this step — just confirm your mental model matches reality before calling this done. Not masked by this plan (all pre-existing, documented in the spec's "Fora de escopo" section or newly identified during planning):
- `ProjectChat` (comments) and `ProjectFiles` (file names) on `/projeto/[id]` — spec Fase 2.
- `ProjectRequestEditForm` (the edit form shown when editing a project's own request) — pre-fills real values into editable inputs; editing flows were out of scope.
- PDF/PPTX exports (payback deck, etc.) — spec explicitly out of scope.
- The XML-import raw company name mismatch message and batch-import result titles on `/cliente/solicitar` — pre-creation transient state, not an existing record being displayed.
- Toast messages and delete/promote/reset-password confirmation dialogs on `/admin/clientes` — see the scope note in Task 10.

If any of these turn out to matter in practice, they're all small additions using the same `maskFreeText`/`maskPersonName`/`maskCompanyName`/`maskContact` helpers built in Task 1 — no new architecture needed.
