# Meus Robôs — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao cliente uma tela ("Meus Robôs", `/cliente/robos`) que lista todo projeto seu já concluído (`status = DONE`) com status operacional (Ativo/Pausado/Com problema) e economia acumulada — atualizados manualmente pelo admin, nunca por telemetria automática — mais um jeito simples de reportar problema.

**Architecture:** Três campos novos em `Project` (`operationalStatus`, `accumulatedSavingBRL`, `operationalStatusUpdatedAt`) e um campo novo em `Comment` (`isIncident`), editáveis via a mutation `project.update`/`comment.create` já existentes (sem endpoint novo). O admin edita os dois primeiros num bloco novo dentro do `ProjectDetailsModal` já existente. O cliente vê tudo numa tabela nova (`/cliente/robos`), e "reportar problema" abre um modal simples que cria um `Comment` marcado como incidente, reaproveitando o mesmo canal `GLOBAL` do chat do projeto.

**Tech Stack:** Next.js (App Router), tRPC, Prisma, React, shadcn/ui (`Table`, `Badge`, `Select`, `Input`, `Textarea`, `Button`), `sonner` (toast), `lucide-react` (ícones).

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest/Playwright). A verificação de cada task é feita via `npx tsc --noEmit` (checagem de tipos), `npm run lint` e teste manual no navegador (Task 12) — mesmo padrão já usado nos planos anteriores deste projeto (ver `docs/superpowers/plans/2026-07-13-edicao-solicitacao-pos-envio.md`).

**Spec:** `docs/superpowers/specs/2026-07-14-meus-robos-operacao-design.md`

---

### Task 1: Schema Prisma — campos operacionais e migração

**Files:**
- Modify: `prisma/schema.prisma:124-209` (model `Project`)
- Modify: `prisma/schema.prisma:279-284` (região de enums)
- Modify: `prisma/schema.prisma:361-379` (model `Comment`)

- [ ] **Step 1: Adicionar o bloco de campos operacionais ao model `Project`**

Em `prisma/schema.prisma`, localize o final do model `Project` (logo antes dos relacionamentos):

```prisma
  // Esforço de implementação (preenchido pelo arquiteto, nunca exposto ao cliente)
  implementationEffortDays Int? // dias úteis estimados de desenvolvimento do robô
  implementationWave       Int? // 1 = onda 1 (priorizada), 2 = onda 2, null = não classificado ainda
  waveOrder                Int? // ordem de execução dentro da onda (menor = primeiro), null = ainda não sequenciado

  // Relacionamentos
```

Troque por (adiciona o bloco novo entre os dois):

```prisma
  // Esforço de implementação (preenchido pelo arquiteto, nunca exposto ao cliente)
  implementationEffortDays Int? // dias úteis estimados de desenvolvimento do robô
  implementationWave       Int? // 1 = onda 1 (priorizada), 2 = onda 2, null = não classificado ainda
  waveOrder                Int? // ordem de execução dentro da onda (menor = primeiro), null = ainda não sequenciado

  // Operacao pos-entrega (preenchido manualmente pelo admin, SEMPRE visivel ao cliente
  // — ao contrario dos campos tecnico/financeiro acima, que sao escondidos dele)
  operationalStatus          RobotOperationalStatus?
  accumulatedSavingBRL        Float?
  operationalStatusUpdatedAt  DateTime?

  // Relacionamentos
```

- [ ] **Step 2: Adicionar o enum `RobotOperationalStatus`**

Em `prisma/schema.prisma`, localize:

```prisma
enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

// ==========================================
// FASES E TAREFAS DE ESPECIFICACAO
// ==========================================
```

Troque por:

```prisma
enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum RobotOperationalStatus {
  ACTIVE
  PAUSED
  ISSUE
}

// ==========================================
// FASES E TAREFAS DE ESPECIFICACAO
// ==========================================
```

- [ ] **Step 3: Adicionar `isIncident` ao model `Comment`**

Em `prisma/schema.prisma`, localize:

```prisma
model Comment {
  id         String            @id @default(cuid())
  content    String
  visibility CommentVisibility @default(GLOBAL)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
```

Troque por:

```prisma
model Comment {
  id          String            @id @default(cuid())
  content     String
  visibility  CommentVisibility @default(GLOBAL)
  isIncident  Boolean           @default(false)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
```

- [ ] **Step 4: Gerar e aplicar a migração local**

