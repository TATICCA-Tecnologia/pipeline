# Central de Downloads + XML agregado por empresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two duplicate download icons on `admin/empresas` with a single "Central de Downloads" link to a new per-company page, and add a new export option there: an aggregated XML of every project of the company, grouped and ordered by area.

**Architecture:** Extract the existing per-project XML tag-building logic (`build-projeto-completo-xml.ts`) into a reusable, narrowly-typed function, reuse it inside a new aggregator builder (`build-empresa-agregado-xml.ts`) that nests projects under `<area>`, expose it through a new authenticated API route (`/api/empresas/[id]/xml-agregado`) that mirrors the existing `/deck` routes, and surface all three downloads (2 existing PPTX + 1 new XML) on a new `admin/empresas/[id]/downloads` page built from a small config array so future downloads are one-line additions.

**Tech Stack:** Next.js App Router (route handlers + client pages), Prisma, tRPC (`company.listAll` only, no new procedures needed), TypeScript. No test runner is configured in this repo (no `vitest`/`jest`, no `test` script in `package.json`) — verification for pure functions uses a throwaway `tsx` script plus `tsc --noEmit`/`eslint`, and the final task is a manual browser smoke test.

**Reference spec:** `docs/superpowers/specs/2026-07-23-central-de-downloads-xml-agregado-design.md`

---

## Task 1: Extract reusable XML field-builder from `build-projeto-completo-xml.ts`

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts`

This file currently exports one function, `buildProjetoCompletoXml(project: Project, urgencyLevels)`, which builds the full standalone XML document (declaration + `<projetoCompleto>` wrapper + ~40 tag lines) for a single project. It's used today by `src/shared/components/project-xml-import-export.tsx`.

We need the ~40 tag lines reusable *without* the wrapper (so the aggregator can nest them under `<area>`/`<projeto>`), and we need the parameter type narrowed to only the fields actually read — so the new aggregate route doesn't have to fabricate unrelated `Project` fields like `status`/`priority`/`clientId` just to satisfy the type.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Already confirmed — current file is 119 lines, single export `buildProjetoCompletoXml`, private helpers `escapeXml`, `tag`, `listTag`, `labelForBenefit`, `formatDeadline`.

- [ ] **Step 2: Replace the whole file with the refactored version**

Replace the entire contents of `src/shared/xml/build-projeto-completo-xml.ts` with:

```ts
import type { Project } from "@/shared/types";
import {
  PLATFORMS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  PROCESS_FREQUENCIES,
  COMPLEXITY_LEVELS,
  BENEFIT_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
import { EXECUTION_STRATEGIES } from "@/src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture";

export function escapeXml(value: string): string {
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

// Subconjunto de `Project` realmente lido por buildProjetoCompletoXmlFields —
// permite que o export agregado por empresa (build-empresa-agregado-xml.ts)
// monte esse shape a partir de uma query Prisma sem precisar fabricar campos
// não usados aqui (status, priority, clientId, createdAt, updatedAt...).
// Como `Project` é estruturalmente um superconjunto, o caller existente
// (project-xml-import-export.tsx, que passa um `Project` inteiro) continua
// funcionando sem nenhuma mudança.
export type ProjetoCompletoXmlData = Pick<
  Project,
  | "id"
  | "companyName"
  | "title"
  | "area"
  | "theme"
  | "platform"
  | "description"
  | "targetAudience"
  | "expectedUsers"
  | "hasExistingSystem"
  | "existingSystemDetails"
  | "hasCurrentApplication"
  | "currentApplicationDetails"
  | "peopleInvolved"
  | "taskDurationHours"
  | "processFrequency"
  | "projectNarrative"
  | "features"
  | "benefits"
  | "benefitsDetails"
  | "monthlyHoursSaved"
  | "ratingErrorReduction"
  | "ratingProcessCriticality"
  | "ratingInternalImpact"
  | "ratingExternalImpact"
  | "ratingCompliance"
  | "urgency"
  | "estimatedDeadline"
  | "additionalInfo"
  | "mainToolCategory"
  | "mainTool"
  | "peopleOfInterest"
  | "complexity"
  | "robotSchedule"
  | "hourlyRateBRL"
  | "estimatedAnnualSavingBRL"
  | "executionStrategy"
  | "solutionTypes"
  | "architectNotes"
  | "implementationEffortDays"
  | "implementationWave"
  | "waveOrder"
>;

// Só as linhas de tag por projeto, sem declaração XML nem wrapper de root —
// reaproveitado tanto pelo export individual (abaixo) quanto pelo agregado
// por empresa (build-empresa-agregado-xml.ts), que aninha essas mesmas
// linhas dentro de <area>/<projeto>.
export function buildProjetoCompletoXmlFields(
  project: ProjetoCompletoXmlData,
  urgencyLevels: { value: string; label: string }[]
): string[] {
  const lines: string[] = [];
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
  lines.push(tag("urgencia", resolveLabel(project.urgency, urgencyLevels)));
  lines.push(tag("prazoLimite", formatDeadline(project.estimatedDeadline)));
  lines.push(tag("informacoesAdicionais", project.additionalInfo));
  lines.push(tag("categoriaDaFerramenta", project.mainToolCategory?.name));
  lines.push(tag("ferramentaPrincipal", project.mainTool?.name));
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
      (project.solutionTypes ?? []).map((k) => k.name)
    )
  );
  lines.push(tag("notasDoArquiteto", project.architectNotes));
  lines.push(tag("esforcoDeImplementacaoDias", project.implementationEffortDays));
  lines.push(tag("ondaDeImplementacao", project.implementationWave));
  lines.push(tag("ordemNaOnda", project.waveOrder));
  return lines;
}

