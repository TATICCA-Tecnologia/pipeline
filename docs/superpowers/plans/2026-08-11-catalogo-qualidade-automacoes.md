# Critérios de qualidade do catálogo de automações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que a ficha de qualquer automação responda os seis requisitos mínimos do Glauber sem consulta externa, e levar essa informação para os decks.

**Architecture:** Dez colunas novas em `Project` (prefixo `currentApplication*`), três colunas de dados sigilosos válidas para todo projeto, um catálogo novo de dois níveis para os sistemas sobre os quais a automação atua (`TargetSystemCategory` → `TargetSystem`), e duas listas por projeto (`ProjectTargetSystem`, `ProjectAutomationAccount`) gravadas por substituição integral dentro de uma transação. O wizard ganha um passo; os dois decks ganham conteúdo.

**Tech Stack:** Next.js 16 (App Router) · tRPC 11 · Prisma 6 / PostgreSQL · Zod 3 · react-hook-form · pptxgenjs 4 · tsx para scripts de verificação.

**Spec:** `docs/superpowers/specs/2026-08-11-catalogo-qualidade-automacoes-design.md`

**Verificação:** o projeto não tem framework de teste. As verificações são scripts `tsx` em `scripts/`, no molde de `scripts/preview-executive-slides.ts`.

Duas armadilhas confirmadas na Task 1, que valem para **todas** as tasks:

- **`pnpm lint` não funciona.** O script chama `eslint`, que não está nas dependências. Pré-existente.
- **`pnpm build` não checa tipos.** `next.config.mjs` tem `typescript: { ignoreBuildErrors: true }`, então o build passa verde com erro de tipo. Onde este plano diz "Run: `pnpm build`", rode **também** `npx tsc --noEmit`.

Baseline do `npx tsc --noEmit` antes da Task 1: **10 erros em 4 arquivos**, todos em `src/shared/components/ui/` (`chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx`) — boilerplate shadcn pré-existente. Qualquer erro fora desses quatro arquivos é regressão sua.

Migrations são arquivos SQL escritos à mão; **não rode `prisma migrate dev` nem `prisma db push`** — não existe `.env`/`DATABASE_URL` nesta máquina, e o deploy aplica a migration no push para `main`.

**Não rode `npx prisma format`** — ele reformata o schema inteiro e polui o diff com arquivos fora do escopo da task.

---

### Task 1: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811120000_catalogo_qualidade_automacoes/migration.sql`

- [ ] **Step 1: Adicionar as colunas escalares em `model Project`**

Em `prisma/schema.prisma`, logo depois de `currentApplicationLiveSince` (linha 178):

```prisma
  // Complemento dos critérios mínimos de catálogo (Glauber). Ver
  // docs/superpowers/specs/2026-08-11-catalogo-qualidade-automacoes-design.md
  currentApplicationAssetId            String? // hostname, IP ou nº de patrimônio
  currentApplicationOwnerRole          String? // cargo do responsável
  currentApplicationDataInput          String? // slug de CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS
  currentApplicationDataInputDetails   String?
  currentApplicationDataOutput         String? // mesma lista de opções
  currentApplicationDataOutputDetails  String?
  currentApplicationContingencyActions Json? // array de chaves de CURRENT_APPLICATION_CONTINGENCY_OPTIONS
  currentApplicationContingencyDetails String?
  currentApplicationBackupOwner        String? // quem assume se o responsável sair

  // Sigilo dos dados — vale para TODO projeto, novo ou de melhoria, por isso
  // sem o prefixo currentApplication*.
  handlesSensitiveData    String? // slug de SENSITIVE_DATA_ANSWER_OPTIONS
  sensitiveDataCategories Json? // array de chaves de SENSITIVE_DATA_CATEGORY_OPTIONS
  sensitiveDataDetails    String?
```

- [ ] **Step 2: Nomear as duas relações com `ProjectArea`**

`Project.areaId` já aponta para `ProjectArea`; uma segunda FK obriga a nomear as duas. Em `model Project`, trocar a linha `area ProjectArea? @relation(fields: [areaId], ...)` (linha 231) por:

```prisma
  area             ProjectArea?              @relation("ProjectProcessArea", fields: [areaId], references: [id], onDelete: SetNull)
  areaId           String?
  // Setor do responsável pela automação. Deliberadamente separado de areaId
  // (a área DO PROCESSO): quem sustenta costuma ser o TI, não a área dona.
  ownerArea        ProjectArea?              @relation("ProjectOwnerArea", fields: [currentApplicationOwnerAreaId], references: [id], onDelete: SetNull)
  currentApplicationOwnerAreaId String?
```

E em `model ProjectArea` (linha 521), trocar `projects Project[]` por:

```prisma
  projects          Project[] @relation("ProjectProcessArea")
  sustainedProjects Project[] @relation("ProjectOwnerArea")
```

- [ ] **Step 3: Adicionar os três models novos**

No fim de `prisma/schema.prisma`, depois de `model MainTool` (linha 583):

```prisma
// ==========================================
// SISTEMAS SOBRE OS QUAIS A AUTOMACAO ATUA
// ==========================================
// Eixo distinto de ProjectKind ("tipo de solução": Power Automate, RPA) e de
// MainToolCategory/MainTool ("categoria de ferramenta"/"produto"): aqueles dois
// descrevem COMO a solução é construída, este descreve SOBRE O QUE ela age.

model TargetSystemCategory {
  id        String         @id @default(cuid())
  name      String
  slug      String         @unique
  isActive  Boolean        @default(true)
  order     Int            @default(0)
  systems   TargetSystem[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@map("target_system_categories")
}

model TargetSystem {
  id           String                @id @default(cuid())
  name         String
  slug         String                @unique
  isActive     Boolean               @default(true)
  order        Int                   @default(0)
  category     TargetSystemCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId   String?
  projectLinks ProjectTargetSystem[]
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt

  @@map("target_systems")
}

model ProjectTargetSystem {
  id             String        @id @default(cuid())
  project        Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId      String
  targetSystem   TargetSystem? @relation(fields: [targetSystemId], references: [id], onDelete: SetNull)
  targetSystemId String?
  /// Preenchido quando a tecnologia não está no catálogo. Uma linha precisa de
  /// targetSystemId OU customName — as duas vazias é linha sem sentido.
  customName     String?
  accessPoint    String? // URL, servidor ou instância — onde ele é acessado
  /// COMO acessar: ponteiro para onde o acesso mora, NUNCA a credencial.
  accessNotes    String?
  order          Int           @default(0)
  accounts       ProjectAutomationAccount[]

  @@index([projectId])
  @@map("project_target_systems")
}

model ProjectAutomationAccount {
  id                    String               @id @default(cuid())
  project               Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId             String
  /// O login em si. NÃO existe campo par de senha/token em lugar nenhum do
  /// modelo, e isso é deliberado: a plataforma é inventário, não cofre.
  username              String
  projectTargetSystem   ProjectTargetSystem? @relation(fields: [projectTargetSystemId], references: [id], onDelete: SetNull)
  projectTargetSystemId String?
  accountType           String? // slug de AUTOMATION_ACCOUNT_TYPE_OPTIONS
  ownerName             String?
  notes                 String?
  order                 Int                  @default(0)

  @@index([projectId])
  @@map("project_automation_accounts")
}
```

- [ ] **Step 4: Declarar as duas listas em `model Project`**

Junto das outras relações de `Project` (perto de `peopleOfInterest`, linha 247):

```prisma
  targetSystems    ProjectTargetSystem[]
  automationAccounts ProjectAutomationAccount[]
```

- [ ] **Step 5: Escrever a migration SQL à mão**

Criar `prisma/migrations/20260811120000_catalogo_qualidade_automacoes/migration.sql`:

```sql
-- Critérios mínimos de qualidade do catálogo de automações.
-- Só adiciona: nenhuma coluna existente é alterada, nenhum dado é migrado.
-- Nomear as relações Project<->ProjectArea é mudança apenas do schema Prisma,
-- a coluna "areaId" continua a mesma — por isso não aparece aqui.

ALTER TABLE "projects" ADD COLUMN "currentApplicationAssetId" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwnerRole" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwnerAreaId" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataInput" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataInputDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataOutput" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataOutputDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationContingencyActions" JSONB;
ALTER TABLE "projects" ADD COLUMN "currentApplicationContingencyDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationBackupOwner" TEXT;
ALTER TABLE "projects" ADD COLUMN "handlesSensitiveData" TEXT;
ALTER TABLE "projects" ADD COLUMN "sensitiveDataCategories" JSONB;
ALTER TABLE "projects" ADD COLUMN "sensitiveDataDetails" TEXT;

ALTER TABLE "projects" ADD CONSTRAINT "projects_currentApplicationOwnerAreaId_fkey"
  FOREIGN KEY ("currentApplicationOwnerAreaId") REFERENCES "project_areas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "target_system_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "target_system_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "target_system_categories_slug_key" ON "target_system_categories"("slug");

CREATE TABLE "target_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "target_systems_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "target_systems_slug_key" ON "target_systems"("slug");
ALTER TABLE "target_systems" ADD CONSTRAINT "target_systems_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "target_system_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_target_systems" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetSystemId" TEXT,
    "customName" TEXT,
    "accessPoint" TEXT,
    "accessNotes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_target_systems_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_target_systems_projectId_idx" ON "project_target_systems"("projectId");
ALTER TABLE "project_target_systems" ADD CONSTRAINT "project_target_systems_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_target_systems" ADD CONSTRAINT "project_target_systems_targetSystemId_fkey"
  FOREIGN KEY ("targetSystemId") REFERENCES "target_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_automation_accounts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "projectTargetSystemId" TEXT,
    "accountType" TEXT,
    "ownerName" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_automation_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_automation_accounts_projectId_idx" ON "project_automation_accounts"("projectId");
ALTER TABLE "project_automation_accounts" ADD CONSTRAINT "project_automation_accounts_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_automation_accounts" ADD CONSTRAINT "project_automation_accounts_projectTargetSystemId_fkey"
  FOREIGN KEY ("projectTargetSystemId") REFERENCES "project_target_systems"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 6: Gerar o client e verificar**

Run: `pnpm db:generate`
Expected: `Generated Prisma Client` sem erro. Se reclamar de relação ambígua em `ProjectArea`, o Step 2 ficou incompleto.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260811120000_catalogo_qualidade_automacoes/
git commit -m "feat: schema dos criterios de qualidade do catalogo de automacoes"
```

---

### Task 2: Listas de opções

**Files:**
- Modify: `src/shared/constants/project-taxonomy.ts`

- [ ] **Step 1: Adicionar as quatro listas**

Depois de `CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH` (linha ~157). O bloco de ATENÇÃO que já existe acima de `CURRENT_APPLICATION_HOSTING_OPTIONS` vale igual para estas listas — a importação de XML casa por label:

```ts
// ATENÇÃO: como nas listas acima, os LABELS abaixo estão duplicados como texto
// literal em docs/prompt-geracao-xml.md e em src/server/ai/xml-generation-prompt.ts,
// e a importação de XML casa por label. Mexeu no label, mexa nos três lugares.

/** Serve aos dois selects do critério 5 — entrada e saída têm a mesma natureza. */
export const CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS = [
  { value: "sistema", label: "Sistema (ERP, CRM, portal)" },
  { value: "planilha", label: "Planilha" },
  { value: "email", label: "E-mail" },
  { value: "api", label: "API" },
  { value: "banco-dados", label: "Banco de dados" },
  { value: "pasta-rede", label: "Pasta de rede ou SharePoint" },
  { value: "portal-web", label: "Site ou portal web" },
  { value: "manual", label: "Entrada manual de uma pessoa" },
  { value: "outro", label: "Outro" },
];

export const CURRENT_APPLICATION_CONTINGENCY_OPTIONS = [
  { key: "reexecutar", label: "Reexecutar ou reiniciar a automação" },
  { key: "verificar-log", label: "Verificar log ou relatório de erro" },
  { key: "verificar-acessos", label: "Verificar credenciais e acessos expirados" },
  { key: "acionar-ti-interno", label: "Acionar o TI interno" },
  { key: "acionar-fornecedor", label: "Acionar o fornecedor ou desenvolvedor externo" },
  { key: "executar-manual", label: "Executar o processo manualmente enquanto isso" },
  { key: "acionar-negocio", label: "Acionar o responsável da área de negócio" },
  // Marcada de propósito: campo vazio não distingue "ninguém preencheu" de
  // "não existe caminho". Esta opção torna o risco um dado, não uma ausência.
  { key: "sem-caminho-definido", label: "Não existe caminho definido hoje" },
];

export const AUTOMATION_ACCOUNT_TYPE_OPTIONS = [
  { value: "servico", label: "Usuário de serviço" },
  { value: "nominal", label: "Usuário nominal" },
  { value: "email", label: "Conta de e-mail" },
  { value: "api-key", label: "Chave de API" },
  { value: "certificado", label: "Certificado digital" },
  { value: "outro", label: "Outro" },
];

export const SENSITIVE_DATA_ANSWER_OPTIONS = [
  { value: "sim", label: "Sim" },
  { value: "nao", label: "Não" },
  { value: "nao-sei", label: "Não sei" },
];

export const SENSITIVE_DATA_CATEGORY_OPTIONS = [
  { key: "pessoais-clientes", label: "Dados pessoais de clientes (LGPD)" },
  { key: "pessoais-colaboradores", label: "Dados pessoais de colaboradores" },
  { key: "folha-remuneracao", label: "Folha de pagamento e remuneração" },
  { key: "bancarios-financeiros", label: "Dados bancários e financeiros" },
  { key: "saude", label: "Dados de saúde" },
  { key: "fiscais-contabeis", label: "Dados fiscais e contábeis" },
  { key: "contratos-juridico", label: "Contratos e jurídico" },
  { key: "propriedade-intelectual", label: "Propriedade intelectual" },
  { key: "credenciais-acessos", label: "Credenciais e acessos" },
];

/** Curto de propósito: username é identificador, não bloco de credenciais. */
export const AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH = 120;
```

- [ ] **Step 2: Adicionar os resolvedores de label**

Ao lado de `resolveCurrentApplicationHostingLabel` (linha ~289):

`resolveLabel` devolve `string | undefined` — `undefined` só quando o valor é vazio;
caso contrário, o label, ou o valor cru quando o slug não está na lista. Os
resolvedores novos herdam esse tipo, como `resolveCurrentApplicationHostingLabel`
já faz. **Quem consome (ficha, deck) precisa tratar o `undefined`** — em geral com
`?? "Não informado"`.

```ts
export function resolveDataEndpointLabel(value: string | null | undefined): string | undefined {
  return resolveLabel(value, CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS);
}

export function resolveAccountTypeLabel(value: string | null | undefined): string | undefined {
  return resolveLabel(value, AUTOMATION_ACCOUNT_TYPE_OPTIONS);
}

export function resolveSensitiveDataAnswerLabel(value: string | null | undefined): string | undefined {
  return resolveLabel(value, SENSITIVE_DATA_ANSWER_OPTIONS);
}

/**
 * Traduz um array de chaves (vindo de coluna Json?) para labels. Chave
 * desconhecida vira a própria chave crua, NÃO some: é o idioma já usado em
 * quatro lugares para BENEFIT_OPTIONS, e o mesmo de resolveLabel. Descartar
 * faria um item renomeado na taxonomia desaparecer da tela sem rastro.
 */
export function resolveKeyLabels(
  keys: unknown,
  options: readonly { key: string; label: string }[]
): string[] {
  if (!Array.isArray(keys)) return [];
  return keys
    .filter((k): k is string => typeof k === "string")
    .map((k) => options.find((o) => o.key === k)?.label ?? k);
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm lint`
Expected: sem erro novo em `project-taxonomy.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/constants/project-taxonomy.ts
git commit -m "feat: listas de opcoes de dados, contingencia, contas e sigilo"
```

---

### Task 3: Tipos compartilhados

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/context/projects-context.tsx`

- [ ] **Step 1: Declarar os tipos das duas listas**

Em `src/shared/types/index.ts`, antes da interface `Project`:

Sufixo `View` de propósito: `ProjectTargetSystem` e `ProjectAutomationAccount` são
nomes de model do Prisma, e um arquivo que importe os dois teria colisão.

```ts
export interface ProjectTargetSystemView {
  id: string;
  targetSystemId: string | null;
  /** Nome já resolvido: do catálogo, ou o customName quando fora dele. */
  name: string;
  categoryName: string | null;
  accessPoint: string | null;
  accessNotes: string | null;
  order: number;
}