Run: `cd "c:/Users/danie/Pipeline" && npx prisma migrate dev --name add_robot_operational_status`
Expected: prompt de confirmação (se houver) seguido de `The migration has been created and applied successfully` e regeneração do Prisma Client sem erros.

- [ ] **Step 5: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros (o client do Prisma foi regenerado no passo anterior; nenhum código ainda referencia os campos novos).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add operational status/savings fields to Project and isIncident to Comment"
```

---

### Task 2: `project.router.ts` — autorização e gravação dos campos operacionais em `update`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:47-63` (`ARCHITECT_ONLY_FIELDS`)
- Modify: `src/server/trpc/routers/project.router.ts:67-94` (`SOLICITATION_FIELD_LABELS`)
- Modify: `src/server/trpc/routers/project.router.ts:439-484` (schema de input de `update`)
- Modify: `src/server/trpc/routers/project.router.ts:574-586` (corpo da mutation, montagem de `data`)

Os dois campos editáveis (`operationalStatus`, `accumulatedSavingBRL`) precisam ser: (1) aceitos no input; (2) bloqueados para não-arquiteto (reaproveitando a trava que já existe); (3) gravados em `data`, com `operationalStatusUpdatedAt` setado no servidor sempre que qualquer um dos dois mudar (nunca aceito do client — evita spoof de data); (4) listados no `ActivityLog` com rótulo legível.

- [ ] **Step 1: Adicionar as duas chaves a `ARCHITECT_ONLY_FIELDS`**

Em `src/server/trpc/routers/project.router.ts`, localize:

```ts
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
```

Troque por:

```ts
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
  "operationalStatus",
  "accumulatedSavingBRL",
]);
```

- [ ] **Step 2: Adicionar rótulos ao `SOLICITATION_FIELD_LABELS` (para o `ActivityLog`)**

Em `src/server/trpc/routers/project.router.ts`, localize o final do objeto `SOLICITATION_FIELD_LABELS`:

```ts
  taskDurationHours: "Duração por execução",
  processFrequency: "Periodicidade",
};
```

Troque por:

```ts
  taskDurationHours: "Duração por execução",
  processFrequency: "Periodicidade",
  operationalStatus: "Status operacional",
  accumulatedSavingBRL: "Economia acumulada",
};
```

Nota: `operationalStatusUpdatedAt` **não** entra nesse mapa — é setado só no servidor (Step 4 abaixo), nunca chega em `rest`, então nunca apareceria no diff mesmo se incluído.

- [ ] **Step 3: Adicionar os dois campos ao schema zod de `update`**

Em `src/server/trpc/routers/project.router.ts`, localize o final do input de `update`:

```ts
        ratingCompliance: z.number().int().min(1).max(5).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
```

Troque por:

```ts
        ratingCompliance: z.number().int().min(1).max(5).nullable().optional(),
        operationalStatus: z.enum(["ACTIVE", "PAUSED", "ISSUE"]).nullable().optional(),
        accumulatedSavingBRL: z.number().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
```

- [ ] **Step 4: Gravar os campos em `data`, com `operationalStatusUpdatedAt` calculado no servidor**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro do corpo da mutation, logo após o bloco de `taskDurationHours`/`processFrequency`):

```ts
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
```

Troque por:

```ts
      if (rest.taskDurationHours !== undefined || rest.processFrequency !== undefined) {
        const nextDuration =
          rest.taskDurationHours !== undefined ? rest.taskDurationHours : current.taskDurationHours;
        const nextFrequency =
          rest.processFrequency !== undefined ? rest.processFrequency : current.processFrequency;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }
      if (rest.operationalStatus !== undefined || rest.accumulatedSavingBRL !== undefined) {
        if (rest.operationalStatus !== undefined) data.operationalStatus = rest.operationalStatus;
        if (rest.accumulatedSavingBRL !== undefined)
          data.accumulatedSavingBRL = rest.accumulatedSavingBRL;
        data.operationalStatusUpdatedAt = new Date();
      }

      const changedFieldLabels = describeChangedFields(
```

- [ ] **Step 5: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project.router.ts`.

- [ ] **Step 6: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros no arquivo modificado.

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: allow admin to set operational status and accumulated saving via project.update"
```

---

### Task 3: `project.router.ts` — devolver os campos operacionais em `list` e `byId`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:196-199` (retorno de `list`)
- Modify: `src/server/trpc/routers/project.router.ts:272-273` (retorno de `byId`)

Diferente dos campos técnico/financeiro (que ficam de fora do retorno de propósito, para não vazar ao cliente), estes 3 campos **devem** aparecer no retorno — é assim que a tela `/cliente/robos` vai ler o dado.

