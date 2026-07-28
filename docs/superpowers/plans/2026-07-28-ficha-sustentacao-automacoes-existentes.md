# Ficha de sustentação das automações existentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o texto livre "Detalhes da aplicação existente" por uma ficha estruturada de seis campos opcionais (hospedagem, autor, responsável, local e referência dos acessos, em produção desde), preenchida na solicitação e exibida na ficha do projeto, na tela de Automações Existentes, no deck .pptx e em ambos os XMLs.

**Architecture:** Seis colunas nulas novas em `Project`, nenhuma tabela nova. Duas listas de opções como constantes em `project-taxonomy.ts`. Cada campo percorre o caminho já padronizado de qualquer campo de solicitação: schema Prisma → router tRPC (`create`/`update`/`importXml`) → tipos compartilhados → contexto → formulários → XMLs. Nenhum comportamento existente muda: campos ausentes continuam válidos em toda camada.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL, tRPC 11, Zod 3, react-hook-form, shadcn/ui, Recharts, PptxGenJS.

**Spec:** `docs/superpowers/specs/2026-07-28-ficha-sustentacao-automacoes-existentes-design.md`

---

## Nota sobre verificação

Este repositório **não tem framework de testes** (sem vitest, sem jest, sem arquivos `*.test.ts`). O plano não introduz um — isso não foi pedido e seria uma decisão de arquitetura separada.

A verificação de cada tarefa é, portanto:

1. `npx tsc --noEmit` — o gate principal. Como cada campo atravessa ~8 arquivos tipados, um campo esquecido em qualquer camada quebra a compilação.

   **Baseline:** o repositório já tem **10 erros pré-existentes** de `tsc`, todos em `src/shared/components/ui/` (boilerplate shadcn não usado: `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx`). Onde o plano diz "Expected: nenhum erro", leia **"nenhum erro novo fora de `src/shared/components/ui/`"**. Consertar esses 10 está fora do escopo desta feature.
2. ~~`pnpm lint`~~ — **indisponível.** O script existe em `package.json` (`"lint": "eslint ."`), mas o eslint não está instalado (não é devDependency e não há binário em `node_modules/.bin`). Onde o plano manda rodar `pnpm lint`, pule — é um buraco pré-existente do repo, fora do escopo desta feature.
3. Verificação manual no browser, com caminho de clique exato, nas tarefas de UI.

`parseProjetoCompletoXml` usa `DOMParser` (API de browser), então não dá para exercitá-lo por script Node — a verificação do round-trip XML é manual, pela própria UI de importação/exportação.

**Migration:** as migrations deste repo são SQL escrito à mão em pastas com timestamp (ver `prisma/migrations/20260722140000_add_main_tool_category/migration.sql`). O deploy roda a migration automaticamente no push para `main`. Não rode `prisma migrate dev` nem peça acesso a banco local.

---

## Estrutura de arquivos

**Criar:**
- `prisma/migrations/20260728120000_add_existing_automation_fields/migration.sql` — as seis colunas.

**Modificar:**
- `prisma/schema.prisma` — seis campos em `model Project`.
- `src/shared/constants/project-taxonomy.ts` — duas listas de opções.
- `src/shared/types/index.ts` — interface `Project`.
- `src/shared/context/projects-context.tsx` — tipo de entrada do mapper, mapper e `addProject`.
- `src/server/trpc/routers/project.router.ts` — `FIELD_LABELS`, mappers de `list`/`byId`, inputs e `data` de `create`/`update`/`importXml`, `getExistingAutomationsRanking`.
- `src/shared/schema/solicitar-projeto.ts` — campos do formulário.
- `src/app/(private)/cliente/solicitar/page.tsx` — `defaultValues`, `fieldsToValidate`, bloco de UI.
- `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts` — payload de criação.
- `src/shared/components/project-detail-sections.tsx` — nova `DetailSection`.
- `src/shared/components/project-request-edit-form.tsx` — estado, `handleSave`, UI de edição.
- `src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx` — duas colunas.
- `src/server/deck/build-existing-automations-deck.ts` — slide de inventário + linhas por projeto.
- `src/shared/xml/build-projeto-completo-xml.ts` — sete tags.
- `src/shared/xml/parse-projeto-completo-xml.ts` — sete tags.
- `src/shared/components/project-xml-import-export.tsx` — conversão da data importada.
- `src/app/api/empresas/[id]/xml-agregado/route.ts` — mapeamento dos campos.
- `src/app/(private)/cliente/solicitar/utils/xml-import.ts` — sete tags no XML de solicitação.
- `public/modelo-solicitacao-projeto.xml` — tags de exemplo.
- `docs/prompt-geracao-xml.md` — instruções para o LLM externo.

---

## Task 1: Schema, migration e constantes

**Files:**
- Modify: `prisma/schema.prisma:144-155`
- Create: `prisma/migrations/20260728120000_add_existing_automation_fields/migration.sql`
- Modify: `src/shared/constants/project-taxonomy.ts:121-125`

- [ ] **Step 1: Adicionar os seis campos ao schema Prisma**

Em `prisma/schema.prisma`, localize este trecho dentro de `model Project` (por volta da linha 151):

```prisma
  hasExistingSystem         String? // "nao" | "sim-substituir" | "sim-integrar" | "sim-melhorar"
  existingSystemDetails     String?
  hasCurrentApplication     String? // "sim" | "nao" - já existe uma aplicação/app para o processo hoje
  currentApplicationDetails String?
  projectNarrative          String?
```

Substitua por:

```prisma
  hasExistingSystem         String? // "nao" | "sim-substituir" | "sim-integrar" | "sim-melhorar"
  existingSystemDetails     String?
  hasCurrentApplication     String? // "sim" | "nao" - já existe uma aplicação/app para o processo hoje
  currentApplicationDetails String?
  projectNarrative          String?

  // Ficha de sustentacao da automacao que ja existe (so faz sentido quando
  // hasCurrentApplication = "sim"). Preenchida pelo solicitante no levantamento,
  // editavel depois por dev/arquiteto. Tudo opcional — a ficha e preenchida
  // incrementalmente. Ver docs/superpowers/specs/2026-07-28-ficha-sustentacao-automacoes-existentes-design.md
  currentApplicationHosting         String? // slug de CURRENT_APPLICATION_HOSTING_OPTIONS
  currentApplicationHostingCustom   String? // texto livre quando hosting = "outro"
  currentApplicationAuthor          String? // quem desenvolveu
  currentApplicationOwner           String? // quem cuida hoje
  currentApplicationAccessLocation  String? // slug de CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS
  // Ponteiro para ONDE o acesso mora (nome do cofre, caminho, com quem esta).
  // NUNCA a credencial em si — ver secao "Regra de seguranca" da spec.
  currentApplicationAccessReference String?
  currentApplicationLiveSince       DateTime? // em producao desde
```

- [ ] **Step 2: Escrever a migration SQL**

Crie `prisma/migrations/20260728120000_add_existing_automation_fields/migration.sql`:

```sql
-- Ficha de sustentação das automações existentes.
-- Seis colunas opcionais em projects; nenhum backfill — o texto livre já
-- existente em "currentApplicationDetails" permanece intocado como observações.
ALTER TABLE "projects" ADD COLUMN "currentApplicationHosting" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationHostingCustom" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAuthor" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwner" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAccessLocation" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAccessReference" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationLiveSince" TIMESTAMP(3);
```

- [ ] **Step 3: Adicionar as duas listas de opções**

Em `src/shared/constants/project-taxonomy.ts`, logo depois do bloco `HAS_CURRENT_APPLICATION_OPTIONS` (que termina na linha 125), insira:

```ts
// Ficha de sustentação da automação existente — listas curtas e estáveis, por
// isso constantes aqui em vez de tabela configurável (ao contrário de
// ProjectArea/MainTool/UrgencyLevel, que variam por cliente).
export const CURRENT_APPLICATION_HOSTING_OPTIONS = [
  { value: "servidor-proprio", label: "Servidor próprio (on-premise)" },
  { value: "vm-cliente", label: "Máquina virtual da empresa" },
  { value: "nuvem", label: "Nuvem (Azure, AWS, GCP)" },
  { value: "maquina-usuario", label: "Máquina de um usuário" },
  { value: "saas", label: "Plataforma SaaS do fornecedor" },
  { value: "nao-sei", label: "Não sei" },
  { value: "outro", label: "Outro" },
];

export const CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS = [
  { value: "cofre-senhas", label: "Cofre de senhas corporativo" },
  { value: "planilha", label: "Planilha ou documento compartilhado" },
  { value: "com-pessoa", label: "Com uma pessoa específica" },
  { value: "nao-se-sabe", label: "Não se sabe" },
  { value: "outro", label: "Outro" },
];

// Limite do ponteiro de acessos. Curto de propósito: desencoraja colar um bloco
// de credenciais num campo que é para dizer ONDE procurar, não O QUE usar.
export const CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH = 200;
```

- [ ] **Step 4: Reexportar as constantes no barrel do formulário de solicitação**

`src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts` é um barrel puro de re-export: tanto `page.tsx` quanto `xml-import.ts` importam as constantes de taxonomia **dele**, não direto de `@/shared/constants/project-taxonomy`. Adicione os três nomes novos à lista, antes do fechamento:

```ts
  HAS_CURRENT_APPLICATION_OPTIONS,
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 5: Regenerar o Prisma Client e verificar**

Run: `pnpm db:generate`
Expected: `✔ Generated Prisma Client` sem erros.

Run: `npx tsc --noEmit`
Expected: nenhum erro. (Os campos novos ainda não são usados em lugar nenhum, então a compilação continua limpa.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260728120000_add_existing_automation_fields/migration.sql src/shared/constants/project-taxonomy.ts "src/app/(private)/cliente/solicitar/utils/solicitar.utils.ts"
git commit -m "feat: campos de sustentacao da automacao existente no schema"
```