export interface ProjectAutomationAccountView {
  id: string;
  username: string;
  projectTargetSystemId: string | null;
  /** Nome do sistema em que a conta é usada, já resolvido. */
  systemName: string | null;
  accountType: string | null;
  ownerName: string | null;
  notes: string | null;
  order: number;
}
```

- [ ] **Step 2: Estender a interface `Project`**

Ao lado de `solutionTypes` (linha 95).

**Sem `| null`**, apesar de as colunas Prisma serem nuláveis. `mapProject` normaliza
`null → undefined` em todos os ~35 campos que já existem, e `Project` não tem
`| null` em lugar nenhum. Duas convenções na mesma interface obrigariam cada
consumidor a lembrar qual campo é de qual época. O `| null` fica onde pertence: no
tipo do **parâmetro** de `mapProject`, que é a forma crua vinda do Prisma.

```ts
  currentApplicationAssetId?: string;
  currentApplicationOwnerRole?: string;
  // Achatado de propósito, ao contrário de `area`, que é objeto aninhado com
  // slug: aqui o setor é só exibido como texto, nunca navegado.
  currentApplicationOwnerAreaId?: string;
  currentApplicationOwnerAreaName?: string;
  currentApplicationDataInput?: string;
  currentApplicationDataInputDetails?: string;
  currentApplicationDataOutput?: string;
  currentApplicationDataOutputDetails?: string;
  currentApplicationContingencyActions?: string[];
  currentApplicationContingencyDetails?: string;
  currentApplicationBackupOwner?: string;
  handlesSensitiveData?: string;
  sensitiveDataCategories?: string[];
  sensitiveDataDetails?: string;
  targetSystems?: ProjectTargetSystemView[];
  automationAccounts?: ProjectAutomationAccountView[];
```

**Convenção de nome:** o sufixo `View` é precedente novo no repositório, adotado
porque `ProjectTargetSystem` e `ProjectAutomationAccount` já são nomes de model do
Prisma. Tipos de leitura análogos nas tasks seguintes usam o mesmo sufixo — não
invente `Row`, `Item` ou `Dto`.

- [ ] **Step 3: Declarar os campos no tipo do contexto — sem mapear ainda**

Em `src/shared/context/projects-context.tsx`, acrescentar os campos **apenas ao tipo local** (junto de `currentApplicationHosting`, linhas ~60-67), todos opcionais.

**Não toque nos dois mapeamentos** (linhas ~111-118 e ~220+). Eles leem da saída do tRPC, e o router só passa a devolver esses campos na Task 6 — mapear agora daria "Property does not exist" no tipo inferido. O mapeamento é Step da Task 6.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: os 10 erros de baseline em `src/shared/components/ui/` e nada além. Campos opcionais recém-declarados não quebram nenhum consumidor.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/index.ts src/shared/context/projects-context.tsx
git commit -m "feat: tipos das listas de sistemas e contas"
```

---

### Task 4: Catálogo de sistemas no taxonomy router

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Copiar o bloco de procedures de `MainTool`**

`taxonomy.router.ts` já tem o par completo: `listMainTools`/`listAllMainTools`/`createMainTool`/`updateMainTool`/`deleteMainTool` (linhas 403-480) e o mesmo para categorias (linhas 590-650). Duplicar os dois blocos com esta substituição de identificadores, mantendo tudo o mais igual — inclusive a criação idempotente por slug, cujo comentário explica que um item inativo some do `list*` e o usuário não conseguia nem selecioná-lo nem recriá-lo:

| De | Para |
|---|---|
| `listMainTools` | `listTargetSystems` |
| `listAllMainTools` | `listAllTargetSystems` |
| `createMainTool` | `createTargetSystem` |
| `updateMainTool` | `updateTargetSystem` |
| `deleteMainTool` | `deleteTargetSystem` |
| `ctx.db.mainTool` | `ctx.db.targetSystem` |
| `listMainToolCategories` | `listTargetSystemCategories` |
| `listAllMainToolCategories` | `listAllTargetSystemCategories` |
| `createMainToolCategory` | `createTargetSystemCategory` |
| `updateMainToolCategory` | `updateTargetSystemCategory` |
| `deleteMainToolCategory` | `deleteTargetSystemCategory` |
| `ctx.db.mainToolCategory` | `ctx.db.targetSystemCategory` |

- [ ] **Step 2: Semear as categorias**

Em `prisma/seed.ts`, acrescentar (idempotente por slug, para o seed poder rodar de novo):

```ts
const TARGET_SYSTEM_CATEGORIES = [
  "ERP",
  "Sistema fiscal/contábil",
  "Portal governamental",
  "Banco ou instituição financeira",
  "E-mail e mensageria",
  "Office e planilhas",
  // Com exemplos no nome: sem eles, "SharePoint" cai tanto aqui quanto em
  // "Office e planilhas". Quando "Portal governamental" e "Site externo de
  // terceiros" se aplicarem aos dois, o governamental tem precedência.
  "Armazenamento de arquivos (SharePoint, rede, Drive)",
  "Banco de dados",
  "CRM",
  "RH e folha",
  "Sistema interno próprio",
  "Site externo de terceiros",
  "Outro",
];

for (const [index, name] of TARGET_SYSTEM_CATEGORIES.entries()) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  await prisma.targetSystemCategory.upsert({
    where: { slug },
    update: {},
    create: { name, slug, order: index },
  });
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm build`
Expected: compila, e `trpc.taxonomy.listTargetSystems` aparece no tipo `RouterOutputs`.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts prisma/seed.ts
git commit -m "feat: catalogo de sistemas-alvo no taxonomy router"
```

---

### Task 5: Catálogo de sistemas na admin de categorias

**Files:**
- Create: `src/app/(private)/admin/configuracoes/categorias/_components/target-systems-section.tsx`
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`
- Modify: `src/server/trpc/routers/taxonomy.router.ts`
- Modify: `src/shared/components/merge-suggestions.tsx`

**Duas correções ao plano original, descobertas ao inspecionar o código:**

**1. Componente novo, não duplicação inline.** `page.tsx` já tem 1520 linhas; duplicar a
seção inline levaria a ~1720. A seção nova vai para `_components/`, convenção que o
repositório já usa em seis lugares (`admin/clientes/_components`,
`admin/projetos/_components`, …). `page.tsx` ganha só um import e um render. As
seções existentes ficam onde estão — isto é adição, não reestruturação.

O componente carrega o próprio estado, as próprias mutations e os próprios dialogs,
então o union `deleteConfirm` de `page.tsx` **não** é tocado.

**2. Suporte a merge é obrigatório aqui, ao contrário do que o plano original supunha.**
`MergeSuggestions` e as procedures `merge`/`mergeImpact` operam sobre o enum fechado
`MERGE_TYPE` (`taxonomy.router.ts:12-18`). Sem estender esse enum, a seção nova fica
sem detecção de duplicata.

Isso não é simetria cosmética com `MainTool`: `MainTool` é populado por arquitetos,
enquanto `TargetSystem` vai ser populado **inline por todo usuário cliente** no wizard
(Task 9). É o catálogo com maior risco de acumular "SAP", "S.A.P." e "SAP ECC" como
três registros. Um catálogo de qualidade sem merge apodrece exatamente onde mais
importa.

- [ ] **Step 1: Estender `MERGE_TYPE` e os dois switches**

Em `src/server/trpc/routers/taxonomy.router.ts`, acrescentar `"targetSystem"` e
`"targetSystemCategory"` ao enum `MERGE_TYPE` (linha 12), e o `case` correspondente
em `mergeImpact` (linha ~858) e em `merge` (linha ~912), espelhando os cases de
`mainTool`/`mainToolCategory`.

Diferença de contagem: `mainTool` conta `project.count({ where: { mainToolId } })`.
O equivalente aqui é `projectTargetSystem.count({ where: { targetSystemId } })` — o
vínculo é pela tabela de junção, não por uma FK direta em `Project`.

- [ ] **Step 2: Estender o union `MergeType`**

Em `src/shared/components/merge-suggestions.tsx` (linha 32), acrescentar os dois
valores ao union.

- [ ] **Step 3: Escrever o componente da seção**