- [ ] **Step 1: Adicionar os campos ao retorno de `list`**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro do `.map` de `list`):

```ts
        complexity: p.complexity ?? undefined,
        robotSchedule: p.robotSchedule ?? undefined,
        estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
        createdAt: p.createdAt,
```

Troque por:

```ts
        complexity: p.complexity ?? undefined,
        robotSchedule: p.robotSchedule ?? undefined,
        estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
        operationalStatus: p.operationalStatus ?? undefined,
        accumulatedSavingBRL: p.accumulatedSavingBRL ?? undefined,
        operationalStatusUpdatedAt: p.operationalStatusUpdatedAt ?? undefined,
        createdAt: p.createdAt,
```

- [ ] **Step 2: Adicionar os campos ao retorno de `byId`**

Em `src/server/trpc/routers/project.router.ts`, localize (dentro do `return` de `byId`):

```ts
        hourlyRateBRL: project.hourlyRateBRL ?? undefined,
        estimatedAnnualSavingBRL: project.estimatedAnnualSavingBRL ?? undefined,
        implementationEffortDays: project.implementationEffortDays ?? undefined,
```

Troque por:

```ts
        hourlyRateBRL: project.hourlyRateBRL ?? undefined,
        estimatedAnnualSavingBRL: project.estimatedAnnualSavingBRL ?? undefined,
        operationalStatus: project.operationalStatus ?? undefined,
        accumulatedSavingBRL: project.accumulatedSavingBRL ?? undefined,
        operationalStatusUpdatedAt: project.operationalStatusUpdatedAt ?? undefined,
        implementationEffortDays: project.implementationEffortDays ?? undefined,
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros (o tipo de retorno dessas queries é inferido a partir do próprio objeto retornado, não checado contra o tipo `Project` do frontend, então não há acoplamento entre este arquivo e a Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: return operational status fields from project.list and project.byId"
```

---

### Task 4: `comment.router.ts` — suporte a `isIncident`

**Files:**
- Modify: `src/server/trpc/routers/comment.router.ts` (todo o arquivo, 101 linhas)

- [ ] **Step 1: Adicionar `isIncident` ao input e à gravação de `create`, e ao retorno de todas as queries/mutations**

Em `src/server/trpc/routers/comment.router.ts`, substitua o arquivo inteiro por:

```ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const commentRouter = router({
  byProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        visibility: z.enum(["GLOBAL", "INTERNAL", "ALL"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const requestingUser = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });

      // Clientes só podem ver mensagens do canal global
      const isClient = requestingUser?.role === "CLIENT";
      const effectiveVisibility = isClient ? "GLOBAL" : input.visibility;

      const comments = await ctx.db.comment.findMany({
        where: {
          projectId: input.projectId,
          ...(effectiveVisibility !== "ALL" ? { visibility: effectiveVisibility } : {}),
        },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      });
      return comments.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        userId: c.userId,
        userName: c.user.name,
        userRole: c.user.role.toLowerCase() as "client" | "developer" | "admin",
        content: c.content,
        visibility: c.visibility,
        isIncident: c.isIncident,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        content: z.string().min(1),
        visibility: z.enum(["GLOBAL", "INTERNAL"]).default("GLOBAL"),
        isIncident: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          content: input.content,
          visibility: input.visibility,
          isIncident: input.isIncident,
        },
        include: { user: { select: { name: true, role: true } } },
      });
      return {
        id: comment.id,
        projectId: comment.projectId,
        userId: comment.userId,
        userName: comment.user.name,
        userRole: comment.user.role.toLowerCase(),
        content: comment.content,
        visibility: comment.visibility,
        isIncident: comment.isIncident,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.update({
        where: { id: input.id },
        data: { content: input.content },
        include: { user: { select: { name: true, role: true } } },
      });
      return {
        id: comment.id,
        projectId: comment.projectId,
        userId: comment.userId,
        userName: comment.user.name,
        userRole: comment.user.role.toLowerCase(),
        content: comment.content,
        visibility: comment.visibility,
        isIncident: comment.isIncident,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.comment.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `comment.router.ts` (o tipo de retorno é inferido; o frontend ainda não usa `isIncident` — isso vem na Task 6 — então não há consumidor quebrado ainda).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/comment.router.ts
git commit -m "feat: add isIncident flag to comment create/read"
```

---

### Task 5: Tipos compartilhados e config de status operacional