---

## Task 2: Camada de tipos e leitura (types, contexto, mappers do router)

**Files:**
- Modify: `src/shared/types/index.ts:66`
- Modify: `src/shared/context/projects-context.tsx:60` e `:104`
- Modify: `src/server/trpc/routers/project.router.ts:98` (FIELD_LABELS), `:215` (mapper de `list`), `:301` (mapper de `byId`)

- [ ] **Step 1: Adicionar os campos à interface `Project`**

Em `src/shared/types/index.ts`, localize (linha 66):

```ts
  currentApplicationDetails?: string;
  projectNarrative?: string;
```

Substitua por:

```ts
  currentApplicationDetails?: string;
  // Ficha de sustentação da automação existente
  currentApplicationHosting?: string;
  currentApplicationHostingCustom?: string;
  currentApplicationAuthor?: string;
  currentApplicationOwner?: string;
  currentApplicationAccessLocation?: string;
  currentApplicationAccessReference?: string;
  currentApplicationLiveSince?: Date;
  projectNarrative?: string;
```

- [ ] **Step 2: Adicionar os campos ao tipo de entrada do mapper do contexto**

Em `src/shared/context/projects-context.tsx`, localize (linha 60):

```ts
  currentApplicationDetails?: string | null;
  projectNarrative?: string | null;
```

Substitua por:

```ts
  currentApplicationDetails?: string | null;
  currentApplicationHosting?: string | null;
  currentApplicationHostingCustom?: string | null;
  currentApplicationAuthor?: string | null;
  currentApplicationOwner?: string | null;
  currentApplicationAccessLocation?: string | null;
  currentApplicationAccessReference?: string | null;
  currentApplicationLiveSince?: Date | null;
  projectNarrative?: string | null;
```

- [ ] **Step 3: Mapear os campos no corpo do mapper do contexto**

No mesmo arquivo, localize (linha 104):

```ts
    currentApplicationDetails: p.currentApplicationDetails ?? undefined,
    projectNarrative: p.projectNarrative ?? undefined,
```

Substitua por:

```ts
    currentApplicationDetails: p.currentApplicationDetails ?? undefined,
    currentApplicationHosting: p.currentApplicationHosting ?? undefined,
    currentApplicationHostingCustom: p.currentApplicationHostingCustom ?? undefined,
    currentApplicationAuthor: p.currentApplicationAuthor ?? undefined,
    currentApplicationOwner: p.currentApplicationOwner ?? undefined,
    currentApplicationAccessLocation: p.currentApplicationAccessLocation ?? undefined,
    currentApplicationAccessReference: p.currentApplicationAccessReference ?? undefined,
    currentApplicationLiveSince: p.currentApplicationLiveSince ?? undefined,
    projectNarrative: p.projectNarrative ?? undefined,
```

- [ ] **Step 4: Adicionar os rótulos pt-BR ao `FIELD_LABELS` do router**

Em `src/server/trpc/routers/project.router.ts`, localize (linha 98):

```ts
  currentApplicationDetails: "Detalhes da aplicação existente",
```

Substitua por:

```ts
  currentApplicationDetails: "Detalhes da aplicação existente",
  currentApplicationHosting: "Onde a automação roda",
  currentApplicationHostingCustom: "Onde a automação roda (outro)",
  currentApplicationAuthor: "Quem desenvolveu",
  currentApplicationOwner: "Responsável pela automação hoje",
  currentApplicationAccessLocation: "Onde ficam os acessos",
  currentApplicationAccessReference: "Referência dos acessos",
  currentApplicationLiveSince: "Em produção desde",
```

Esses rótulos são usados pelo `ActivityLog` para descrever quais campos mudaram numa edição.

**Nota importante:** os seis campos **não** entram em `ARCHITECT_ONLY_FIELDS` (linha 62). São campos de solicitação — o cliente-dono precisa poder editá-los.

- [ ] **Step 5: Mapear os campos nas duas queries de leitura**

No mesmo arquivo, o mapper de `list` (linha 215) e o de `byId` (linha 301) têm ambos a linha:

```ts
        currentApplicationDetails: p.currentApplicationDetails ?? undefined,
```

(no `byId` a variável se chama `project`, não `p` — confira o contexto antes de editar).

Em **cada um dos dois**, adicione logo abaixo o bloco correspondente. No mapper de `list` (variável `p`):

```ts
        currentApplicationHosting: p.currentApplicationHosting ?? undefined,
        currentApplicationHostingCustom: p.currentApplicationHostingCustom ?? undefined,
        currentApplicationAuthor: p.currentApplicationAuthor ?? undefined,
        currentApplicationOwner: p.currentApplicationOwner ?? undefined,
        currentApplicationAccessLocation: p.currentApplicationAccessLocation ?? undefined,
        currentApplicationAccessReference: p.currentApplicationAccessReference ?? undefined,
        currentApplicationLiveSince: p.currentApplicationLiveSince ?? undefined,
```

No mapper de `byId` (variável `project`):

```ts
        currentApplicationHosting: project.currentApplicationHosting ?? undefined,
        currentApplicationHostingCustom: project.currentApplicationHostingCustom ?? undefined,
        currentApplicationAuthor: project.currentApplicationAuthor ?? undefined,
        currentApplicationOwner: project.currentApplicationOwner ?? undefined,
        currentApplicationAccessLocation: project.currentApplicationAccessLocation ?? undefined,
        currentApplicationAccessReference: project.currentApplicationAccessReference ?? undefined,
        currentApplicationLiveSince: project.currentApplicationLiveSince ?? undefined,
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/index.ts src/shared/context/projects-context.tsx src/server/trpc/routers/project.router.ts
git commit -m "feat: expor campos de sustentacao nas leituras de projeto"
```

---

## Task 3: Escrita no backend (create, update, addProject)

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:379` (input de `create`), `:448` (data de `create`), `:545` (input de `update`), `:652` (data de `update`)
- Modify: `src/shared/context/projects-context.tsx:206` (`addProject`)

- [ ] **Step 1: Adicionar os campos ao input de `create`**

Em `src/server/trpc/routers/project.router.ts`, localize (linha 379):

```ts
        currentApplicationDetails: z.string().optional(),
        projectNarrative: z.string().optional(),
```

Substitua por:

```ts
        currentApplicationDetails: z.string().optional(),
        // Ficha de sustentação da automação existente
        currentApplicationHosting: z.string().optional(),
        currentApplicationHostingCustom: z.string().optional(),
        currentApplicationAuthor: z.string().optional(),
        currentApplicationOwner: z.string().optional(),
        currentApplicationAccessLocation: z.string().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .optional(),
        currentApplicationLiveSince: z.date().optional(),
        projectNarrative: z.string().optional(),
```

- [ ] **Step 2: Importar a constante de limite no router**

No topo de `src/server/trpc/routers/project.router.ts`, adicione `CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH` ao import já existente de `@/shared/constants/project-taxonomy`. Se não houver import desse módulo no arquivo, adicione uma linha nova junto aos demais imports:

```ts
import { CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH } from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 3: Gravar os campos no `create`**

Localize (linha 448):

```ts
          currentApplicationDetails: input.currentApplicationDetails ?? null,
          projectNarrative: input.projectNarrative ?? null,
```

Substitua por:

```ts
          currentApplicationDetails: input.currentApplicationDetails ?? null,
          currentApplicationHosting: input.currentApplicationHosting ?? null,
          currentApplicationHostingCustom: input.currentApplicationHostingCustom ?? null,
          currentApplicationAuthor: input.currentApplicationAuthor ?? null,
          currentApplicationOwner: input.currentApplicationOwner ?? null,
          currentApplicationAccessLocation: input.currentApplicationAccessLocation ?? null,
          currentApplicationAccessReference: input.currentApplicationAccessReference ?? null,
          currentApplicationLiveSince: input.currentApplicationLiveSince ?? null,
          projectNarrative: input.projectNarrative ?? null,
```

- [ ] **Step 4: Adicionar os campos ao input de `update`**

Localize (linha 545):

```ts
        currentApplicationDetails: z.string().nullable().optional(),
        projectNarrative: z.string().nullable().optional(),
```

Substitua por:

```ts
        currentApplicationDetails: z.string().nullable().optional(),
        currentApplicationHosting: z.string().nullable().optional(),
        currentApplicationHostingCustom: z.string().nullable().optional(),
        currentApplicationAuthor: z.string().nullable().optional(),
        currentApplicationOwner: z.string().nullable().optional(),
        currentApplicationAccessLocation: z.string().nullable().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .nullable()
          .optional(),
        currentApplicationLiveSince: z.date().nullable().optional(),
        projectNarrative: z.string().nullable().optional(),
```

- [ ] **Step 5: Gravar os campos no `update`**

Localize (linha 651):

```ts
      if (rest.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = rest.currentApplicationDetails;
```

Substitua por:

```ts
      if (rest.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = rest.currentApplicationDetails;
      if (rest.currentApplicationHosting !== undefined)
        data.currentApplicationHosting = rest.currentApplicationHosting;
      if (rest.currentApplicationHostingCustom !== undefined)
        data.currentApplicationHostingCustom = rest.currentApplicationHostingCustom;
      if (rest.currentApplicationAuthor !== undefined)
        data.currentApplicationAuthor = rest.currentApplicationAuthor;
      if (rest.currentApplicationOwner !== undefined)
        data.currentApplicationOwner = rest.currentApplicationOwner;
      if (rest.currentApplicationAccessLocation !== undefined)
        data.currentApplicationAccessLocation = rest.currentApplicationAccessLocation;
      if (rest.currentApplicationAccessReference !== undefined)
        data.currentApplicationAccessReference = rest.currentApplicationAccessReference;
      if (rest.currentApplicationLiveSince !== undefined)
        data.currentApplicationLiveSince = rest.currentApplicationLiveSince;
```