`_components/target-systems-section.tsx`, espelhando as duas seções de
`MainToolCategory` + `MainTool` de `page.tsx` (estado, mutations, dialogs, listagem,
`MergeSuggestions`, `Switch` de ativo, editar, apagar), com os textos trocados:

- Seção de categorias: título **"Categorias de Sistema"**, subtítulo "Agrupam os
  sistemas em que as automações atuam (ex.: 'ERP' agrupa SAP, Protheus...)."
- Seção de sistemas: título **"Sistemas em que as automações atuam"**, subtítulo
  "Ex.: SAP dentro de ERP — os sistemas e sites sobre os quais os robôs agem, não a
  ferramenta com que foram construídos."
- Toasts: "Categoria de sistema criada/atualizada/removida", "Sistema criado/
  atualizado/removido".

- [ ] **Step 4: Renderizar em `page.tsx`**

Import e render logo depois da seção "Ferramentas principais", que é a vizinha
conceitual.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit` — os 10 erros de baseline e nada além.
Run: `pnpm dev`, abrir `/admin/configuracoes/categorias`.
Expected: a seção nova aparece depois de "Ferramentas principais"; criar categoria e
sistema funciona; a lista sobrevive ao reload; a sugestão de merge aparece ao criar
dois nomes parecidos.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/" src/server/trpc/routers/taxonomy.router.ts src/shared/components/merge-suggestions.tsx
git commit -m "feat: admin do catalogo de sistemas-alvo, com merge"
```

---

### Task 6: Persistência no project router

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`

- [ ] **Step 1: Declarar os inputs das listas**

No topo do arquivo, junto dos outros schemas Zod:

```ts
const targetSystemInputSchema = z
  .object({
    targetSystemId: z.string().optional(),
    customName: z.string().optional(),
    accessPoint: z.string().optional(),
    accessNotes: z.string().max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH).optional(),
  })
  .refine((s) => !!s.targetSystemId || !!s.customName?.trim(), {
    message: "Escolha um sistema do catálogo ou informe um nome",
  });

const automationAccountInputSchema = z.object({
  username: z.string().min(1).max(AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH),
  /**
   * POSIÇÃO na lista `systems` do mesmo payload, não um id: a gravação
   * substitui as linhas por inteiro e destrói os ids anteriores.
   */
  systemIndex: z.number().int().min(0).optional(),
  accountType: z.string().optional(),
  ownerName: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Sistemas e contas viajam juntos de propósito. As contas apontam para linhas
 * de ProjectTargetSystem por índice, então gravar um sem o outro deixaria todo
 * vínculo nulo — em silêncio, sem erro.
 */
const automationInventoryInputSchema = z.object({
  systems: z.array(targetSystemInputSchema),
  accounts: z.array(automationAccountInputSchema),
});
```

- [ ] **Step 2: Escrever o gravador das listas**

Ainda em `project.router.ts`, acima do `projectRouter`:

```ts
type AutomationInventoryInput = z.infer<typeof automationInventoryInputSchema>;

/**
 * Substituição integral, dentro de uma transação. A ORDEM é obrigatória:
 * apagar contas → apagar sistemas → recriar sistemas → recriar contas.
 * Recriar as contas antes dos sistemas, ou referenciar sistema por id em vez de
 * índice, zeraria todo projectTargetSystemId a cada save sem levantar erro.
 */
async function replaceAutomationInventory(
  tx: Prisma.TransactionClient,
  projectId: string,
  inventory: AutomationInventoryInput
): Promise<void> {
  await tx.projectAutomationAccount.deleteMany({ where: { projectId } });
  await tx.projectTargetSystem.deleteMany({ where: { projectId } });

  const createdSystemIds: string[] = [];
  for (const [index, system] of inventory.systems.entries()) {
    const row = await tx.projectTargetSystem.create({
      data: {
        projectId,
        targetSystemId: system.targetSystemId || null,
        customName: system.customName?.trim() || null,
        accessPoint: system.accessPoint?.trim() || null,
        accessNotes: system.accessNotes?.trim() || null,
        order: index,
      },
      select: { id: true },
    });
    createdSystemIds.push(row.id);
  }

  for (const [index, account] of inventory.accounts.entries()) {
    await tx.projectAutomationAccount.create({
      data: {
        projectId,
        username: account.username.trim(),
        projectTargetSystemId:
          account.systemIndex != null ? createdSystemIds[account.systemIndex] ?? null : null,
        accountType: account.accountType || null,
        ownerName: account.ownerName?.trim() || null,
        notes: account.notes?.trim() || null,
        order: index,
      },
    });
  }
}
```

- [ ] **Step 3: Estender os inputs de `create` e `update`**

Em `create` (linha 380) e no input de `update`, acrescentar depois de `currentApplicationLiveSince`:

```ts
        currentApplicationAssetId: z.string().optional(),
        currentApplicationOwnerRole: z.string().optional(),
        currentApplicationOwnerAreaId: z.string().optional(),
        currentApplicationDataInput: z.string().optional(),
        currentApplicationDataInputDetails: z.string().optional(),
        currentApplicationDataOutput: z.string().optional(),
        currentApplicationDataOutputDetails: z.string().optional(),
        currentApplicationContingencyActions: z.array(z.string()).optional(),
        currentApplicationContingencyDetails: z.string().optional(),
        currentApplicationBackupOwner: z.string().optional(),
        handlesSensitiveData: z.string().optional(),
        sensitiveDataCategories: z.array(z.string()).optional(),
        sensitiveDataDetails: z.string().optional(),
        automationInventory: automationInventoryInputSchema.optional(),
```

- [ ] **Step 4: Gravar**

Envolver o `ctx.db.project.create` existente (linha ~505) e o `update` numa `ctx.db.$transaction`, mapeando os campos escalares como os `currentApplication*` já são mapeados, e chamando:

```ts
      if (input.automationInventory) {
        await replaceAutomationInventory(tx, project.id, input.automationInventory);
      }
```

- [ ] **Step 5: Ler**

Nas queries que devolvem projeto (`byId` e as listagens que alimentam a ficha), acrescentar ao `select`/`include`:

```ts
          ownerArea: { select: { id: true, name: true } },
          targetSystems: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              targetSystemId: true,
              customName: true,
              accessPoint: true,
              accessNotes: true,
              order: true,
              targetSystem: { select: { name: true, category: { select: { name: true } } } },
            },
          },
          automationAccounts: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              username: true,
              projectTargetSystemId: true,
              accountType: true,
              ownerName: true,
              notes: true,
              order: true,
              projectTargetSystem: {
                select: { customName: true, targetSystem: { select: { name: true } } },
              },
            },
          },
```

E achatar para os tipos da Task 3, resolvendo `name` como `targetSystem?.name ?? customName`.

**Só em `byId`, nunca em `list`.** `list` alimenta o provider global
`projects-context`, consultado em toda navegação e invalidado a cada mutação de
qualquer projeto; as duas listas com `include` aninhado ali custariam joins em todo o
app sem consumidor. As telas de ficha já buscam por `byId` à parte
(`project-details.modal.tsx:73`, `projeto/[id]/hooks/project.hook.ts:4`) — é esse o
padrão do repositório: `list` = card leve, `byId` = ficha completa sob demanda. Os 13
campos **escalares** ficam nos dois, porque vêm da mesma linha, sem join.

- [ ] **Step 5b: Mapear no contexto (adiado da Task 3)**

Só agora, com o router devolvendo os campos, acrescentar os dois mapeamentos em
`src/shared/context/projects-context.tsx` (linhas ~111-118 e ~220+), no padrão
`p.campo ?? undefined` que `currentApplicationHosting` já usa — é esse `?? undefined`
que sustenta a ausência de `| null` na interface `Project`. Os tipos já foram
declarados na Task 3.

`ProjectTargetSystemView.name` promete `string` não-vazia. O fallback
`targetSystem?.name ?? customName ?? ""` satisfaz o TypeScript e trai a promessa:
string vazia aqui é bug de backend, não valor legítimo. O Zod de entrada já rejeita
linha sem `targetSystemId` e sem `customName`, então o `?? ""` só dispara se um dado
inconsistente entrou por outro caminho — vale um filtro que descarte a linha em vez
de renderizar um nome vazio na ficha e no deck.

- [ ] **Step 6: Rotular para o ActivityLog**

Em `SOLICITATION_FIELD_LABELS` (linha 88):

```ts
  currentApplicationAssetId: "Identificação do ativo",
  currentApplicationOwnerRole: "Cargo do responsável",
  currentApplicationOwnerAreaId: "Setor do responsável",
  currentApplicationDataInput: "Origem dos dados de entrada",
  currentApplicationDataInputDetails: "Detalhes da entrada de dados",
  currentApplicationDataOutput: "Destino dos dados de saída",
  currentApplicationDataOutputDetails: "Detalhes da saída de dados",
  currentApplicationContingencyActions: "O que fazer se a automação parar",
  currentApplicationContingencyDetails: "Detalhes da contingência",
  currentApplicationBackupOwner: "Responsável substituto",
  handlesSensitiveData: "Mexe em dados sigilosos",
  sensitiveDataCategories: "Categorias de dados sigilosos",
  sensitiveDataDetails: "Detalhes dos dados sigilosos",