**Files:**
- Modify: `src/shared/types/index.ts:31-82` (`Project`)
- Modify: `src/shared/types/index.ts:122-133` (`Comment`)
- Modify: `src/shared/types/index.ts:201-210` (região de `STATUS_CONFIG`)

- [ ] **Step 1: Adicionar os campos operacionais a `Project` e o novo tipo/config**

Em `src/shared/types/index.ts`, localize:

```ts
  solutionTypes?: string[];
  mainTool?: string;
  executionStrategy?: string;
  architectNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

Troque por:

```ts
  solutionTypes?: string[];
  mainTool?: string;
  executionStrategy?: string;
  architectNotes?: string;
  // Operacao pos-entrega (admin escreve, cliente sempre ve)
  operationalStatus?: RobotOperationalStatus;
  accumulatedSavingBRL?: number;
  operationalStatusUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RobotOperationalStatus = "ACTIVE" | "PAUSED" | "ISSUE";
```

- [ ] **Step 2: Adicionar `isIncident` a `Comment`**

Em `src/shared/types/index.ts`, localize:

```ts
export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  content: string;
  visibility: CommentVisibility;
  attachments?: ProjectFile[];
  createdAt: Date;
  updatedAt?: Date;
}
```

Troque por:

```ts
export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  content: string;
  visibility: CommentVisibility;
  isIncident?: boolean;
  attachments?: ProjectFile[];
  createdAt: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 3: Adicionar `ROBOT_OPERATIONAL_STATUS_CONFIG`**

Em `src/shared/types/index.ts`, localize:

```ts
export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string }
> = {
  low: { label: "Baixa", color: "text-muted-foreground" },
  medium: { label: "Média", color: "text-amber-500" },
  high: { label: "Alta", color: "text-destructive" },
  urgent: { label: "Urgente", color: "text-destructive font-semibold" },
};
```

Troque por (adiciona um novo config logo depois):

```ts
export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string }
> = {
  low: { label: "Baixa", color: "text-muted-foreground" },
  medium: { label: "Média", color: "text-amber-500" },
  high: { label: "Alta", color: "text-destructive" },
  urgent: { label: "Urgente", color: "text-destructive font-semibold" },
};

export const ROBOT_OPERATIONAL_STATUS_CONFIG: Record<
  RobotOperationalStatus,
  { label: string; color: string }
> = {
  ACTIVE: { label: "Ativo", color: "bg-emerald-500/20 text-emerald-600" },
  PAUSED: { label: "Pausado", color: "bg-muted text-muted-foreground" },
  ISSUE: { label: "Com problema", color: "bg-destructive/20 text-destructive" },
};
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `src/shared/types/index.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add RobotOperationalStatus type and config to shared types"
```

---

### Task 6: Mapeadores do frontend — `projects-context.tsx` e `comments-context.tsx`

**Files:**
- Modify: `src/shared/context/projects-context.tsx:40-122` (`mapProject`)
- Modify: `src/shared/context/comments-context.tsx:15,50-59,87-103` (`addComment`, `mapComment`)

- [ ] **Step 1: Repassar os campos operacionais em `mapProject`**

Em `src/shared/context/projects-context.tsx`, localize a assinatura de `mapProject` (o parâmetro tipado):

```ts
  complexity?: string | null;
  robotSchedule?: string | null;
  estimatedAnnualSavingBRL?: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
```

Troque por:

```ts
  complexity?: string | null;
  robotSchedule?: string | null;
  estimatedAnnualSavingBRL?: number | null;
  operationalStatus?: string | null;
  accumulatedSavingBRL?: number | null;
  operationalStatusUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
```

Em seguida, localize o final do objeto retornado por `mapProject`:

```ts
    complexity: p.complexity ?? undefined,
    robotSchedule: p.robotSchedule ?? undefined,
    estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

Troque por:

```ts
    complexity: p.complexity ?? undefined,
    robotSchedule: p.robotSchedule ?? undefined,
    estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
    operationalStatus: (p.operationalStatus as Project["operationalStatus"]) ?? undefined,
    accumulatedSavingBRL: p.accumulatedSavingBRL ?? undefined,
    operationalStatusUpdatedAt: p.operationalStatusUpdatedAt ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
```

- [ ] **Step 2: Repassar `isIncident` em `addComment` e `mapComment`**

Em `src/shared/context/comments-context.tsx`, localize:

```ts
  addComment: (comment: Omit<Comment, "id" | "createdAt"> & { visibility?: CommentVisibility }) => void;
```

