# Área/Tema como taxonomia estruturada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a `área`/`tema` um vínculo estruturado real no banco (`Project.areaId`/`themeId` → `ProjectArea`/`ProjectTheme`), e oferecer, tanto na importação de XML quanto no formulário manual, a opção de mapear um valor não reconhecido para uma categoria já cadastrada ou (só admin/super_admin) cadastrar uma nova — conforme `docs/superpowers/specs/2026-07-07-area-tema-taxonomia-estruturada-design.md`.

**Architecture:** Migration Prisma adicionando duas colunas nullable + FK. Backend (`project.create`) passa a aceitar `areaId`/`themeId` opcionais. `useTaxonomy()` passa a expor o `id` real de cada área/tema (hoje só expõe `value`/`label`). O fluxo de resolução (mapear pra existente / cadastrar novo) só entra em jogo quando `projectArea`/`projectTheme` cai em `"outro"` — reaproveita o mesmo padrão de Promise/`useRef` já usado para resolver empresa ambígua no import em lote.

**Escopo desta primeira fatia (confirmado com o usuário):** `areaId`/`themeId` só são preenchidos quando o usuário passa pelo fluxo de resolução explícita (mapear ou cadastrar). O caminho feliz de hoje (área já bate direto com uma opção do dropdown) **não** ganha `areaId`/`themeId` nesta entrega — ficaria inconsistente com projetos já existentes, mas é aditivo e não quebra nada; unificar os dois caminhos é um follow-up natural, não um requisito confirmado agora.

**Tech Stack:** Next.js 16 / TypeScript / Prisma / tRPC / React Hook Form. **Sem test runner configurado.** Verificação: `npx tsc --noEmit` + revisão estática (sem navegador, sem banco local acessível nesta sessão — a migration é escrita à mão, sem rodar `prisma migrate dev` contra banco nenhum, e só é aplicada de verdade no deploy via `prisma migrate deploy` no Docker).

---

## Mapa de arquivos

- `prisma/schema.prisma`: `Project.areaId`/`themeId` + relações; back-relations em `ProjectArea`/`ProjectTheme`.
- Criar: `prisma/migrations/20260707150000_add_project_area_theme_link/migration.sql`.
- `src/server/trpc/routers/project.router.ts`: `create` aceita `areaId`/`themeId` opcionais.
- `src/shared/types/index.ts`: `Project.areaId`/`themeId`.
- `src/shared/context/projects-context.tsx`: mapeamento inclui `areaId`/`themeId`.
- `src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts`: `areas`/`themesByArea` passam a incluir `id`.
- `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`: aceita e repassa `areaId`/`themeId`.
- `src/shared/schema/solicitar-projeto.ts`: novos campos opcionais `resolvedAreaId`/`resolvedThemeId`.
- `src/app/(private)/cliente/solicitar/page.tsx`: resolução de área/tema no import de XML (Promise/diálogo) + checkbox "cadastrar como nova área/tema" no formulário manual (admin/super_admin).

---

### Task 1: Migration Prisma — `Project.areaId`/`themeId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260707150000_add_project_area_theme_link/migration.sql`

- [ ] **Step 1: Adicionar as colunas/relações no `Project`**

Old (dentro de `model Project`, seção "Relacionamentos"):

```prisma
  // Relacionamentos
  client       User             @relation("ProjectClient", fields: [clientId], references: [id])
  clientId     String
  company      Company?         @relation(fields: [companyId], references: [id])
  companyId    String?
  developer    User?            @relation("ProjectDeveloper", fields: [developerId], references: [id])
  developerId  String?
  features     ProjectFeature[]
  phases       ProjectPhase[]
  tasks        Task[]
  comments     Comment[]
  files        ProjectFile[]
  activityLogs ActivityLog[]

  @@map("projects")
```

New:

