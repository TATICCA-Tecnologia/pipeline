# Importação de Solicitação de Projeto via XML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client (or a super admin viewing as client) upload a pre-filled XML file on `/cliente/solicitar` to create a project directly, without filling the multi-step form by hand — plus a downloadable blank XML template and a help page documenting every tag.

**Architecture:** Everything happens client-side. A new pure module (`xml-import.ts`) parses the XML with the browser-native `DOMParser`, resolves menu-driven fields (area/tema/plataforma/etc.) against the exact same label lists the form's `<Select>` menus already use, and produces a `SolicitarProjetoFormData`-shaped object. A second new module (`build-project-payload.ts`) contains the exact object-mapping logic the manual form already uses to turn form data into the payload `addProject()` expects — extracted out of `page.tsx` so both the manual submit button and the XML import path call the identical function, guaranteeing zero drift. No new tRPC procedure, no new backend dependency, no new npm package.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, existing `project.create` tRPC mutation (via `addProject` in `projects-context.tsx`), browser-native `DOMParser`.

**No test runner is configured in this project** (no vitest/jest in `package.json`, no test files under `src/`). Verification in this plan relies on `pnpm exec tsc --noEmit` for type safety after every step, plus a final manual end-to-end pass in the browser dev server (per project convention established by the two prior features in this session).

---

## Context for every task

- Reference spec: `docs/superpowers/specs/2026-07-01-xml-import-solicitacao-design.md` (committed, approved by user).
- The form component is `src/app/(private)/cliente/solicitar/page.tsx`. It is a client component (`"use client"`).
- `PROJECT_AREAS`/`PROJECT_THEMES_BY_AREA` used inside `page.tsx` are **not** the static constants — they come from the `useTaxonomy()` hook (`src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts`), which is DB-backed with a static fallback. Any new code resolving area/tema labels **must** use the same hook output already destructured in `page.tsx` (`PROJECT_AREAS`, `PROJECT_THEMES_BY_AREA`, `buildClienteProjectTypeLabel`), not a fresh import of the static constants, or it will silently diverge from what the dropdowns show.
- `PLATFORMS`, `TARGET_AUDIENCES`, `URGENCY_LEVELS`, `DEFAULT_PLATFORM_VALUE`, `PROCESS_FREQUENCIES`, `PROCESS_FREQUENCY_MULTIPLIERS` are imported in `page.tsx` from `./utils/solicitar.utils`, which just re-exports from `src/shared/constants/project-taxonomy.ts`. These ARE static (no DB backing) and safe to import directly in the new `xml-import.ts` module.
- Two label lists the form currently uses are **not** in any shared constant — they're hardcoded inline in `page.tsx`: the 4 "Já existe um processo/sistema atual?" `<SelectItem>` options (lines ~848-857) and the `BENEFIT_OPTIONS` array (lines 73-95). Both must be extracted into `project-taxonomy.ts` first (Task 1), otherwise the XML resolver and the help page would have to duplicate these lists by hand, which is exactly the drift risk the spec calls out.

---

### Task 1: Extract `HAS_EXISTING_SYSTEM_OPTIONS` and `BENEFIT_OPTIONS` into shared constants

**Files:**
- Modify: `src/shared/constants/project-taxonomy.ts`
- Modify: `src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts`
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Add the two constants to `project-taxonomy.ts`**

Append at the end of `src/shared/constants/project-taxonomy.ts` (after `TARGET_AUDIENCES`, before `FEATURE_SUGGESTION_GROUPS` — exact insertion point: right after line 108, the closing `];` of `TARGET_AUDIENCES`):

```ts
export const HAS_EXISTING_SYSTEM_OPTIONS = [
  { value: "nao", label: "Não, projeto do zero" },
  { value: "sim-substituir", label: "Sim, quero substituir" },
  { value: "sim-integrar", label: "Sim, quero integrar/migrar dados" },
  { value: "sim-melhorar", label: "Sim, quero melhorar o existente" },
];

export const BENEFIT_OPTIONS = [
  {
    key: "reducao-trabalho-operacional",
    label: "Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)",
  },
  {
    key: "melhor-relacionamento-cliente",
    label: "Melhor relacionamento com o cliente (experiência, atendimento, rapidez)",
  },
  {
    key: "melhor-relacionamento-fornecedor-parceiro",
    label: "Melhor relacionamento com fornecedores ou parceiros",
  },
  {
    key: "reducao-multas-infracoes",
    label: "Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais)",
  },
  {
    key: "melhoria-qualidade-trabalho",
    label: "Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade)",
  },
  { key: "outro", label: "Outro" },
];
```

- [ ] **Step 2: Re-export both from `solicitar.utils.ts`**

Replace the full content of `src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts` with:

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
  HAS_EXISTING_SYSTEM_OPTIONS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 3: Use the constants in `page.tsx` instead of inline copies**

In `src/app/(private)/cliente/solicitar/page.tsx`:

3a. Add `HAS_EXISTING_SYSTEM_OPTIONS` and `BENEFIT_OPTIONS` to the existing import block from `./utils/solicitar.utils` (currently lines 45-52):

```ts
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  BENEFIT_OPTIONS,
} from "./utils/solicitar.utils";
```

3b. Delete the inline `const BENEFIT_OPTIONS = [...]` block entirely (currently lines 73-95 — the whole block from `const BENEFIT_OPTIONS = [` through the closing `];`). It's now imported instead.

3c. Replace the hardcoded `<SelectItem>` list for "Já existe um processo/sistema atual?" (currently lines 847-858):

Find:
```tsx
                        <SelectContent>
                          <SelectItem value="nao">Não, projeto do zero</SelectItem>
                          <SelectItem value="sim-substituir">
                            Sim, quero substituir
                          </SelectItem>
                          <SelectItem value="sim-integrar">
                            Sim, quero integrar/migrar dados
                          </SelectItem>
                          <SelectItem value="sim-melhorar">
                            Sim, quero melhorar o existente
                          </SelectItem>
                        </SelectContent>
```

Replace with:
```tsx
                        <SelectContent>
                          {HAS_EXISTING_SYSTEM_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
```

- [ ] **Step 4: Verify types**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/constants/project-taxonomy.ts src/app/\(private\)/cliente/solicitar/utils/solicitar.utils.ts src/app/\(private\)/cliente/solicitar/page.tsx
git commit -m "refactor: extract hasExistingSystem and benefit options into shared constants"
```

---

### Task 2: Extract `buildProjectPayload` shared helper and refactor `onSubmit` to use it

**Files:**
- Create: `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

This is a pure refactor: the exact mapping logic currently inline in `onSubmit` (lines 337-460 minus the file-attachment loop and the toast/redirect) moves into a standalone function so the upcoming XML import path (Task 5) can call the identical code. No behavior change for the manual form.

- [ ] **Step 1: Create `build-project-payload.ts`**

```ts
import type { Project } from "@/shared/types";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import { PLATFORMS } from "./solicitar.utils";

export type ProjectPayload = Omit<Project, "id" | "createdAt" | "updatedAt">;

export function buildProjectPayload(params: {
  data: SolicitarProjetoFormData;
  features: string[];
  benefits: string[];
  clientId: string;
  companyId: string | undefined;
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
}): ProjectPayload {
  const { data, features, benefits, clientId, companyId, areas, themesByArea, buildTypeLabel } =
    params;

  const areaLabel =
    data.projectArea === "outro"
      ? data.customProjectArea.trim()
      : areas.find((a) => a.value === data.projectArea)?.label ?? "";
  const themeLabel =
    data.projectTheme === "outro"
      ? data.customProjectTheme.trim()
      : (themesByArea[data.projectArea] ?? []).find((t) => t.value === data.projectTheme)
          ?.label ?? "";
  const typeLabel =
    data.projectArea === "outro" || data.projectTheme === "outro"
      ? [areaLabel, themeLabel].filter(Boolean).join(" - ") || "Outro"
      : buildTypeLabel(data.projectArea, data.projectTheme);

  const platformLabel = PLATFORMS.find((p) => p.value === data.platform)?.label ?? data.platform;
  const projectTypeWithPlatform = `${typeLabel} · Plataforma: ${platformLabel}`;

  const targetAudienceValue =
    data.targetAudience === "outro" ? data.customTargetAudience.trim() : data.targetAudience;

  const monthlyHours = data.monthlyHoursSaved ? Number(data.monthlyHoursSaved) : undefined;
  const peopleInvolvedValue = data.peopleInvolved ? Number(data.peopleInvolved) : undefined;
  const taskDurationHoursValue = data.taskDurationHours
    ? Number(data.taskDurationHours)
    : undefined;

  return {
    title: data.title,
    description: data.description,
    clientId,
    companyId,
    status: "backlog",
    priority:
      data.urgency === "urgente"
        ? "urgent"
        : data.urgency === "alta"
          ? "high"
          : data.urgency === "baixa"
            ? "low"
            : "medium",
    projectType: projectTypeWithPlatform,
    targetAudience: targetAudienceValue,
    expectedUsers: data.expectedUsers,
    urgency: data.urgency,
    features,
    estimatedDeadline: data.deadline ? new Date(data.deadline) : undefined,
    additionalInfo: data.additionalInfo || undefined,
    hasExistingSystem: data.hasExistingSystem || undefined,
    existingSystemDetails: data.existingSystemDetails || undefined,
    projectNarrative: data.projectNarrative || undefined,
    benefits: benefits.length ? benefits : undefined,
    benefitsDetails: data.benefitsDetails || undefined,
    monthlyHoursSaved: Number.isFinite(monthlyHours) ? monthlyHours : undefined,
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
  };
}
```

- [ ] **Step 2: Refactor `onSubmit` in `page.tsx` to call it**

