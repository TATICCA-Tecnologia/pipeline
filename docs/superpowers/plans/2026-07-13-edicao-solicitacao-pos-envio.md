# Edição dos campos de solicitação depois de enviado — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o cliente-criador do projeto (`clientId`) e o arquiteto (`admin`/`super_admin`) editem os campos "de solicitação" (título, descrição, área/tema, narrativa, benefícios, avaliações, urgência, prazo, etc.) depois que o projeto já foi enviado, direto na tela `/projeto/[id]`, e fechar a lacuna de autorização que hoje deixa `project.update` aberto a qualquer usuário autenticado.

**Architecture:** A mutation `project.update` (`src/server/trpc/routers/project.router.ts`) ganha checagem de role/dono/status e uma allowlist de campos por papel, além dos campos de solicitação que faltavam no seu schema zod. `project.byId` passa a devolver `areaId`/`themeId` (já existem no banco, só não eram devolvidos). No frontend, `ProjectDetailSections` ganha um botão "Editar" que troca a visualização só-leitura por um novo componente `ProjectRequestEditForm`, reaproveitando os mesmos selects/constantes de taxonomia já usados no wizard de criação (`useTaxonomy`, `RatingRow` — este último extraído para um componente compartilhado).

**Tech Stack:** Next.js (App Router), tRPC, Prisma, React, React Hook Form não é usado aqui (form controlado com `useState` simples, já que é um form único de edição, não um wizard), shadcn/ui (`Select`, `Checkbox`, `Textarea`, `Input`, `Card`, `Button`), `sonner` (toast).

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest/Playwright, sem scripts de teste no `package.json`, `next.config.mjs` tem `typescript.ignoreBuildErrors: true`). A verificação de cada task é feita via `npx tsc --noEmit` (checagem de tipos — é o único jeito de pegar erro de tipo aqui, já que o build ignora), `npm run lint` e teste manual no navegador — não via testes automatizados novos.

**Spec:** `docs/superpowers/specs/2026-07-13-edicao-solicitacao-pos-envio-design.md`

---

### Task 1: Extrair `RatingRow` para um componente compartilhado

**Files:**
- Create: `src/shared/components/rating-row.tsx`
- Modify: `src/app/(private)/cliente/solicitar/page.tsx:186-222` (remove a definição local, importa do novo arquivo)

Hoje `RatingRow` (o seletor 1-5 usado na etapa "Benefícios" do wizard de criação) é uma função privada dentro de `solicitar/page.tsx`. O novo form de edição precisa do mesmo widget — em vez de duplicar, extraímos para um arquivo compartilhado.

- [ ] **Step 1: Criar `src/shared/components/rating-row.tsx`**

```tsx
"use client";

import { cn } from "@/shared/utils";

export function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={cn(
                "h-8 w-8 rounded-full border text-sm font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remover a definição local em `solicitar/page.tsx` e importar a versão compartilhada**

Em `src/app/(private)/cliente/solicitar/page.tsx:186-222`, remova todo o bloco:

```tsx
function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  ...
}
```

E adicione o import no topo do arquivo, junto aos outros imports de componentes compartilhados (perto da linha 78, onde já importa `cn` de `@/shared/utils`):

```tsx
import { RatingRow } from "@/shared/components/rating-row";
```

O uso de `<RatingRow ... />` mais abaixo no arquivo (por volta da linha 1617) não muda — só a origem do componente.

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `rating-row.tsx` ou `solicitar/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/rating-row.tsx "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "refactor: extract RatingRow into a shared component"
```

---

### Task 2: `project.byId` passa a devolver `areaId`/`themeId`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:166-167`

`areaId`/`themeId` já existem no modelo `Project` e já são gravados no `create`, mas a query `byId` nunca os devolve — sem isso, o formulário de edição não tem como saber qual área/tema já estão selecionados.

- [ ] **Step 1: Adicionar os dois campos ao objeto de retorno de `byId`**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro do `query` de `byId`):

```ts
        companyId: project.companyId ?? undefined,
        companyName: project.company?.name,
        projectType: project.platform ?? project.type,
```

Troque por:

```ts
        companyId: project.companyId ?? undefined,
        companyName: project.company?.name,
        areaId: project.areaId ?? undefined,
        themeId: project.themeId ?? undefined,
        projectType: project.platform ?? project.type,
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts` (o tipo de retorno de `byId` é inferido, `areaId`/`themeId` já existem em `Project`, então não deve quebrar nada no client).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "fix: return areaId/themeId from project.byId"
```

---

### Task 3: Autorização, allowlist de campos e log de atividade em `project.update`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:33-52` (novas constantes, perto de `complexitySchema`)
- Modify: `src/server/trpc/routers/project.router.ts:363-454` (schema + corpo da mutation `update`)

Hoje `update` é `protectedProcedure` sem NENHUMA checagem — qualquer usuário logado pode alterar qualquer campo de qualquer projeto. Este task adiciona: (1) checagem de dono/role/status; (2) uma allowlist que impede um cliente de tocar em campos reservados ao arquiteto; (3) os campos de solicitação que faltavam no schema zod; (4) um log de atividade que lista os campos alterados.

- [ ] **Step 1: Adicionar as constantes de labels e allowlist logo após `complexitySchema`**

Em `src/server/trpc/routers/project.router.ts`, localize:

```ts
const complexitySchema = z.enum(["baixa", "media", "alta"]);

function computeCurrentAnnualHours(
```

Troque por (adiciona duas constantes novas entre as duas):

```ts
const complexitySchema = z.enum(["baixa", "media", "alta"]);

// Campos que só admin/super_admin (o "arquiteto" do sistema — não existe role
// separado) pode alterar via project.update. Um cliente que tentar enviar
// qualquer uma dessas chaves recebe FORBIDDEN.
const ARCHITECT_ONLY_FIELDS = new Set([
  "status",
  "priority",
  "developerId",
  "companyId",
  "solutionTypes",
  "mainTool",
  "executionStrategy",
  "architectNotes",
  "complexity",
  "robotSchedule",
  "hourlyRateBRL",
  "estimatedAnnualSavingBRL",
  "implementationEffortDays",
  "implementationWave",
  "waveOrder",
]);

// Rótulos em pt-BR dos campos "de solicitação" editáveis por cliente-dono e
// arquiteto, usados para descrever no ActivityLog quais campos mudaram.
const SOLICITATION_FIELD_LABELS: Record<string, string> = {
  title: "Título",
  description: "Descrição",
  estimatedDeadline: "Prazo limite",
  areaId: "Área",
  themeId: "Tema",
  targetAudience: "Público-alvo",
  expectedUsers: "Usuários esperados",
  urgency: "Urgência",
  additionalInfo: "Informações adicionais",
  hasExistingSystem: "Processo/sistema existente",
  existingSystemDetails: "Detalhes do processo atual",
  hasCurrentApplication: "Aplicação existente hoje",
  currentApplicationDetails: "Detalhes da aplicação existente",
  projectNarrative: "Narrativa do processo",
  benefits: "Benefícios esperados",
  benefitsDetails: "Detalhes dos benefícios",
  monthlyHoursSaved: "Horas economizadas por mês",
  ratingErrorReduction: "Avaliação: redução de erros",
  ratingProcessCriticality: "Avaliação: criticidade do processo",
  ratingInternalImpact: "Avaliação: impacto interno",
  ratingExternalImpact: "Avaliação: impacto externo",
  ratingCompliance: "Avaliação: atendimento a políticas",
  peopleInvolved: "Colaboradores envolvidos",
  peopleInvolvedDetails: "Detalhes dos colaboradores",
  taskDurationHours: "Duração por execução",
  processFrequency: "Periodicidade",
};

// Compara os valores enviados (rest) contra o estado atual do projeto (current,
// linha crua do Prisma) e devolve os rótulos dos campos que de fato mudaram —
// usado só para descrever a entrada do ActivityLog, não afeta o que é salvo.
function describeChangedFields(
  rest: Record<string, unknown>,
  current: Record<string, unknown>
): string[] {
  const changed: string[] = [];
  for (const [key, label] of Object.entries(SOLICITATION_FIELD_LABELS)) {
    if (!(key in rest) || rest[key] === undefined) continue;
    const currentKey = key === "estimatedDeadline" ? "deadline" : key;
    const before = current[currentKey];
    const after = rest[key];
    const beforeStr =
      before instanceof Date ? before.toISOString() : JSON.stringify(before ?? null);
    const afterStr =
      after instanceof Date ? after.toISOString() : JSON.stringify(after ?? null);
    if (beforeStr !== afterStr) changed.push(label);
  }
  return changed;
}

function computeCurrentAnnualHours(
```

- [ ] **Step 2: Substituir a mutation `update` inteira**