```

Nenhum deles entra em `ARCHITECT_ONLY_FIELDS`: são campos de solicitação, editáveis pelo cliente-dono.

- [ ] **Step 7: Verificar**

Run: `pnpm build`
Expected: compila.

- [ ] **Step 8: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: persistencia dos campos de catalogo e das listas de sistemas e contas"
```

---

### Task 7: Script de verificação do vínculo conta→sistema

**Files:**
- Create: `scripts/verify-automation-inventory.ts`
- Modify: `package.json`

- [ ] **Step 1: Escrever o script**

Este é o cenário que falha em silêncio: salvar duas vezes sem mudar nada não pode perder o vínculo.

**Correção ao esboço abaixo:** ele reimplementa a transação à mão, o que testaria uma
cópia da lógica em vez do código real. O script deve chamar `project.create` e
`project.update` pelo `createCaller` do tRPC — o mesmo padrão que
`src/server/deck/build-existing-automations-deck.ts` usa — para exercitar
`replaceAutomationInventory` de verdade, incluindo a tradução `systemIndex` → id e a
validação de índice fora do intervalo.

**Este script exige `DATABASE_URL` e não roda na máquina de desenvolvimento atual**
(não há `.env`). Ele é entregue como artefato executável contra um banco descartável
ou no ambiente de deploy; enquanto não rodar, a regressão que ele cobre permanece
não verificada, e isso deve ser dito explicitamente em vez de presumido resolvido.

```ts
import { PrismaClient } from "@prisma/client";

/**
 * Verifica que o vínculo conta → sistema sobrevive ao ciclo apaga-e-recria de
 * replaceAutomationInventory. Rode: pnpm verify:inventory
 * Precisa de DATABASE_URL apontando para uma base descartável — o script cria e
 * apaga os próprios dados.
 */
const db = new PrismaClient();

async function main() {
  const client = await db.user.findFirst({ select: { id: true } });
  if (!client) throw new Error("Nenhum usuário na base — rode o seed antes.");

  const project = await db.project.create({
    data: { title: "[verify] inventario", type: "AUTOMATION", category: "INTERNAL", clientId: client.id },
    select: { id: true },
  });

  async function save() {
    await db.$transaction(async (tx) => {
      await tx.projectAutomationAccount.deleteMany({ where: { projectId: project.id } });
      await tx.projectTargetSystem.deleteMany({ where: { projectId: project.id } });
      const sap = await tx.projectTargetSystem.create({
        data: { projectId: project.id, customName: "SAP", order: 0 },
        select: { id: true },
      });
      await tx.projectAutomationAccount.create({
        data: { projectId: project.id, username: "rpa_sap", projectTargetSystemId: sap.id, order: 0 },
      });
    });
  }

  await save();
  await save();

  const accounts = await db.projectAutomationAccount.findMany({
    where: { projectId: project.id },
    select: { username: true, projectTargetSystem: { select: { customName: true } } },
  });

  await db.project.delete({ where: { id: project.id } });

  const linked = accounts[0]?.projectTargetSystem?.customName;
  if (accounts.length !== 1 || linked !== "SAP") {
    console.error(`FALHOU: esperava 1 conta ligada a "SAP", veio ${JSON.stringify(accounts)}`);
    process.exit(1);
  }
  console.log("OK: vinculo conta -> sistema sobreviveu a dois saves consecutivos");
}

main().finally(() => db.$disconnect());
```

Confira os valores de `type` e `category` contra os enums `ProjectType`/`ProjectCategory` em `prisma/schema.prisma` e ajuste se os nomes forem outros.

- [ ] **Step 2: Registrar o script**

Em `package.json`, na seção `scripts`:

```json
    "verify:inventory": "tsx scripts/verify-automation-inventory.ts",
```

- [ ] **Step 3: Rodar**

Run: `pnpm verify:inventory`
Expected: `OK: vinculo conta -> sistema sobreviveu a dois saves consecutivos`

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-automation-inventory.ts package.json
git commit -m "test: script de verificacao do vinculo conta-sistema"
```

---

### Task 8: Schema do formulário e payload

**Files:**
- Modify: `src/shared/schema/solicitar-projeto.ts`
- Modify: `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`

- [ ] **Step 1: Estender o schema do formulário**

Em `solicitar-projeto.ts`, depois de `currentApplicationLiveSince` (linha 46), seguindo o padrão `.optional().default("")` que o arquivo já usa:

```ts
    currentApplicationAssetId: z.string().optional().default(""),
    currentApplicationOwnerRole: z.string().optional().default(""),
    currentApplicationOwnerAreaId: z.string().optional().default(""),
    currentApplicationDataInput: z.string().optional().default(""),
    currentApplicationDataInputDetails: z.string().optional().default(""),
    currentApplicationDataOutput: z.string().optional().default(""),
    currentApplicationDataOutputDetails: z.string().optional().default(""),
    currentApplicationContingencyActions: z.array(z.string()).optional().default([]),
    currentApplicationContingencyDetails: z.string().optional().default(""),
    currentApplicationBackupOwner: z.string().optional().default(""),
    handlesSensitiveData: z.string().optional().default(""),
    sensitiveDataCategories: z.array(z.string()).optional().default([]),
    sensitiveDataDetails: z.string().optional().default(""),
    targetSystems: z
      .array(
        z.object({
          targetSystemId: z.string().optional().default(""),
          customName: z.string().optional().default(""),
          accessPoint: z.string().optional().default(""),
          accessNotes: z
            .string()
            .max(CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH, "Máximo de 200 caracteres")
            .optional()
            .default(""),
        })
      )
      .optional()
      .default([]),
    automationAccounts: z
      .array(
        z.object({
          username: z
            .string()
            .max(AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH, "Máximo de 120 caracteres")
            .optional()
            .default(""),
          systemIndex: z.number().int().min(0).nullable().optional().default(null),
          accountType: z.string().optional().default(""),
          ownerName: z.string().optional().default(""),
          notes: z.string().optional().default(""),
        })
      )
      .optional()
      .default([]),
```

- [ ] **Step 2: Montar o payload**

Em `build-project-payload.ts`, depois de `currentApplicationLiveSince` (linha 97):

```ts
    currentApplicationAssetId: data.currentApplicationAssetId || undefined,
    currentApplicationOwnerRole: data.currentApplicationOwnerRole || undefined,
    currentApplicationOwnerAreaId: data.currentApplicationOwnerAreaId || undefined,
    currentApplicationDataInput: data.currentApplicationDataInput || undefined,
    currentApplicationDataInputDetails: data.currentApplicationDataInputDetails || undefined,
    currentApplicationDataOutput: data.currentApplicationDataOutput || undefined,
    currentApplicationDataOutputDetails: data.currentApplicationDataOutputDetails || undefined,
    currentApplicationContingencyActions: data.currentApplicationContingencyActions?.length
      ? data.currentApplicationContingencyActions
      : undefined,
    currentApplicationContingencyDetails: data.currentApplicationContingencyDetails || undefined,
    currentApplicationBackupOwner: data.currentApplicationBackupOwner || undefined,
    handlesSensitiveData: data.handlesSensitiveData || undefined,
    sensitiveDataCategories: data.sensitiveDataCategories?.length
      ? data.sensitiveDataCategories
      : undefined,
    sensitiveDataDetails: data.sensitiveDataDetails || undefined,
    automationInventory: buildAutomationInventory(data),