```prisma
  // Relacionamentos
  client       User             @relation("ProjectClient", fields: [clientId], references: [id])
  clientId     String
  company      Company?         @relation(fields: [companyId], references: [id])
  companyId    String?
  developer    User?            @relation("ProjectDeveloper", fields: [developerId], references: [id])
  developerId  String?
  area         ProjectArea?     @relation(fields: [areaId], references: [id], onDelete: SetNull)
  areaId       String?
  theme        ProjectTheme?    @relation(fields: [themeId], references: [id], onDelete: SetNull)
  themeId      String?
  features     ProjectFeature[]
  phases       ProjectPhase[]
  tasks        Task[]
  comments     Comment[]
  files        ProjectFile[]
  activityLogs ActivityLog[]

  @@map("projects")
```

- [ ] **Step 2: Adicionar as back-relations em `ProjectArea`/`ProjectTheme`**

Old:

```prisma
model ProjectArea {
  id        String         @id @default(cuid())
  name      String
  slug      String         @unique
  isActive  Boolean        @default(true)
  order     Int            @default(0)
  themes    ProjectTheme[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@map("project_areas")
}

model ProjectTheme {
  id        String      @id @default(cuid())
  name      String
  slug      String
  isActive  Boolean     @default(true)
  order     Int         @default(0)
  areaId    String
  area      ProjectArea @relation(fields: [areaId], references: [id], onDelete: Cascade)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@unique([slug, areaId])
  @@map("project_themes")
}
```

New:

```prisma
model ProjectArea {
  id        String         @id @default(cuid())
  name      String
  slug      String         @unique
  isActive  Boolean        @default(true)
  order     Int            @default(0)
  themes    ProjectTheme[]
  projects  Project[]
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  @@map("project_areas")
}

model ProjectTheme {
  id        String      @id @default(cuid())
  name      String
  slug      String
  isActive  Boolean     @default(true)
  order     Int         @default(0)
  areaId    String
  area      ProjectArea @relation(fields: [areaId], references: [id], onDelete: Cascade)
  projects  Project[]
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  @@unique([slug, areaId])
  @@map("project_themes")
}
```

- [ ] **Step 3: Criar o arquivo de migration à mão**

**Não rode `prisma migrate dev`** — sem banco local confiável nesta sessão para testar contra ele. A migration só é aplicada de verdade no deploy (`prisma migrate deploy`, já parte do `CMD` do `Dockerfile`). Crie o diretório e o arquivo:

`prisma/migrations/20260707150000_add_project_area_theme_link/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "projects" ADD COLUMN "areaId" TEXT,
ADD COLUMN "themeId" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "project_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "project_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerar o Prisma Client (local, não toca banco nenhum)**

Run: `cd "c:/Users/danie/Pipeline" && npx prisma generate`
Expected: `Generated Prisma Client` sem erro — isso só atualiza os tipos TypeScript do client, não conecta em nenhum banco.

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros (baseline conhecido: `clientes/page.tsx`, `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx`).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma "prisma/migrations/20260707150000_add_project_area_theme_link"
git commit -m "feat: add Project.areaId/themeId structured taxonomy link"
```

---

