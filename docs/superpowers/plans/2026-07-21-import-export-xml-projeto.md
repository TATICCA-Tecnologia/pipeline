# Importar/Exportar XML de um projeto existente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar exportação e importação de um novo formato XML (`<projetoCompleto>`), cobrindo os campos de solicitação **e** os campos técnicos do arquiteto, na página de detalhe do projeto — permitindo que admin/developer editem um projeto existente inteiramente por fora e reimportem.

**Architecture:** Export é 100% client-side (serializa o `Project` já carregado). Import faz o parsing (leniente, com avisos) no navegador e envia um payload já tipado pra uma mutation tRPC nova e isolada (`project.importXml`), que resolve toda taxonomia relacional (área/tema/ferramenta/tipo de projeto/pessoas de interesse) via find-or-create no servidor, numa única mutation dedicada que — diferente de `project.update` — libera developer a gravar campos técnicos.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, Prisma 6 (PostgreSQL), Zod, DOMParser (client), sonner (toast). Sem framework de testes automatizados neste repo (confirmado na feature anterior) — verificação via `tsc --noEmit` e `pnpm build`.

**Spec:** `docs/superpowers/specs/2026-07-21-import-export-xml-projeto-design.md`

---

### Task 1: Incluir `area`/`theme`/`platform` nas queries de projeto

O formato XML precisa do **nome** da área/tema (não só o id) e do valor bruto de `platform` — hoje `project.router.ts` só retorna `areaId`/`themeId` (sem objeto) e funde `platform` dentro de `projectType`. Sem esse passo o export não tem como montar `<area>`, `<tema>`, `<plataforma>`.

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Incluir `area`/`theme` no include da query `list`**

Encontre (por volta da linha 158-174):
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
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
```
Substitua por:
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
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
```

- [ ] **Step 2: Mapear `area`/`theme`/`platform` no retorno da query `list`**

Encontre:
```ts
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        projectKind: p.projectKind ?? undefined,
```
Substitua por:
```ts
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        platform: p.platform ?? undefined,
        area: p.area ?? undefined,
        theme: p.theme ?? undefined,
        projectKind: p.projectKind ?? undefined,
```

- [ ] **Step 3: Incluir `area`/`theme` no include da query `byId`**

Encontre:
```ts
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
      });
```
Substitua por:
```ts
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          area: { select: { id: true, name: true, slug: true } },
          theme: { select: { id: true, name: true, slug: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          projectKind: { select: { id: true, name: true, slug: true } },
          tasks: true,
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
      });
```

- [ ] **Step 4: Mapear `area`/`theme`/`platform` no retorno da query `byId`**

Encontre:
```ts
        areaId: project.areaId ?? undefined,
        themeId: project.themeId ?? undefined,
        projectType: project.platform ?? project.type,
```
Substitua por:
```ts
        areaId: project.areaId ?? undefined,
        themeId: project.themeId ?? undefined,
        area: project.area ?? undefined,
        theme: project.theme ?? undefined,
        platform: project.platform ?? undefined,
        projectType: project.platform ?? project.type,
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: novos erros vão aparecer em `src/shared/types/index.ts`-dependentes, já que `area`/`theme`/`platform` ainda não existem no tipo `Project` do frontend — corrigido na Task 2. Confirme que os únicos erros novos são sobre esses três campos.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: include area/theme/platform in project list/byId queries"
```

---

### Task 2: Adicionar `area`/`theme`/`platform` ao tipo `Project` do frontend

**Files:**
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Adicionar os campos**

Encontre:
```ts
  companyId?: string;
  companyName?: string;
  areaId?: string;
  themeId?: string;
```
Substitua por:
```ts
  companyId?: string;
  companyName?: string;
  areaId?: string;
  themeId?: string;
  area?: { id: string; name: string; slug: string };
  theme?: { id: string; name: string; slug: string };
  platform?: string;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: add area/theme/platform to Project type"
```

---

### Task 3: Adicionar `resolvePersonIdsByName` ao `person.router.ts`

O XML lista pessoas de interesse por **nome** (não por id) — precisa de uma variante do find-or-create que já existe pra ids (`resolvePersonIds`), mas por nome.

**Files:**
- Modify: `src/server/trpc/routers/person.router.ts`