- [ ] **Step 6: Encaminhar os campos no `addProject` do contexto**

Em `src/shared/context/projects-context.tsx`, localize (linha 206):

```ts
        currentApplicationDetails: project.currentApplicationDetails,
        projectNarrative: project.projectNarrative,
```

Substitua por:

```ts
        currentApplicationDetails: project.currentApplicationDetails,
        currentApplicationHosting: project.currentApplicationHosting,
        currentApplicationHostingCustom: project.currentApplicationHostingCustom,
        currentApplicationAuthor: project.currentApplicationAuthor,
        currentApplicationOwner: project.currentApplicationOwner,
        currentApplicationAccessLocation: project.currentApplicationAccessLocation,
        currentApplicationAccessReference: project.currentApplicationAccessReference,
        currentApplicationLiveSince: project.currentApplicationLiveSince,
        projectNarrative: project.projectNarrative,
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 8: Commit**

```bash
git add src/server/trpc/routers/project.router.ts src/shared/context/projects-context.tsx
git commit -m "feat: aceitar campos de sustentacao em create e update de projeto"
```

---

## Task 4: Formulário de solicitação

**Files:**
- Modify: `src/shared/schema/solicitar-projeto.ts:29`
- Modify: `src/app/(private)/cliente/solicitar/page.tsx:146-149` (fieldsToValidate), `:228` (defaultValues), `:1113` (UI)
- Modify: `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts:90`

- [ ] **Step 1: Adicionar os campos ao schema Zod do formulário**

Em `src/shared/schema/solicitar-projeto.ts`, localize (linha 29):

```ts
    currentApplicationDetails: z.string().optional().default(""),
```

Substitua por:

```ts
    currentApplicationDetails: z.string().optional().default(""),
    // Ficha de sustentação — só faz sentido quando hasCurrentApplication = "sim",
    // mas nenhum campo é obrigatório: a ficha é preenchida incrementalmente.
    currentApplicationHosting: z.string().optional().default(""),
    currentApplicationHostingCustom: z.string().optional().default(""),
    currentApplicationAuthor: z.string().optional().default(""),
    currentApplicationOwner: z.string().optional().default(""),
    currentApplicationAccessLocation: z.string().optional().default(""),
    currentApplicationAccessReference: z
      .string()
      .max(
        CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
        "Use no máximo 200 caracteres — este campo é só a referência de onde encontrar o acesso"
      )
      .optional()
      .default(""),
    currentApplicationLiveSince: z.string().optional().default(""),
```

E no topo do arquivo, abaixo de `import { z } from "zod";`, adicione:

```ts
import { CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH } from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 2: Adicionar os campos aos `defaultValues` e ao `fieldsToValidate`**

Em `src/app/(private)/cliente/solicitar/page.tsx`, no array `fieldsToValidate` do passo `"envolvidos"` (linha 146-149), localize:

```ts
      "hasCurrentApplication",
      "customHasCurrentApplication",
      "currentApplicationDetails",
      "peopleInvolvedDetails",
```

Substitua por:

```ts
      "hasCurrentApplication",
      "customHasCurrentApplication",
      "currentApplicationDetails",
      "currentApplicationHosting",
      "currentApplicationHostingCustom",
      "currentApplicationAuthor",
      "currentApplicationOwner",
      "currentApplicationAccessLocation",
      "currentApplicationAccessReference",
      "currentApplicationLiveSince",
      "peopleInvolvedDetails",
```

(Isso só faz o passo revalidar esses campos ao avançar — nenhum deles é obrigatório, então nunca bloqueia.)

Em seguida, nos `defaultValues` (linha 228), localize:

```ts
      currentApplicationDetails: "",
```

Substitua por:

```ts
      currentApplicationDetails: "",
      currentApplicationHosting: "",
      currentApplicationHostingCustom: "",
      currentApplicationAuthor: "",
      currentApplicationOwner: "",
      currentApplicationAccessLocation: "",
      currentApplicationAccessReference: "",
      currentApplicationLiveSince: "",
```

- [ ] **Step 3: Adicionar o `watch` da hospedagem**

No mesmo arquivo, localize (linha 263):

```ts
  const hasCurrentApplication = watch("hasCurrentApplication");
```

Substitua por:

```ts
  const hasCurrentApplication = watch("hasCurrentApplication");
  const currentApplicationHosting = watch("currentApplicationHosting");
```

- [ ] **Step 4: Adicionar o bloco de UI da ficha**

No mesmo arquivo, localize o bloco condicional inteiro (linhas 1101-1113):

```tsx
                {hasCurrentApplication === "sim" && (
                  <div className="space-y-2">
                    <Label htmlFor="currentApplicationDetails">
                      Detalhes da aplicação existente
                    </Label>
                    <Textarea
                      id="currentApplicationDetails"
                      {...register("currentApplicationDetails")}
                      placeholder="Qual plataforma, quem desenvolveu, desde quando está em uso..."
                      rows={4}
                    />
                  </div>
                )}
```

Substitua por:

```tsx
                {hasCurrentApplication === "sim" && (
                  <div className="space-y-5 rounded-lg border border-border p-4">
                    <div className="space-y-1">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        Ficha da automação existente
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Tudo opcional — ajuda o TI a saber onde a automação vive e quem
                        cuida dela. O que você não souber, deixe em branco.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Onde essa automação roda hoje?</Label>
                      <div className="flex gap-2">
                        <Controller
                          control={control}
                          name="currentApplicationHosting"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                if (value !== "outro")
                                  setValue("currentApplicationHostingCustom", "");
                              }}
                            >
                              <SelectTrigger
                                className={
                                  currentApplicationHosting === "outro"
                                    ? "w-40 shrink-0"
                                    : "w-full"
                                }
                              >
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {CURRENT_APPLICATION_HOSTING_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {currentApplicationHosting === "outro" && (
                          <Input
                            id="currentApplicationHostingCustom"
                            {...register("currentApplicationHostingCustom")}
                            placeholder="Descreva onde roda"
                            className="flex-1"
                          />
                        )}
                      </div>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="currentApplicationAuthor">Quem desenvolveu?</Label>
                        <Input
                          id="currentApplicationAuthor"
                          {...register("currentApplicationAuthor")}
                          placeholder="Pessoa, equipe interna ou fornecedor"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currentApplicationOwner">Quem cuida dela hoje?</Label>
                        <Input
                          id="currentApplicationOwner"
                          {...register("currentApplicationOwner")}
                          placeholder="Quem chamar quando para de funcionar"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Onde ficam guardados os acessos que ela usa?</Label>
                      <Controller
                        control={control}
                        name="currentApplicationAccessLocation"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currentApplicationAccessReference">
                        Onde encontrar
                      </Label>
                      <Input
                        id="currentApplicationAccessReference"
                        {...register("currentApplicationAccessReference")}
                        maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
                        placeholder="Ex.: cofre TI — pasta Automações; ou: com o João do Financeiro"
                      />
                      <p className="text-xs text-muted-foreground">
                        Só a referência de onde procurar. Nunca escreva senhas, tokens ou
                        chaves aqui.
                      </p>
                      {errors.currentApplicationAccessReference && (
                        <p className="text-xs text-destructive">
                          {errors.currentApplicationAccessReference.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currentApplicationLiveSince">Em produção desde</Label>
                      <Input
                        id="currentApplicationLiveSince"
                        type="date"
                        {...register("currentApplicationLiveSince")}
                        className="sm:w-48"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="currentApplicationDetails">
                        Outras observações sobre a aplicação existente
                      </Label>
                      <Textarea
                        id="currentApplicationDetails"
                        {...register("currentApplicationDetails")}
                        placeholder="Limitações conhecidas, o que costuma quebrar, integrações..."
                        rows={4}
                      />
                    </div>
                  </div>
                )}
```

- [ ] **Step 5: Importar as constantes na página**

No mesmo arquivo, adicione ao import existente de `./utils/solicitar.utils` (que termina na linha 67, e é de onde `HAS_CURRENT_APPLICATION_OPTIONS` já vem — **não** importe direto de `@/shared/constants/project-taxonomy` aqui) os três novos nomes:

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
```

- [ ] **Step 6: Enviar os campos no payload de criação**

Em `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`, localize (linha 90):

```ts
    currentApplicationDetails: data.currentApplicationDetails || undefined,
```

Substitua por:

```ts
    currentApplicationDetails: data.currentApplicationDetails || undefined,
    currentApplicationHosting: data.currentApplicationHosting || undefined,
    currentApplicationHostingCustom: data.currentApplicationHostingCustom || undefined,
    currentApplicationAuthor: data.currentApplicationAuthor || undefined,
    currentApplicationOwner: data.currentApplicationOwner || undefined,
    currentApplicationAccessLocation: data.currentApplicationAccessLocation || undefined,
    currentApplicationAccessReference: data.currentApplicationAccessReference || undefined,
    currentApplicationLiveSince: data.currentApplicationLiveSince
      ? new Date(data.currentApplicationLiveSince)
      : undefined,
```

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

Run: `pnpm lint`
Expected: nenhum erro novo.

- [ ] **Step 8: Verificar manualmente no browser**

Run: `pnpm dev`

Caminho: abra `http://localhost:3000/cliente/solicitar` → preencha o passo "Básico" com qualquer conteúdo → avance para "Envolvidos" → em "Já existe uma aplicação (app/sistema) para esse processo hoje?" selecione **Sim**.