```

E a função, no mesmo arquivo. Linhas em branco são descartadas aqui, não no servidor, porque o formulário sempre carrega uma linha vazia pronta para digitação:

```ts
function buildAutomationInventory(data: SolicitarProjetoFormData) {
  const systems = (data.targetSystems ?? []).filter(
    (s) => s.targetSystemId || s.customName.trim()
  );
  // O índice precisa apontar para a lista JÁ FILTRADA: descartar uma linha vazia
  // no meio desloca todas as seguintes.
  const indexMap = new Map<number, number>();
  (data.targetSystems ?? []).forEach((s, original) => {
    if (s.targetSystemId || s.customName.trim()) indexMap.set(original, indexMap.size);
  });

  const accounts = (data.automationAccounts ?? [])
    .filter((a) => a.username.trim())
    .map((a) => ({
      username: a.username.trim(),
      systemIndex: a.systemIndex != null ? indexMap.get(a.systemIndex) : undefined,
      accountType: a.accountType || undefined,
      ownerName: a.ownerName || undefined,
      notes: a.notes || undefined,
    }));

  if (systems.length === 0 && accounts.length === 0) return undefined;
  return {
    systems: systems.map((s) => ({
      targetSystemId: s.targetSystemId || undefined,
      customName: s.customName.trim() || undefined,
      accessPoint: s.accessPoint || undefined,
      accessNotes: s.accessNotes || undefined,
    })),
    accounts,
  };
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm build`
Expected: compila; erros em `page.tsx` sobre `defaultValues` incompletos são esperados e resolvem na Task 9.

- [ ] **Step 4: Commit**

```bash
git add src/shared/schema/solicitar-projeto.ts "src/app/(private)/cliente/solicitar/utils/build-project-payload.ts"
git commit -m "feat: campos novos no schema do formulario e no payload"
```

---

### Task 9: Wizard de solicitação

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`
- Create: `src/app/(private)/cliente/solicitar/_components/sensitive-data-block.tsx`
- Create: `src/app/(private)/cliente/solicitar/_components/target-systems-list.tsx`
- Create: `src/app/(private)/cliente/solicitar/_components/automation-accounts-list.tsx`
- Create: `src/app/(private)/cliente/solicitar/_components/sustentacao-block.tsx`

Quatro componentes em vez de tudo inline: `page.tsx` já passa de 600 linhas e receberia mais ~350.

- [ ] **Step 1: Acrescentar o passo novo em `STEPS`**

Em `page.tsx` (linha 122), tirar do passo `envolvidos` os oito `fieldsToValidate` de `currentApplicationHosting` a `currentApplicationLiveSince`, e inserir entre `envolvidos` e `funcionalidades`:

```ts
  {
    key: "sistemas",
    label: "Sistemas",
    description: "Sobre o que a automação atua e como ela se sustenta",
    fieldsToValidate: [
      "targetSystems",
      "automationAccounts",
      "currentApplicationHosting",
      "currentApplicationHostingCustom",
      "currentApplicationAssetId",
      "currentApplicationAuthor",
      "currentApplicationOwner",
      "currentApplicationOwnerRole",
      "currentApplicationOwnerAreaId",
      "currentApplicationAccessLocation",
      "currentApplicationAccessReference",
      "currentApplicationLiveSince",
      "currentApplicationDataInput",
      "currentApplicationDataInputDetails",
      "currentApplicationDataOutput",
      "currentApplicationDataOutputDetails",
      "currentApplicationContingencyActions",
      "currentApplicationContingencyDetails",
      "currentApplicationBackupOwner",
    ],
  },
```

Acrescentar `"sistemas"` ao union `StepKey` (linha 113). Acrescentar `"handlesSensitiveData"`, `"sensitiveDataCategories"` e `"sensitiveDataDetails"` aos `fieldsToValidate` do passo `basico`.

- [ ] **Step 2: Bloco de dados sigilosos**

`_components/sensitive-data-block.tsx`: um `Select` de `SENSITIVE_DATA_ANSWER_OPTIONS`, e — só quando o valor é `"sim"` — os checkboxes de `SENSITIVE_DATA_CATEGORY_OPTIONS` e um `Textarea` de detalhes. Mesmo padrão de checkbox + textarea já usado por `BENEFIT_OPTIONS` / `benefitsDetails` no passo Benefícios. Renderizar no passo `basico`, logo depois de `description`.

- [ ] **Step 3: Lista de sistemas**

`_components/target-systems-list.tsx`, com `useFieldArray` de react-hook-form sobre `targetSystems`. Por linha: `CreatableCombobox` de `trpc.taxonomy.listTargetSystems` (mesmo uso de `architecture-tab.tsx:361-372`, com `onCreate` chamando `createTargetSystem`), input de `accessPoint` ("Onde é acessado — URL, servidor ou instância"), input de `accessNotes` com o helper **"Onde encontrar o acesso — nunca escreva senhas ou tokens aqui"**, e botão de remover. Botão "Adicionar sistema" no fim. Renderizar no passo `sistemas`, fora de qualquer condicional: vale para todo projeto.

**Exigência que vale para a Task 9 e para a Task 10:** hidratar o formulário a partir
de um projeto existente precisa de uma **função de conversão nomeada**, não de um
spread ou reaproveitamento. A leitura devolve `ProjectTargetSystemView[]` (resolvido,
com id) e `ProjectAutomationAccountView[]` (com `projectTargetSystemId`); o formulário
precisa de linhas com `targetSystemId`/`customName` e de contas com **`systemIndex`**.
Converter `projectTargetSystemId` → posição na lista é exatamente onde um índice
trocado nasce sem erro. Escreva `viewToFormRows` (ou nome equivalente) explicitamente,
e mapeie id → índice por um `Map` construído da mesma lista que vai para o formulário.

- [ ] **Step 4: Lista de contas**

`_components/automation-accounts-list.tsx`, `useFieldArray` sobre `automationAccounts`. Por linha: input de `username` com `maxLength={AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH}` e o helper **"Só o login. Nunca escreva a senha aqui"**, `Select` de `AUTOMATION_ACCOUNT_TYPE_OPTIONS`, `Select` de sistema alimentado pelas linhas de `targetSystems` do próprio formulário (`value` = índice, label = nome do catálogo ou `customName`), input de `ownerName`, input de `notes`.

- [ ] **Step 5: Bloco de sustentação**

`_components/sustentacao-block.tsx`, com a ficha inteira: os campos de julho (hospedagem, hospedagem custom, autor, responsável, local de acessos, referência de acessos, em produção desde) mais ativo, cargo, setor (`CreatableCombobox` de áreas, reusando a mesma lista do passo Básico), o par entrada/saída, os checkboxes de contingência com o textarea de detalhes, o substituto, e a lista de contas do Step 4. Renderizar no passo `sistemas` dentro de `{hasCurrentApplication === "sim" && ...}`.

Trocar o label do `currentApplicationDetails` para **"O que a automação faz hoje e qual o objetivo dela"**, com placeholder pedindo o objetivo funcional — plataforma, autor e data agora têm campo próprio.

- [ ] **Step 6: Estender `defaultValues`**

Acrescentar todos os campos da Task 8 aos `defaultValues` do `useForm`, com `""`, `[]` ou `[{ ... }]` para as listas (uma linha vazia inicial em cada).

- [ ] **Step 7: Verificar na tela**

Run: `pnpm dev` e abrir `/cliente/solicitar`
Expected: seis passos; "Sistemas" mostra a lista de sistemas para qualquer projeto e abre a ficha de sustentação só quando "já existe automação hoje" = Sim; enviar com o passo inteiro vazio salva normalmente.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/"
git commit -m "feat: passo Sistemas no wizard e bloco de dados sigilosos"
```

---

### Task 10: Ficha do projeto e edição

**Files:**
- Modify: `src/shared/components/project-detail-sections.tsx`
- Modify: `src/shared/components/project-request-edit-form.tsx`
- Modify: `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

- [ ] **Step 1: Expandir "Sustentação & acessos"**

Em `project-detail-sections.tsx`, na `DetailSection` da linha 137, acrescentar ativo, cargo, setor (`project.currentApplicationOwnerAreaName`), substituto, as ações de contingência (via `resolveKeyLabels`) e os detalhes.

- [ ] **Step 2: Criar a `DetailSection` "Sistemas e dados"**

Logo depois, fora de `canSeeTechnical` — o cliente preenche, o cliente vê:

- tabela de `project.targetSystems` (sistema · categoria · onde é acessado · como acessar);
- resposta de sigilo via `resolveSensitiveDataAnswerLabel`, categorias via `resolveKeyLabels`, e os detalhes;
- par entrada/saída via `resolveDataEndpointLabel` + os detalhes.

Renderizar a seção só quando ao menos um desses campos tem valor, como as demais seções já fazem.

- [ ] **Step 3: Bloco de contas com visibilidade restrita**

Dentro de "Sustentação & acessos":

```tsx
{(canSeeTechnical || isOwner) && (project.automationAccounts?.length ?? 0) > 0 && (
  // tabela: usuário · tipo · sistema · responsável · observações
)}
```

`canSeeTechnical` e `isOwner` já existem nas linhas 51-54. Username é metade de uma credencial: a lista não vai para os demais usuários clientes da empresa.

Passar `username`, `accessPoint` e `accessNotes` por `maskFreeText` (o hook `useDemoMode` já está em uso na linha 43).

- [ ] **Step 4: Edição**

Em `project-request-edit-form.tsx`, acrescentar os mesmos campos e as duas listas, seguindo o `canEdit` que já existe ali. Reaproveitar os componentes de lista criados na Task 9 em vez de duplicar o `useFieldArray`.

- [ ] **Step 5: Arquiteto**

Em `architecture-tab.tsx`, acrescentar os mesmos campos para o arquiteto refinar a versão inicial preenchida pelo cliente.

- [ ] **Step 6: Verificar na tela**

Run: `pnpm dev`, abrir um projeto com a ficha preenchida como admin e como usuário cliente que não é o dono
Expected: admin vê as contas, o cliente não-dono não vê; as demais seções aparecem para os dois.

- [ ] **Step 7: Commit**

```bash
git add src/shared/components/project-detail-sections.tsx src/shared/components/project-request-edit-form.tsx "src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx"
git commit -m "feat: ficha e edicao dos campos de catalogo de automacoes"
```

---

### Task 11: XML de projeto completo e round-trip

**Files:**
- Modify: `src/shared/xml/build-projeto-completo-xml.ts`
- Modify: `src/shared/xml/parse-projeto-completo-xml.ts`
- Modify: `src/app/api/empresas/[id]/xml-agregado/route.ts`
- Create: `scripts/verify-xml-roundtrip.ts`
- Modify: `package.json`

- [ ] **Step 1: Serializar**

Em `build-projeto-completo-xml.ts`, acrescentar as tags escalares, com os mesmos nomes em português do padrão de julho:

`ativoAplicacaoExistente` · `cargoResponsavelAplicacaoExistente` · `setorResponsavelAplicacaoExistente` · `origemDadosEntrada` · `detalhesDadosEntrada` · `destinoDadosSaida` · `detalhesDadosSaida` · `acoesContingencia` · `detalhesContingencia` · `responsavelSubstitutoAplicacaoExistente` · `dadosSigilosos` · `categoriasDadosSigilosos` · `detalhesDadosSigilosos`

E as duas listas, no padrão aninhado de `features`:

```xml
<sistemas>
  <sistema>
    <nome>SAP</nome>
    <categoria>ERP</categoria>
    <pontoAcesso>srv-sap.empresa.local</pontoAcesso>
    <comoAcessar>Cofre de senhas do TI</comoAcessar>
  </sistema>
</sistemas>
<contas>
  <conta>
    <usuario>rpa_sap</usuario>
    <tipo>Usuário de serviço</tipo>
    <sistema>SAP</sistema>
    <responsavel>Ana Souza</responsavel>
    <observacoes></observacoes>
  </conta>
</contas>
```

Selects e chaves saem como **label**, não slug — é o que a importação casa (`matchByLabel`/`resolveEnum`).

- [ ] **Step 2: Ler**

Em `parse-projeto-completo-xml.ts`, ler tudo como opcional. Regra do vínculo:

```ts
// <conta><sistema> carrega o NOME, não um id: id não sobrevive entre bases.
// Sem correspondência, a conta entra com vínculo nulo — nunca é descartada.
// Por isso as contas são processadas DEPOIS dos sistemas.
const systemIndexByName = new Map(
  systems.map((s, i) => [s.nome.trim().toLowerCase(), i])
);
const systemIndex = systemIndexByName.get(conta.sistema?.trim().toLowerCase() ?? "");
```

Linha de sistema sem `<nome>` e conta sem `<usuario>` são descartadas com aviso, não derrubam a importação. `comoAcessar` acima de 200 caracteres e `usuario` acima de 120 são truncados com aviso.

- [ ] **Step 3: XML agregado**

Em `src/app/api/empresas/[id]/xml-agregado/route.ts`, acrescentar os campos novos e as duas listas ao `select`.

- [ ] **Step 4: Script de round-trip**

`scripts/verify-xml-roundtrip.ts`:

```ts
import { buildProjetoCompletoXml } from "../src/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "../src/shared/xml/parse-projeto-completo-xml";

/**
 * Exporta um projeto fictício com todos os campos novos preenchidos, reimporta e
 * compara. Sem banco. Rode: pnpm verify:xml
 */
const original = {
  title: "Conciliação bancária",
  currentApplicationAssetId: "SRV-RPA-01",
  currentApplicationOwnerRole: "Analista de Processos",
  currentApplicationDataInput: "sistema",
  currentApplicationDataInputDetails: "Extrato SAP FBL3N, diário 6h",
  currentApplicationDataOutput: "planilha",
  currentApplicationDataOutputDetails: "\\\\fs01\\financeiro\\conciliacao.xlsx",
  currentApplicationContingencyActions: ["reexecutar", "acionar-ti-interno"],
  currentApplicationContingencyDetails: "Conferir log em D:\\rpa\\logs",
  currentApplicationBackupOwner: "Carlos Lima",
  handlesSensitiveData: "sim",
  sensitiveDataCategories: ["bancarios-financeiros"],
  sensitiveDataDetails: "Extratos e saldos",
  targetSystems: [
    { name: "SAP", categoryName: "ERP", accessPoint: "srv-sap.empresa.local", accessNotes: "Cofre do TI" },
  ],
  automationAccounts: [
    { username: "rpa_sap", accountType: "servico", systemName: "SAP", ownerName: "Ana Souza", notes: null },
  ],
};

const xml = buildProjetoCompletoXml(original as never);
const parsed = parseProjetoCompletoXml(xml);

const checks: [string, unknown, unknown][] = [
  ["assetId", parsed.currentApplicationAssetId, original.currentApplicationAssetId],
  ["dataInput", parsed.currentApplicationDataInput, original.currentApplicationDataInput],
  ["contingencia", JSON.stringify(parsed.currentApplicationContingencyActions), JSON.stringify(original.currentApplicationContingencyActions)],
  ["sigilo", parsed.handlesSensitiveData, original.handlesSensitiveData],
  ["sistemas", parsed.targetSystems?.length, 1],
  ["contas", parsed.automationAccounts?.length, 1],
  ["vinculo conta->sistema", parsed.automationAccounts?.[0]?.systemIndex, 0],
];

const failures = checks.filter(([, got, want]) => got !== want);
if (failures.length > 0) {
  for (const [name, got, want] of failures) console.error(`FALHOU ${name}: veio ${got}, esperava ${want}`);
  process.exit(1);
}

// XML antigo, sem nenhuma tag nova, precisa importar sem erro.
const legacy = parseProjetoCompletoXml("<projeto><titulo>Antigo</titulo></projeto>");
if (legacy.targetSystems?.length) {
  console.error("FALHOU: XML sem tags novas devolveu sistemas");
  process.exit(1);
}

console.log("OK: round-trip completo e XML legado importam sem perda");
```

Ajuste os nomes de `buildProjetoCompletoXml`/`parseProjetoCompletoXml` e a forma do objeto de entrada ao que os dois arquivos realmente exportam.

- [ ] **Step 5: Registrar e rodar**

Em `package.json`: `"verify:xml": "tsx scripts/verify-xml-roundtrip.ts",`

Run: `pnpm verify:xml`
Expected: `OK: round-trip completo e XML legado importam sem perda`

- [ ] **Step 6: Commit**

```bash
git add src/shared/xml/ "src/app/api/empresas/[id]/xml-agregado/route.ts" scripts/verify-xml-roundtrip.ts package.json
git commit -m "feat: campos de catalogo no XML de projeto completo"
```

---

### Task 12: XML de solicitação e prompts

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/xml-import.ts`
- Modify: `src/server/trpc/routers/project-import-xml-helpers.ts`
- Modify: `public/modelo-solicitacao-projeto.xml`
- Modify: `docs/prompt-geracao-xml.md`
- Modify: `src/server/ai/xml-generation-prompt.ts`

- [ ] **Step 1: Importar as tags novas**

Em `xml-import.ts` e `project-import-xml-helpers.ts`, ler as mesmas tags e listas da Task 11, com o mesmo tratamento: tudo opcional, linha inválida descartada com aviso, valor de select desconhecido caindo no fallback que já existe.

- [ ] **Step 2: Atualizar o modelo público**

Em `public/modelo-solicitacao-projeto.xml`, acrescentar as tags novas com valores de exemplo e um comentário XML avisando que `<comoAcessar>` e `<usuario>` nunca recebem senha.

- [ ] **Step 3: Atualizar os dois prompts, na mesma edição**

`docs/prompt-geracao-xml.md` e `src/server/ai/xml-generation-prompt.ts` são cópias do mesmo prompt: o `.md` é colado numa IA externa, o `.ts` é usado pela geração de oportunidades dentro do app. O cabeçalho do `.ts` já avisa que esquecer a sincronia faz o caminho in-app gerar XML sem os campos, em silêncio.

Documentar cada tag nova com os **labels exatos** das listas da Task 2 — a importação casa por label, e um label divergente cai no fallback "Outro" sem erro e sem aviso. Instruir explicitamente: nunca inventar hostname, conta ou plano de contingência que não esteja na transcrição; deixar a tag vazia é o comportamento certo.

- [ ] **Step 4: Verificar**

Run: `pnpm dev`, importar `public/modelo-solicitacao-projeto.xml` em `/cliente/solicitar`
Expected: sistemas, contas e campos novos aparecem preenchidos no passo Sistemas. Importar um XML antigo qualquer: importa sem erro, campos vazios.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/utils/xml-import.ts" src/server/trpc/routers/project-import-xml-helpers.ts public/modelo-solicitacao-projeto.xml docs/prompt-geracao-xml.md src/server/ai/xml-generation-prompt.ts
git commit -m "feat: campos de catalogo no XML de solicitacao e nos prompts"
```

---

### Task 13: Slide de ficha técnica no deck de automações existentes

**Files:**
- Modify: `src/server/deck/build-existing-automations-deck.ts`
- Create: `scripts/preview-ficha-tecnica-slide.ts`
- Modify: `package.json`

- [ ] **Step 1: Selecionar os campos novos**

No `db.project.findMany` (linha 119), acrescentar ao `select` os treze campos escalares, `ownerArea: { select: { name: true } }` e as duas listas com o mesmo shape da Task 6, Step 5.

- [ ] **Step 2: Escrever `addFichaTecnicaSlide`**

Cinco blocos, usando os helpers que já existem no arquivo (`addTitledSlide`, `hostingLabel`, `accessLabel`, `liveSinceLabel`) e o tema de `deck-theme.ts`:

```
┌ Hospedagem ────────────┬ Sistemas em que atua ──────────────┐
│ Servidor próprio       │ SAP        ERP        srv-sap.ext  │
│ SRV-RPA-01             │ Portal RFB Gov        gov.br/...   │
│ Em produção desde 03/24│ SharePoint Arquivos   /financeiro  │
├ Fluxo de dados ────────┴────────────────────────────────────┤
│ Entrada  Sistema   · extrato SAP FBL3N, diário 6h           │
│ Saída    Planilha  · \\fs01\financeiro\conciliacao.xlsx      │
├ Sustentação ────────────────────┬ Contas utilizadas ────────┤
│ Ana Souza · Analista · Financeiro│ rpa_sap   serviço  SAP   │
│ Substituto: Carlos Lima          │ nf@empresa e-mail  Outlook│
│ Se parar: reiniciar serviço,     │                          │
│ acionar TI · dados sigilosos: sim│                          │
└──────────────────────────────────┴──────────────────────────┘
```

Campo não preenchido sai como "Não informado", como as `extraLines` de julho já fazem.

- [ ] **Step 3: Chamar, pulando quando não há dado**

Dentro do `for (const project of projects)` (linha 174), depois de `addProjectSlide`:

```ts
    // Sem nenhum campo novo, o slide seria uma página de "Não informado" —
    // deck de empresa que ainda não fez o levantamento não deve carregá-la.
    if (hasFichaTecnicaData(project)) {
      addFichaTecnicaSlide(pres, project);
    }
```

`hasFichaTecnicaData` espelha o `hasSustentacaoData` que já existe na linha 87, cobrindo os campos novos e as duas listas.

As sete `extraLines` de julho e o slide de inventário **não mudam**.

- [ ] **Step 4: Script de preview**

`scripts/preview-ficha-tecnica-slide.ts`, no molde de `scripts/preview-executive-slides.ts`: gera `preview-ficha-tecnica.pptx` com dados fixos, sem tocar no banco — um projeto com tudo preenchido, um com metade, e um vazio (que não deve gerar slide).

Registrar em `package.json`: `"deck:preview-ficha": "tsx scripts/preview-ficha-tecnica-slide.ts",`

- [ ] **Step 5: Rodar e abrir**

Run: `pnpm deck:preview-ficha`
Expected: `preview-ficha-tecnica.pptx` com **dois** slides (o projeto vazio não gera). Abrir e conferir que nenhum bloco estoura a margem.

- [ ] **Step 6: Commit**

```bash
git add src/server/deck/build-existing-automations-deck.ts scripts/preview-ficha-tecnica-slide.ts package.json
git commit -m "feat: slide de ficha tecnica no deck de automacoes existentes"
```

---

### Task 14: Sistemas e sigilo no deck de diagnóstico

**Files:**
- Modify: `src/server/deck/build-diagnostic-deck.ts`

- [ ] **Step 1: Selecionar os campos**

Na query que alimenta o deck, acrescentar `handlesSensitiveData`, `sensitiveDataCategories`, `sensitiveDataDetails` e a lista `targetSystems`.

- [ ] **Step 2: Renderizar no slide de processo**

Em `addProjectSlide` (linha 1134), na coluna esquerda depois do bloco de `architectNotes` (que termina na linha ~1199), acrescentar "Sistemas envolvidos" (nomes separados por ` · `) e "Dados sigilosos" (a resposta, mais as categorias quando `"sim"`), cada um só quando tem valor.

`addProjectSlide` é compartilhado com o deck de automações existentes, então os dois decks ganham os dois blocos — que é o desejado: os campos valem para projeto novo e existente. `leftY` precisa avançar como os blocos anteriores fazem, senão o conteúdo se sobrepõe.

- [ ] **Step 3: Verificar**

Run: `pnpm deck:preview-ficha` (usa o mesmo `addProjectSlide`) e gerar um deck de diagnóstico real pela tela `/admin/empresas`
Expected: o slide de processo mostra os dois blocos novos quando preenchidos e mantém o layout quando vazios.

- [ ] **Step 4: Commit**

```bash
git add src/server/deck/build-diagnostic-deck.ts
git commit -m "feat: sistemas e dados sigilosos no slide de processo"
```

---

### Task 15: Fechamento

- [ ] **Step 1: Rodar tudo**

```bash
pnpm lint && pnpm build && pnpm verify:xml && pnpm verify:inventory
```
Expected: os quatro passam.

- [ ] **Step 2: Conferir a cobertura da spec**

Reler a seção "Fora de escopo" da spec e confirmar que nada dali foi implementado por engano — em especial: nenhum indicador de completude, nenhuma coluna nova em `/admin/empresas/[id]/automacoes-existentes`, nenhum campo de senha em lugar nenhum.

Run: `grep -rin "password\|senha\|token\|secret" prisma/schema.prisma`
Expected: nenhuma ocorrência nos models novos.

- [ ] **Step 3: Push**

Push para `main` dispara build + migration + deploy automáticos. Confirme com o usuário antes.