- [ ] **Step 1: Adicionar a função**

No final do arquivo `src/server/trpc/routers/person.router.ts`, logo antes de `export const personRouter = router({`, adicione:

```ts
export async function resolvePersonIdsByName(
  db: PrismaClient,
  companyId: string,
  names: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = await db.person.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      ids.push(existing.id);
    } else {
      const created = await db.person.create({ data: { companyId, name } });
      ids.push(created.id);
    }
  }
  return Array.from(new Set(ids));
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/person.router.ts
git commit -m "feat: add resolvePersonIdsByName helper for XML import"
```

---

### Task 4: Criar helpers de find-or-create de taxonomia (área/tema/ferramenta/tipo)

Isolado num arquivo próprio pra não inchar ainda mais `project.router.ts` (já com >1100 linhas). Reaproveita o mesmo `slugify` já usado em `xml-opportunity-resolution-dialogs.tsx`/`architecture-tab.tsx`, só que rodando no servidor (função pura, sem API de browser).

**Files:**
- Create: `src/server/trpc/routers/project-import-xml-helpers.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
import type { PrismaClient } from "@prisma/client";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function findOrCreateProjectArea(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectArea.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectArea.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(`Área "${trimmed}" não encontrada e o slug gerado já está em uso — área não alterada.`);
    return undefined;
  }
  const created = await db.projectArea.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Área "${trimmed}" não existia e foi criada.`);
  return created;
}