Expected:
- O bloco "Ficha da automação existente" aparece dentro de uma borda.
- Selecionar "Outro" em "Onde essa automação roda hoje?" revela o input de texto ao lado; trocar para outra opção limpa e esconde esse input.
- O campo "Onde encontrar" mostra o aviso "Nunca escreva senhas, tokens ou chaves aqui" e para de aceitar digitação em 200 caracteres.
- Avançar até o fim e enviar salva o projeto sem erro, mesmo com a ficha inteira em branco.

- [ ] **Step 9: Commit**

```bash
git add src/shared/schema/solicitar-projeto.ts "src/app/(private)/cliente/solicitar/page.tsx" "src/app/(private)/cliente/solicitar/utils/build-project-payload.ts"
git commit -m "feat: ficha de sustentacao no formulario de solicitacao"
```

---

## Task 5: Ficha do projeto (exibição e edição)

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx:121`
- Modify: `src/shared/components/project-request-edit-form.tsx:69` (estado), `:114` (init), `:210` (save), `:380` (UI)

- [ ] **Step 1: Adicionar a `DetailSection` de exibição**

Em `src/shared/components/project-detail-sections.tsx`, localize o fechamento da seção "Envolvidos & contexto atual" (linha 121):

```tsx
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
```

Substitua por:

```tsx
      </DetailSection>

      {hasSustentacaoData && (
        <DetailSection title="Sustentação & acessos">
          <FieldRow
            label="Onde a automação roda"
            value={
              project.currentApplicationHosting === "outro"
                ? maskFreeText(project.currentApplicationHostingCustom)
                : resolveLabel(
                    project.currentApplicationHosting,
                    CURRENT_APPLICATION_HOSTING_OPTIONS
                  )
            }
          />
          <FieldRow
            label="Em produção desde"
            value={
              project.currentApplicationLiveSince
                ? formatDate(new Date(project.currentApplicationLiveSince))
                : undefined
            }
          />
          <FieldRow
            label="Quem desenvolveu"
            value={maskFreeText(project.currentApplicationAuthor)}
          />
          <FieldRow
            label="Responsável hoje"
            value={maskFreeText(project.currentApplicationOwner)}
          />
          <FieldRow
            label="Onde ficam os acessos"
            value={resolveLabel(
              project.currentApplicationAccessLocation,
              CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS
            )}
          />
          <FieldRow
            label="Onde encontrar"
            value={maskFreeText(project.currentApplicationAccessReference)}
          />
        </DetailSection>
      )}

      <DetailSection title="Diagnóstico operacional">
```

- [ ] **Step 2: Calcular `hasSustentacaoData` e importar as constantes**

No mesmo arquivo, logo depois de `const solutionTypeLabels = ...` (linha 75), adicione:

```tsx
  // A seção só aparece quando há algo preenchido — projetos que não são
  // automações existentes não ganham um card vazio de "Não informado".
  const hasSustentacaoData = Boolean(
    project.currentApplicationHosting ||
      project.currentApplicationHostingCustom ||
      project.currentApplicationAuthor ||
      project.currentApplicationOwner ||
      project.currentApplicationAccessLocation ||
      project.currentApplicationAccessReference ||
      project.currentApplicationLiveSince
  );
```

E adicione ao import existente de `@/shared/constants/project-taxonomy` (linhas 15-22):

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
```

`formatDate` e `resolveLabel` já estão importados neste arquivo (linhas 7 e 21).

- [ ] **Step 3: Adicionar os campos ao estado do formulário de edição**

Em `src/shared/components/project-request-edit-form.tsx`, na interface `EditFormState`, localize (linha 69):

```ts
  currentApplicationDetails: string;
```

Substitua por:

```ts
  currentApplicationDetails: string;
  currentApplicationHosting: string;
  currentApplicationHostingCustom: string;
  currentApplicationAuthor: string;
  currentApplicationOwner: string;
  currentApplicationAccessLocation: string;
  currentApplicationAccessReference: string;
  currentApplicationLiveSince: string;
```

- [ ] **Step 4: Inicializar o estado a partir do projeto**

No mesmo arquivo, localize (linha 114):

```ts
    currentApplicationDetails: project.currentApplicationDetails ?? "",
```

Substitua por:

```ts
    currentApplicationDetails: project.currentApplicationDetails ?? "",
    currentApplicationHosting: project.currentApplicationHosting ?? "",
    currentApplicationHostingCustom: project.currentApplicationHostingCustom ?? "",
    currentApplicationAuthor: project.currentApplicationAuthor ?? "",
    currentApplicationOwner: project.currentApplicationOwner ?? "",
    currentApplicationAccessLocation: project.currentApplicationAccessLocation ?? "",
    currentApplicationAccessReference: project.currentApplicationAccessReference ?? "",
    currentApplicationLiveSince: toDateInputValue(project.currentApplicationLiveSince),
```

- [ ] **Step 5: Enviar os campos no `handleSave`**

No mesmo arquivo, localize (linha 210):

```ts
      currentApplicationDetails: form.currentApplicationDetails || null,
```

Substitua por:

```ts
      currentApplicationDetails: form.currentApplicationDetails || null,
      currentApplicationHosting: form.currentApplicationHosting || null,
      currentApplicationHostingCustom: form.currentApplicationHostingCustom || null,
      currentApplicationAuthor: form.currentApplicationAuthor || null,
      currentApplicationOwner: form.currentApplicationOwner || null,
      currentApplicationAccessLocation: form.currentApplicationAccessLocation || null,
      currentApplicationAccessReference: form.currentApplicationAccessReference || null,
      currentApplicationLiveSince: form.currentApplicationLiveSince
        ? new Date(form.currentApplicationLiveSince)
        : null,
```

- [ ] **Step 6: Adicionar a seção de edição**

No mesmo arquivo, localize o fechamento da `DetailSection` de contexto atual (linhas 380-383):

```tsx
        </div>
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
```

Substitua por:

```tsx
        </div>
      </DetailSection>

      <DetailSection title="Sustentação & acessos">
        <div className="space-y-1.5">
          <Label>Onde a automação roda</Label>
          <Select
            value={form.currentApplicationHosting}
            onValueChange={(v) => {
              set("currentApplicationHosting", v);
              if (v !== "outro") set("currentApplicationHostingCustom", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_HOSTING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.currentApplicationHosting === "outro" && (
          <div className="space-y-1.5">
            <Label htmlFor="edit-currentApplicationHostingCustom">Onde roda (outro)</Label>
            <Input
              id="edit-currentApplicationHostingCustom"
              value={form.currentApplicationHostingCustom}
              onChange={(e) => set("currentApplicationHostingCustom", e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationAuthor">Quem desenvolveu</Label>
          <Input
            id="edit-currentApplicationAuthor"
            value={form.currentApplicationAuthor}
            onChange={(e) => set("currentApplicationAuthor", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationOwner">Responsável hoje</Label>
          <Input
            id="edit-currentApplicationOwner"
            value={form.currentApplicationOwner}
            onChange={(e) => set("currentApplicationOwner", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Onde ficam os acessos</Label>
          <Select
            value={form.currentApplicationAccessLocation}
            onValueChange={(v) => set("currentApplicationAccessLocation", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationAccessReference">Onde encontrar</Label>
          <Input
            id="edit-currentApplicationAccessReference"
            value={form.currentApplicationAccessReference}
            maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
            onChange={(e) => set("currentApplicationAccessReference", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Só a referência de onde procurar. Nunca senhas, tokens ou chaves.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-currentApplicationLiveSince">Em produção desde</Label>
          <Input
            id="edit-currentApplicationLiveSince"
            type="date"
            value={form.currentApplicationLiveSince}
            onChange={(e) => set("currentApplicationLiveSince", e.target.value)}
          />
        </div>
      </DetailSection>

      <DetailSection title="Diagnóstico operacional">
```

- [ ] **Step 7: Importar as constantes no formulário de edição**

No mesmo arquivo, adicione ao import de `@/shared/constants/project-taxonomy`:

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
```

- [ ] **Step 8: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 9: Verificar manualmente no browser**

Run: `pnpm dev`

Caminho: `http://localhost:3000/admin/projetos` → abra um projeto qualquer → botão **Editar** → role até "Sustentação & acessos" → preencha "Quem desenvolveu" e "Onde a automação roda" → **Salvar**.

Expected:
- A seção "Sustentação & acessos" aparece no formulário de edição.
- Depois de salvar, a seção "Sustentação & acessos" aparece na visualização, entre "Envolvidos & contexto atual" e "Diagnóstico operacional", com os valores preenchidos.
- Num projeto com a ficha totalmente vazia, a seção **não** aparece na visualização.
- Selecionar "Outro" em hospedagem revela o campo de texto extra.

- [ ] **Step 10: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx src/shared/components/project-request-edit-form.tsx
git commit -m "feat: secao Sustentacao e acessos na ficha do projeto"
```

---

## Task 6: Tela Automações Existentes

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:1013-1057` (`getExistingAutomationsRanking`)
- Modify: `src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx:52-60` (tipo), `:254-260` (cabeçalho), `:282-311` (linhas)

- [ ] **Step 1: Selecionar e devolver os campos no ranking**

Em `src/server/trpc/routers/project.router.ts`, dentro de `getExistingAutomationsRanking`, localize o `select` (linha 1013-1025):

```ts
          select: {
            id: true,
            title: true,
            areaId: true,
            area: { select: { name: true } },
            ratingErrorReduction: true,
            ratingProcessCriticality: true,
            ratingInternalImpact: true,
            ratingExternalImpact: true,
            ratingCompliance: true,
            accumulatedSavingBRL: true,
            operationalStatus: true,
          },
```

Substitua por:

```ts
          select: {
            id: true,
            title: true,
            areaId: true,
            area: { select: { name: true } },
            ratingErrorReduction: true,
            ratingProcessCriticality: true,
            ratingInternalImpact: true,
            ratingExternalImpact: true,
            ratingCompliance: true,
            accumulatedSavingBRL: true,
            operationalStatus: true,
            currentApplicationHosting: true,
            currentApplicationHostingCustom: true,
            currentApplicationOwner: true,
          },
```

Em seguida, no objeto devolvido pelo `.map` (linha 1049-1057), localize:

```ts
        return {
          id: p.id,
          title: p.title,
          areaName: p.area?.name ?? null,
          qualitativeScorePercent,
          accumulatedSavingBRL: p.accumulatedSavingBRL,
          economiaScore,
          operationalStatus: p.operationalStatus,
        };
```

Substitua por:

```ts
        return {
          id: p.id,
          title: p.title,
          areaName: p.area?.name ?? null,
          qualitativeScorePercent,
          accumulatedSavingBRL: p.accumulatedSavingBRL,
          economiaScore,
          operationalStatus: p.operationalStatus,
          currentApplicationHosting: p.currentApplicationHosting,
          currentApplicationHostingCustom: p.currentApplicationHostingCustom,
          currentApplicationOwner: p.currentApplicationOwner,
        };
```

- [ ] **Step 2: Ampliar o tipo `RankingRow` na página**

Em `src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx`, localize (linha 52-60):

```ts
type RankingRow = {
  id: string;
  title: string;
  areaName: string | null;
  qualitativeScorePercent: number;
  accumulatedSavingBRL: number | null;
  economiaScore: number;
  operationalStatus: RobotOperationalStatus | null;
};
```

Substitua por:

```ts
type RankingRow = {
  id: string;
  title: string;
  areaName: string | null;
  qualitativeScorePercent: number;
  accumulatedSavingBRL: number | null;
  economiaScore: number;
  operationalStatus: RobotOperationalStatus | null;
  currentApplicationHosting: string | null;
  currentApplicationHostingCustom: string | null;
  currentApplicationOwner: string | null;
};

// "Outro" guarda o texto real no campo custom; qualquer outro slug vira o
// rótulo da taxonomia (resolveLabel devolve o próprio slug se não reconhecer).
function hostingLabelOf(row: RankingRow): string {
  if (row.currentApplicationHosting === "outro") {
    return row.currentApplicationHostingCustom || "Outro";
  }
  return resolveLabel(row.currentApplicationHosting, CURRENT_APPLICATION_HOSTING_OPTIONS) ?? "-";
}
```

E adicione o import no topo do arquivo:

```ts
import {
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

- [ ] **Step 3: Adicionar as colunas no cabeçalho da tabela**

No mesmo arquivo, localize (linha 254-260):

```tsx
                <TableHead className="w-12">#</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">Qualitativo %</TableHead>
                <TableHead>Status operacional</TableHead>
                <TableHead className="text-right">Economia acumulada</TableHead>
                <TableHead className="w-32" />
```

Substitua por:

```tsx
                <TableHead className="w-12">#</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Onde roda</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Qualitativo %</TableHead>
                <TableHead>Status operacional</TableHead>
                <TableHead className="text-right">Economia acumulada</TableHead>
                <TableHead className="w-32" />
```

- [ ] **Step 4: Adicionar as células nas linhas e corrigir os `colSpan`**

No mesmo arquivo, localize as duas células de estado vazio (linhas 266 e 272), que hoje usam `colSpan={7}`:

```tsx
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
```

Troque **as duas ocorrências** para `colSpan={9}` (duas colunas novas).

Em seguida, localize (linha 289-294):

```tsx
                      <TableCell className="text-muted-foreground">
                        {row.areaName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(row.qualitativeScorePercent)}%
                      </TableCell>
```

Substitua por:

```tsx
                      <TableCell className="text-muted-foreground">
                        {row.areaName ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[180px] truncate">
                        {hostingLabelOf(row)}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[160px] truncate">
                        {maskFreeText(row.currentApplicationOwner) ?? "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Math.round(row.qualitativeScorePercent)}%
                      </TableCell>
```

`maskFreeText` já está disponível neste componente (linha 103).

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

Nota: `handleViewDetails` faz um cast `as unknown as Project` (linha 127) que continua válido — as propriedades novas de `RankingRow` não conflitam.

- [ ] **Step 6: Verificar manualmente no browser**

Run: `pnpm dev`

Caminho: `http://localhost:3000/admin/empresas` → escolha uma empresa → **Automações existentes**.

Expected:
- Tabela com as colunas "Onde roda" e "Responsável" entre "Área" e "Qualitativo %".
- Automações sem ficha preenchida mostram `-` nessas colunas.
- O gráfico e as duas abas de ordenação continuam funcionando igual.

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/project.router.ts "src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx"
git commit -m "feat: colunas de hospedagem e responsavel em automacoes existentes"
```

---

## Task 7: Deck .pptx

**Files:**
- Modify: `src/server/deck/build-existing-automations-deck.ts:62-89` (query), `:97-103` (ordem dos slides), `:104-122` (linhas por projeto), fim do arquivo (nova função)

- [ ] **Step 1: Selecionar os campos na query do deck**

Em `src/server/deck/build-existing-automations-deck.ts`, localize o `select` do `db.project.findMany` (linha 68-87) e adicione, logo depois de `operationalStatus: true,`:

```ts
          currentApplicationHosting: true,
          currentApplicationHostingCustom: true,
          currentApplicationAuthor: true,
          currentApplicationOwner: true,
          currentApplicationAccessLocation: true,
          currentApplicationLiveSince: true,
```

- [ ] **Step 2: Adicionar os helpers de rótulo no topo do arquivo**

No mesmo arquivo, logo depois do `ROBOT_OPERATIONAL_STATUS_LABEL` (linha 39), adicione:

```ts
type ExistingAutomationProject = {
  title: string;
  currentApplicationHosting: string | null;
  currentApplicationHostingCustom: string | null;
  currentApplicationAuthor: string | null;
  currentApplicationOwner: string | null;
  currentApplicationAccessLocation: string | null;
  currentApplicationLiveSince: Date | null;
};

// "Outro" guarda o texto real no campo custom; os demais slugs viram rótulo
// da taxonomia. Sem valor nenhum, o deck mostra "-" em vez de célula vazia.
function hostingLabel(p: ExistingAutomationProject): string {
  if (p.currentApplicationHosting === "outro") {
    return p.currentApplicationHostingCustom || "Outro";
  }
  return resolveLabel(p.currentApplicationHosting, CURRENT_APPLICATION_HOSTING_OPTIONS) ?? "-";
}

function accessLabel(p: ExistingAutomationProject): string {
  return (
    resolveLabel(p.currentApplicationAccessLocation, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS) ??
    "-"
  );
}

function liveSinceLabel(p: ExistingAutomationProject): string {
  return p.currentApplicationLiveSince ? formatDate(p.currentApplicationLiveSince) : "-";
}

// Um projeto sem nenhum campo de ficha preenchido não entra no slide de
// inventário — uma tabela só de traços não informa nada.
function hasSustentacaoData(p: ExistingAutomationProject): boolean {
  return Boolean(
    p.currentApplicationHosting ||
      p.currentApplicationHostingCustom ||
      p.currentApplicationAuthor ||
      p.currentApplicationOwner ||
      p.currentApplicationAccessLocation ||
      p.currentApplicationLiveSince
  );
}
```

E amplie os imports do topo do arquivo:

```ts
import { formatCurrency, formatDate } from "@/shared/utils";
import {
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  resolveLabel,
} from "@/shared/constants/project-taxonomy";
```

(A linha 6 hoje importa só `formatCurrency` — substitua-a pela versão acima.)

- [ ] **Step 3: Adicionar a função do slide de inventário**

No fim de `src/server/deck/build-existing-automations-deck.ts`, adicione:

```ts
function addInventorySlide(pres: PptxGenJS, projects: ExistingAutomationProject[]): void {
  const withData = projects.filter(hasSustentacaoData);
  const slide = addTitledSlide(pres, "Inventário técnico — sustentação e acessos");

  if (withData.length === 0) {
    slide.addText("Nenhuma automação existente com ficha de sustentação preenchida.", {
      x: 0.5,
      y: 1.5,
      fontSize: 14,
      color: COLOR_MUTED,
    });
    return;
  }

  const header: TableRow = [
    { text: "Automação", options: TABLE_HEADER_OPTS },
    { text: "Onde roda", options: TABLE_HEADER_OPTS },
    { text: "Quem fez", options: TABLE_HEADER_OPTS },
    { text: "Responsável", options: TABLE_HEADER_OPTS },
    { text: "Acessos", options: TABLE_HEADER_OPTS },
    { text: "Desde", options: TABLE_HEADER_OPTS },
  ];

  const rows: TableRow[] = withData.map((p) => [
    { text: p.title },
    { text: hostingLabel(p) },
    { text: p.currentApplicationAuthor ?? "-" },
    { text: p.currentApplicationOwner ?? "-" },
    { text: accessLabel(p) },
    { text: liveSinceLabel(p) },
  ]);

  addSlideTable(slide, [header, ...rows], [3.2, 2.2, 2, 2, 2, 1.2]);
}
```

- [ ] **Step 4: Chamar o slide novo e adicionar as linhas por projeto**

No mesmo arquivo, localize (linhas 101-122):

```ts
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  for (const project of projects) {
    const extraLines: QuantitativeLine[] = [
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? ROBOT_OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : "Sem status",
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
            : "Não informado",
        isSaving: true,
      },
    ];
    addProjectSlide(pres, project, extraLines);
  }
```

Substitua por:

```ts
  addInventorySlide(pres, projects);
  if (interviews.length > 0) {
    addInterviewsSlide(pres, interviews);
  }
  for (const project of projects) {
    const extraLines: QuantitativeLine[] = [
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? ROBOT_OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : "Sem status",
      },
      {
        label: "Economia acumulada (real)",
        value:
          project.accumulatedSavingBRL != null
            ? formatCurrency(project.accumulatedSavingBRL)
            : "Não informado",
        isSaving: true,
      },
      { label: "Onde roda", value: hostingLabel(project) },
      { label: "Quem desenvolveu", value: project.currentApplicationAuthor ?? "Não informado" },
      { label: "Responsável hoje", value: project.currentApplicationOwner ?? "Não informado" },
      { label: "Onde ficam os acessos", value: accessLabel(project) },
      { label: "Em produção desde", value: liveSinceLabel(project) },
    ];
    addProjectSlide(pres, project, extraLines);
  }