Troque por:

```ts
  addComment: (
    comment: Omit<Comment, "id" | "createdAt"> & {
      visibility?: CommentVisibility;
      isIncident?: boolean;
    }
  ) => void;
```

Em seguida, localize:

```ts
  const addComment = useCallback(
    (comment: Omit<Comment, "id" | "createdAt"> & { visibility?: CommentVisibility }) => {
      createComment.mutate({
        projectId: comment.projectId,
        content: comment.content,
        visibility: comment.visibility ?? "GLOBAL",
      });
    },
    [createComment]
  );
```

Troque por:

```ts
  const addComment = useCallback(
    (
      comment: Omit<Comment, "id" | "createdAt"> & {
        visibility?: CommentVisibility;
        isIncident?: boolean;
      }
    ) => {
      createComment.mutate({
        projectId: comment.projectId,
        content: comment.content,
        visibility: comment.visibility ?? "GLOBAL",
        isIncident: comment.isIncident ?? false,
      });
    },
    [createComment]
  );
```

Por fim, localize `mapComment`:

```ts
function mapComment(c: Record<string, unknown>): Comment {
  return {
    id: c.id as string,
    projectId: c.projectId as string,
    userId: c.userId as string,
    userName: c.userName as string,
    userRole: c.userRole as Comment["userRole"],
    content: c.content as string,
    visibility: (c.visibility as CommentVisibility) ?? "GLOBAL",
    createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt as string),
    updatedAt: c.updatedAt
      ? c.updatedAt instanceof Date
        ? c.updatedAt
        : new Date(c.updatedAt as string)
      : undefined,
  };
}
```

Troque por:

```ts
function mapComment(c: Record<string, unknown>): Comment {
  return {
    id: c.id as string,
    projectId: c.projectId as string,
    userId: c.userId as string,
    userName: c.userName as string,
    userRole: c.userRole as Comment["userRole"],
    content: c.content as string,
    visibility: (c.visibility as CommentVisibility) ?? "GLOBAL",
    isIncident: (c.isIncident as boolean) ?? false,
    createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt as string),
    updatedAt: c.updatedAt
      ? c.updatedAt instanceof Date
        ? c.updatedAt
        : new Date(c.updatedAt as string)
      : undefined,
  };
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `projects-context.tsx` ou `comments-context.tsx`.

- [ ] **Step 4: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros.

- [ ] **Step 5: Commit**

```bash
git add src/shared/context/projects-context.tsx src/shared/context/comments-context.tsx
git commit -m "feat: forward operational status and isIncident through frontend mappers"
```

---

### Task 7: Item de navegação "Meus Robôs" na sidebar do cliente

**Files:**
- Modify: `src/shared/components/app-sidebar.tsx:17-30` (imports de ícones)
- Modify: `src/shared/components/app-sidebar.tsx:43-50` (`clientSections`)

- [ ] **Step 1: Adicionar o ícone `Bot` aos imports**

Em `src/shared/components/app-sidebar.tsx`, localize:

```tsx
import {
  Building2,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Shield,
  Tag,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
```

Troque por:

```tsx
import {
  Bot,
  Building2,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Shield,
  Tag,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: Adicionar o item de navegação**

Em `src/shared/components/app-sidebar.tsx`, localize:

```tsx
const clientSections: NavSection[] = [
  {
    label: "Projetos",
    items: [
      { href: "/cliente/solicitar", label: "Solicitar Projeto", icon: PlusCircle },
      { href: "/cliente", label: "Meus Projetos", icon: FolderKanban },
    ],
  },
```

Troque por:

```tsx
const clientSections: NavSection[] = [
  {
    label: "Projetos",
    items: [
      { href: "/cliente/solicitar", label: "Solicitar Projeto", icon: PlusCircle },
      { href: "/cliente", label: "Meus Projetos", icon: FolderKanban },
      { href: "/cliente/robos", label: "Meus Robôs", icon: Bot },
    ],
  },
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros (a rota `/cliente/robos` ainda não existe até a Task 8 — isso não quebra a compilação, só o link ficaria 404 até lá).

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/app-sidebar.tsx
git commit -m "feat: add Meus Robos nav item to client sidebar"
```

---

### Task 8: Nova página `/cliente/robos` (tabela)

**Files:**
- Create: `src/app/(private)/cliente/robos/page.tsx`

- [ ] **Step 1: Criar a página**

```tsx
"use client";

import { useState } from "react";
import { useProjects } from "@/shared/context/projects-context";
import {
  CompanyFilter,
  filterProjectsByCompany,
  ALL_COMPANIES_VALUE,
} from "@/shared/components/company-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { Badge } from "@/src/shared/components/ui/badge";
import { Button } from "@/src/shared/components/ui/button";
import { formatCurrency, formatDate } from "@/shared/utils";
import { ROBOT_OPERATIONAL_STATUS_CONFIG } from "@/shared/types";
import type { Project } from "@/shared/types";
import { useModal } from "@/shared/context/modal-context";
import { ReportIncidentModal } from "./_components/report-incident.modal";

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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meus Robôs</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe os robôs já em operação e a economia acumulada
          </p>
        </div>
        <CompanyFilter
          projects={doneProjects}
          value={companyFilter}
          onChange={setCompanyFilter}
        />
      </header>

      {visibleProjects.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum robô em operação ainda — assim que um projeto for concluído, ele
          aparece aqui.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Robô</TableHead>
              {showCompanyColumn && <TableHead>Empresa</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Economia acumulada</TableHead>
              <TableHead>Atualizado em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleProjects.map((project) => {
              const statusConfig = project.operationalStatus
                ? ROBOT_OPERATIONAL_STATUS_CONFIG[project.operationalStatus]
                : null;
              return (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.title}</TableCell>
                  {showCompanyColumn && (
                    <TableCell>{project.companyName ?? "—"}</TableCell>
                  )}
                  <TableCell>
                    <Badge variant="outline" className={statusConfig?.color}>
                      {statusConfig?.label ?? "Sem status"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {project.accumulatedSavingBRL != null
                      ? formatCurrency(project.accumulatedSavingBRL)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {project.operationalStatusUpdatedAt
                      ? formatDate(project.operationalStatusUpdatedAt)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReportIncident(project)}
                    >
                      Reportar problema
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: erro esperado `Cannot find module './_components/report-incident.modal'` — isso é normal, o arquivo é criado na Task 9. Confirme que não há **nenhum outro** erro além desse.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/cliente/robos/page.tsx"
git commit -m "feat: add Meus Robos client page listing operational status of delivered projects"
```

---

### Task 9: `ReportIncidentModal`

**Files:**
- Create: `src/app/(private)/cliente/robos/_components/report-incident.modal.tsx`

- [ ] **Step 1: Criar o modal**

```tsx
"use client";

import { useState } from "react";
import type { ModalProps } from "@/shared/types/modal";
import { Button } from "@/src/shared/components/ui/button";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { useComments } from "@/shared/context/comments-context";
import { useAuth } from "@/shared/context/auth-context";

interface ReportIncidentModalData {
  projectId: string;
  projectTitle: string;
}

export function ReportIncidentModal({
  data,
  onClose,
}: ModalProps<ReportIncidentModalData>) {
  const { user } = useAuth();
  const { addComment } = useComments(data?.projectId);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!data) return null;
  const { projectId, projectTitle } = data;

  function handleSubmit() {
    if (!content.trim() || !user) return;
    setSubmitting(true);
    addComment({
      projectId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      content: content.trim(),
      visibility: "GLOBAL",
      isIncident: true,
    });
    setSubmitting(false);
    onClose();
  }

  return (
    <div className="flex flex-col gap-4 rounded-[8px] bg-white p-5">
      <div>
        <h2 className="text-lg font-bold text-[#0F172A]">Reportar problema</h2>
        <p className="text-sm text-[#6B7280]">{projectTitle}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="incident-content">Descreva o problema</Label>
        <Textarea
          id="incident-content"
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Ex.: o robô parou de rodar desde ontem à noite..."
          autoFocus
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!content.trim() || submitting}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem erros relacionados a `report-incident.modal.tsx` ou `cliente/robos/page.tsx` (o erro de módulo faltando da Task 8 deve ter sumido agora).

- [ ] **Step 3: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/cliente/robos/_components/report-incident.modal.tsx"
git commit -m "feat: add report incident modal reusing the existing comment system"
```

---

### Task 10: Bloco de edição do status operacional no `ProjectDetailsModal` (admin)

**Files:**
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`

Segue exatamente o padrão já existente do bloco "Corrigir Aplicação existente hoje" (mesmo arquivo, `Select` + botão "Salvar" chamando `project.update` direto), só que gated por `project.status === "completed"` em vez de sempre visível.

- [ ] **Step 1: Adicionar imports**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`, localize:

```tsx
import { HAS_CURRENT_APPLICATION_OPTIONS } from "@/shared/constants/project-taxonomy";
import { Loader2, Presentation } from "lucide-react";
```

Troque por:

```tsx
import { HAS_CURRENT_APPLICATION_OPTIONS } from "@/shared/constants/project-taxonomy";
import { ROBOT_OPERATIONAL_STATUS_CONFIG } from "@/shared/types";
import type { RobotOperationalStatus } from "@/shared/types";
import { Input } from "@/src/shared/components/ui/input";
import { Loader2, Presentation } from "lucide-react";
```

- [ ] **Step 2: Adicionar estado e mutation dedicados**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`, localize:

```tsx
  const updateHasCurrentApplicationMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      if (data?.project.id) utils.project.byId.invalidate({ id: data.project.id });
      toast.success("Campo atualizado");
      setPendingHasCurrentApplication(undefined);
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível atualizar o campo.");
    },
  });