export async function findOrCreateProjectTheme(
  db: PrismaClient,
  areaId: string,
  name: string,
  warnings: string[]
) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectTheme.findFirst({
    where: { areaId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectTheme.findUnique({ where: { slug_areaId: { slug, areaId } } });
  if (slugTaken) {
    warnings.push(
      `Tema "${trimmed}" não encontrado e o slug gerado já está em uso nesta área — tema não alterado.`
    );
    return undefined;
  }
  const created = await db.projectTheme.create({ data: { areaId, name: trimmed, slug, order: 0 } });
  warnings.push(`Tema "${trimmed}" não existia (nesta área) e foi criado.`);
  return created;
}

export async function findOrCreateMainTool(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.mainTool.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.mainTool.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Ferramenta "${trimmed}" não encontrada e o slug gerado já está em uso — ferramenta não alterada.`
    );
    return undefined;
  }
  const created = await db.mainTool.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Ferramenta "${trimmed}" não existia e foi criada.`);
  return created;
}

export async function findOrCreateProjectKind(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectKind.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectKind.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Tipo de projeto "${trimmed}" não encontrado e o slug gerado já está em uso — tipo não alterado.`
    );
    return undefined;
  }
  const created = await db.projectKind.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Tipo de projeto "${trimmed}" não existia e foi criado.`);
  return created;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/project-import-xml-helpers.ts
git commit -m "feat: add find-or-create helpers for area/theme/mainTool/projectKind"
```

---

### Task 5: Adicionar a mutation `project.importXml`

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Importar os helpers novos**

Encontre:
```ts
import { resolvePersonIds } from "./person.router";
```
Substitua por:
```ts
import { resolvePersonIds, resolvePersonIdsByName } from "./person.router";
import {
  findOrCreateProjectArea,
  findOrCreateProjectTheme,
  findOrCreateMainTool,
  findOrCreateProjectKind,
} from "./project-import-xml-helpers";
```

- [ ] **Step 2: Adicionar a mutation no final do router**

Encontre o final do arquivo:
```ts
      return { success: true };
    }),
});
```
Substitua por (adiciona a mutation nova antes do `});` final do router):
```ts
      return { success: true };
    }),

  importXml: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).optional(),
        areaName: z.string().optional(),
        themeName: z.string().optional(),
        platform: z.string().optional(),
        description: z.string().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        hasCurrentApplication: z.string().optional(),
        currentApplicationDetails: z.string().optional(),
        peopleInvolved: z.number().int().optional(),
        taskDurationHours: z.number().optional(),
        processFrequency: z.string().optional(),
        projectNarrative: z.string().optional(),
        features: z.array(z.string()).optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
        urgency: z.string().optional(),
        estimatedDeadline: z.coerce.date().optional(),
        additionalInfo: z.string().optional(),
        mainToolName: z.string().optional(),
        projectKindName: z.string().optional(),
        peopleOfInterestNames: z.array(z.string()).optional(),
        complexity: z.string().optional(),
        robotSchedule: z.string().optional(),
        hourlyRateBRL: z.number().optional(),
        estimatedAnnualSavingBRL: z.number().optional(),
        executionStrategy: z.string().optional(),
        solutionTypes: z.array(z.string()).optional(),
        architectNotes: z.string().optional(),
        implementationEffortDays: z.number().int().optional(),
        implementationWave: z.number().int().optional(),
        waveOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const caller = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      const canImport =
        caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN" || caller?.role === "DEVELOPER";
      if (!canImport) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas admin ou developer podem importar XML de projeto.",
        });
      }

      const current = await ctx.db.project.findUnique({ where: { id: input.projectId } });
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }

      const warnings: string[] = [];
      const data: Record<string, unknown> = {};

      if (input.title !== undefined) data.title = input.title;
      if (input.platform !== undefined) data.platform = input.platform;
      if (input.description !== undefined) data.description = input.description;
      if (input.targetAudience !== undefined) data.targetAudience = input.targetAudience;
      if (input.expectedUsers !== undefined) data.expectedUsers = input.expectedUsers;
      if (input.hasExistingSystem !== undefined) data.hasExistingSystem = input.hasExistingSystem;
      if (input.existingSystemDetails !== undefined)
        data.existingSystemDetails = input.existingSystemDetails;
      if (input.hasCurrentApplication !== undefined)
        data.hasCurrentApplication = input.hasCurrentApplication;
      if (input.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = input.currentApplicationDetails;
      if (input.peopleInvolved !== undefined) data.peopleInvolved = input.peopleInvolved;
      if (input.taskDurationHours !== undefined || input.processFrequency !== undefined) {
        const nextDuration = input.taskDurationHours ?? current.taskDurationHours;
        const nextFrequency = input.processFrequency ?? current.processFrequency;
        data.taskDurationHours = nextDuration;
        data.processFrequency = nextFrequency;
        data.currentAnnualHours = computeCurrentAnnualHours(nextDuration, nextFrequency);
      }
      if (input.projectNarrative !== undefined) data.projectNarrative = input.projectNarrative;
      if (input.benefits !== undefined) data.benefits = input.benefits;
      if (input.benefitsDetails !== undefined) data.benefitsDetails = input.benefitsDetails;
      if (input.monthlyHoursSaved !== undefined) data.monthlyHoursSaved = input.monthlyHoursSaved;
      if (input.ratingErrorReduction !== undefined)
        data.ratingErrorReduction = input.ratingErrorReduction;
      if (input.ratingProcessCriticality !== undefined)
        data.ratingProcessCriticality = input.ratingProcessCriticality;
      if (input.ratingInternalImpact !== undefined)
        data.ratingInternalImpact = input.ratingInternalImpact;
      if (input.ratingExternalImpact !== undefined)
        data.ratingExternalImpact = input.ratingExternalImpact;
      if (input.ratingCompliance !== undefined) data.ratingCompliance = input.ratingCompliance;
      if (input.urgency !== undefined) data.urgency = input.urgency;
      if (input.estimatedDeadline !== undefined) data.deadline = input.estimatedDeadline;
      if (input.additionalInfo !== undefined) data.additionalInfo = input.additionalInfo;
      if (input.complexity !== undefined) data.complexity = input.complexity;
      if (input.robotSchedule !== undefined) data.robotSchedule = input.robotSchedule;
      if (input.hourlyRateBRL !== undefined) data.hourlyRateBRL = input.hourlyRateBRL;
      if (input.estimatedAnnualSavingBRL !== undefined)
        data.estimatedAnnualSavingBRL = input.estimatedAnnualSavingBRL;
      if (input.executionStrategy !== undefined) data.executionStrategy = input.executionStrategy;
      if (input.solutionTypes !== undefined) data.solutionTypes = input.solutionTypes;
      if (input.architectNotes !== undefined) data.architectNotes = input.architectNotes;
      if (input.implementationEffortDays !== undefined)
        data.implementationEffortDays = input.implementationEffortDays;
      if (input.implementationWave !== undefined) data.implementationWave = input.implementationWave;
      if (input.waveOrder !== undefined) data.waveOrder = input.waveOrder;

      let resolvedAreaId: string | undefined;
      if (input.areaName !== undefined) {
        const area = await findOrCreateProjectArea(ctx.db, input.areaName, warnings);
        if (area) {
          resolvedAreaId = area.id;
          data.areaId = area.id;
        }
      }
      if (input.themeName !== undefined) {
        const areaIdForTheme = resolvedAreaId ?? current.areaId ?? undefined;
        if (areaIdForTheme) {
          const theme = await findOrCreateProjectTheme(ctx.db, areaIdForTheme, input.themeName, warnings);
          if (theme) data.themeId = theme.id;
        } else {
          warnings.push(`Tema "${input.themeName}" ignorado — nenhuma área definida para o projeto.`);
        }
      }
      if (input.mainToolName !== undefined) {
        const tool = await findOrCreateMainTool(ctx.db, input.mainToolName, warnings);
        if (tool) data.mainToolId = tool.id;
      }
      if (input.projectKindName !== undefined) {
        const kind = await findOrCreateProjectKind(ctx.db, input.projectKindName, warnings);
        if (kind) data.projectKindId = kind.id;
      }

      await ctx.db.project.update({ where: { id: input.projectId }, data });

      if (input.features !== undefined) {
        const existingFeatures = await ctx.db.projectFeature.findMany({
          where: { projectId: input.projectId },
        });
        const keep = new Set(input.features);
        const toDelete = existingFeatures.filter((f) => !keep.has(f.name));
        const existingNames = new Set(existingFeatures.map((f) => f.name));
        const toCreate = input.features.filter((name) => !existingNames.has(name));
        if (toDelete.length > 0) {
          await ctx.db.projectFeature.deleteMany({
            where: { id: { in: toDelete.map((f) => f.id) } },
          });
        }
        if (toCreate.length > 0) {
          await ctx.db.projectFeature.createMany({
            data: toCreate.map((name) => ({ projectId: input.projectId, name })),
          });
        }
      }

      if (input.peopleOfInterestNames !== undefined && current.companyId) {
        const personIds = await resolvePersonIdsByName(
          ctx.db,
          current.companyId,
          input.peopleOfInterestNames
        );
        await ctx.db.projectPersonOfInterest.deleteMany({ where: { projectId: input.projectId } });
        await ctx.db.projectPersonOfInterest.createMany({
          data: personIds.map((personId) => ({ projectId: input.projectId, personId })),
        });
      }

      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Projeto importado via XML",
          details: warnings.length > 0 ? warnings.join(" | ") : undefined,
        },
      });

      return { warnings };
    }),
});
```

Note: `computeCurrentAnnualHours` já existe nesse arquivo (usada pelo `update` existente) — não precisa ser reimportada/redefinida.

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add project.importXml mutation (admin+developer, full field set)"
```