```

- [ ] **Step 5: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

Se o TypeScript reclamar que o tipo do `project` da query não é atribuível a `ExistingAutomationProject`, confirme que o Step 1 adicionou os seis campos ao `select` — o objeto da query precisa ser um superconjunto estrutural do tipo.

- [ ] **Step 6: Verificar manualmente no browser**

Run: `pnpm dev`

Caminho: `http://localhost:3000/admin/empresas` → escolha uma empresa que tenha ao menos uma automação existente → botão de exportar deck de automações existentes → abra o `.pptx` baixado.

Expected:
- Slide "Inventário técnico — sustentação e acessos" logo depois dos rankings, antes dos slides por projeto.
- Empresa sem nenhuma ficha preenchida: o slide aparece com a mensagem "Nenhuma automação existente com ficha de sustentação preenchida."
- Cada slide de projeto mostra as cinco linhas novas, com "Não informado" / "-" onde não há dado.

- [ ] **Step 7: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts
git commit -m "feat: slide de inventario tecnico no deck de automacoes existentes"
```

---

## Task 8: XML de projeto completo (export, import e agregado)

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts:66` (tipo), `:126` (tags)
- Modify: `src/shared/xml/parse-projeto-completo-xml.ts:23` (interface), `:155` (parsing)
- Modify: `src/server/trpc/routers/project.router.ts:1256` (input de `importXml`), `:1321` (data)
- Modify: `src/shared/components/project-xml-import-export.tsx:83-88`
- Modify: `src/app/api/empresas/[id]/xml-agregado/route.ts:85`

- [ ] **Step 1: Ampliar o tipo `ProjetoCompletoXmlData`**

Em `src/shared/xml/build-projeto-completo-xml.ts`, localize (linha 66):

```ts
  | "currentApplicationDetails"
```

Substitua por:

```ts
  | "currentApplicationDetails"
  | "currentApplicationHosting"
  | "currentApplicationHostingCustom"
  | "currentApplicationAuthor"
  | "currentApplicationOwner"
  | "currentApplicationAccessLocation"
  | "currentApplicationAccessReference"
  | "currentApplicationLiveSince"
```

- [ ] **Step 2: Serializar as sete tags**

No mesmo arquivo, localize (linha 126):

```ts
  lines.push(tag("detalhesAplicacaoExistente", project.currentApplicationDetails));
```

Substitua por:

```ts
  lines.push(tag("detalhesAplicacaoExistente", project.currentApplicationDetails));
  lines.push(
    tag(
      "hospedagemAplicacaoExistente",
      resolveLabel(project.currentApplicationHosting, CURRENT_APPLICATION_HOSTING_OPTIONS)
    )
  );
  lines.push(
    tag("hospedagemCustomAplicacaoExistente", project.currentApplicationHostingCustom)
  );
  lines.push(tag("autorAplicacaoExistente", project.currentApplicationAuthor));
  lines.push(tag("responsavelAplicacaoExistente", project.currentApplicationOwner));
  lines.push(
    tag(
      "localAcessosAplicacaoExistente",
      resolveLabel(
        project.currentApplicationAccessLocation,
        CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS
      )
    )
  );
  lines.push(
    tag("referenciaAcessosAplicacaoExistente", project.currentApplicationAccessReference)
  );
  lines.push(
    tag("producaoDesdeAplicacaoExistente", formatDeadline(project.currentApplicationLiveSince))
  );
```

`formatDeadline` (linha 36) já formata `Date | undefined` como `AAAA-MM-DD` e devolve `""` para ausente — exatamente o que precisamos.

E adicione as duas constantes ao import de `@/shared/constants/project-taxonomy` (linhas 2-10):

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
```

- [ ] **Step 3: Ampliar a interface `ParsedProjetoCompleto`**

Em `src/shared/xml/parse-projeto-completo-xml.ts`, localize (linha 23):

```ts
  currentApplicationDetails?: string;
```

Substitua por:

```ts
  currentApplicationDetails?: string;
  currentApplicationHosting?: string;
  currentApplicationHostingCustom?: string;
  currentApplicationAuthor?: string;
  currentApplicationOwner?: string;
  currentApplicationAccessLocation?: string;
  currentApplicationAccessReference?: string;
  // String "AAAA-MM-DD", igual a estimatedDeadline — convertida para Date pelo
  // caller (project-xml-import-export.tsx).
  currentApplicationLiveSince?: string;
```

- [ ] **Step 4: Ler as sete tags**

No mesmo arquivo, localize (linha 155):

```ts
  data.currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");
```

Substitua por:

```ts
  data.currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");
  data.currentApplicationHosting = resolveEnum(
    getDirectChildText(root, "hospedagemAplicacaoExistente"),
    CURRENT_APPLICATION_HOSTING_OPTIONS,
    "Onde a automação roda",
    warnings
  );
  data.currentApplicationHostingCustom = getDirectChildText(
    root,
    "hospedagemCustomAplicacaoExistente"
  );
  data.currentApplicationAuthor = getDirectChildText(root, "autorAplicacaoExistente");
  data.currentApplicationOwner = getDirectChildText(root, "responsavelAplicacaoExistente");
  data.currentApplicationAccessLocation = resolveEnum(
    getDirectChildText(root, "localAcessosAplicacaoExistente"),
    CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
    "Onde ficam os acessos",
    warnings
  );
  const rawAccessReference = getDirectChildText(root, "referenciaAcessosAplicacaoExistente");
  if (rawAccessReference) {
    if (rawAccessReference.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
      // Trunca em vez de falhar a importação inteira por causa de um campo
      // auxiliar — ver "Tratamento de erros" na spec.
      data.currentApplicationAccessReference = rawAccessReference.slice(
        0,
        CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH
      );
      warnings.push(
        `"Referência dos acessos" tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres — foi truncada.`
      );
    } else {
      data.currentApplicationAccessReference = rawAccessReference;
    }
  }
  const rawLiveSince = getDirectChildText(root, "producaoDesdeAplicacaoExistente");
  if (rawLiveSince) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawLiveSince)) {
      data.currentApplicationLiveSince = rawLiveSince;
    } else {
      warnings.push(
        `"Em produção desde" com valor "${rawLiveSince}" não está no formato AAAA-MM-DD — ignorado.`
      );
    }
  }
```

E adicione ao import de `@/shared/constants/project-taxonomy` (linhas 1-8):

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
```

- [ ] **Step 5: Converter a data no componente de import/export**

Em `src/shared/components/project-xml-import-export.tsx`, localize (linhas 83-88):

```tsx
    const { projetoId: _projetoId, estimatedDeadline, ...rest } = parsed.data;
    importMutation.mutate({
      projectId: project.id,
      ...rest,
      ...(estimatedDeadline ? { estimatedDeadline: parseLocalDateInputValue(estimatedDeadline) } : {}),
    });
```

Substitua por:

```tsx
    const {
      projetoId: _projetoId,
      estimatedDeadline,
      currentApplicationLiveSince,
      ...rest
    } = parsed.data;
    importMutation.mutate({
      projectId: project.id,
      ...rest,
      ...(estimatedDeadline ? { estimatedDeadline: parseLocalDateInputValue(estimatedDeadline) } : {}),
      ...(currentApplicationLiveSince
        ? { currentApplicationLiveSince: parseLocalDateInputValue(currentApplicationLiveSince) }
        : {}),
    });
```

Os demais campos novos fluem sozinhos pelo `...rest` — nenhuma outra mudança é necessária aqui.

- [ ] **Step 6: Aceitar os campos no `importXml`**

Em `src/server/trpc/routers/project.router.ts`, no input de `importXml`, localize (linha 1256):

```ts
        currentApplicationDetails: z.string().optional(),
```

Substitua por:

```ts
        currentApplicationDetails: z.string().optional(),
        currentApplicationHosting: z.string().optional(),
        currentApplicationHostingCustom: z.string().optional(),
        currentApplicationAuthor: z.string().optional(),
        currentApplicationOwner: z.string().optional(),
        currentApplicationAccessLocation: z.string().optional(),
        currentApplicationAccessReference: z
          .string()
          .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH)
          .optional(),
        currentApplicationLiveSince: z.coerce.date().optional(),
```

Em seguida, no corpo do mutation, localize (linha 1320):

```ts
      if (input.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = input.currentApplicationDetails;
```

Substitua por:

```ts
      if (input.currentApplicationDetails !== undefined)
        data.currentApplicationDetails = input.currentApplicationDetails;
      if (input.currentApplicationHosting !== undefined)
        data.currentApplicationHosting = input.currentApplicationHosting;
      if (input.currentApplicationHostingCustom !== undefined)
        data.currentApplicationHostingCustom = input.currentApplicationHostingCustom;
      if (input.currentApplicationAuthor !== undefined)
        data.currentApplicationAuthor = input.currentApplicationAuthor;
      if (input.currentApplicationOwner !== undefined)
        data.currentApplicationOwner = input.currentApplicationOwner;
      if (input.currentApplicationAccessLocation !== undefined)
        data.currentApplicationAccessLocation = input.currentApplicationAccessLocation;
      if (input.currentApplicationAccessReference !== undefined)
        data.currentApplicationAccessReference = input.currentApplicationAccessReference;
      if (input.currentApplicationLiveSince !== undefined)
        data.currentApplicationLiveSince = input.currentApplicationLiveSince;
```

- [ ] **Step 7: Mapear os campos no XML agregado da empresa**

Em `src/app/api/empresas/[id]/xml-agregado/route.ts`, localize (linha 85):

```ts
      currentApplicationDetails: p.currentApplicationDetails ?? undefined,
```

Substitua por:

```ts
      currentApplicationDetails: p.currentApplicationDetails ?? undefined,
      currentApplicationHosting: p.currentApplicationHosting ?? undefined,
      currentApplicationHostingCustom: p.currentApplicationHostingCustom ?? undefined,
      currentApplicationAuthor: p.currentApplicationAuthor ?? undefined,
      currentApplicationOwner: p.currentApplicationOwner ?? undefined,
      currentApplicationAccessLocation: p.currentApplicationAccessLocation ?? undefined,
      currentApplicationAccessReference: p.currentApplicationAccessReference ?? undefined,
      currentApplicationLiveSince: p.currentApplicationLiveSince ?? undefined,
```

- [ ] **Step 8: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

- [ ] **Step 9: Verificar o round-trip manualmente**

Run: `pnpm dev`

Caminho:
1. `http://localhost:3000/admin/projetos` → abra um projeto → **Editar** → preencha a ficha inteira ("Sustentação & acessos"), inclusive a data → **Salvar**.
2. Na mesma tela, use o botão de **exportar XML** do projeto.
3. Abra o `.xml` baixado num editor de texto.

Expected: as sete tags presentes, com **rótulos** (não slugs) nas duas de enum — ex.: `<hospedagemAplicacaoExistente>Servidor próprio (on-premise)</hospedagemAplicacaoExistente>` — e `<producaoDesdeAplicacaoExistente>` no formato `AAAA-MM-DD`.

4. Abra um **outro** projeto → **importar XML** → escolha o arquivo baixado → confirme o aviso de "exportado de outro projeto".

Expected: a seção "Sustentação & acessos" do segundo projeto aparece com exatamente os mesmos valores do primeiro.

5. Teste um XML antigo: remova as sete tags novas do arquivo e importe de novo.

Expected: importa sem erro; os campos ficam inalterados no projeto de destino.

- [ ] **Step 10: Commit**

```bash
git add src/shared/xml/build-projeto-completo-xml.ts src/shared/xml/parse-projeto-completo-xml.ts src/shared/components/project-xml-import-export.tsx src/server/trpc/routers/project.router.ts "src/app/api/empresas/[id]/xml-agregado/route.ts"
git commit -m "feat: ficha de sustentacao no XML de projeto completo"
```

---

## Task 9: XML de solicitação (import, modelo e prompt do LLM)

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/xml-import.ts:202` (leitura), `:369` (formData)
- Modify: `public/modelo-solicitacao-projeto.xml`
- Modify: `docs/prompt-geracao-xml.md`
- Modify: `src/server/ai/xml-generation-prompt.ts`

> **Arquivo que este plano tinha esquecido:** `src/server/ai/xml-generation-prompt.ts` é uma cópia em template literal da seção `## Prompt` do `.md`, usada pela geração de oportunidades por IA dentro do app. O cabeçalho dele exige sincronia sempre que o schema do XML muda. As mesmas sete tags e os mesmos sete bullets precisam entrar lá — sem o `## Histórico`, que é só do `.md`. Cuidado com backticks e `${` dentro do template literal.

> Esta tarefa mexe no XML de **entrada**, o que normalmente é fora de escopo neste projeto. Foi autorizado explicitamente para esta feature.

> **Estado deixado pela Task 4:** `xml-import.ts` já contém os sete campos no objeto `formData` devolvido, todos com o literal `""` e um comentário dizendo que ainda não há tags de XML. Isso foi obrigatório para compilar — `SolicitarProjetoFormData` é o tipo de *saída* do Zod, e `.optional().default("")` torna a chave obrigatória. Esta tarefa **substitui** esses sete literais pelas variáveis derivadas do parsing, e remove aquele comentário.

- [ ] **Step 1: Ler as sete tags no import de solicitação**

Em `src/app/(private)/cliente/solicitar/utils/xml-import.ts`, localize (linha 202):

```ts
  const currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");
```

Substitua por:

```ts
  const currentApplicationDetails = getDirectChildText(root, "detalhesAplicacaoExistente");

  // Ficha de sustentação da automação existente. Segue o padrão desta função:
  // valor não reconhecido vira "outro" + texto original preservado no campo
  // custom, com aviso — nunca bloqueia a importação.
  const hospedagemTag = getDirectChildText(root, "hospedagemAplicacaoExistente");
  let currentApplicationHosting = "";
  let currentApplicationHostingCustom =
    getDirectChildText(root, "hospedagemCustomAplicacaoExistente") ?? "";
  if (hospedagemTag) {
    const match = matchByLabel(hospedagemTag, CURRENT_APPLICATION_HOSTING_OPTIONS);
    currentApplicationHosting = match ? match.value : "outro";
    if (!match) {
      currentApplicationHostingCustom = hospedagemTag;
      warnings.push(
        `<hospedagemAplicacaoExistente> com valor '${hospedagemTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }

  const currentApplicationAuthor = getDirectChildText(root, "autorAplicacaoExistente") ?? "";
  const currentApplicationOwner = getDirectChildText(root, "responsavelAplicacaoExistente") ?? "";

  const localAcessosTag = getDirectChildText(root, "localAcessosAplicacaoExistente");
  let currentApplicationAccessLocation = "";
  if (localAcessosTag) {
    const match = matchByLabel(localAcessosTag, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS);
    currentApplicationAccessLocation = match ? match.value : "outro";
    if (!match) {
      warnings.push(
        `<localAcessosAplicacaoExistente> com valor '${localAcessosTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro".`
      );
    }
  }

  const referenciaAcessosTag =
    getDirectChildText(root, "referenciaAcessosAplicacaoExistente") ?? "";
  let currentApplicationAccessReference = referenciaAcessosTag;
  if (referenciaAcessosTag.length > CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH) {
    currentApplicationAccessReference = referenciaAcessosTag.slice(
      0,
      CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH
    );
    warnings.push(
      `<referenciaAcessosAplicacaoExistente> tinha mais de ${CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH} caracteres e foi truncada.`
    );
  }

  const producaoDesdeTag = getDirectChildText(root, "producaoDesdeAplicacaoExistente");
  let currentApplicationLiveSince = "";
  if (producaoDesdeTag) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(producaoDesdeTag)) {
      currentApplicationLiveSince = producaoDesdeTag;
    } else {
      warnings.push(
        `<producaoDesdeAplicacaoExistente> deve estar no formato AAAA-MM-DD; valor '${producaoDesdeTag}' foi ignorado.`
      );
    }
  }
```

O helper `matchByLabel` já existe neste arquivo (linha 57) com a assinatura `matchByLabel<T extends { label: string }>(value: string, options: T[]): T | undefined` — devolve a opção inteira, por isso `match.value` funciona.

E adicione ao import de `./solicitar.utils` deste arquivo (linhas 2-10 — as constantes vêm do barrel, não direto de `@/shared/constants/project-taxonomy`):

```ts
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
```

- [ ] **Step 2: Incluir os campos no `formData` devolvido**

No mesmo arquivo, localize (linha 369):

```ts
    currentApplicationDetails,
    peopleInvolved,
```

Substitua por:

```ts
    currentApplicationDetails,
    currentApplicationHosting,
    currentApplicationHostingCustom,
    currentApplicationAuthor,
    currentApplicationOwner,
    currentApplicationAccessLocation,
    currentApplicationAccessReference,
    currentApplicationLiveSince,
    peopleInvolved,