export function buildProjetoCompletoXml(
  project: ProjetoCompletoXmlData,
  urgencyLevels: { value: string; label: string }[]
): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<projetoCompleto>");
  lines.push(...buildProjetoCompletoXmlFields(project, urgencyLevels));
  lines.push("</projetoCompleto>");
  return lines.join("\n");
}
```

Note this is a pure reorganization: every tag line, its order, and the wrapper output of `buildProjetoCompletoXml` are unchanged — only `escapeXml` becomes exported and the field lines move into `buildProjetoCompletoXmlFields`.

- [ ] **Step 3: Manually verify the output is byte-identical to before the refactor**

There's no test runner in this repo, so verify with a throwaway script. Create `tmp-verify-projeto-xml.ts` at the repo root:

```ts
import { buildProjetoCompletoXml } from "./src/shared/xml/build-projeto-completo-xml";
import type { Project } from "./src/shared/types";

const fixture: Project = {
  id: "proj_123",
  title: "Automação de conciliação bancária",
  description: "Descrição de teste",
  status: "backlog",
  priority: "medium",
  clientId: "client_1",
  projectType: "rpa",
  companyName: "Empresa Teste",
  area: { id: "area_1", name: "RPA", slug: "rpa" },
  theme: { id: "theme_1", name: "Automação de processos", slug: "rpa-automacao" },
  platform: "web",
  targetAudience: "interno",
  expectedUsers: "10",
  urgency: "alta",
  features: ["Login", "Dashboard"],
  peopleOfInterest: [{ id: "p1", name: "Maria" }],
  benefits: ["reducao-trabalho-operacional"],
  monthlyHoursSaved: 20,
  ratingErrorReduction: 4,
  ratingProcessCriticality: 3,
  ratingInternalImpact: 5,
  ratingExternalImpact: 2,
  ratingCompliance: 3,
  solutionTypes: [{ id: "st1", name: "RPA", slug: "rpa" }],
  mainTool: { id: "mt1", name: "UiPath", slug: "uipath" },
  mainToolCategory: { id: "mtc1", name: "RPA Tool", slug: "rpa-tool" },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const urgencyLevels = [{ value: "alta", label: "Alta — próximo mês" }];
console.log(buildProjetoCompletoXml(fixture, urgencyLevels));
```

Run: `npx tsx tmp-verify-projeto-xml.ts`

Expected: prints a well-formed XML document starting with `<?xml version="1.0" encoding="UTF-8"?>`, then `<projetoCompleto>`, then tags including `<projetoId>proj_123</projetoId>`, `<area>RPA</area>`, `<tema>Automação de processos</tema>`, `<plataforma>Web (desktop e celular)</plataforma>`, `<urgencia>Alta — próximo mês</urgencia>`, ending with `</projetoCompleto>` — no `undefined` or `[object Object]` anywhere in the output.

- [ ] **Step 4: Delete the throwaway script**

```bash
rm tmp-verify-projeto-xml.ts
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `build-projeto-completo-xml.ts` or `project-xml-import-export.tsx` (the repo has pre-existing unrelated errors in `src/shared/components/ui/chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — ignore those, they predate this change).

- [ ] **Step 6: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts
git commit -m "refactor: extract reusable field-builder from projeto-completo XML export"
```

---

## Task 2: Create the aggregated-XML builder

**Files:**
- Create: `src/shared/xml/build-empresa-agregado-xml.ts`

- [ ] **Step 1: Write the file**

```ts
import {
  escapeXml,
  buildProjetoCompletoXmlFields,
  type ProjetoCompletoXmlData,
} from "./build-projeto-completo-xml";

export interface EmpresaAgregadoAreaGroup {
  name: string;
  projects: ProjetoCompletoXmlData[];
}

// Gera um XML com todos os projetos de uma empresa, agrupados por área
// (grupos já vêm ordenados por quem chama esta função — ver
// /api/empresas/[id]/xml-agregado/route.ts, que ordena por ProjectArea.order
// e joga projetos sem área para um grupo "Sem área" no final).
// Reaproveita exatamente as mesmas tags por projeto do export individual
// (buildProjetoCompletoXmlFields), só aninhadas dentro de <area>/<projeto>.
export function buildEmpresaAgregadoXml(
  company: { id: string; name: string },
  areaGroups: EmpresaAgregadoAreaGroup[],
  urgencyLevels: { value: string; label: string }[]
): string {
  const totalProjetos = areaGroups.reduce((sum, group) => sum + group.projects.length, 0);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push("<dadosAgregadosEmpresa>");
  lines.push(`  <empresaId>${escapeXml(company.id)}</empresaId>`);
  lines.push(`  <empresaNome>${escapeXml(company.name)}</empresaNome>`);
  lines.push(`  <totalProjetos>${totalProjetos}</totalProjetos>`);
  lines.push("  <areas>");
  for (const group of areaGroups) {
    lines.push("    <area>");
    lines.push(`      <areaNome>${escapeXml(group.name)}</areaNome>`);
    lines.push(`      <totalProjetosNaArea>${group.projects.length}</totalProjetosNaArea>`);
    lines.push("      <projetos>");
    for (const project of group.projects) {
      lines.push("        <projeto>");
      for (const fieldLine of buildProjetoCompletoXmlFields(project, urgencyLevels)) {
        lines.push(`  ${fieldLine}`);
      }
      lines.push("        </projeto>");
    }
    lines.push("      </projetos>");
    lines.push("    </area>");
  }
  lines.push("  </areas>");
  lines.push("</dadosAgregadosEmpresa>");
  return lines.join("\n");
}
```

- [ ] **Step 2: Manually verify with a throwaway script**

Create `tmp-verify-empresa-xml.ts` at the repo root:

```ts
import { buildEmpresaAgregadoXml } from "./src/shared/xml/build-empresa-agregado-xml";
import type { ProjetoCompletoXmlData } from "./src/shared/xml/build-projeto-completo-xml";

const projectA: ProjetoCompletoXmlData = {
  id: "proj_a",
  title: "Projeto A",
  companyName: "Empresa Teste",
  description: "Desc A",
  createdAt: new Date(),
  updatedAt: new Date(),
} as ProjetoCompletoXmlData;

const projectB: ProjetoCompletoXmlData = {
  id: "proj_b",
  title: "Projeto B",
  companyName: "Empresa Teste",
  description: "Desc B",
  createdAt: new Date(),
  updatedAt: new Date(),
} as ProjetoCompletoXmlData;

const xml = buildEmpresaAgregadoXml(
  { id: "company_1", name: "Empresa Teste" },
  [
    { name: "RPA", projects: [projectA] },
    { name: "Sem área", projects: [projectB] },
  ],
  []
);
console.log(xml);
```

Run: `npx tsx tmp-verify-empresa-xml.ts`

Expected: output starts with `<?xml version="1.0" encoding="UTF-8"?>` then `<dadosAgregadosEmpresa>`, contains `<totalProjetos>2</totalProjetos>`, two `<area>` blocks (`RPA` with `<totalProjetosNaArea>1</totalProjetosNaArea>` containing `proj_a`, then `Sem área` containing `proj_b`), each `<projeto>` block contains the full field list (e.g. `<projetoId>proj_a</projetoId>`, `<titulo>Projeto A</titulo>`), ends with `</areas>` then `</dadosAgregadosEmpresa>`.

- [ ] **Step 3: Delete the throwaway script**

```bash
rm tmp-verify-empresa-xml.ts
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `build-empresa-agregado-xml.ts` (same pre-existing unrelated errors as Task 1 are fine).

- [ ] **Step 5: Commit**

```bash
git add src/shared/xml/build-empresa-agregado-xml.ts
git commit -m "feat: add XML builder for a company's projects grouped by area"
```

---

## Task 3: Add the `/api/empresas/[id]/xml-agregado` route

**Files:**
- Create: `src/app/api/empresas/[id]/xml-agregado/route.ts`

This mirrors the auth/response pattern of the existing `src/app/api/empresas/[id]/deck/route.ts` and `deck-automacoes-existentes/route.ts` exactly (manual `x-user-id` header check, since API routes don't go through the tRPC `enforceAdmin` middleware).

- [ ] **Step 1: Write the route**

```ts
import { db } from "@/server/db";
import {
  buildEmpresaAgregadoXml,
  type EmpresaAgregadoAreaGroup,
} from "@/shared/xml/build-empresa-agregado-xml";
import type { ProjetoCompletoXmlData } from "@/shared/xml/build-projeto-completo-xml";
import { slugifyFilename } from "@/shared/utils";

/**
 * GET /api/empresas/[id]/xml-agregado
 *
 * Gera e devolve um XML com todos os projetos da empresa (qualquer status),
 * agrupados e ordenados por área — pensado para processamento externo ao
 * sistema, não para reimportação.
 *
 * Autenticação: mesmo padrão manual de /api/empresas/[id]/deck (header
 * x-user-id, role ADMIN/SUPER_ADMIN) — esta rota não é tRPC, então não passa
 * pelos middlewares enforceAdmin.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return new Response("Não autenticado (header x-user-id ausente).", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    return new Response("Não autenticado (usuário não encontrado).", { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return new Response("Acesso restrito a administradores.", { status: 403 });
  }

  const { id: companyId } = await params;

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return new Response("Empresa não encontrada.", { status: 404 });
  }

  try {
    const [projects, urgencyLevelRows] = await Promise.all([
      db.project.findMany({
        where: { companyId },
        include: {
          area: { select: { id: true, name: true, slug: true, order: true } },
          theme: { select: { id: true, name: true, slug: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          mainToolCategory: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
        },
      }),
      db.urgencyLevel.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
      }),
    ]);

    const urgencyLevels = urgencyLevelRows.map((l) => ({ value: l.slug, label: l.name }));

    const mapped: ProjetoCompletoXmlData[] = projects.map((p) => ({
      id: p.id,
      companyName: company.name,
      title: p.title,
      area: p.area ?? undefined,
      theme: p.theme ?? undefined,
      platform: p.platform ?? undefined,
      description: p.description ?? "",
      targetAudience: p.targetAudience ?? undefined,
      expectedUsers: p.expectedUsers ?? undefined,
      hasExistingSystem: p.hasExistingSystem ?? undefined,
      existingSystemDetails: p.existingSystemDetails ?? undefined,
      hasCurrentApplication: p.hasCurrentApplication ?? undefined,
      currentApplicationDetails: p.currentApplicationDetails ?? undefined,
      peopleInvolved: p.peopleInvolved ?? undefined,
      taskDurationHours: p.taskDurationHours ?? undefined,
      processFrequency: p.processFrequency ?? undefined,
      projectNarrative: p.projectNarrative ?? undefined,
      features: p.features?.map((f) => f.name) ?? [],
      benefits: (p.benefits as string[] | null) ?? undefined,
      benefitsDetails: p.benefitsDetails ?? undefined,
      monthlyHoursSaved: p.monthlyHoursSaved ?? undefined,
      ratingErrorReduction: p.ratingErrorReduction ?? undefined,
      ratingProcessCriticality: p.ratingProcessCriticality ?? undefined,
      ratingInternalImpact: p.ratingInternalImpact ?? undefined,
      ratingExternalImpact: p.ratingExternalImpact ?? undefined,
      ratingCompliance: p.ratingCompliance ?? undefined,
      urgency: p.urgency ?? undefined,
      estimatedDeadline: p.deadline ?? undefined,
      additionalInfo: p.additionalInfo ?? undefined,
      mainToolCategory: p.mainToolCategory ?? undefined,
      mainTool: p.mainTool ?? undefined,
      peopleOfInterest: p.peopleOfInterest.map((link) => ({
        id: link.person.id,
        name: link.person.name,
        role: link.person.role ?? undefined,
        userId: link.person.userId ?? undefined,
      })),
      complexity: p.complexity ?? undefined,
      robotSchedule: p.robotSchedule ?? undefined,
      hourlyRateBRL: p.hourlyRateBRL ?? undefined,
      estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
      executionStrategy: p.executionStrategy ?? undefined,
      solutionTypes: p.solutionTypes,
      architectNotes: p.architectNotes ?? undefined,
      implementationEffortDays: p.implementationEffortDays ?? undefined,
      implementationWave: p.implementationWave ?? undefined,
      waveOrder: p.waveOrder ?? undefined,
    }));

    interface AreaAccumulator {
      name: string;
      order: number;
      projects: ProjetoCompletoXmlData[];
    }

    const areaAccumulators = new Map<string, AreaAccumulator>();
    projects.forEach((p, index) => {
      const key = p.area?.id ?? "__sem_area__";
      const existing = areaAccumulators.get(key);
      if (existing) {
        existing.projects.push(mapped[index]);
      } else {
        areaAccumulators.set(key, {
          name: p.area?.name ?? "Sem área",
          order: p.area?.order ?? Number.MAX_SAFE_INTEGER,
          projects: [mapped[index]],
        });
      }
    });

    const areaGroups: EmpresaAgregadoAreaGroup[] = Array.from(areaAccumulators.values())
      .sort((a, b) => a.order - b.order)
      .map((group) => ({ name: group.name, projects: group.projects }));

    const xml = buildEmpresaAgregadoXml(company, areaGroups, urgencyLevels);
    const safeName = slugifyFilename(company.name) || companyId;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="xml-agregado-${safeName}.xml"`,
      },
    });
  } catch (err) {
    console.error("Falha ao gerar XML agregado da empresa:", err);
    return new Response("Falha ao gerar o XML agregado.", { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `xml-agregado/route.ts` (same pre-existing unrelated errors as before are fine).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/empresas/[id]/xml-agregado/route.ts
git commit -m "feat: add API route to export a company's projects as aggregated XML"
```

---

## Task 4: Create the "Central de Downloads" page

**Files:**
- Create: `src/app/(private)/admin/empresas/[id]/downloads/page.tsx`

Follows the same structural pattern as the sibling pages `src/app/(private)/admin/empresas/[id]/custos/page.tsx` and `.../automacoes-existentes/page.tsx` (client component, `use(params)`, `trpc.company.listAll` + `find` for company name, back-arrow header). The two existing PPTX downloads move here verbatim (same fetch/blob/download logic as today's `handleExportDeck` / `handleExportExistingAutomationsDeck` in `admin/empresas/page.tsx`), plus the new XML option.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Button } from "@/src/shared/components/ui/button";
import { useToast } from "@/src/shared/hooks/use-toast";
import { ArrowLeft, Download } from "lucide-react";
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { slugifyFilename } from "@/shared/utils";

interface Props {
  params: Promise<{ id: string }>;
}

interface DownloadOption {
  id: string;
  endpoint: string;
  filenamePrefix: string;
  extension: string;
  title: string;
  description: string;
  errorTitle: string;
}

// Downloads disponíveis para uma empresa — adicionar um novo download no
// futuro é só acrescentar uma entrada aqui, sem reestruturar a página.
const DOWNLOAD_OPTIONS: DownloadOption[] = [
  {
    id: "deck",
    endpoint: "deck",
    filenamePrefix: "diagnostico",
    extension: "pptx",
    title: "Diagnóstico completo",
    description: "Deck consolidado (.pptx) com o diagnóstico completo da empresa.",
    errorTitle: "Erro ao exportar diagnóstico",
  },
  {
    id: "deck-automacoes-existentes",
    endpoint: "deck-automacoes-existentes",
    filenamePrefix: "automacoes-existentes",
    extension: "pptx",
    title: "Automações existentes",
    description: "Deck (.pptx) com as automações já existentes/entregues para a empresa.",
    errorTitle: "Erro ao exportar automações existentes",
  },
  {
    id: "xml-agregado",
    endpoint: "xml-agregado",
    filenamePrefix: "xml-agregado",
    extension: "xml",
    title: "XML agregado de projetos",
    description:
      "XML com todos os projetos da empresa, organizados por área, para processamento externo ao sistema.",
    errorTitle: "Erro ao exportar XML agregado",
  },
];

export default function DownloadsPage({ params }: Props) {
  const { id: companyId } = use(params);
  const { toast } = useToast();
  const { maskCompanyName } = useDemoMode();
  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Rotas de deck/XML exigem o header x-user-id (mesma auth do resto do
  // app), que uma navegação simples de <a href> não incluiria — por isso
  // fazemos um fetch manual com o header, convertemos em blob e disparamos
  // o download por um link temporário (mesma técnica já usada antes em
  // admin/empresas/page.tsx).
  async function handleDownload(option: DownloadOption) {
    setDownloadingId(option.id);
    try {
      const response = await fetch(`/api/empresas/${companyId}/${option.endpoint}`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const safeName = company ? slugifyFilename(company.name) || companyId : companyId;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${option.filenamePrefix}-${safeName}.${option.extension}`;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: option.errorTitle,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Downloads</h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOWNLOAD_OPTIONS.map((option) => (
          <Card key={option.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                {option.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{option.description}</p>
              <Button
                size="sm"
                disabled={downloadingId === option.id}
                onClick={() => handleDownload(option)}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingId === option.id ? "Gerando..." : "Baixar"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `downloads/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/downloads/page.tsx"
git commit -m "feat: add Central de Downloads page per company"
```

---

## Task 5: Replace the two download icons on `admin/empresas` with a link to the new page

**Files:**
- Modify: `src/app/(private)/admin/empresas/page.tsx`

- [ ] **Step 1: Remove the now-unused state**

Old string (lines 41–45):

```tsx
  const [search, setSearch] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingExistingAutomationsId, setExportingExistingAutomationsId] = useState<
    string | null
  >(null);
```

New string:

```tsx
  const [search, setSearch] = useState("");
```

- [ ] **Step 2: Remove the two export handlers**

Old string (the full block from the `handleExportDeck` comment through the end of `handleExportExistingAutomationsDeck`, lines 105–180):

```tsx
  // Download do deck consolidado (.pptx). A rota /api/empresas/[id]/deck exige
  // o header x-user-id (mesma auth do resto do app), que uma navegação simples
  // de <a href> não incluiria — por isso fazemos um fetch manual com o header,
  // convertemos em blob e disparamos o download por um link temporário.
  async function handleExportDeck(company: (typeof companies)[number]) {
    setExportingId(company.id);
    try {
      const response = await fetch(`/api/empresas/${company.id}/deck`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      // Blob URLs ignoram o header Content-Disposition do servidor — o browser
      // usa `link.download` diretamente. Por isso sanitizamos o nome aqui
      // também (mesma função `slugifyFilename` usada no Content-Disposition
      // da rota), senão o nome real do arquivo baixado usaria o `company.name`
      // cru, que pode ter acentos, espaços ou "/" (caractere hostil a path).
      const safeName = slugifyFilename(company.name) || company.id;
      const link = document.createElement("a");
      link.href = url;
      link.download = `diagnostico-${safeName}.pptx`;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: "Erro ao exportar diagnóstico",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  }

  async function handleExportExistingAutomationsDeck(company: (typeof companies)[number]) {
    setExportingExistingAutomationsId(company.id);
    try {
      const response = await fetch(`/api/empresas/${company.id}/deck-automacoes-existentes`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const safeName = slugifyFilename(company.name) || company.id;
      const link = document.createElement("a");
      link.href = url;
      link.download = `automacoes-existentes-${safeName}.pptx`;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: "Erro ao exportar automações existentes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setExportingExistingAutomationsId(null);
    }
  }

  const filtered = companies.filter((c) =>
```

New string:

```tsx
  const filtered = companies.filter((c) =>
```

- [ ] **Step 3: Replace the two download buttons with a single link button**

Old string (lines 296–313):

```tsx
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
                          disabled={exportingId === company.id}
                          onClick={() => handleExportDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar automações existentes (.pptx)"
                          disabled={exportingExistingAutomationsId === company.id}
                          onClick={() => handleExportExistingAutomationsDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
```

New string:

```tsx
                        <Link href={`/admin/empresas/${company.id}/downloads`}>
                          <Button size="icon" variant="ghost" title="Central de Downloads">
                            <Download className="h-4 w-4" />
                          </Button>
                        </Link>
```

- [ ] **Step 4: Remove now-unused imports**

`getTrpcUserId` and `slugifyFilename` were only used inside the two removed handlers. Confirm this and remove their imports.

Old string:

```tsx
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { slugifyFilename } from "@/shared/utils";
```

New string: (delete both lines entirely — remove the two import lines from the file)

- [ ] **Step 5: Lint and typecheck**

Run: `npx eslint src/app/\(private\)/admin/empresas/page.tsx`
Expected: no `no-unused-vars` warnings/errors for `getTrpcUserId`, `slugifyFilename`, `exportingId`, `exportingExistingAutomationsId`, `handleExportDeck`, `handleExportExistingAutomationsDeck`.

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `admin/empresas/page.tsx` (same pre-existing unrelated errors as before are fine).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/empresas/page.tsx"
git commit -m "feat: replace duplicate download icons with a single Central de Downloads link"
```

---

## Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or `pnpm dev`, matching this repo's package manager)

- [ ] **Step 2: Verify the empresas list**

Open `/admin/empresas` in the browser as an ADMIN/SUPER_ADMIN user. Confirm:
- The row actions now show one "Central de Downloads" icon instead of the two previous download icons.
- Hovering it shows the tooltip "Central de Downloads".
- Clicking it navigates to `/admin/empresas/{id}/downloads`.

- [ ] **Step 3: Verify the downloads page**

On `/admin/empresas/{id}/downloads`, confirm:
- The back arrow returns to `/admin/empresas`.
- The header shows the company name (or masked name in demo mode).
- Three cards render: "Diagnóstico completo", "Automações existentes", "XML agregado de projetos".
- Clicking "Baixar" on the first two produces the same `.pptx` files as before this change (compare filenames: `diagnostico-{empresa}.pptx`, `automacoes-existentes-{empresa}.pptx`).
- Clicking "Baixar" on "XML agregado de projetos" downloads a file named `xml-agregado-{empresa}.xml`.

- [ ] **Step 4: Inspect the downloaded XML for a company with projects in multiple areas**

Open the downloaded `xml-agregado-*.xml` in a text editor. Confirm:
- Root element `<dadosAgregadosEmpresa>` with `<empresaId>`, `<empresaNome>`, `<totalProjetos>` matching the "Projetos" count shown for that company on `/admin/empresas`.
- One `<area>` block per distinct area the company's projects use, in the same order as `ProjectArea.order` (check via `/admin/taxonomias` or the Prisma Studio `project_areas` table if unsure of the expected order).
- Any project with no `areaId` appears under a trailing `<area><areaNome>Sem área</areaNome>`.
- Each `<projeto>` block contains the same tag set as a project's individual XML export (spot-check one project: export it individually via the project detail page's "Exportar XML" button, and confirm the tag names/values match what appears inside its `<projeto>` block in the aggregated file — values, not necessarily formatting/whitespace).

- [ ] **Step 5: Regression-check the individual project XML export/import**

On any project's detail page, click "Exportar XML", confirm the download still works and produces a `<projetoCompleto>` document identical in shape to before this change. Then use "Importar XML" to re-import that same file and confirm it's accepted without errors (proves Task 1's refactor didn't break the existing single-project flow).