Replace the full body of `onSubmit` (currently lines 337-460) with:

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
    try {
      const payload = buildProjectPayload({
        data,
        features,
        benefits,
        clientId: user.id,
        companyId: selectedCompanyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      const projectId = await addProject(payload);

      if (projectId && attachedFiles.length > 0) {
        for (const file of attachedFiles) {
          try {
            await addFile({ projectId, file });
          } catch {
            // erro por arquivo é silencioso
          }
        }
      }

      toast({
        title: "Solicitação enviada",
        description: "Seu processo foi criado e está no backlog.",
      });
      router.push("/cliente");
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível criar o processo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
```

- [ ] **Step 3: Import `buildProjectPayload` in `page.tsx`**

Add near the other local util imports (after the `useTaxonomy` import, currently line 53):

```ts
import { buildProjectPayload } from "./utils/build-project-payload";
```

- [ ] **Step 4: Verify types**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify no behavior change in the browser**

Run: `pnpm dev`, open `/cliente/solicitar` logged in as a client, fill the form minimally (título, área, tema, descrição) and submit. Confirm the project is created and you're redirected to `/cliente`, exactly as before this refactor.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(private\)/cliente/solicitar/utils/build-project-payload.ts src/app/\(private\)/cliente/solicitar/page.tsx
git commit -m "refactor: extract project payload building out of onSubmit"
```

---

### Task 3: Create the XML parsing/resolution module

**Files:**
- Create: `src/app/(private)/cliente/solicitar/utils/xml-import.ts`

This is the core new logic: parse XML text with `DOMParser`, validate required tags, resolve menu-driven tags against label lists (with the "Outro" fallback for 3 fields, hard error for 4 fields, per the design spec), and produce a `SolicitarProjetoFormData`-shaped object plus `features`/`benefits` arrays and a resolved `companyId`.

- [ ] **Step 1: Write the module**

```ts
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  DEFAULT_PLATFORM_VALUE,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  BENEFIT_OPTIONS,
} from "./solicitar.utils";

export interface XmlImportContext {
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  companies: { id: string; name: string }[];
}

export type XmlImportResult =
  | {
      ok: true;
      formData: SolicitarProjetoFormData;
      features: string[];
      benefits: string[];
      companyId: string | undefined;
    }
  | { ok: false; error: string };

function getDirectChildText(parent: Element, tagName: string): string {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      return (child.textContent ?? "").trim();
    }
  }
  return "";
}

function getListItems(root: Element, groupTag: string, itemTag: string): string[] {
  const group = Array.from(root.children).find((c) => c.tagName === groupTag);
  if (!group) return [];
  return Array.from(group.children)
    .filter((c) => c.tagName === itemTag)
    .map((c) => (c.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

function matchByLabel<T extends { label: string }>(
  value: string,
  options: T[]
): T | undefined {
  const normalized = value.trim().toLowerCase();
  return options.find((o) => o.label.trim().toLowerCase() === normalized);
}

export function parseSolicitacaoXml(
  xmlText: string,
  context: XmlImportContext
): XmlImportResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  if (doc.querySelector("parsererror")) {
    return {
      ok: false,
      error:
        "O arquivo não é um XML válido. Verifique se todas as tags estão fechadas corretamente.",
    };
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== "solicitacaoDeProjeto") {
    return { ok: false, error: "A tag raiz do arquivo deve ser <solicitacaoDeProjeto>." };
  }

  const titulo = getDirectChildText(root, "titulo");
  if (!titulo) {
    return { ok: false, error: "A tag <titulo> é obrigatória e não pode ficar vazia." };
  }

  const descricao = getDirectChildText(root, "descricao");
  if (!descricao) {
    return { ok: false, error: "A tag <descricao> é obrigatória e não pode ficar vazia." };
  }

  // <empresa>
  const empresaTag = getDirectChildText(root, "empresa");
  let companyId: string | undefined;
  if (empresaTag) {
    const match = context.companies.find(
      (c) => c.name.trim().toLowerCase() === empresaTag.toLowerCase()
    );
    if (!match) {
      const names =
        context.companies.map((c) => c.name).join(", ") || "(nenhuma empresa vinculada a você)";
      return {
        ok: false,
        error: `A tag <empresa> tem o valor '${empresaTag}', que não corresponde a nenhuma empresa vinculada a você. Empresas disponíveis: ${names}.`,
      };
    }
    companyId = match.id;
  } else if (context.companies.length === 1) {
    companyId = context.companies[0].id;
  } else if (context.companies.length > 1) {
    return {
      ok: false,
      error: `A tag <empresa> está vazia, mas você está vinculado a mais de uma empresa. Informe uma das seguintes: ${context.companies.map((c) => c.name).join(", ")}.`,
    };
  }

  // <area> / <tema> — com fallback "Outro"
  const areaTag = getDirectChildText(root, "area");
  if (!areaTag) {
    return { ok: false, error: "A tag <area> é obrigatória e não pode ficar vazia." };
  }
  const areaMatch = matchByLabel(areaTag, context.areas);
  const projectArea = areaMatch ? areaMatch.value : "outro";
  const customProjectArea = areaMatch ? "" : areaTag;

  const temaTag = getDirectChildText(root, "tema");
  if (!temaTag) {
    return { ok: false, error: "A tag <tema> é obrigatória e não pode ficar vazia." };
  }
  const themesForArea = context.themesByArea[projectArea] ?? [];
  const temaMatch = matchByLabel(temaTag, themesForArea);
  const projectTheme = temaMatch ? temaMatch.value : "outro";
  const customProjectTheme = temaMatch ? "" : temaTag;

  // <plataforma> — sem fallback "Outro"
  const plataformaTag = getDirectChildText(root, "plataforma");
  let platform = DEFAULT_PLATFORM_VALUE;
  if (plataformaTag) {
    const platformMatch = matchByLabel(plataformaTag, PLATFORMS);
    if (!platformMatch) {
      return {
        ok: false,
        error: `A tag <plataforma> tem o valor '${plataformaTag}', que não é reconhecido. Valores aceitos: ${PLATFORMS.map((p) => p.label).join(", ")}.`,
      };
    }
    platform = platformMatch.value;
  }

  // <publicoAlvo> — com fallback "Outro"
  const publicoTag = getDirectChildText(root, "publicoAlvo");
  let targetAudience = "";
  let customTargetAudience = "";
  if (publicoTag) {
    const audienceMatch = matchByLabel(publicoTag, TARGET_AUDIENCES);
    if (audienceMatch) {
      targetAudience = audienceMatch.value;
    } else {
      targetAudience = "outro";
      customTargetAudience = publicoTag;
    }
  }

  const numeroUsuarios = getDirectChildText(root, "numeroUsuarios");

  // <processoExistente> — sem fallback "Outro"
  const processoExistenteTag = getDirectChildText(root, "processoExistente");
  let hasExistingSystem = "";
  if (processoExistenteTag) {
    const match = matchByLabel(processoExistenteTag, HAS_EXISTING_SYSTEM_OPTIONS);
    if (!match) {
      return {
        ok: false,
        error: `A tag <processoExistente> tem o valor '${processoExistenteTag}', que não é reconhecido. Valores aceitos: ${HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label).join(", ")}.`,
      };
    }
    hasExistingSystem = match.value;
  }

  const existingSystemDetails = getDirectChildText(root, "detalhesProcessoAtual");

  // <colaboradoresEnvolvidos>
  const colaboradoresTag = getDirectChildText(root, "colaboradoresEnvolvidos");
  let peopleInvolved = "";
  if (colaboradoresTag) {
    const n = Number(colaboradoresTag);
    if (!Number.isInteger(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <colaboradoresEnvolvidos> deve ser um número inteiro maior ou igual a zero. Valor recebido: '${colaboradoresTag}'.`,
      };
    }
    peopleInvolved = String(n);
  }

  // <duracaoPorExecucao>
  const duracaoTag = getDirectChildText(root, "duracaoPorExecucao");
  let taskDurationHours = "";
  if (duracaoTag) {
    const n = Number(duracaoTag);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <duracaoPorExecucao> deve ser um número maior ou igual a zero. Valor recebido: '${duracaoTag}'.`,
      };
    }
    taskDurationHours = String(n);
  }

  // <periodicidade> — sem fallback "Outro"
  const periodicidadeTag = getDirectChildText(root, "periodicidade");
  let processFrequency = "";
  if (periodicidadeTag) {
    const match = matchByLabel(periodicidadeTag, PROCESS_FREQUENCIES);
    if (!match) {
      return {
        ok: false,
        error: `A tag <periodicidade> tem o valor '${periodicidadeTag}', que não é reconhecido. Valores aceitos: ${PROCESS_FREQUENCIES.map((p) => p.label).join(", ")}.`,
      };
    }
    processFrequency = match.value;
  }

  const projectNarrative = getDirectChildText(root, "narrativaDoProcesso");
  const features = getListItems(root, "funcionalidades", "funcionalidade");

  // <beneficios>
  const beneficioItems = getListItems(root, "beneficios", "beneficio");
  const benefits: string[] = [];
  for (const item of beneficioItems) {
    const match = matchByLabel(item, BENEFIT_OPTIONS);
    if (!match) {
      return {
        ok: false,
        error: `O item '${item}' dentro de <beneficios> não corresponde a nenhum benefício conhecido. Valores aceitos: ${BENEFIT_OPTIONS.map((b) => b.label).join(", ")}.`,
      };
    }
    benefits.push(match.key);
  }

  const benefitsDetails = getDirectChildText(root, "detalhesBeneficios");

  // <horasEconomizadasPorMes>
  const horasTag = getDirectChildText(root, "horasEconomizadasPorMes");
  let monthlyHoursSaved = "";
  if (horasTag) {
    const n = Number(horasTag);
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        error: `A tag <horasEconomizadasPorMes> deve ser um número maior ou igual a zero. Valor recebido: '${horasTag}'.`,
      };
    }
    monthlyHoursSaved = String(n);
  }

  // Avaliações 1-5
  function parseRating(tag: string): { value: number | null } | { error: string } {
    const text = getDirectChildText(root, tag);
    if (!text) return { value: null };
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return {
        error: `A tag <${tag}> deve ser um número inteiro entre 1 e 5. Valor recebido: '${text}'.`,
      };
    }
    return { value: n };
  }

  const ratingErrorReductionResult = parseRating("avaliacaoReducaoErros");
  if ("error" in ratingErrorReductionResult) {
    return { ok: false, error: ratingErrorReductionResult.error };
  }
  const ratingProcessCriticalityResult = parseRating("avaliacaoCriticidadeProcesso");
  if ("error" in ratingProcessCriticalityResult) {
    return { ok: false, error: ratingProcessCriticalityResult.error };
  }
  const ratingInternalImpactResult = parseRating("avaliacaoImpactoInterno");
  if ("error" in ratingInternalImpactResult) {
    return { ok: false, error: ratingInternalImpactResult.error };
  }
  const ratingExternalImpactResult = parseRating("avaliacaoImpactoExterno");
  if ("error" in ratingExternalImpactResult) {
    return { ok: false, error: ratingExternalImpactResult.error };
  }
  const ratingComplianceResult = parseRating("avaliacaoAtendimentoPoliticas");
  if ("error" in ratingComplianceResult) {
    return { ok: false, error: ratingComplianceResult.error };
  }

  // <urgencia> — sem fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    if (!match) {
      return {
        ok: false,
        error: `A tag <urgencia> tem o valor '${urgenciaTag}', que não é reconhecido. Valores aceitos: ${URGENCY_LEVELS.map((u) => u.label).join(", ")}.`,
      };
    }
    urgency = match.value;
  }

  // <prazoLimite>
  const prazoTag = getDirectChildText(root, "prazoLimite");
  let deadline = "";
  if (prazoTag) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazoTag)) {
      return {
        ok: false,
        error: `A tag <prazoLimite> deve estar no formato AAAA-MM-DD. Valor recebido: '${prazoTag}'.`,
      };
    }
    deadline = prazoTag;
  }

  const additionalInfo = getDirectChildText(root, "informacoesAdicionais");

  const formData: SolicitarProjetoFormData = {
    title: titulo,
    projectArea,
    customProjectArea,
    projectTheme,
    customProjectTheme,
    platform,
    description: descricao,
    targetAudience,
    customTargetAudience,
    expectedUsers: numeroUsuarios,
    hasExistingSystem,
    existingSystemDetails,
    peopleInvolved,
    taskDurationHours,
    processFrequency,
    benefitsDetails,
    monthlyHoursSaved,
    ratingErrorReduction: ratingErrorReductionResult.value,
    ratingProcessCriticality: ratingProcessCriticalityResult.value,
    ratingInternalImpact: ratingInternalImpactResult.value,
    ratingExternalImpact: ratingExternalImpactResult.value,
    ratingCompliance: ratingComplianceResult.value,
    projectNarrative,
    urgency,
    deadline,
    additionalInfo,
  };

  return { ok: true, formData, features, benefits, companyId };
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(private\)/cliente/solicitar/utils/xml-import.ts
git commit -m "feat: add XML parsing and field-resolution logic for project import"
```

---

### Task 4: Create the blank downloadable XML template

**Files:**
- Create: `public/modelo-solicitacao-projeto.xml`

- [ ] **Step 1: Write the template file**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <empresa></empresa>
  <titulo></titulo>
  <area></area>
  <tema></tema>
  <plataforma></plataforma>
  <descricao></descricao>
  <publicoAlvo></publicoAlvo>
  <numeroUsuarios></numeroUsuarios>
  <processoExistente></processoExistente>
  <detalhesProcessoAtual></detalhesProcessoAtual>
  <colaboradoresEnvolvidos></colaboradoresEnvolvidos>
  <duracaoPorExecucao></duracaoPorExecucao>
  <periodicidade></periodicidade>
  <narrativaDoProcesso></narrativaDoProcesso>
  <funcionalidades>
    <!-- <funcionalidade>Exemplo de funcionalidade</funcionalidade> -->
  </funcionalidades>
  <beneficios>
    <!-- <beneficio>Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)</beneficio> -->
  </beneficios>
  <detalhesBeneficios></detalhesBeneficios>
  <horasEconomizadasPorMes></horasEconomizadasPorMes>
  <avaliacaoReducaoErros></avaliacaoReducaoErros>
  <avaliacaoCriticidadeProcesso></avaliacaoCriticidadeProcesso>
  <avaliacaoImpactoInterno></avaliacaoImpactoInterno>
  <avaliacaoImpactoExterno></avaliacaoImpactoExterno>
  <avaliacaoAtendimentoPoliticas></avaliacaoAtendimentoPoliticas>
  <urgencia></urgencia>
  <prazoLimite></prazoLimite>
  <informacoesAdicionais></informacoesAdicionais>