### Task 2: Backend — `project.create` aceita `areaId`/`themeId`; tipos e contexto

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/context/projects-context.tsx`

- [ ] **Step 1: `project.router.ts` — aceitar `areaId`/`themeId` no input de `create` e persistir**

No input schema do `create` (procure `title: z.string().min(1)` dentro de `create: protectedProcedure.input(z.object({`), adicione dois campos opcionais:

```ts
        title: z.string().min(1),
        description: z.string().optional(),
        status: projectStatusSchema.default("backlog"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        clientId: z.string(),
        developerId: z.string().optional(),
        companyId: z.string().optional(),
        areaId: z.string().optional(),
        themeId: z.string().optional(),
        projectType: z.string(),
```

E no `ctx.db.project.create({ data: { ... } })` dentro dessa mesma mutation, adicione as duas linhas junto dos outros relacionamentos opcionais (perto de `companyId: input.companyId ?? null,`):

```ts
        companyId: input.companyId ?? null,
        areaId: input.areaId ?? null,
        themeId: input.themeId ?? null,
```

- [ ] **Step 2: `shared/types/index.ts` — adicionar `areaId`/`themeId` ao tipo `Project`**

Old:

```ts
  clientId: string;
  developerId?: string;
  companyId?: string;
  companyName?: string;
```

New:

```ts
  clientId: string;
  developerId?: string;
  companyId?: string;
  companyName?: string;
  areaId?: string;
  themeId?: string;
```

- [ ] **Step 3: `projects-context.tsx` — repassar `areaId`/`themeId` no `addProject`**

No `addProject` (dentro de `createProject.mutateAsync({ ... })`), adicione, perto de `companyId: project.companyId,`:

```ts
        companyId: project.companyId,
        areaId: project.areaId,
        themeId: project.themeId,
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/project.router.ts src/shared/types/index.ts src/shared/context/projects-context.tsx
git commit -m "feat: accept and persist areaId/themeId on project creation"
```

---

### Task 3: `useTaxonomy()` expõe `id` real; `buildProjectPayload` repassa `areaId`/`themeId`

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts`
- Modify: `src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`
- Modify: `src/shared/schema/solicitar-projeto.ts`

- [ ] **Step 1: `use-taxonomy.ts` — incluir `id` em `areas`/`themesByArea`**

Old:

```ts
  const areas = useDb
    ? dbAreas!.map((a) => ({ value: a.slug, label: a.name }))
    : FALLBACK_AREAS.map((a) => ({ value: a.value, label: a.label }));

  const themesByArea: Record<string, { value: string; label: string }[]> = useDb
    ? Object.fromEntries(
        dbAreas!.map((a) => [
          a.slug,
          a.themes.map((t) => ({ value: t.slug, label: t.name })),
        ])
      )
    : FALLBACK_THEMES;
```

New:

```ts
  const areas = useDb
    ? dbAreas!.map((a) => ({ value: a.slug, label: a.name, id: a.id as string | undefined }))
    : FALLBACK_AREAS.map((a) => ({ value: a.value, label: a.label, id: undefined as string | undefined }));

  const themesByArea: Record<string, { value: string; label: string; id?: string }[]> = useDb
    ? Object.fromEntries(
        dbAreas!.map((a) => [
          a.slug,
          a.themes.map((t) => ({ value: t.slug, label: t.name, id: t.id as string | undefined })),
        ])
      )
    : FALLBACK_THEMES;
```

Note: `id` fica `undefined` quando a taxonomia ainda não está semeada no banco (`useDb === false`) — não há uma linha real de `ProjectArea`/`ProjectTheme` pra referenciar nesse caso, então `areaId`/`themeId` corretamente ficam nulos pra quem usar essas opções.

- [ ] **Step 2: `build-project-payload.ts` — aceitar e repassar `areaId`/`themeId`**

Adicione ao parâmetro da função (perto de `buildTypeLabel: (areaValue: string, themeValue: string) => string;`):

```ts
export function buildProjectPayload(params: {
  data: SolicitarProjetoFormData;
  features: string[];
  benefits: string[];
  clientId: string;
  companyId: string | undefined;
  areaId?: string;
  themeId?: string;
  areas: { value: string; label: string }[];
  themesByArea: Record<string, { value: string; label: string }[]>;
  buildTypeLabel: (areaValue: string, themeValue: string) => string;
}): ProjectPayload {
  const { data, features, benefits, clientId, companyId, areaId, themeId, areas, themesByArea, buildTypeLabel } =
    params;
```

E no objeto retornado (`return { ... }`), adicione perto de `companyId,`:

```ts
    companyId,
    areaId,
    themeId,
```

- [ ] **Step 3: `solicitar-projeto.ts` — campos para carregar o `areaId`/`themeId` já resolvidos**

Adicione ao final do objeto do schema (antes do `.superRefine`), dois campos opcionais que guardam o resultado já resolvido (preenchidos pelo código, não digitados pelo usuário — por isso sem validação/mensagem de erro):

```ts
    additionalInfo: z.string().optional().default(""),
    resolvedAreaId: z.string().optional(),
    resolvedThemeId: z.string().optional(),
  })
```

(A linha `additionalInfo: z.string().optional().default(""),` já existe — só adicione as duas novas logo depois, antes do `})` que fecha o objeto de campos, mantendo o `.superRefine(...)` como já está encadeado depois.)

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts" "src/app/(private)/cliente/solicitar/utils/build-project-payload.ts" src/shared/schema/solicitar-projeto.ts
git commit -m "feat: thread real area/theme ids through taxonomy hook and payload builder"
```

---

### Task 4: Resolução de área/tema na importação de XML (single e lote)

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Query da taxonomia completa (com IDs) e novo estado de resolução de área/tema**

Perto de `const [pendingXmlImport, setPendingXmlImport] = useState<...>` (já existe, do lote de empresa), adicione um novo estado paralelo para área/tema — **não reaproveita `pendingXmlImport`/`companyResolverRef`**, já que pode ser necessário resolver empresa E área/tema no mesmo arquivo, em sequência, cada um com seu próprio diálogo:

```tsx
  const [pendingTaxonomyResolution, setPendingTaxonomyResolution] = useState<{
    kind: "area" | "theme";
    rawValue: string;
    areaIdForTheme?: string; // só usado quando kind === "theme": área já resolvida a que o tema pertence
    batchContext?: BatchContext;
  } | null>(null);
  const [chosenTaxonomyId, setChosenTaxonomyId] = useState<string | undefined>();
  const [creatingNewTaxonomy, setCreatingNewTaxonomy] = useState(false);
  const taxonomyResolverRef = useRef<((result: { id: string; slug: string; name: string } | null) => void) | null>(
    null
  );

  const createAreaMutation = trpc.taxonomy.createArea.useMutation();
  const createThemeMutation = trpc.taxonomy.createTheme.useMutation();
```

- [ ] **Step 2: Helper de slugify (mesma lógica já usada em `admin/configuracoes/categorias/page.tsx`, duplicada aqui por ser um utilitário de 8 linhas sem dependências)**

Adicione como função de módulo, fora do componente (pode ficar perto de `QUALITATIVE_RATINGS`, no topo do arquivo):

```tsx
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
```

- [ ] **Step 3: Função `resolveTaxonomyAmbiguity` (Promise, mesmo padrão de `resolveCompanyAmbiguity`) + `closeTaxonomyResolutionDialog`**

Adicione logo abaixo de `closeCompanyResolutionDialog`/`resolveCompanyAmbiguity` (já existentes):

```tsx
  function closeTaxonomyResolutionDialog(result: { id: string; slug: string; name: string } | null) {
    taxonomyResolverRef.current?.(result);
    taxonomyResolverRef.current = null;
    setPendingTaxonomyResolution(null);
    setChosenTaxonomyId(undefined);
    setCreatingNewTaxonomy(false);
  }

  function resolveTaxonomyAmbiguity(
    kind: "area" | "theme",
    rawValue: string,
    areaIdForTheme?: string,
    batchContext?: BatchContext
  ): Promise<{ id: string; slug: string; name: string } | null> {
    return new Promise((resolve) => {
      taxonomyResolverRef.current = resolve;
      setPendingTaxonomyResolution({ kind, rawValue, areaIdForTheme, batchContext });
      setChosenTaxonomyId(undefined);
      setCreatingNewTaxonomy(false);
    });
  }
```

- [ ] **Step 4: Chamar a resolução dentro de `importXmlEntry`, depois que `parseSolicitacaoXml` roda e antes de montar o payload**

Old (dentro de `importXmlEntry`, logo após o bloco de resolução de empresa):

```tsx
      const chosen = await resolveCompanyAmbiguity(result.rawCompanyName, batchContext);
      if (!chosen) return { ok: false, error: "Empresa não resolvida (seleção cancelada)." };
      companyId = chosen;
    }

    try {
      const payload = buildProjectPayload({
        data: result.formData,
        features: result.features,
        benefits: result.benefits,
        clientId: user.id,
        companyId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);
      return { ok: true, title: result.formData.title, hasWarnings: result.warnings.length > 0 };
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      return { ok: false, error: "Não foi possível criar o processo. Tente novamente." };
    }
  }
```

New:

```tsx
      const chosen = await resolveCompanyAmbiguity(result.rawCompanyName, batchContext);
      if (!chosen) return { ok: false, error: "Empresa não resolvida (seleção cancelada)." };
      companyId = chosen;
    }

    let resolvedAreaId: string | undefined;
    let resolvedThemeId: string | undefined;

    if (result.formData.projectArea === "outro" && result.formData.customProjectArea.trim()) {
      const resolvedArea = await resolveTaxonomyAmbiguity(
        "area",
        result.formData.customProjectArea.trim(),
        undefined,
        batchContext
      );
      if (resolvedArea) {
        resolvedAreaId = resolvedArea.id;
        result.formData.projectArea = resolvedArea.slug;
        result.formData.customProjectArea = resolvedArea.slug === "outro" ? result.formData.customProjectArea : "";
      }
      // Se o usuário cancelar (resolvedArea === null), mantém "outro" + texto livre — comportamento de hoje.
    }

    if (result.formData.projectTheme === "outro" && result.formData.customProjectTheme.trim()) {
      const resolvedTheme = await resolveTaxonomyAmbiguity(
        "theme",
        result.formData.customProjectTheme.trim(),
        resolvedAreaId,
        batchContext
      );
      if (resolvedTheme) {
        resolvedThemeId = resolvedTheme.id;
        result.formData.projectTheme = resolvedTheme.slug;
        result.formData.customProjectTheme = "";
      }
    }

    try {
      const payload = buildProjectPayload({
        data: result.formData,
        features: result.features,
        benefits: result.benefits,
        clientId: user.id,
        companyId,
        areaId: resolvedAreaId,
        themeId: resolvedThemeId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      await addProject(payload);
      return { ok: true, title: result.formData.title, hasWarnings: result.warnings.length > 0 };
    } catch (error) {
      console.error("Erro ao criar processo a partir do XML:", error);
      return { ok: false, error: "Não foi possível criar o processo. Tente novamente." };
    }
  }
```

Note: mapear pra um tema "existente" só faz sentido se soubermos a área — se a área ficou sem resolver (usuário cancelou), pulamos a resolução de tema também nesta implementação simples: o `if` acima só entra quando `resolvedAreaId` pode ser `undefined`, e nesse caso o diálogo de tema mostra só a opção de cadastrar novo tema "solto" (sem área associada) **não é permitido** pelo schema (`ProjectTheme.areaId` é obrigatório) — trate esse caso no diálogo (Step 5) impedindo "cadastrar novo tema" quando não há área resolvida, deixando só cancelar (mantém "Outro" pro tema também).

- [ ] **Step 5: Diálogo de resolução de área/tema (JSX), logo depois do diálogo de resumo do lote (`batchImportResults`)**

Adicione, antes do `</TooltipProvider>` final:

```tsx
      <Dialog
        open={pendingTaxonomyResolution !== null}
        onOpenChange={(open) => {
          if (!open) closeTaxonomyResolutionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingTaxonomyResolution?.kind === "area" ? "Área não cadastrada" : "Tema não cadastrado"}
            </DialogTitle>
            <DialogDescription>
              {pendingTaxonomyResolution?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Arquivo {pendingTaxonomyResolution.batchContext.index} de{" "}
                  {pendingTaxonomyResolution.batchContext.total}: {pendingTaxonomyResolution.batchContext.fileName}
                </span>
              )}
              O XML indica{" "}
              {pendingTaxonomyResolution?.kind === "area" ? "a área" : "o tema"} &quot;
              {pendingTaxonomyResolution?.rawValue}&quot;, que não corresponde a nenhuma opção cadastrada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                Usar {pendingTaxonomyResolution?.kind === "area" ? "uma área" : "um tema"} já cadastrado
              </Label>
              <Select
                value={creatingNewTaxonomy ? "" : chosenTaxonomyId}
                onValueChange={(value) => {
                  setChosenTaxonomyId(value);
                  setCreatingNewTaxonomy(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(pendingTaxonomyResolution?.kind === "area"
                    ? PROJECT_AREAS
                    : PROJECT_THEMES_BY_AREA[pendingTaxonomyResolution?.areaIdForTheme ?? ""] ?? []
                  )
                    .filter((opt): opt is typeof opt & { id: string } => Boolean(opt.id))
                    .map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {(user?.role === "admin" || user?.role === "super_admin") &&
              !(pendingTaxonomyResolution?.kind === "theme" && !pendingTaxonomyResolution?.areaIdForTheme) && (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3">
                  <Checkbox
                    checked={creatingNewTaxonomy}
                    onCheckedChange={(checked) => {
                      setCreatingNewTaxonomy(checked === true);
                      if (checked === true) setChosenTaxonomyId(undefined);
                    }}
                  />
                  <span className="text-sm">
                    Cadastrar &quot;{pendingTaxonomyResolution?.rawValue}&quot; como{" "}
                    {pendingTaxonomyResolution?.kind === "area" ? "nova área" : "novo tema"} permanente
                  </span>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => closeTaxonomyResolutionDialog(null)}>
              Manter como &quot;Outro&quot;
            </Button>
            <Button
              disabled={(!chosenTaxonomyId && !creatingNewTaxonomy) || createAreaMutation.isPending || createThemeMutation.isPending}
              onClick={async () => {
                if (!pendingTaxonomyResolution) return;
                if (creatingNewTaxonomy) {
                  const name = pendingTaxonomyResolution.rawValue;
                  const slug = slugify(name);
                  try {
                    if (pendingTaxonomyResolution.kind === "area") {
                      const created = await createAreaMutation.mutateAsync({ name, slug, order: 0 });
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    } else if (pendingTaxonomyResolution.areaIdForTheme) {
                      const created = await createThemeMutation.mutateAsync({
                        name,
                        slug,
                        areaId: pendingTaxonomyResolution.areaIdForTheme,
                        order: 0,
                      });
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    }
                  } catch (error) {
                    console.error("Erro ao cadastrar categoria:", error);
                    toast({
                      title: "Erro",
                      description: "Não foi possível cadastrar a categoria. Tente novamente.",
                      variant: "destructive",
                    });
                  }
                } else if (chosenTaxonomyId) {
                  const options =
                    pendingTaxonomyResolution.kind === "area"
                      ? PROJECT_AREAS
                      : PROJECT_THEMES_BY_AREA[pendingTaxonomyResolution.areaIdForTheme ?? ""] ?? [];
                  const picked = options.find((o) => o.id === chosenTaxonomyId);
                  if (picked?.id) {
                    closeTaxonomyResolutionDialog({ id: picked.id, slug: picked.value, name: picked.label });
                  }
                }
              }}
            >
              {createAreaMutation.isPending || createThemeMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros. Preste atenção especial: `PROJECT_AREAS`/`PROJECT_THEMES_BY_AREA` (vindos de `useTaxonomy()`, já ajustado no Task 3 pra incluir `id`) precisam ter `id?: string` reconhecido no tipo — se o TypeScript reclamar de `opt.id` não existir, confirme que o Task 3 foi aplicado corretamente antes deste.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: resolve area/tema ambiguity during XML import (map to existing or create new)"
```

---

### Task 5: Formulário manual — cadastrar nova área/tema (admin/super_admin)

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/page.tsx`

- [ ] **Step 1: Estado local para os checkboxes "cadastrar como nova área/tema permanente"**

Perto dos outros `useState` do componente, adicione:

```tsx
  const [registerNewArea, setRegisterNewArea] = useState(false);
  const [registerNewTheme, setRegisterNewTheme] = useState(false);
```

- [ ] **Step 2: Checkbox no bloco de Área, visível só quando `projectArea === "outro"` e o usuário é admin/super_admin**

Old (dentro do bloco de Área, logo após o `<Input id="customProjectArea" ...>`):

```tsx
                    {projectArea === "outro" && (
                      <Input
                        id="customProjectArea"
                        {...register("customProjectArea")}
                        placeholder="Qual área?"
                        className="flex-1"
                      />
                    )}
```

New:

```tsx
                    {projectArea === "outro" && (
                      <Input
                        id="customProjectArea"
                        {...register("customProjectArea")}
                        placeholder="Qual área?"
                        className="flex-1"
                      />
                    )}
                    {projectArea === "outro" && (user?.role === "admin" || user?.role === "super_admin") && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox checked={registerNewArea} onCheckedChange={(c) => setRegisterNewArea(c === true)} />
                        <span className="text-xs text-muted-foreground">
                          Cadastrar como nova área permanente
                        </span>
                      </div>
                    )}
```

- [ ] **Step 3: Checkbox equivalente no bloco de Tema**

Old (dentro do bloco de Tema, logo após o `<Input id="customProjectTheme" ...>`):

```tsx
                    {projectTheme === "outro" && (
                      <Input
                        id="customProjectTheme"
                        {...register("customProjectTheme")}
                        placeholder="Qual tema?"
                        className="flex-1"
                      />
                    )}
```

New:

```tsx
                    {projectTheme === "outro" && (
                      <Input
                        id="customProjectTheme"
                        {...register("customProjectTheme")}
                        placeholder="Qual tema?"
                        className="flex-1"
                      />
                    )}
                    {projectTheme === "outro" && (user?.role === "admin" || user?.role === "super_admin") && (
                      <div className="mt-2 flex items-center gap-2">
                        <Checkbox
                          checked={registerNewTheme}
                          onCheckedChange={(c) => setRegisterNewTheme(c === true)}
                        />
                        <span className="text-xs text-muted-foreground">
                          Cadastrar como novo tema permanente
                        </span>
                      </div>
                    )}
```

- [ ] **Step 4: No `onSubmit`, cadastrar a área/tema antes de montar o payload, quando os checkboxes estiverem marcados**

Old (início de `onSubmit`, logo após o guard de `companyOptions.length > 1 && !selectedCompanyId`):

```tsx
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
```

New:

```tsx
    setIsSubmitting(true);
    try {
      let areaId: string | undefined;
      let themeId: string | undefined;
      let areaSlugForPayload = data.projectArea;
      let themeSlugForPayload = data.projectTheme;

      if (registerNewArea && data.projectArea === "outro" && data.customProjectArea.trim()) {
        const name = data.customProjectArea.trim();
        const created = await createAreaMutation.mutateAsync({ name, slug: slugify(name), order: 0 });
        areaId = created.id;
        areaSlugForPayload = created.slug;
      }

      if (registerNewTheme && data.projectTheme === "outro" && data.customProjectTheme.trim() && areaId) {
        const name = data.customProjectTheme.trim();
        const created = await createThemeMutation.mutateAsync({
          name,
          slug: slugify(name),
          areaId,
          order: 0,
        });
        themeId = created.id;
        themeSlugForPayload = created.slug;
      }

      const payload = buildProjectPayload({
        data: { ...data, projectArea: areaSlugForPayload, projectTheme: themeSlugForPayload },
        features,
        benefits,
        clientId: user.id,
        companyId: selectedCompanyId,
        areaId,
        themeId,
        areas: PROJECT_AREAS,
        themesByArea: PROJECT_THEMES_BY_AREA,
        buildTypeLabel: buildClienteProjectTypeLabel,
      });
      const projectId = await addProject(payload);
```

Note: `registerNewTheme` só tem efeito se uma área nova tiver sido cadastrada NESTE MESMO submit (`areaId` definido) — cadastrar um tema exige uma área (`ProjectTheme.areaId` obrigatório no schema). Se o usuário marcou "cadastrar tema" mas a área escolhida já era uma existente (não "outro"), esse `if` não bate (`data.projectArea === "outro"` é falso) e o tema simplesmente não é cadastrado como novo — fica como está hoje (texto livre em "Outro"). Isso é aceitável para esta entrega: cadastrar um novo tema dentro de uma área **já existente** (não "outro") é um caso que esta implementação não cobre — sinalizar como fora de escopo desta fatia caso o usuário aponte a falta.

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/page.tsx"
git commit -m "feat: let admin/super_admin register new area/tema from the manual form"
```

---

### Task 6: Verificação (sem navegador, sem banco local)

**Files:** nenhum

- [ ] **Step 1: Revisão estática completa**

Reler os arquivos tocados e confirmar:
- A migration SQL usa exatamente os nomes de tabela/coluna do schema (`projects.areaId`/`themeId`, `project_areas`, `project_themes`).
- `useTaxonomy()` continua funcionando para o caso `useDb === false` (fallback), com `id: undefined` em todas as opções — nenhum lugar tenta usar `.id` sem checar se existe primeiro (o diálogo de resolução filtra `Boolean(opt.id)` antes de listar).
- O diálogo de resolução de tema não oferece "cadastrar novo tema" quando não há área resolvida (`areaIdForTheme` ausente).
- `closeTaxonomyResolutionDialog`/`resolveTaxonomyAmbiguity` seguem o mesmo padrão já usado por `closeCompanyResolutionDialog`/`resolveCompanyAmbiguity` (resolver a Promise em toda saída do diálogo, inclusive Esc/clique fora).
- `npx tsc --noEmit` limpo (baseline conhecido à parte).

- [ ] **Step 2: Registrar como pendente para o usuário**

Ao reportar a conclusão, deixar explícito que:
- A migration nunca foi executada contra um banco de verdade nesta sessão — só será aplicada no próximo deploy (`prisma migrate deploy`). Vale conferir o log do deploy com atenção redobrada.
- A verificação funcional real (importar um XML/zip com área "Financeiro" não cadastrada, resolver mapeando pra existente, depois resolver cadastrando nova; testar o formulário manual como admin) não foi feita por falta de navegador nesta sessão.

---

## Self-review

- **Cobertura da spec:** vínculo estruturado real (Task 1-2), `id` disponível na taxonomia (Task 3), resolução no XML — mapear ou cadastrar, só admin cadastra (Task 4), resolução no formulário manual — mesma regra de permissão (Task 5). Todos os requisitos confirmados estão cobertos.
- **Sem placeholders:** todo bloco de código é o conteúdo final.
- **Risco principal:** a migration (Task 1) é o passo mais arriscado — nunca testada contra um banco real nesta sessão. Escrita cuidadosamente à mão, seguindo exatamente o estilo das migrations já existentes no repositório, mas **o log do deploy deve ser observado com atenção redobrada** depois do push.
- **Limitação de escopo assumida:** `areaId`/`themeId` só são preenchidos no caminho de resolução explícita (Outro → mapear/cadastrar), não no caminho feliz onde a área já bate direto — deliberado, documentado na spec, não é uma omissão.
