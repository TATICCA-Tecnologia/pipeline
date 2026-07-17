# Tipo de Projeto (taxonomia editável) — Design

## Contexto

Hoje, na aba Arquitetura da especificação (`architecture-tab.tsx`), o arquiteto escolhe "Ferramenta principal" (taxonomia editável, `MainTool`, ver [[2026-07-15-ferramenta-principal-taxonomia-editavel-design]]) e "Estratégia de execução" (lista fixa `EXECUTION_STRATEGIES`). Falta um campo para classificar o projeto por **tipo de solução**: Automação, Agente IA, Dados e BI, Integração entre Sistemas — com espaço para novos tipos no futuro, sem deploy.

**Colisão de nomes a evitar**: já existe um enum Prisma `ProjectType` (`Project.type`, categorização legada RPA/Dev-API etc.) e um campo computado `project.projectType` no frontend (`= platform ?? type`), usado inclusive como badge no card do Kanban (`project-card.tsx:116-123`). O novo campo usa o nome interno **`ProjectKind`/`projectKindId`** para não colidir com nada disso. O rótulo visível ao usuário continua "Tipo de Projeto".

O precedente de taxonomia editável no banco (Área/Tema, Ferramenta principal) já existe: CRUD em `taxonomy.router.ts`, tela em `/admin/configuracoes/categorias`, combobox com criação inline na tela de arquitetura. `ProjectKind` segue exatamente esse padrão — mesma forma de `MainTool` (lista plana, sem hierarquia).

## Requisitos confirmados com o usuário

1. **Taxonomia no banco**, não lista fixa no código — CRUD em Configurações do admin, igual Área/Tema/Ferramenta principal.
2. **Nome interno `ProjectKind`/`projectKindId`**, distinto do enum `ProjectType` e do campo `projectType` legados, que continuam existindo sem alteração.
3. **Só na aba Arquitetura** (`admin/projetos/[id]/especificacao`), preenchido pelo arquiteto/admin — não entra no formulário de solicitação do cliente.
4. **Campo opcional** (`projectKindId String?`, nullable) — projetos existentes ficam sem tipo até serem editados; não é obrigatório salvar.
5. **Seed inicial** com os 4 tipos: Automação, Agente IA, Dados e BI, Integração entre Sistemas.
6. **Badge novo no card do Kanban**, exibido só quando `projectKind` está definido, **sem substituir** o badge existente de `project.projectType` (convivem lado a lado, estilo visualmente distinto para não confundir).
7. **Filtro por Tipo de Projeto** na listagem `admin/projetos`, ao lado do `CompanyFilter` existente.
8. **Ordenação** por "Criação mais recente" / "Edição mais recente" (`createdAt`/`updatedAt`, já existem no modelo `Project`) na mesma listagem — pedido junto do filtro, tratado aqui por ser pequeno (não requer mudança de schema).
9. **Coluna no CSV** de exportação de projetos.
10. Filtros adicionais além de Tipo de Projeto ficam fora de escopo — mencionados pelo usuário como necessidade futura, não detalhados aqui.

## Modelo de dados

Nova tabela, espelhando `MainTool`:

```prisma
model ProjectKind {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("project_kinds")
}
```

Em `Project` (schema.prisma, perto de `mainTool`/`mainToolId`):
```prisma
projectKind   ProjectKind? @relation(fields: [projectKindId], references: [id], onDelete: SetNull)
projectKindId String?
```

**Migration** faz duas coisas:
1. Cria a tabela `project_kinds` e semeia as 4 linhas iniciais (slugs `automacao`, `agente-ia`, `dados-bi`, `integracao-sistemas`, `order` 0-3, `isActive: true`).
2. Adiciona `projects.projectKindId` (nullable, sem backfill — não existe dado anterior a migrar, diferente do caso de `mainTool`).

## Backend

Estende `src/server/trpc/routers/taxonomy.router.ts` com o mesmo formato da seção `mainTool` (linhas 384-434):
- `listProjectKinds` — `publicProcedure`, só ativos, ordenados por `order`. Usada pelo combobox da aba Arquitetura.
- `listAllProjectKinds` — `protectedProcedure`, todos incl. inativos. Usada pela tela de admin.
- `createProjectKind` — `adminProcedure`, input `{name, slug, order}`, checa slug único (`CONFLICT` se duplicado).
- `updateProjectKind` — `adminProcedure`, `{id, name?, isActive?, order?}`.
- `deleteProjectKind` — `adminProcedure`, `{id}`.