---

### Task 6: Criar o serializador de export (`buildProjetoCompletoXml`)

**Files:**
- Create: `src/shared/xml/build-projeto-completo-xml.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
import type { Project } from "@/shared/types";
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : escapeXml(String(value));
  return `  <${name}>${text}</${name}>`;
}

function listTag(groupName: string, itemName: string, items: string[]): string {
  const inner = items.map((item) => `    <${itemName}>${escapeXml(item)}</${itemName}>`).join("\n");
  return `  <${groupName}>\n${inner}\n  </${groupName}>`;
}

function labelForBenefit(key: string): string {
  return BENEFIT_OPTIONS.find((b) => b.key === key)?.label ?? key;
}

function formatDeadline(date: Date | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildProjetoCompletoXml(project: Project): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<projetoCompleto>");
  lines.push(tag("projetoId", project.id));
  lines.push(tag("empresa", project.companyName));
  lines.push(tag("titulo", project.title));
  lines.push(tag("area", project.area?.name));
  lines.push(tag("tema", project.theme?.name));
  lines.push(tag("plataforma", resolveLabel(project.platform, PLATFORMS)));
  lines.push(tag("descricao", project.description));
  lines.push(tag("publicoAlvo", project.targetAudience));
  lines.push(tag("numeroUsuarios", project.expectedUsers));
  lines.push(
    tag("processoExistente", resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS))
  );
  lines.push(tag("detalhesProcessoAtual", project.existingSystemDetails));
  lines.push(
    tag(
      "aplicacaoExistenteHoje",
      resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS)
    )
  );
  lines.push(tag("detalhesAplicacaoExistente", project.currentApplicationDetails));
  lines.push(tag("colaboradoresEnvolvidos", project.peopleInvolved));
  lines.push(tag("duracaoPorExecucao", project.taskDurationHours));
  lines.push(tag("periodicidade", resolveLabel(project.processFrequency, PROCESS_FREQUENCIES)));
  lines.push(tag("narrativaDoProcesso", project.projectNarrative));
  lines.push(listTag("funcionalidades", "funcionalidade", project.features ?? []));
  lines.push(
    listTag("beneficios", "beneficio", (project.benefits ?? []).map((key) => labelForBenefit(key)))
  );
  lines.push(tag("detalhesBeneficios", project.benefitsDetails));
  lines.push(tag("horasEconomizadasPorMes", project.monthlyHoursSaved));
  lines.push(tag("avaliacaoReducaoErros", project.ratingErrorReduction));
  lines.push(tag("avaliacaoCriticidadeProcesso", project.ratingProcessCriticality));
  lines.push(tag("avaliacaoImpactoInterno", project.ratingInternalImpact));
  lines.push(tag("avaliacaoImpactoExterno", project.ratingExternalImpact));
  lines.push(tag("avaliacaoAtendimentoPoliticas", project.ratingCompliance));
  lines.push(tag("urgencia", resolveLabel(project.urgency, URGENCY_LEVELS)));
  lines.push(tag("prazoLimite", formatDeadline(project.estimatedDeadline)));
  lines.push(tag("informacoesAdicionais", project.additionalInfo));
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
  lines.push(tag("tipoDeProjeto", project.projectKind?.name));
  lines.push(
    listTag(
      "pessoasDeInteresse",
      "pessoa",
      (project.peopleOfInterest ?? []).map((p) => p.name)
    )
  );
  lines.push(tag("complexidade", resolveLabel(project.complexity, COMPLEXITY_LEVELS)));
  lines.push(tag("agendaDoRobo", project.robotSchedule));
  lines.push(tag("taxaHorariaBRL", project.hourlyRateBRL));
  lines.push(tag("economiaAnualEstimadaBRL", project.estimatedAnnualSavingBRL));
  lines.push(
    tag("estrategiaDeExecucao", resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES))
  );
  lines.push(
    listTag(
      "tiposDeSolucao",
      "tipo",
      (project.solutionTypes ?? []).map((v) => resolveLabel(v, SOLUTION_TYPES) ?? v)
    )
  );
  lines.push(tag("notasDoArquiteto", project.architectNotes));
  lines.push(tag("esforcoDeImplementacaoDias", project.implementationEffortDays));
  lines.push(tag("ondaDeImplementacao", project.implementationWave));
  lines.push(tag("ordemNaOnda", project.waveOrder));
  lines.push("</projetoCompleto>");
  return lines.join("\n");
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts
git commit -m "feat: add buildProjetoCompletoXml exporter"
```