</solicitacaoDeProjeto>
```

- [ ] **Step 2: Verify it's well-formed XML**

Run: `pnpm exec node -e "const fs=require('fs');const {DOMParser}=require('@xmldom/xmldom');" 2>/dev/null || true`

This project has no XML-parsing devDependency, so instead just visually confirm every opening tag has a matching closing tag (already true above) and open the file directly in a browser tab (`file:///.../public/modelo-solicitacao-projeto.xml`) — browsers render/parse-error XML natively, so a blank page with no "This page contains the following errors" banner confirms it's valid.

- [ ] **Step 3: Commit**

```bash
git add public/modelo-solicitacao-projeto.xml
git commit -m "feat: add blank XML template for project request import"
```

---

### Task 5: Wire up the "Importar XML" button and handler in `page.tsx`

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Add imports**

Add to the lucide-react import block (currently lines 36-44), adding `Upload`:

```ts
import {
  ArrowLeft,
  ArrowRight,
  Send,
  HelpCircle,
  Plus,
  X,
  Check,
  Upload,
} from "lucide-react";
```

Add a new import for the XML parser right after the `build-project-payload` import added in Task 2:

```ts
import { parseSolicitacaoXml } from "./utils/xml-import";
```

- [ ] **Step 2: Add a ref for the hidden file input**