```

Troque por:

```tsx
  const updateHasCurrentApplicationMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      if (data?.project.id) utils.project.byId.invalidate({ id: data.project.id });
      toast.success("Campo atualizado");
      setPendingHasCurrentApplication(undefined);
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível atualizar o campo.");
    },
  });

  // Status operacional pos-entrega — só admin edita, cliente ve em /cliente/robos.
  const [pendingOperationalStatus, setPendingOperationalStatus] = useState<
    RobotOperationalStatus | undefined
  >(undefined);
  const [pendingAccumulatedSaving, setPendingAccumulatedSaving] = useState<string>("");
  const updateOperationalStatusMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      if (data?.project.id) utils.project.byId.invalidate({ id: data.project.id });
      toast.success("Status operacional atualizado");
      setPendingOperationalStatus(undefined);
      setPendingAccumulatedSaving("");
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível atualizar o status operacional.");
    },
  });
```

- [ ] **Step 3: Adicionar o bloco de edição na UI**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`, localize o final do bloco existente "Corrigir Aplicação existente hoje" (o `</div>` seguido do fechamento do bloco condicional):

```tsx
            <Button
              size="sm"
              className="h-8"
              disabled={
                !pendingHasCurrentApplication ||
                pendingHasCurrentApplication === project.hasCurrentApplication ||
                updateHasCurrentApplicationMutation.isPending
              }
              onClick={() =>
                updateHasCurrentApplicationMutation.mutate({
                  id: project.id,
                  hasCurrentApplication: pendingHasCurrentApplication,
                })
              }
            >
              {updateHasCurrentApplicationMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}
```

Troque por:

```tsx
            <Button
              size="sm"
              className="h-8"
              disabled={
                !pendingHasCurrentApplication ||
                pendingHasCurrentApplication === project.hasCurrentApplication ||
                updateHasCurrentApplicationMutation.isPending
              }
              onClick={() =>
                updateHasCurrentApplicationMutation.mutate({
                  id: project.id,
                  hasCurrentApplication: pendingHasCurrentApplication,
                })
              }
            >
              {updateHasCurrentApplicationMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )}

        {(user?.role === "admin" || user?.role === "super_admin") &&
          project.status === "completed" &&
          !isLoading && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-3">
              <Label htmlFor="operational-status" className="text-xs text-muted-foreground">
                Status operacional:
              </Label>
              <Select
                value={pendingOperationalStatus ?? project.operationalStatus ?? undefined}
                onValueChange={(v) => setPendingOperationalStatus(v as RobotOperationalStatus)}
              >
                <SelectTrigger id="operational-status" className="h-8 w-40 text-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROBOT_OPERATIONAL_STATUS_CONFIG).map(([value, cfg]) => (
                    <SelectItem key={value} value={value}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="accumulated-saving" className="text-xs text-muted-foreground">
                Economia acumulada (R$):
              </Label>
              <Input
                id="accumulated-saving"
                type="number"
                min={0}
                step="0.01"
                className="h-8 w-32 text-xs"
                value={
                  pendingAccumulatedSaving ||
                  project.accumulatedSavingBRL?.toString() ||
                  ""
                }
                onChange={(e) => setPendingAccumulatedSaving(e.target.value)}
              />
              <Button
                size="sm"
                className="h-8"
                disabled={updateOperationalStatusMutation.isPending}
                onClick={() =>
                  updateOperationalStatusMutation.mutate({
                    id: project.id,
                    operationalStatus: pendingOperationalStatus ?? project.operationalStatus,
                    accumulatedSavingBRL: pendingAccumulatedSaving
                      ? parseFloat(pendingAccumulatedSaving)
                      : project.accumulatedSavingBRL,
                  })
                }
              >
                {updateOperationalStatusMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project-details.modal.tsx`.