---

### Task 7: Criar o parser de import (`parseProjetoCompletoXml`)

**Files:**
- Create: `src/shared/xml/parse-projeto-completo-xml.ts`

- [ ] **Step 1: Criar o arquivo**

```ts
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  URGENCY_LEVELS,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
import {
  SOLUTION_TYPES,
  EXECUTION_STRATEGIES,
} from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

export interface ParsedProjetoCompleto {
  projetoId?: string;
  title?: string;
  areaName?: string;
  themeName?: string;
  platform?: string;
  description?: string;
  targetAudience?: string;
  expectedUsers?: string;
  hasExistingSystem?: string;
  existingSystemDetails?: string;
  hasCurrentApplication?: string;
  currentApplicationDetails?: string;
  peopleInvolved?: number;
  taskDurationHours?: number;
  processFrequency?: string;
  projectNarrative?: string;
  features?: string[];
  benefits?: string[];
  benefitsDetails?: string;
  monthlyHoursSaved?: number;
  ratingErrorReduction?: number;
  ratingProcessCriticality?: number;
  ratingInternalImpact?: number;
  ratingExternalImpact?: number;
  ratingCompliance?: number;
  urgency?: string;
  estimatedDeadline?: string;
  additionalInfo?: string;
  mainToolName?: string;
  projectKindName?: string;
  peopleOfInterestNames?: string[];
  complexity?: string;
  robotSchedule?: string;
  hourlyRateBRL?: number;
  estimatedAnnualSavingBRL?: number;
  executionStrategy?: string;
  solutionTypes?: string[];
  architectNotes?: string;
  implementationEffortDays?: number;
  implementationWave?: number;
  waveOrder?: number;
}

export type ParseProjetoCompletoResult =
  | { ok: true; data: ParsedProjetoCompleto; warnings: string[] }
  | { ok: false; error: string };

function getDirectChildText(parent: Element, tagName: string): string | undefined {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      const text = (child.textContent ?? "").trim();
      return text.length > 0 ? text : undefined;
    }
  }
  return undefined;
}

function getListItems(root: Element, groupTag: string, itemTag: string): string[] | undefined {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return undefined;
  return Array.from(group.children)
    .filter((c) => c.tagName === itemTag)
    .map((c) => (c.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

function matchValueByLabel(
  label: string,
  options: readonly { value: string; label: string }[]
): string | undefined {
  const normalized = label.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized)?.value;
}

function matchKeyByLabel(
  label: string,
  options: readonly { key: string; label: string }[]
): string | undefined {
  const normalized = label.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized)?.key;
}

function resolveEnum(
  raw: string | undefined,
  options: readonly { value: string; label: string }[],
  fieldLabel: string,
  warnings: string[]
): string | undefined {
  if (raw === undefined) return undefined;
  const matched = matchValueByLabel(raw, options);
  if (matched) return matched;
  warnings.push(`"${fieldLabel}" com valor "${raw}" não reconhecido — mantido como texto livre.`);
  return raw;
}

function parseNumber(raw: string | undefined, fieldLabel: string, warnings: string[]): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    warnings.push(`"${fieldLabel}" com valor "${raw}" não é um número válido — ignorado.`);
    return undefined;
  }
  return n;
}

export function parseProjetoCompletoXml(xmlText: string): ParseProjetoCompletoResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) {
    return { ok: false, error: "XML inválido — verifique se o arquivo não foi corrompido." };
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "projetoCompleto") {
    return { ok: false, error: 'Tag raiz inválida — esperado "<projetoCompleto>".' };
  }

  const warnings: string[] = [];
  const data: ParsedProjetoCompleto = {};

  data.projetoId = getDirectChildText(root, "projetoId");
  data.title = getDirectChildText(root, "titulo");
  data.areaName = getDirectChildText(root, "area");
  data.themeName = getDirectChildText(root, "tema");
  data.platform = resolveEnum(getDirectChildText(root, "plataforma"), PLATFORMS, "Plataforma", warnings);
  data.description = getDirectChildText(root, "descricao");
  data.targetAudience = getDirectChildText(root, "publicoAlvo");
  data.expectedUsers = getDirectChildText(root, "numeroUsuarios");
  data.hasExistingSystem = resolveEnum(
    getDirectChildText(root, "processoExistente"),
    HAS_EXISTING_SYSTEM_OPTIONS,
    "Processo existente",
    warnings
  );
  data.existingSystemDetails = getDirectChildText(root, "detalhesProcessoAtual");
  data.hasCurrentApplication = resolveEnum(
    getDirectChildText(root, "aplicacaoExistenteHoje"),
    HAS_CURRENT_APPLICATION_OPTIONS,
    "Aplicação existente hoje",
    warnings
  );
  data.currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");
  data.peopleInvolved = parseNumber(
    getDirectChildText(root, "colaboradoresEnvolvidos"),
    "Colaboradores envolvidos",
    warnings
  );
  data.taskDurationHours = parseNumber(
    getDirectChildText(root, "duracaoPorExecucao"),
    "Duração por execução",
    warnings
  );
  data.processFrequency = resolveEnum(
    getDirectChildText(root, "periodicidade"),
    PROCESS_FREQUENCIES,
    "Periodicidade",
    warnings
  );
  data.projectNarrative = getDirectChildText(root, "narrativaDoProcesso");
  data.features = getListItems(root, "funcionalidades", "funcionalidade");
  const rawBenefits = getListItems(root, "beneficios", "beneficio");
  data.benefits = rawBenefits?.map((label) => matchKeyByLabel(label, BENEFIT_OPTIONS) ?? label);
  data.benefitsDetails = getDirectChildText(root, "detalhesBeneficios");
  data.monthlyHoursSaved = parseNumber(
    getDirectChildText(root, "horasEconomizadasPorMes"),
    "Horas economizadas por mês",
    warnings
  );
  data.ratingErrorReduction = parseNumber(
    getDirectChildText(root, "avaliacaoReducaoErros"),
    "Avaliação de redução de erros",
    warnings
  );
  data.ratingProcessCriticality = parseNumber(
    getDirectChildText(root, "avaliacaoCriticidadeProcesso"),
    "Avaliação de criticidade do processo",
    warnings
  );
  data.ratingInternalImpact = parseNumber(
    getDirectChildText(root, "avaliacaoImpactoInterno"),
    "Avaliação de impacto interno",
    warnings
  );
  data.ratingExternalImpact = parseNumber(
    getDirectChildText(root, "avaliacaoImpactoExterno"),
    "Avaliação de impacto externo",
    warnings
  );
  data.ratingCompliance = parseNumber(
    getDirectChildText(root, "avaliacaoAtendimentoPoliticas"),
    "Avaliação de atendimento a políticas",
    warnings
  );
  data.urgency = resolveEnum(getDirectChildText(root, "urgencia"), URGENCY_LEVELS, "Urgência", warnings);
  const rawDeadline = getDirectChildText(root, "prazoLimite");
  if (rawDeadline) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)) {
      data.estimatedDeadline = rawDeadline;
    } else {
      warnings.push(`"Prazo limite" com valor "${rawDeadline}" não está no formato AAAA-MM-DD — ignorado.`);
    }
  }
  data.additionalInfo = getDirectChildText(root, "informacoesAdicionais");
  data.mainToolName = getDirectChildText(root, "ferramentaPrincipal");
  data.projectKindName = getDirectChildText(root, "tipoDeProjeto");
  data.peopleOfInterestNames = getListItems(root, "pessoasDeInteresse", "pessoa");
  data.complexity = resolveEnum(
    getDirectChildText(root, "complexidade"),
    COMPLEXITY_LEVELS,
    "Complexidade",
    warnings
  );
  data.robotSchedule = getDirectChildText(root, "agendaDoRobo");
  data.hourlyRateBRL = parseNumber(getDirectChildText(root, "taxaHorariaBRL"), "Taxa horária", warnings);
  data.estimatedAnnualSavingBRL = parseNumber(
    getDirectChildText(root, "economiaAnualEstimadaBRL"),
    "Economia anual estimada",
    warnings
  );
  data.executionStrategy = resolveEnum(
    getDirectChildText(root, "estrategiaDeExecucao"),
    EXECUTION_STRATEGIES,
    "Estratégia de execução",
    warnings
  );
  const rawSolutionTypes = getListItems(root, "tiposDeSolucao", "tipo");
  data.solutionTypes = rawSolutionTypes?.map((label) => matchValueByLabel(label, SOLUTION_TYPES) ?? label);
  data.architectNotes = getDirectChildText(root, "notasDoArquiteto");
  data.implementationEffortDays = parseNumber(
    getDirectChildText(root, "esforcoDeImplementacaoDias"),
    "Esforço de implementação (dias)",
    warnings
  );
  data.implementationWave = parseNumber(
    getDirectChildText(root, "ondaDeImplementacao"),
    "Onda de implementação",
    warnings
  );
  data.waveOrder = parseNumber(getDirectChildText(root, "ordemNaOnda"), "Ordem na onda", warnings);

  return { ok: true, data, warnings };
}
```