Em `src/server/trpc/routers/project.router.ts`, substitua o bloco inteiro de `update: protectedProcedure` até o fechamento `}),` que vem logo antes de `move: protectedProcedure` (linhas 363-454 do arquivo original) por:

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
        areaId: z.string().nullable().optional(),
        themeId: z.string().nullable().optional(),
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
        peopleInvolved: z.number().int().min(0).nullable().optional(),
        peopleInvolvedDetails: z.string().nullable().optional(),
        taskDurationHours: z.number().min(0).nullable().optional(),
        processFrequency: z.string().nullable().optional(),
        complexity: complexitySchema.nullable().optional(),
        robotSchedule: z.string().nullable().optional(),
        hourlyRateBRL: z.number().min(0).nullable().optional(),
        estimatedAnnualSavingBRL: z.number().nullable().optional(),
        implementationEffortDays: z.number().int().min(0).nullable().optional(),
        implementationWave: z.number().int().min(0).nullable().optional(),
        waveOrder: z.number().int().min(0).nullable().optional(),
        hasCurrentApplication: z.string().nullable().optional(),
        targetAudience: z.string().nullable().optional(),
        expectedUsers: z.string().nullable().optional(),
        urgency: z.string().nullable().optional(),
        additionalInfo: z.string().nullable().optional(),
        hasExistingSystem: z.string().nullable().optional(),
        existingSystemDetails: z.string().nullable().optional(),
        currentApplicationDetails: z.string().nullable().optional(),
        projectNarrative: z.string().nullable().optional(),
        benefits: z.array(z.string()).nullable().optional(),
        benefitsDetails: z.string().nullable().optional(),
        monthlyHoursSaved: z.number().nullable().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).nullable().optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).nullable().optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).nullable().optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).nullable().optional(),
        ratingCompliance: z.number().int().min(1).max(5).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;

      const current = await ctx.db.project.findUnique({ where: { id } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
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
        const forbiddenKey = Object.keys(rest).find(
          (key) =>
            ARCHITECT_ONLY_FIELDS.has(key) &&
            (rest as Record<string, unknown>)[key] !== undefined
        );
        if (forbiddenKey) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Este campo só pode ser alterado por um administrador.",
          });
        }
      }

      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.companyId !== undefined) data.companyId = rest.companyId;
      if (rest.areaId !== undefined) data.areaId = rest.areaId;
      if (rest.themeId !== undefined) data.themeId = rest.themeId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;
      if (rest.complexity !== undefined) data.complexity = rest.complexity;
      if (rest.robotSchedule !== undefined) data.robotSchedule = rest.robotSchedule;
      if (rest.hourlyRateBRL !== undefined) data.hourlyRateBRL = rest.hourlyRateBRL;
      if (rest.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = rest.estimatedAnnualSavingBRL;
      if (rest.implementationEffortDays !== undefined)
        data.implementationEffortDays = rest.implementationEffortDays;
      if (rest.implementationWave !== undefined) data.implementationWave = rest.implementationWave;
      if (rest.waveOrder !== undefined) data.waveOrder = rest.waveOrder;
      if (rest.hasCurrentApplication !== undefined)
        data.hasCurrentApplication = rest.hasCurrentApplication;
      if (rest.targetAudience !== undefined) data.targetAudience = rest.targetAudience;
      if (rest.expectedUsers !== undefined) data.expectedUsers = rest.expectedUsers;
      if (rest.urgency !== undefined) data.urgency = rest.urgency;
      if (rest.additionalInfo !== undefined) data.additionalInfo = rest.additionalInfo;
      if (rest.hasExistingSystem !== undefined) data.hasExistingSystem = rest.hasExistingSystem;
      if (rest.existingSystemDetails !== undefined)
        data.existingSystemDetails = rest.existingSystemDetails;
      if (rest.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = rest.currentApplicationDetails;
      if (rest.projectNarrative !== undefined) data.projectNarrative = rest.projectNarrative;
      if (rest.benefits !== undefined) data.benefits = rest.benefits;
      if (rest.benefitsDetails !== undefined) data.benefitsDetails = rest.benefitsDetails;
      if (rest.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = rest.monthlyHoursSaved;
      if (rest.ratingErrorReduction !== undefined)
        data.ratingErrorReduction = rest.ratingErrorReduction;
      if (rest.ratingProcessCriticality !== undefined)
        data.ratingProcessCriticality = rest.ratingProcessCriticality;
      if (rest.ratingInternalImpact !== undefined)
        data.ratingInternalImpact = rest.ratingInternalImpact;
      if (rest.ratingExternalImpact !== undefined)
        data.ratingExternalImpact = rest.ratingExternalImpact;
      if (rest.ratingCompliance !== undefined) data.ratingCompliance = rest.ratingCompliance;
      if (rest.peopleInvolved !== undefined) data.peopleInvolved = rest.peopleInvolved;
      if (rest.peopleInvolvedDetails !== undefined)
        data.peopleInvolvedDetails = rest.peopleInvolvedDetails;
      if (rest.taskDurationHours !== undefined || rest.processFrequency !== undefined) {
        const nextDuration =
          rest.taskDurationHours !== undefined ? rest.taskDurationHours : current.taskDurationHours;
        const nextFrequency =
          rest.processFrequency !== undefined ? rest.processFrequency : current.processFrequency;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }

      const changedFieldLabels = describeChangedFields(
        rest as Record<string, unknown>,
        current as unknown as Record<string, unknown>
      );

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: changedFieldLabels.length > 0 ? "Solicitação editada" : "Projeto atualizado",
          details: changedFieldLabels.length > 0 ? changedFieldLabels.join(", ") : undefined,
        },
      });
      return {
        ...project,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase(),
        developerId: project.developerId ?? undefined,
        estimatedDeadline: project.deadline ?? undefined,
      };
    }),