- [ ] **Step 5: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/projetos/_components/project-details.modal.tsx"
git commit -m "feat: let admin set operational status and accumulated saving from project details"
```

---

### Task 11: Badge de incidente no `ProjectChat`

**Files:**
- Modify: `src/shared/components/project-chat.tsx:152-167`

- [ ] **Step 1: Renderizar o badge quando `comment.isIncident`**

Em `src/shared/components/project-chat.tsx`, localize:

```tsx
          <div className={cn("flex-1 max-w-[80%]", isOwn && "flex flex-col items-end")}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">
                {isOwn ? "Você" : comment.userName}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1 py-0 h-4 border", getRoleBadge(comment.userRole))}
              >
                {getRoleLabel(comment.userRole)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.createdAt)}
                {comment.updatedAt && " (editado)"}
              </span>
            </div>
```

Troque por:

```tsx
          <div className={cn("flex-1 max-w-[80%]", isOwn && "flex flex-col items-end")}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">
                {isOwn ? "Você" : comment.userName}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1 py-0 h-4 border", getRoleBadge(comment.userRole))}
              >
                {getRoleLabel(comment.userRole)}
              </Badge>
              {comment.isIncident && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1 py-0 h-4 border border-destructive/40 bg-destructive/10 text-destructive"
                >
                  ⚠️ Incidente
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.createdAt)}
                {comment.updatedAt && " (editado)"}
              </span>
            </div>
```

- [ ] **Step 2: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros em `project-chat.tsx`.

- [ ] **Step 3: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-chat.tsx
git commit -m "feat: highlight incident-flagged comments in the project chat"
```

---

### Task 12: Verificação manual no navegador

**Files:** nenhum (só teste manual)

- [ ] **Step 1: Subir o servidor de dev**

Run: `cd "c:/Users/danie/Pipeline" && npm run dev`

- [ ] **Step 2: Testar como cliente**

1. Logar como `client`, abrir `/cliente/robos` pelo item "Meus Robôs" na sidebar.
2. Se o cliente não tiver nenhum projeto `DONE`/"Concluído", confirmar a mensagem de estado vazio.
3. Marcar um projeto existente como "Concluído" (via kanban em `/cliente` ou como admin) e recarregar `/cliente/robos` — confirmar que ele aparece na tabela com badge "Sem status" (ainda não classificado pelo admin) e "—" nas colunas de economia/atualização.
4. Clicar em "Reportar problema", escrever um texto e enviar — confirmar que o modal fecha e que a mensagem aparece no chat do projeto (`/projeto/[id]`, aba "Chat do Projeto") com o badge "⚠️ Incidente".
5. Confirmar que o filtro por empresa (se o cliente tiver mais de uma) funciona igual ao de "Meus Projetos".

- [ ] **Step 3: Testar como admin**

1. Logar como `admin`, abrir o mesmo projeto `DONE` em "Detalhes do projeto" (`/admin/projetos`).
2. Confirmar que o bloco "Status operacional" aparece (só aparece porque o projeto está "Concluído").
3. Selecionar "Ativo", preencher economia acumulada (ex.: `1500.50`) e clicar em "Salvar" — confirmar toast de sucesso.
4. Recarregar `/cliente/robos` como o cliente dono do projeto — confirmar que o badge virou "Ativo" (verde), a economia mostra `R$ 1.500,50` e a data de atualização é a de hoje.
5. Confirmar em "Atividade Recente" do projeto (`/projeto/[id]`) que apareceu uma entrada listando "Status operacional, Economia acumulada".
6. Abrir um projeto que **não** está "Concluído" em "Detalhes do projeto" — confirmar que o bloco de status operacional **não** aparece.

- [ ] **Step 4: Testar autorização**

1. Via chamada direta (ex.: ferramenta de API do navegador ou script) tentar chamar `project.update` com `{ id, operationalStatus: "ACTIVE" }` autenticado como `client` — confirmar que retorna `FORBIDDEN` ("Este campo só pode ser alterado por um administrador.").

- [ ] **Step 5: Commit final (se algo precisar de ajuste)**

Se algum ajuste for necessário durante a verificação manual, aplique a mudança e:

```bash
git add -A
git commit -m "fix: adjustments from manual verification of Meus Robos screen"
```