Nota de design: tags ausentes **e** tags presentes-mas-vazias são tratadas do mesmo jeito pra campos de texto/número (`undefined` → não altera o valor atual) — evita apagar dado por acidente num XML editado à mão. Só as tags de lista (`funcionalidades`, `beneficios`, `pessoasDeInteresse`, `tiposDeSolucao`) distinguem "grupo ausente" (`undefined`, não mexe) de "grupo presente e vazio" (`[]`, limpa a lista) — é a forma de um developer explicitamente esvaziar uma lista pelo XML.

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/xml/parse-projeto-completo-xml.ts
git commit -m "feat: add parseProjetoCompletoXml parser"
```

---

### Task 8: Criar o componente de UI `ProjectXmlImportExport`

**Files:**
- Create: `src/shared/components/project-xml-import-export.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import type { Project } from "@/shared/types";
import { buildProjetoCompletoXml } from "@/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "@/shared/xml/parse-projeto-completo-xml";

export function ProjectXmlImportExport({ project }: { project: Project }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const importMutation = trpc.project.importXml.useMutation({
    onSuccess: (result) => {
      utils.project.byId.invalidate({ id: project.id });
      if (result.warnings.length > 0) {
        toast.warning("XML importado com avisos", {
          description: result.warnings.join(" • "),
        });
      } else {
        toast.success("XML importado com sucesso.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao importar XML", { description: error.message });
    },
    onSettled: () => setIsImporting(false),
  });

  function handleExport() {
    const xml = buildProjetoCompletoXml(project);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projeto-${project.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const text = await file.text();
    const parsed = parseProjetoCompletoXml(text);
    if (!parsed.ok) {
      toast.error("Não foi possível importar o XML", { description: parsed.error });
      return;
    }

    if (parsed.data.projetoId && parsed.data.projetoId !== project.id) {
      const confirmed = window.confirm(
        "Este XML foi exportado de outro projeto. Aplicar mesmo assim neste projeto?"
      );
      if (!confirmed) return;
    }

    setIsImporting(true);
    const { projetoId: _projetoId, ...rest } = parsed.data;
    importMutation.mutate({ projectId: project.id, ...rest });
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Exportar XML
      </Button>
      <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Importar XML
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/project-xml-import-export.tsx
git commit -m "feat: add ProjectXmlImportExport UI component"
```

---

### Task 9: Colocar os botões na página de detalhe do projeto

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx`

- [ ] **Step 1: Importar o componente novo**

Encontre:
```tsx
import { ProjectPeopleOfInterestCard } from "@/shared/components/project-people-of-interest-card";
```
Substitua por:
```tsx
import { ProjectPeopleOfInterestCard } from "@/shared/components/project-people-of-interest-card";
import { ProjectXmlImportExport } from "@/shared/components/project-xml-import-export";
```

- [ ] **Step 2: Mostrar os botões ao lado do "Editar"**

Encontre:
```tsx
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}
```
Substitua por:
```tsx
      {(canEdit || canSeeTechnical) && (
        <div className="flex justify-end gap-2">
          {canSeeTechnical && <ProjectXmlImportExport project={project} />}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx
git commit -m "feat: show XML import/export buttons on project detail page"
```

---

### Task 10: Verificação final

- [ ] **Step 1: Type-check completo**

Run: `pnpm exec tsc --noEmit`
Expected: só os 10 erros pré-existentes e não relacionados (chart.tsx, input-otp.tsx, sidebar.tsx, toaster.tsx) — confirme a contagem com `pnpm exec tsc --noEmit 2>&1 | grep -c "error TS"`.

- [ ] **Step 2: Build de produção**

Run: `pnpm build`
Expected: build passa.

- [ ] **Step 3: Passeio manual (quando houver banco disponível)**

1. Abrir um projeto como admin ou developer, clicar "Exportar XML", conferir que o arquivo baixado tem todas as tags, inclusive as técnicas.
2. Editar manualmente algumas tags no arquivo baixado (ex: `<titulo>`, `<complexidade>`, criar um `<ferramentaPrincipal>` com nome novo, adicionar um nome novo em `<pessoasDeInteresse>`).
3. Clicar "Importar XML" nesse mesmo projeto, selecionar o arquivo editado — conferir o toast de sucesso/avisos.
4. Recarregar a página — conferir que os campos editados persistiram, que a ferramenta nova foi criada e aparece selecionada, e que a nova pessoa de interesse aparece no card.
5. Exportar de novo e importar num projeto DIFERENTE — confirmar que aparece o aviso de confirmação por causa do `projetoId` divergente.
6. Confirmar que um `CLIENT` não vê os botões (role sem acesso a `canSeeTechnical`).