```

Note: a query separada que existia antes (buscar só `taskDurationHours`/`processFrequency` antes de aplicar o cálculo de `currentAnnualHours`) foi removida — agora reaproveitamos o `current` que já buscamos para autorização/diff, uma query a menos.

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts`.

- [ ] **Step 4: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros no arquivo modificado.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: authorize project.update by role/ownership/status and expand editable fields"
```

---

### Task 4: Extrair `DetailSection`/`FieldRow`/`FieldValueDisplay` para um arquivo compartilhado

**Files:**
- Create: `src/shared/components/detail-section.tsx`
- Modify: `src/shared/components/project-detail-sections.tsx:1-67`

Preparação para o Task 5: o novo formulário de edição precisa desses componentes de exibição só-leitura (pra mostrar ID, status, prioridade etc. — campos que continuam não-editáveis mesmo em modo de edição). Extrair para um arquivo próprio (em vez de só exportar in-place e importar de dentro de `project-detail-sections.tsx`) evita uma dependência circular: no Task 6, `project-detail-sections.tsx` passa a importar `ProjectRequestEditForm`, e `ProjectRequestEditForm` (Task 5) precisa desses mesmos componentes — se ambos os arquivos se importassem um ao outro, teríamos um ciclo de módulos. Com um terceiro arquivo compartilhado, os dois importam dele e nenhum importa do outro.

- [ ] **Step 1: Criar `src/shared/components/detail-section.tsx`**

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";

export type FieldValue = string | number | string[] | null | undefined;

export function FieldValueDisplay({ value }: { value: FieldValue }) {
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

export function FieldRow({ label, value }: { label: string; value: FieldValue }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <FieldValueDisplay value={value} />
    </div>
  );
}

export function DetailSection({
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
```

- [ ] **Step 2: Remover as definições locais de `project-detail-sections.tsx` e importar do novo arquivo**

Em `src/shared/components/project-detail-sections.tsx`, troque o bloco inicial (imports + as três funções + o type `FieldValue`):

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
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

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
```

por:

```tsx
"use client";

import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate, formatCurrency } from "@/shared/utils";
import { DetailSection, FieldRow } from "@/shared/components/detail-section";
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
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

function formatRating(value: number | null | undefined): string | undefined {
  return value != null ? `${value}/5` : undefined;
}
```

Note que `Card, CardContent, CardHeader, CardTitle` somem daqui (só `detail-section.tsx` precisa deles agora) e `FieldValueDisplay` some (só usado internamente por `FieldRow`, que já é exportado de `detail-section.tsx`).

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros — `project-detail-sections.tsx` deve continuar compilando idêntico, só trocando a origem de `DetailSection`/`FieldRow`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/detail-section.tsx src/shared/components/project-detail-sections.tsx
git commit -m "refactor: extract DetailSection/FieldRow into a shared module to avoid a future circular import"
```

---

### Task 5: Criar `ProjectRequestEditForm`

**Files:**
- Create: `src/shared/components/project-request-edit-form.tsx`