Next to the existing `fileInputRef` declaration (currently line 278):

```ts
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Add the import handler function**

Add this function right after `handleAttachFilesChange` (currently ends at line 318), before `async function goNext()`:

```tsx
  async function handleImportXmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!user?.id) {
      toast({
        title: "Erro",
        description: "Faça login para importar um XML.",
        variant: "destructive",
      });
      return;
    }

    const xmlText = await file.text();
    const result = parseSolicitacaoXml(xmlText, {
      areas: PROJECT_AREAS,
      themesByArea: PROJECT_THEMES_BY_AREA,
      companies: myCompanies,
    });

    if (!result.ok) {
      toast({
        title: "Erro ao importar XML",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = buildProjectPayload({
        data: result.formData,
        features: result.features,
        benefits: result.benefits,
        clientId: user.id,
        companyId: result.companyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);

      toast({
        title: "Solicitação enviada",
        description: "Seu processo foi criado e está no backlog.",
      });
      router.push("/cliente");
    } catch {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível criar o processo. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
```

- [ ] **Step 4: Add the UI block**

Insert right after the `<header>` block and before the `{/* Stepper */}` comment (currently between lines 479 and 481):

```tsx
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-border p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => xmlInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar XML
          </Button>
          <input
            ref={xmlInputRef}
            type="file"
            accept=".xml,text/xml"
            className="hidden"
            onChange={handleImportXmlFile}
          />
          <a
            href="/modelo-solicitacao-projeto.xml"
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Baixar modelo em branco
          </a>
          <Link
            href="/cliente/solicitar/ajuda-xml"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ajuda com as tags do XML
          </Link>
        </div>

```

- [ ] **Step 5: Verify types**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(private\)/cliente/solicitar/page.tsx
git commit -m "feat: add XML import button and handler to solicitar-projeto page"
```

---

### Task 6: Create the XML help page

**Files:**
- Create: `src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/src/shared/components/ui/button";
import {
  PLATFORMS,
  TARGET_AUDIENCES,
  URGENCY_LEVELS,
  PROCESS_FREQUENCIES,
  HAS_EXISTING_SYSTEM_OPTIONS,
  BENEFIT_OPTIONS,
} from "../utils/solicitar.utils";
import { useTaxonomy } from "../utils/use-taxonomy";

type TagHelp = {
  tag: string;
  required: boolean;
  description: string;
  acceptedValues?: string[];
};

export default function AjudaXmlPage() {
  const { areas, themesByArea } = useTaxonomy();

  const allThemeLabels = Object.values(themesByArea).flatMap((themes) =>
    themes.map((t) => t.label)
  );

  const tags: TagHelp[] = [
    {
      tag: "empresa",
      required: false,
      description:
        "Nome de uma das empresas vinculadas a você. Se você só tiver uma empresa, pode deixar vazio.",
    },
    { tag: "titulo", required: true, description: "Nome do processo." },
    {
      tag: "area",
      required: true,
      description:
        'Área do processo. Se o valor não corresponder a nenhuma opção conhecida, é tratado automaticamente como "Outro".',
      acceptedValues: areas.map((a) => a.label),
    },
    {
      tag: "tema",
      required: true,
      description:
        'Tema dentro da área escolhida. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: allThemeLabels,
    },
    {
      tag: "plataforma",
      required: false,
      description:
        "Onde o processo vai funcionar. Um valor não reconhecido gera erro (não existe opção Outro para este campo). Se vazio, usa o padrão (Desktop).",
      acceptedValues: PLATFORMS.map((p) => p.label),
    },
    { tag: "descricao", required: true, description: "Objetivo principal e problema que o processo resolve." },
    {
      tag: "publicoAlvo",
      required: false,
      description: 'Setor envolvido. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: TARGET_AUDIENCES.map((t) => t.label),
    },
    {
      tag: "numeroUsuarios",
      required: false,
      description: 'Estimativa de quantas pessoas vão usar (texto livre, ex.: "10 funcionários").',
    },
    {
      tag: "processoExistente",
      required: false,
      description:
        "Se já existe um processo ou sistema atual. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label),
    },
    {
      tag: "detalhesProcessoAtual",
      required: false,
      description: "Como o processo funciona hoje e o que costuma dar errado.",
    },
    {
      tag: "colaboradoresEnvolvidos",
      required: false,
      description: "Número de colaboradores envolvidos na execução manual hoje (número inteiro).",
    },
    {
      tag: "duracaoPorExecucao",
      required: false,
      description:
        "Duração total de cada execução em horas, somando o tempo de todos os envolvidos, não só de uma pessoa (número).",
    },
    {
      tag: "periodicidade",
      required: false,
      description:
        "Frequência com que o processo acontece. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: PROCESS_FREQUENCIES.map((p) => p.label),
    },
    {
      tag: "narrativaDoProcesso",
      required: false,
      description: "Descrição livre de como o processo deveria funcionar, fluxos e cenários de uso.",
    },
    {
      tag: "funcionalidades",
      required: false,
      description:
        "Lista de funcionalidades desejadas. Cada item vai em uma tag <funcionalidade> dentro dela.",
    },
    {
      tag: "beneficios",
      required: false,
      description:
        "Lista de benefícios esperados. Cada item vai em uma tag <beneficio> dentro dela, e cada um deve corresponder a uma das opções abaixo.",
      acceptedValues: BENEFIT_OPTIONS.map((b) => b.label),
    },
    {
      tag: "detalhesBeneficios",
      required: false,
      description: "Descrição livre das economias e benefícios principais esperados.",
    },
    {
      tag: "horasEconomizadasPorMes",
      required: false,
      description: "Estimativa de horas economizadas por mês (número).",
    },
    {
      tag: "avaliacaoReducaoErros",
      required: false,
      description: "Avaliação de 1 a 5 do quanto o processo reduz erros.",
    },
    {
      tag: "avaliacaoCriticidadeProcesso",
      required: false,
      description: "Avaliação de 1 a 5 da criticidade do processo para a empresa.",
    },
    {
      tag: "avaliacaoImpactoInterno",
      required: false,
      description: "Avaliação de 1 a 5 do impacto interno na própria área.",
    },
    {
      tag: "avaliacaoImpactoExterno",
      required: false,
      description: "Avaliação de 1 a 5 do impacto externo (clientes/fornecedores).",
    },
    {
      tag: "avaliacaoAtendimentoPoliticas",
      required: false,
      description: "Avaliação de 1 a 5 do atendimento a políticas e leis.",
    },
    {
      tag: "urgencia",
      required: false,
      description:
        "Nível de urgência. Um valor não reconhecido gera erro (não existe opção Outro para este campo).",
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
    },
    { tag: "prazoLimite", required: false, description: "Data limite desejada, no formato AAAA-MM-DD." },
    {
      tag: "informacoesAdicionais",
      required: false,
      description: "Restrições técnicas, integrações, segurança, dados da empresa, etc.",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header className="flex items-center gap-3">
        <Link href="/cliente/solicitar">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ajuda: importação por XML</h1>
          <p className="text-sm text-muted-foreground">
            O que cada tag do arquivo de importação significa e quais valores são aceitos.
          </p>
        </div>
      </header>

      <a href="/modelo-solicitacao-projeto.xml" download>
        <Button variant="secondary">
          <Download className="mr-2 h-4 w-4" />
          Baixar modelo em branco
        </Button>
      </a>

      <div className="space-y-4">
        {tags.map((t) => (
          <div key={t.tag} className="rounded-md border border-border p-4 space-y-1">
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono text-primary">&lt;{t.tag}&gt;</code>
              {t.required && <span className="text-xs text-destructive">obrigatório</span>}
            </div>
            <p className="text-sm text-muted-foreground">{t.description}</p>
            {t.acceptedValues && t.acceptedValues.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Valores aceitos: {t.acceptedValues.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the page renders**

Run: `pnpm dev`, navigate to `/cliente/solicitar/ajuda-xml` while logged in as a client. Confirm all 25 tag cards render, area/tema accepted-value lists are non-empty, and the "Baixar modelo em branco" button downloads the file from Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(private\)/cliente/solicitar/ajuda-xml/page.tsx
git commit -m "feat: add XML tag reference help page"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Verify the happy path**

Run `pnpm dev`, log in as a client with exactly one linked company. On `/cliente/solicitar`, click "Importar XML" and upload a file with this content (save it to the scratchpad first, e.g. `sample-valid.xml`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <titulo>Conciliação bancária mensal</titulo>
  <area>RPA</area>
  <tema>Automação de processos</tema>
  <plataforma>Desktop (Windows / macOS)</plataforma>
  <descricao>Hoje o time financeiro concilia manualmente os extratos bancários todo mês.</descricao>
  <publicoAlvo>Uso interno da empresa</publicoAlvo>
  <numeroUsuarios>3 funcionários</numeroUsuarios>
  <processoExistente>Sim, quero substituir</processoExistente>
  <detalhesProcessoAtual>Hoje é feito em planilha, sujeito a erro de digitação.</detalhesProcessoAtual>
  <colaboradoresEnvolvidos>2</colaboradoresEnvolvidos>
  <duracaoPorExecucao>4</duracaoPorExecucao>
  <periodicidade>Mensal</periodicidade>
  <narrativaDoProcesso>O robô deve baixar o extrato, comparar com o ERP e sinalizar divergências.</narrativaDoProcesso>
  <funcionalidades>
    <funcionalidade>Download automático do extrato</funcionalidade>
    <funcionalidade>Comparação com o ERP</funcionalidade>
  </funcionalidades>
  <beneficios>
    <beneficio>Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)</beneficio>
  </beneficios>
  <detalhesBeneficios>Elimina cerca de 8 horas de trabalho manual por mês.</detalhesBeneficios>
  <horasEconomizadasPorMes>8</horasEconomizadasPorMes>
  <avaliacaoReducaoErros>4</avaliacaoReducaoErros>
  <avaliacaoCriticidadeProcesso>3</avaliacaoCriticidadeProcesso>
  <avaliacaoImpactoInterno>3</avaliacaoImpactoInterno>
  <avaliacaoImpactoExterno>1</avaliacaoImpactoExterno>
  <avaliacaoAtendimentoPoliticas>2</avaliacaoAtendimentoPoliticas>
  <urgencia>Média — próximos 2 a 3 meses</urgencia>
  <prazoLimite>2026-09-01</prazoLimite>
  <informacoesAdicionais>Precisa rodar em uma máquina sem acesso à internet externa.</informacoesAdicionais>
</solicitacaoDeProjeto>
```

Expected: success toast, redirect to `/cliente`, and the new project appears with title "Conciliação bancária mensal". Open the project and confirm (via admin view or DB) that `peopleInvolved=2`, `taskDurationHours=4`, `processFrequency="mensal"`, `deadline`/`estimatedDeadline` is 2026-09-01, and `benefits` contains the reduction-of-operational-work key.

- [ ] **Step 2: Verify the "Outro" fallback path**

Upload a file identical to above except `<area>Logística</area>` (a value that matches no known area label). Expected: success (no error), and the created project's type label reflects "Logística" as a custom area (check via `projectType` field on the created project, e.g. in the admin project list — it should read something like "Logística - ..." instead of a known taxonomy label).

- [ ] **Step 3: Verify the hard-error path**

Upload a file identical to the happy-path one except `<periodicidade>toda hora</periodicidade>`. Expected: an error toast naming the `<periodicidade>` tag and listing the 6 accepted values (Diário, Duas vezes por semana, Três vezes por semana, Semanal, Mensal, Anual) — and confirm no project was created (check `/cliente` project list count is unchanged).

- [ ] **Step 4: Verify the missing-required-tag path**

Upload a file with `<titulo></titulo>` left empty. Expected: an error toast saying the `<titulo>` tag is required, no project created.

- [ ] **Step 5: Verify the ambiguous-company path (only if the test user has 2+ companies)**

If the logged-in user has more than one linked company, upload a file with `<empresa>` left empty. Expected: an error toast asking to specify one of the linked company names, no project created.

- [ ] **Step 6: Final full-project type check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors across the whole project.

---

## Self-review notes

- **Spec coverage:** every confirmed requirement (one file = one project, importer = existing client-facing screen, exact field set matching the form including the 3 operational diagnostic fields, technical/financial fields excluded, attachments excluded, direct creation with no review screen, zero new backend dependency, "Outro" fallback for exactly `area`/`tema`/`publicoAlvo` vs. hard error for `plataforma`/`processoExistente`/`periodicidade`/`urgencia`, blank template download, help page sourced from live constants) is implemented across Tasks 1-6 and checked in Task 7.
- **No placeholders:** every step has complete, exact code — no "add validation here" or "similar to Task N" shortcuts.
- **Type consistency:** `XmlImportResult`'s `formData` field is typed as `SolicitarProjetoFormData` (same type `onSubmit` already receives from `react-hook-form`), so `buildProjectPayload` — which takes a `SolicitarProjetoFormData` — works unmodified for both the manual-submit and XML-import call sites. `ProjectPayload` (`build-project-payload.ts`) matches `addProject`'s parameter type exactly (`Omit<Project, "id" | "createdAt" | "updatedAt">`), so no cast is needed at either call site.