```

- [ ] **Step 3: Adicionar as tags ao modelo XML público**

Em `public/modelo-solicitacao-projeto.xml`, localize a linha:

```xml
<detalhesAplicacaoExistente></detalhesAplicacaoExistente>
```

Adicione logo abaixo:

```xml
<hospedagemAplicacaoExistente></hospedagemAplicacaoExistente>
<hospedagemCustomAplicacaoExistente></hospedagemCustomAplicacaoExistente>
<autorAplicacaoExistente></autorAplicacaoExistente>
<responsavelAplicacaoExistente></responsavelAplicacaoExistente>
<localAcessosAplicacaoExistente></localAcessosAplicacaoExistente>
<referenciaAcessosAplicacaoExistente></referenciaAcessosAplicacaoExistente>
<producaoDesdeAplicacaoExistente></producaoDesdeAplicacaoExistente>
```

- [ ] **Step 4: Adicionar as tags ao template do prompt**

Em `docs/prompt-geracao-xml.md`, localize (linha 125):

```xml
<detalhesAplicacaoExistente></detalhesAplicacaoExistente>
```

Adicione logo abaixo, dentro do mesmo bloco de template:

```xml
<hospedagemAplicacaoExistente></hospedagemAplicacaoExistente>
<hospedagemCustomAplicacaoExistente></hospedagemCustomAplicacaoExistente>
<autorAplicacaoExistente></autorAplicacaoExistente>
<responsavelAplicacaoExistente></responsavelAplicacaoExistente>
<localAcessosAplicacaoExistente></localAcessosAplicacaoExistente>
<referenciaAcessosAplicacaoExistente></referenciaAcessosAplicacaoExistente>
<producaoDesdeAplicacaoExistente></producaoDesdeAplicacaoExistente>
```

Faça o mesmo no bloco de **exemplo preenchido** (por volta da linha 243, onde está `<detalhesAplicacaoExistente></detalhesAplicacaoExistente>` logo depois de `<aplicacaoExistenteHoje>Não</aplicacaoExistenteHoje>`) — ali, como o exemplo tem `aplicacaoExistenteHoje` = "Não", as sete tags novas ficam **vazias**, o que é o comportamento correto a demonstrar.

- [ ] **Step 5: Documentar as regras dos campos no prompt**

Em `docs/prompt-geracao-xml.md`, localize a instrução de `<detalhesAplicacaoExistente>` (linha 174) e adicione, logo depois dela, as sete instruções novas:

```markdown
- <hospedagemAplicacaoExistente>: **CAMPO RESTRITO**. Preencha só se aplicacaoExistenteHoje = "Sim". Onde a automação roda hoje. Use EXATAMENTE uma destas opções: "Servidor próprio (on-premise)", "Máquina virtual da empresa", "Nuvem (Azure, AWS, GCP)", "Máquina de um usuário", "Plataforma SaaS do fornecedor", "Não sei", "Outro". Se a transcrição não disser onde roda, deixe VAZIO — não chute "Não sei" (vazio significa "não perguntado"; "Não sei" significa "perguntado e ninguém sabia", que é uma informação diferente e útil para o TI).
  CERTO: "roda num servidor nosso lá na sala do TI" → "Servidor próprio (on-premise)"
  CERTO: "fica na máquina da Fernanda, ela liga de manhã" → "Máquina de um usuário"
  ERRADO: <hospedagemAplicacaoExistente>Servidor próprio do cliente, na sala do TI</hospedagemAplicacaoExistente> (valor com complemento colado — o detalhe vai em <detalhesAplicacaoExistente>)
- <hospedagemCustomAplicacaoExistente>: só quando hospedagem = "Outro". Descreva em poucas palavras onde roda.
- <autorAplicacaoExistente>: quem desenvolveu a automação existente — nome da pessoa, da equipe interna ou do fornecedor, como citado na transcrição. Não confunda com <colaboradoresEnvolvidos> (quem executa o processo). Se a transcrição só disser "foi um estagiário que saiu" ou "veio de uma consultoria", escreva isso mesmo — é exatamente o tipo de informação que o TI precisa.
- <responsavelAplicacaoExistente>: quem cuida da automação HOJE — quem é chamado quando ela para. Pode ser diferente de quem desenvolveu. Se a transcrição indicar que ninguém cuida, escreva "Ninguém definido".
- <localAcessosAplicacaoExistente>: **CAMPO RESTRITO**. Onde ficam guardadas as credenciais/acessos que a automação usa. Use EXATAMENTE uma destas opções: "Cofre de senhas corporativo", "Planilha ou documento compartilhado", "Com uma pessoa específica", "Não se sabe", "Outro". Deixe vazio se o assunto não apareceu na reunião.
- <referenciaAcessosAplicacaoExistente>: ponteiro curto (máx. 200 caracteres) de ONDE encontrar o acesso — nome do cofre, caminho da pasta, com quem está. **NUNCA transcreva senhas, tokens, chaves ou usuários+senha, mesmo que apareçam na transcrição.** Se a transcrição contiver uma credencial literal, ignore-a completamente e descreva só a localização.
  CERTO: "Cofre do TI, pasta Automações Financeiro"
  CERTO: "Com o João do Financeiro"
  ERRADO: "usuário robo_fin senha Abc12345" (credencial literal — nunca)
- <producaoDesdeAplicacaoExistente>: data em que a automação entrou em produção, no formato AAAA-MM-DD. Se a transcrição só der o mês ou o ano ("desde o começo de 2024", "faz uns dois anos"), use o primeiro dia do período mais provável (2024-01-01) e registre a imprecisão em <informacoesAdicionais>. Se não houver pista nenhuma, deixe vazio.
```

- [ ] **Step 6: Registrar a mudança no histórico do prompt**

Em `docs/prompt-geracao-xml.md`, no topo da lista `## Histórico` (antes da entrada `**2026-07-07 (7)**`, linha 15), adicione:

```markdown
- **2026-07-28**: adicionadas sete tags da ficha de sustentação da automação
  existente (`hospedagemAplicacaoExistente`,
  `hospedagemCustomAplicacaoExistente`, `autorAplicacaoExistente`,
  `responsavelAplicacaoExistente`, `localAcessosAplicacaoExistente`,
  `referenciaAcessosAplicacaoExistente`, `producaoDesdeAplicacaoExistente`).
  O que antes era texto corrido em `<detalhesAplicacaoExistente>` agora tem
  campos próprios, filtráveis e exibidos no inventário técnico. Regra de
  segurança explícita: `referenciaAcessosAplicacaoExistente` é ponteiro para
  onde o acesso está, nunca a credencial em si — credenciais literais na
  transcrição devem ser ignoradas.
```

- [ ] **Step 7: Verificar compilação**

Run: `npx tsc --noEmit`
Expected: nenhum erro.

Run: `pnpm lint`
Expected: nenhum erro novo.

- [ ] **Step 8: Verificar manualmente a importação**

Crie um arquivo de teste no scratchpad — copie `public/modelo-solicitacao-projeto.xml`, preencha `<titulo>`, `<empresa>`, `<descricao>`, `<aplicacaoExistenteHoje>Sim</aplicacaoExistenteHoje>` e as sete tags novas assim:

```xml
<hospedagemAplicacaoExistente>Máquina de um usuário</hospedagemAplicacaoExistente>
<hospedagemCustomAplicacaoExistente></hospedagemCustomAplicacaoExistente>
<autorAplicacaoExistente>Estagiário que saiu em 2024</autorAplicacaoExistente>
<responsavelAplicacaoExistente>Ninguém definido</responsavelAplicacaoExistente>
<localAcessosAplicacaoExistente>Com uma pessoa específica</localAcessosAplicacaoExistente>
<referenciaAcessosAplicacaoExistente>Com a Fernanda do Financeiro</referenciaAcessosAplicacaoExistente>
<producaoDesdeAplicacaoExistente>2024-03-01</producaoDesdeAplicacaoExistente>
```

Run: `pnpm dev`

Caminho: `http://localhost:3000/cliente/solicitar` → botão de importar XML → escolha o arquivo.

Expected:
- O formulário carrega com "Sim" em aplicação existente e a ficha preenchida: hospedagem = "Máquina de um usuário", autor, responsável, local dos acessos, referência e a data `2024-03-01`.
- Nenhum aviso de importação relacionado a esses campos.

Depois, troque `<hospedagemAplicacaoExistente>` para um valor inventado (ex.: `Notebook do estagiário`) e importe de novo.

Expected: hospedagem cai em "Outro" com o texto original no campo ao lado, e aparece o aviso correspondente na caixa de avisos da importação.

Por fim, importe um XML **sem** nenhuma das sete tags.

Expected: importa normalmente, ficha em branco, sem avisos novos.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/utils/xml-import.ts" public/modelo-solicitacao-projeto.xml docs/prompt-geracao-xml.md
git commit -m "feat: ficha de sustentacao no XML de solicitacao e no prompt de geracao"
```

---

## Task 10: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Build completo**

Run: `pnpm build`
Expected: build conclui sem erros nem warnings novos de tipo.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: nenhum erro.

- [ ] **Step 3: Passagem end-to-end**

Run: `pnpm dev`

Percorra, nesta ordem:

1. `/cliente/solicitar` → nova solicitação com `hasCurrentApplication = "sim"` e a ficha inteira preenchida → enviar.
2. Abrir o projeto criado → confirmar a seção "Sustentação & acessos" com os valores corretos.
3. `/admin/empresas/<id>/automacoes-existentes` → confirmar as colunas "Onde roda" e "Responsável" preenchidas para esse projeto.
4. Exportar o deck de automações existentes → confirmar o slide "Inventário técnico" com a linha desse projeto.
5. Exportar o XML do projeto → confirmar as sete tags → importar em outro projeto → confirmar que a ficha chegou.

Expected: todos os cinco passos funcionam sem erro.

- [ ] **Step 4: Confirmar que nada quebrou para projetos antigos**

Abra um projeto criado antes desta mudança (qualquer um do backlog).

Expected:
- A seção "Sustentação & acessos" **não** aparece na visualização (ficha vazia).
- A seção aparece vazia no formulário de edição, e salvar sem tocá-la não gera entradas espúrias no histórico de atividades.

---

## Cobertura da spec

| Seção da spec | Tarefa |
|---|---|
| Modelo de dados (6 colunas + migration) | Task 1 |
| Listas de opções em `project-taxonomy.ts` | Task 1 |
| Regra de segurança (helper text, maxLength, `maskFreeText`) | Tasks 4, 5 |
| Superfície 1 — formulário de solicitação | Task 4 |
| Superfície 2 — ficha do projeto (exibição + edição) | Task 5 |
| Superfície 3 — tela Automações Existentes | Task 6 |
| Superfície 4 — deck .pptx | Task 7 |
| Superfície 5 — XML de projeto completo + agregado | Task 8 |
| Superfície 5 — XML de solicitação + prompt do LLM | Task 9 |
| Camadas intermediárias (`FIELD_LABELS`, tipos, contexto) | Tasks 2, 3 |
| Tratamento de erros (enum desconhecido, data inválida, truncamento) | Tasks 8, 9 |
| Fora de escopo (risco calculado, cross-empresa, `/cliente/robos`, `Person`) | não implementado, por definição |