Este é o formulário de edição inline — troca a visualização só-leitura pelos inputs equivalentes, reaproveitando os componentes/constantes já usados no wizard de criação.

- [ ] **Step 1: Criar o arquivo**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import type { Project, UserRole } from "@/shared/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/shared/types";
import { formatDate, formatCurrency } from "@/shared/utils";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { RatingRow } from "@/shared/components/rating-row";
import { DetailSection, FieldRow } from "@/shared/components/detail-section";
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
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";
import { useTaxonomy } from "@/src/app/(private)/cliente/solicitar/utils/use-taxonomy";

function toDateInputValue(date: Date | string | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface ProjectRequestEditFormProps {
  project: Project;
  viewerRole: UserRole | undefined;
  onCancel: () => void;
  onSaved: () => void;
}

export function ProjectRequestEditForm({
  project,
  viewerRole,
  onCancel,
  onSaved,
}: ProjectRequestEditFormProps) {
  const utils = trpc.useUtils();
  const { areas, themesByArea } = useTaxonomy();
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";

  const initialAreaSlug = areas.find((a) => a.id === project.areaId)?.value ?? "";
  const initialThemeSlug =
    (themesByArea[initialAreaSlug] ?? []).find((t) => t.id === project.themeId)?.value ?? "";

  const [form, setForm] = useState({
    title: project.title,
    description: project.description ?? "",
    areaSlug: initialAreaSlug,
    themeSlug: initialThemeSlug,
    targetAudience: project.targetAudience ?? "",
    expectedUsers: project.expectedUsers ?? "",
    hasExistingSystem: project.hasExistingSystem ?? "",
    existingSystemDetails: project.existingSystemDetails ?? "",
    hasCurrentApplication: project.hasCurrentApplication ?? "",
    currentApplicationDetails: project.currentApplicationDetails ?? "",
    peopleInvolved: project.peopleInvolved?.toString() ?? "",
    peopleInvolvedDetails: project.peopleInvolvedDetails ?? "",
    taskDurationHours: project.taskDurationHours?.toString() ?? "",
    processFrequency: project.processFrequency ?? "",
    benefits: project.benefits ?? [],
    benefitsDetails: project.benefitsDetails ?? "",
    monthlyHoursSaved: project.monthlyHoursSaved?.toString() ?? "",
    ratingErrorReduction: project.ratingErrorReduction ?? null,
    ratingProcessCriticality: project.ratingProcessCriticality ?? null,
    ratingInternalImpact: project.ratingInternalImpact ?? null,
    ratingExternalImpact: project.ratingExternalImpact ?? null,
    ratingCompliance: project.ratingCompliance ?? null,
    projectNarrative: project.projectNarrative ?? "",
    urgency: project.urgency ?? "",
    estimatedDeadline: toDateInputValue(project.estimatedDeadline),
    additionalInfo: project.additionalInfo ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBenefit(key: string) {
    setForm((prev) => ({
      ...prev,
      benefits: prev.benefits.includes(key)
        ? prev.benefits.filter((b) => b !== key)
        : [...prev.benefits, key],
    }));
  }

  const updateMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.byId.invalidate({ id: project.id });
      utils.project.list.invalidate();
      toast.success("Solicitação atualizada");
      onSaved();
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível salvar as alterações.");
    },
  });

  function handleSave() {
    const selectedArea = areas.find((a) => a.value === form.areaSlug);
    const selectedTheme = (themesByArea[form.areaSlug] ?? []).find(
      (t) => t.value === form.themeSlug
    );

    updateMutation.mutate({
      id: project.id,
      title: form.title,
      description: form.description || undefined,
      areaId: selectedArea?.id ?? null,
      themeId: selectedTheme?.id ?? null,
      targetAudience: form.targetAudience || null,
      expectedUsers: form.expectedUsers || null,
      hasExistingSystem: form.hasExistingSystem || null,
      existingSystemDetails: form.existingSystemDetails || null,
      hasCurrentApplication: form.hasCurrentApplication || null,
      currentApplicationDetails: form.currentApplicationDetails || null,
      peopleInvolved: form.peopleInvolved ? parseInt(form.peopleInvolved, 10) : null,
      peopleInvolvedDetails: form.peopleInvolvedDetails || null,
      taskDurationHours: form.taskDurationHours ? parseFloat(form.taskDurationHours) : null,
      processFrequency: form.processFrequency || null,
      benefits: form.benefits,
      benefitsDetails: form.benefitsDetails || null,
      monthlyHoursSaved: form.monthlyHoursSaved ? parseFloat(form.monthlyHoursSaved) : null,
      ratingErrorReduction: form.ratingErrorReduction,
      ratingProcessCriticality: form.ratingProcessCriticality,
      ratingInternalImpact: form.ratingInternalImpact,
      ratingExternalImpact: form.ratingExternalImpact,
      ratingCompliance: form.ratingCompliance,
      projectNarrative: form.projectNarrative || null,
      urgency: form.urgency || null,
      estimatedDeadline: form.estimatedDeadline ? new Date(form.estimatedDeadline) : null,
      additionalInfo: form.additionalInfo || null,
    });
  }

  const statusConfig = STATUS_CONFIG[project.status];
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (key) => SOLUTION_TYPES.find((s) => s.value === key)?.label ?? key
  );

  return (
    <div className="space-y-6">
      <DetailSection title="Básico">
        <FieldRow label="ID do projeto" value={project.id} />
        <FieldRow label="Status" value={statusConfig.label} />
        <FieldRow label="Prioridade" value={priorityConfig.label} />
        <FieldRow label="Empresa" value={project.companyName} />
        <FieldRow label="Cliente (ID)" value={project.clientId} />
        <FieldRow label="Desenvolvedor (ID)" value={project.developerId} />
        <FieldRow label="Criado em" value={formatDate(project.createdAt)} />
        <FieldRow label="Última atualização" value={formatDate(project.updatedAt)} />
        <FieldRow label="Tipo / Plataforma" value={project.projectType} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-title">Título</Label>
          <Input
            id="edit-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-description">Descrição</Label>
          <Textarea
            id="edit-description"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Área</Label>
          <Select
            value={form.areaSlug}
            onValueChange={(v) => {
              set("areaSlug", v);
              set("themeSlug", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tema</Label>
          <Select
            value={form.themeSlug}
            onValueChange={(v) => set("themeSlug", v)}
            disabled={!form.areaSlug}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(themesByArea[form.areaSlug] ?? []).map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </DetailSection>

      <DetailSection title="Envolvidos & contexto atual">
        <div className="space-y-1.5">
          <Label htmlFor="edit-targetAudience">Público-alvo</Label>
          <Input
            id="edit-targetAudience"
            value={form.targetAudience}
            onChange={(e) => set("targetAudience", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-expectedUsers">Usuários esperados</Label>
          <Input
            id="edit-expectedUsers"
            value={form.expectedUsers}
            onChange={(e) => set("expectedUsers", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Processo/sistema existente</Label>
          <Select
            value={form.hasExistingSystem}
            onValueChange={(v) => set("hasExistingSystem", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {HAS_EXISTING_SYSTEM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-existingSystemDetails">Detalhes do processo atual</Label>
          <Textarea
            id="edit-existingSystemDetails"
            rows={2}
            value={form.existingSystemDetails}
            onChange={(e) => set("existingSystemDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Aplicação existente hoje</Label>
          <Select
            value={form.hasCurrentApplication}
            onValueChange={(v) => set("hasCurrentApplication", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {HAS_CURRENT_APPLICATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationDetails">
            Detalhes da aplicação existente
          </Label>
          <Textarea
            id="edit-currentApplicationDetails"
            rows={2}
            value={form.currentApplicationDetails}
            onChange={(e) => set("currentApplicationDetails", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
        <div className="space-y-1.5">
          <Label htmlFor="edit-peopleInvolved">Colaboradores envolvidos</Label>
          <Input
            id="edit-peopleInvolved"
            type="number"
            min={0}
            value={form.peopleInvolved}
            onChange={(e) => set("peopleInvolved", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-peopleInvolvedDetails">Detalhes dos colaboradores</Label>
          <Input
            id="edit-peopleInvolvedDetails"
            value={form.peopleInvolvedDetails}
            onChange={(e) => set("peopleInvolvedDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-taskDurationHours">Duração por execução (horas)</Label>
          <Input
            id="edit-taskDurationHours"
            type="number"
            min={0}
            step="0.1"
            value={form.taskDurationHours}
            onChange={(e) => set("taskDurationHours", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Periodicidade</Label>
          <Select
            value={form.processFrequency}
            onValueChange={(v) => set("processFrequency", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {PROCESS_FREQUENCIES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FieldRow label="Horas anuais no processo atual" value={project.currentAnnualHours} />
      </DetailSection>

      <DetailSection title="Funcionalidades & benefícios">
        <FieldRow label="Funcionalidades" value={project.features} />
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Benefícios esperados</Label>
          <div className="space-y-2">
            {BENEFIT_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={form.benefits.includes(option.key)}
                  onCheckedChange={() => toggleBenefit(option.key)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-benefitsDetails">Detalhes dos benefícios</Label>
          <Textarea
            id="edit-benefitsDetails"
            rows={2}
            value={form.benefitsDetails}
            onChange={(e) => set("benefitsDetails", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-monthlyHoursSaved">Horas economizadas por mês</Label>
          <Input
            id="edit-monthlyHoursSaved"
            type="number"
            min={0}
            step="0.1"
            value={form.monthlyHoursSaved}
            onChange={(e) => set("monthlyHoursSaved", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Avaliações">
        <div className="sm:col-span-2 divide-y divide-border/60">
          <RatingRow
            label="Redução de erros"
            value={form.ratingErrorReduction}
            onChange={(v) => set("ratingErrorReduction", v)}
          />
          <RatingRow
            label="Criticidade do processo"
            value={form.ratingProcessCriticality}
            onChange={(v) => set("ratingProcessCriticality", v)}
          />
          <RatingRow
            label="Impacto interno"
            value={form.ratingInternalImpact}
            onChange={(v) => set("ratingInternalImpact", v)}
          />
          <RatingRow
            label="Impacto externo"
            value={form.ratingExternalImpact}
            onChange={(v) => set("ratingExternalImpact", v)}
          />
          <RatingRow
            label="Atendimento a políticas"
            value={form.ratingCompliance}
            onChange={(v) => set("ratingCompliance", v)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Narrativa & prazo">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-projectNarrative">Narrativa do processo</Label>
          <Textarea
            id="edit-projectNarrative"
            rows={3}
            value={form.projectNarrative}
            onChange={(e) => set("projectNarrative", e.target.value)}
          />
        </div>
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
        <div className="space-y-1.5">
          <Label htmlFor="edit-estimatedDeadline">Prazo limite</Label>
          <Input
            id="edit-estimatedDeadline"
            type="date"
            value={form.estimatedDeadline}
            onChange={(e) => set("estimatedDeadline", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="edit-additionalInfo">Informações adicionais</Label>
          <Textarea
            id="edit-additionalInfo"
            rows={2}
            value={form.additionalInfo}
            onChange={(e) => set("additionalInfo", e.target.value)}
          />
        </div>
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
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Campos técnicos/financeiros continuam só editáveis em
            "Especificação" — não fazem parte deste formulário.
          </p>
        </DetailSection>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={updateMutation.isPending}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project-request-edit-form.tsx`. Se aparecer erro de tipo em `form.benefits` (`string[]` vs `never[]` no estado inicial), garanta que o `useState` está inferindo `string[]` — se necessário, tipar explicitamente `useState<{ ...; benefits: string[]; ... }>(...)`.

- [ ] **Step 3: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros no arquivo criado.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-request-edit-form.tsx
git commit -m "feat: add inline edit form for project solicitation fields"
```

---

### Task 6: Ligar o modo de edição em `ProjectDetailSections` e na página `/projeto/[id]`

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx` (imports, assinatura do componente, início do corpo)
- Modify: `src/app/(private)/projeto/[id]/page.tsx:146`

- [ ] **Step 1: Adicionar imports e novo estado em `project-detail-sections.tsx`**

No topo do arquivo, logo abaixo do import `import { DetailSection, FieldRow } from "@/shared/components/detail-section";` (adicionado no Task 4), adicione:

```tsx
import { useState } from "react";
import { Button } from "@/src/shared/components/ui/button";
import { Pencil } from "lucide-react";
import { ProjectRequestEditForm } from "@/shared/components/project-request-edit-form";
```

(O import de `"use client"` já está no topo do arquivo — sem mudança ali.)

- [ ] **Step 2: Trocar a assinatura de `ProjectDetailSections` e adicionar a lógica de `canEdit`**

Troque:

```tsx
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
```

por:

```tsx
export function ProjectDetailSections({
  project,
  viewerRole,
  currentUserId,
  allowEdit = false,
}: {
  project: Project;
  viewerRole: UserRole | undefined;
  currentUserId?: string;
  allowEdit?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const statusConfig = STATUS_CONFIG[project.status];
  const priorityConfig = PRIORITY_CONFIG[project.priority];
  const canSeeTechnical =
    viewerRole === "admin" || viewerRole === "developer" || viewerRole === "super_admin";
  const isArchitect = viewerRole === "admin" || viewerRole === "super_admin";
  const isOwner = !!currentUserId && project.clientId === currentUserId;
  const canEdit =
    allowEdit &&
    (isArchitect ||
      (isOwner && project.status !== "completed" && project.status !== "cancelled"));

  if (isEditing) {
    return (
      <ProjectRequestEditForm
        project={project}
        viewerRole={viewerRole}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    );
  }
```

- [ ] **Step 3: Adicionar o botão "Editar" no início do `return` da visualização só-leitura**

Troque:

```tsx
  return (
    <div className="space-y-6">
      <DetailSection title="Básico">
```

por:

```tsx
  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}

      <DetailSection title="Básico">
```

- [ ] **Step 4: Passar `currentUserId` e `allowEdit` a partir de `/projeto/[id]/page.tsx`**

Em `src/app/(private)/projeto/[id]/page.tsx:146`, troque:

```tsx
          <ProjectDetailSections project={project} viewerRole={user?.role} />
```

por:

```tsx
          <ProjectDetailSections
            project={project}
            viewerRole={user?.role}
            currentUserId={user?.id}
            allowEdit
          />
```

Não mexemos em `project-details.modal.tsx` (o quick-view do admin) — ele não passa `allowEdit`, então continua exatamente como hoje, só-leitura.

- [ ] **Step 5: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project-detail-sections.tsx` ou `projeto/[id]/page.tsx`.

- [ ] **Step 6: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros.

- [ ] **Step 7: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx "src/app/(private)/projeto/[id]/page.tsx"
git commit -m "feat: wire inline edit mode into the project detail page"
```

---

### Task 7: Verificação manual no navegador

**Files:** nenhum (só teste manual)

- [ ] **Step 1: Subir o servidor de dev**

Run: `cd "c:/Users/danie/Pipeline" && npm run dev`

- [ ] **Step 2: Testar como cliente-criador, projeto ativo**

1. Logar como `client`, abrir um projeto próprio (`clientId` = esse usuário) com status diferente de "Concluído"/"Cancelado" em `/projeto/[id]`.
2. Confirmar que o botão "Editar" aparece.
3. Clicar em "Editar" → confirmar que as seções viram formulário (título, descrição, área/tema, envolvidos, diagnóstico operacional, benefícios, avaliações, narrativa/prazo) e que "Diagnóstico técnico" não aparece (cliente não vê essa seção).
4. Mudar um valor (ex.: urgência) e clicar em "Salvar alterações" → confirmar toast de sucesso, volta pra visualização só-leitura com o novo valor refletido.
5. Confirmar em "Atividade Recente" (sidebar da página) que apareceu uma entrada "Solicitação editada" com o campo alterado listado.
6. Abrir de novo, clicar em "Editar", mudar algo e clicar em "Cancelar" → confirmar que volta pro valor original (nada foi salvo).

- [ ] **Step 3: Testar como cliente-criador, projeto concluído/cancelado**

1. Mover um projeto próprio para "Concluído" (ou usar um que já esteja), abrir em `/projeto/[id]`.
2. Confirmar que o botão "Editar" **não aparece**.

- [ ] **Step 4: Testar como cliente que não é dono do projeto**

1. Logar como um `client` diferente do `clientId` do projeto (se o app permitir navegar até lá, ex. testando a URL diretamente).
2. Confirmar que o botão "Editar" não aparece.

- [ ] **Step 5: Testar como admin/super_admin**

1. Logar como `admin`, abrir qualquer projeto (inclusive um "Concluído"/"Cancelado") em `/projeto/[id]`.
2. Confirmar que "Editar" aparece **mesmo com o projeto concluído/cancelado**.
3. Editar um campo de solicitação e salvar — confirmar sucesso e a entrada no log de atividade.
4. Confirmar que o modal "Detalhes do projeto" (aberto a partir de `/admin/projetos`) continua **sem** botão de edição — comportamento inalterado ali.

- [ ] **Step 6: Commit final (se algo precisar de ajuste)**

Se algum ajuste for necessário durante a verificação manual, aplique a mudança e:

```bash
git add -A
git commit -m "fix: adjustments from manual verification of post-submission editing"
```