`src/server/trpc/routers/project.router.ts`:
- `ARCHITECT_ONLY_FIELDS`: adiciona `projectKindId` (mesmo tratamento de `mainToolId`).
- `create` — Zod: `projectKindId: z.string().nullable().optional()`.
- `update` — Zod: `projectKindId: z.string().nullable().optional()`; data-building: `if (rest.projectKindId !== undefined) data.projectKindId = rest.projectKindId;`
- `byId` — resposta inclui `projectKind: project.projectKind ?? undefined, projectKindId: project.projectKindId ?? undefined`.

`src/shared/types/index.ts`: adiciona `projectKind?: { id: string; name: string; slug: string }` e `projectKindId?: string` na interface `Project`, ao lado de `mainTool`/`mainToolId`.

## Admin — `/admin/configuracoes/categorias`

Nova aba/seção "Tipos de Projeto", no mesmo componente que já lista Área/Tema/Ferramentas principais/Sugestões, reaproveitando o layout: lista em cards, `Dialog` de criar/editar (Nome + Slug auto-derivado + Ordem), `Switch` ativo/inativo, exclusão via `AlertDialog`. Lista plana, sem hierarquia — mesmo padrão de "Ferramentas principais".

## Tela de arquitetura

Em `architecture-tab.tsx`, ao lado do `CreatableCombobox` de "Ferramenta principal" (linhas 236-270): novo `CreatableCombobox` "Tipo de Projeto", reaproveitando o componente `creatable-combobox.tsx` já existente, alimentado por `trpc.taxonomy.listProjectKinds`, com criação inline (`createProjectKind.mutate({name: texto, slug: slugify(texto), order: 0})`, invalida `listProjectKinds` e seleciona o `id` retornado).

Layout: o grid `sm:grid-cols-2` (linha 236) passa a `sm:grid-cols-3` para acomodar os três campos (Ferramenta principal, Tipo de Projeto, Estratégia de execução) numa linha só, sem quebrar hierarquia visual.

Estado `projectKindId`, inicializado a partir de `project.projectKind?.id` (junto da inicialização de `mainToolId`, linha 103), incluído em `handleSaveArchitecture` → `updateProject.mutate({..., projectKindId: projectKindId || null, ...})`.

## Card do Kanban

Em `project-card.tsx`, novo badge condicional (`project.projectKind && (...)`) inserido no bloco "Badges" (linhas 98-138), próximo ao badge existente de `project.projectType` mas com classe de cor distinta (ex. `bg-primary/10 text-primary` em vez do `bg-secondary` do badge legado) para diferenciar visualmente os dois. Não renderiza nada quando `projectKind` é nulo.

## Listagem `admin/projetos`

Em `page.tsx`, junto ao `CompanyFilter` (linhas 151-155):
- Novo componente `ProjectKindFilter` (mesmo padrão do `CompanyFilter`: dropdown "Todos os tipos", opção `ALL_PROJECT_KINDS_VALUE`, função `filterProjectsByKind`), filtrando por `project.projectKindId`.
- Novo controle "Ordenar por" (`Select` simples com duas opções: "Criação mais recente" → sort por `createdAt desc`, "Edição mais recente" → sort por `updatedAt desc`). Aplica-se sobre `filteredProjects` antes de passar para `KanbanBoard`, ordenando os cards dentro de cada coluna. Estado local `sortBy`, default "Criação mais recente" (preserva comportamento implícito atual).

`downloadProjectsCSV`: adiciona coluna "Tipo de Projeto" lendo `project.projectKind?.name ?? ""`.

## Fora de escopo

- Campo no formulário de solicitação do cliente (`cliente/solicitar/page.tsx`) — fica restrito à aba Arquitetura, admin-only.
- Substituir o badge/campo `projectType` legado — convivem lado a lado, sem migração de dado antigo.
- Filtros adicionais além de Tipo de Projeto e Empresa na listagem `admin/projetos` — mencionado pelo usuário como necessidade futura, não detalhado aqui.
- Padronizar Área/Tema para usar o `CreatableCombobox` (eles continuam com `Select` simples) — fora deste trabalho.
