# Unificar "Tipo de Solução" e "Tipo de Projeto" (Design)

## Contexto

Na aba "Arquitetura" de um projeto (`architecture-tab.tsx`) existem hoje dois campos lado a lado que respondem à mesma pergunta ("que tipo de solução/tecnologia é essa automação"):

- **Tipo de solução** (`Project.solutionTypes: Json?`) — lista fixa hardcoded em `src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts` (`SOLUTION_TYPES`: rpa, api, ia-ocr, power-platform, python, integracao, dashboard, outro), renderizada como grid de checkboxes, **multi-seleção**, não customizável pelo admin.
- **Tipo de projeto** (`Project.projectKindId` → `ProjectKind`) — taxonomia customizável (CRUD completo em Configurações → Categorias), renderizada como `CreatableCombobox`, **seleção única**.

O usuário confirmou que quer os dois virarem **um único campo, multi-seleção, customizável**, com a lista inicial: RPA, API, IA, OCR, Integração, Dashboards, Plataformas, Chatbots, Outros.

## Requisitos confirmados com o usuário

1. **Multi-seleção obrigatória** — um robô real costuma combinar mais de uma técnica (ex.: RPA + API).
2. **"Tipo de Projeto" já tem uso real** com valores próprios — nada pode ser perdido na migração.
3. **Estratégia de migração**: os valores já cadastrados em "Tipo de Projeto" continuam existindo, como opções extras na lista unificada (a lista só cresce, nada é descartado). O usuário não tem a lista exata em mãos agora — a migração não pode depender de conhecer os nomes específicos, tem que funcionar de forma genérica.
4. **Mapeamento dos 8 valores antigos de "Tipo de Solução"** (confirmado nesta conversa):

   | Valor antigo (`solutionTypes`) | Vira |
   |---|---|
   | `rpa` | RPA |
   | `api` | API |
   | `ia-ocr` | **IA** + **OCR** (as duas) |
   | `power-platform` | Plataformas |
   | `python` | Python (mantido como opção própria) |
   | `integracao` | Integração |
   | `dashboard` | Dashboards |
   | `outro` | Outros |

## Modelo de dados

Reaproveita o model `ProjectKind` já existente (evita renomear identificadores em ~10 arquivos por um motivo só cosmético) — mas muda a cardinalidade da relação com `Project` de FK única para **muitos-para-muitos implícito** do Prisma, e remove o campo `Json` antigo:

```prisma
model Project {
  // ...
  // remove: solutionTypes Json?
  // remove: projectKind   ProjectKind? @relation(fields: [projectKindId], references: [id], onDelete: SetNull)
  // remove: projectKindId String?
  solutionTypes ProjectKind[] @relation("ProjectSolutionTypes")
}

model ProjectKind {
  // campos existentes (id, name, slug, isActive, order, createdAt, updatedAt) inalterados
  projects Project[] @relation("ProjectSolutionTypes")

  @@map("project_kinds")
}
```

O texto exibido ao usuário muda de "Tipo de Projeto" para **"Tipo de Solução"** em todos os lugares (label do campo, título da seção em Configurações → Categorias, textos de toast) — só o nome do model Prisma e das variáveis internas (`projectKind`, `ProjectKind`) continua igual, por ser um detalhe de implementação sem valor pro usuário renomear.

### Migração de dados (uma migration com backfill)

Uma migration Prisma que roda em duas partes — schema (via `prisma migrate dev`/`deploy`, gera o SQL de estrutura) e um passo de backfill em SQL puro dentro da mesma migration, executado **antes** de dropar as colunas antigas:

1. Cria a tabela de junção implícita (`_ProjectSolutionTypes`, nome gerado pelo Prisma pra relação implícita).
2. Para cada `Project` com `projectKindId` não nulo: insere uma linha na tabela de junção ligando o projeto ao mesmo `ProjectKind` que ele já tinha.
3. Para cada um dos 8 valores antigos de `solutionTypes` (Json array) presentes em cada projeto: resolve (via `findOrCreate` por nome, `INSERT ... ON CONFLICT DO NOTHING` no slug) a linha correspondente em `ProjectKind` segundo a tabela de mapeamento acima (`ia-ocr` gera duas linhas de junção), e insere a linha na tabela de junção.
4. Semeia (`INSERT ... ON CONFLICT (slug) DO NOTHING`) qualquer uma das 9 classificações sugeridas que ainda não exista (mesmo que nenhum projeto a use ainda), pra já aparecerem como opção disponível na tela de Arquitetura.
5. Dropa `Project.solutionTypes` e `Project.projectKindId`.

Todo o backfill é escrito como SQL puro dentro do arquivo `migration.sql` gerado pelo Prisma (não como script TS separado) — mantém a garantia de rodar dentro da mesma transação/migration numerada, consistente com o pipeline de deploy (`prisma migrate deploy` já configurado no CI). O mapeamento dos 8 valores antigos fica repetitivo mas mecânico, um bloco por valor, por exemplo: `INSERT INTO project_kinds (id, name, slug, "order") SELECT gen_random_uuid(), 'RPA', 'rpa', 0 WHERE NOT EXISTS (SELECT 1 FROM project_kinds WHERE slug = 'rpa');` seguido de `INSERT INTO "_ProjectSolutionTypes" ("A", "B") SELECT p.id, k.id FROM projects p, project_kinds k WHERE k.slug = 'rpa' AND p.solution_types @> '["rpa"]'::jsonb`.

## Backend

**`src/server/trpc/routers/project.router.ts`:**
- `ARCHITECT_ONLY_FIELDS`: troca a entrada `"projectKindId"` por `"solutionTypeIds"`; remove `"solutionTypes"` (era o campo antigo).
- `update` (mutation): input ganha `solutionTypeIds: z.array(z.string()).optional()` no lugar de `solutionTypes`/`projectKindId`; quando presente, aplicado como `data.solutionTypes = { set: input.solutionTypeIds.map((id) => ({ id })) }` (Prisma `set` substitui a relação inteira pelo array passado — mesmo padrão usado hoje pra outros multi-valores no update, e evita ter que calcular diff manualmente).
- `byId` (mapeamento pro frontend): troca `solutionTypes: (project.solutionTypes as string[] | null) ?? []` e `projectKind`/`projectKindId` por `solutionTypes: project.solutionTypes.map((k) => ({ id: k.id, name: k.name }))` (o `include`/`select` da query precisa trazer a relação `solutionTypes: { select: { id: true, name: true } }`).
- `importXml` (mutation): troca `projectKindName: z.string().optional()` por `solutionTypeNames: z.array(z.string()).optional()`; remove `solutionTypes: z.array(z.string()).optional()` antigo. Quando presente, resolve cada nome via `findOrCreateProjectKind` (loop, igual ao padrão já usado pra `peopleOfInterestNames`) e aplica com `data.solutionTypes = { set: resolvedKinds.map((k) => ({ id: k.id })) }`.

**`src/server/trpc/routers/project-import-xml-helpers.ts`:** `findOrCreateProjectKind` não muda de assinatura — só passa a ser chamado em loop (uma vez por nome) em vez de uma vez só.

**`src/server/trpc/routers/taxonomy.router.ts`:** nenhuma mudança de código — os procedures `listProjectKinds`/`listAllProjectKinds`/`createProjectKind`/`updateProjectKind`/`deleteProjectKind` continuam exatamente iguais (a mudança é só no que os consome).

## Frontend

- **`_constants/architecture.ts`**: remove `SOLUTION_TYPES` (constante fixa). Mantém `EXECUTION_STRATEGIES` (não faz parte deste escopo).
- **`architecture-tab.tsx`**: remove o `Select`/`CreatableCombobox` de "Tipo de projeto". O bloco "Tipo de solução" passa a:
  - Buscar opções via `trpc.taxonomy.listProjectKinds.useQuery()` (já existe, sem mudança de assinatura).
  - Renderizar o mesmo grid de checkboxes de hoje, populado a partir dessas opções (em vez da constante).
  - Estado local vira `solutionTypeIds: string[]` (array de IDs, não mais de slugs fixos).
  - Adiciona um campo pequeno "+ novo tipo" (input + botão) ao lado do grid, que chama `taxonomy.createProjectKind` — mesmo padrão de criação inline que "Ferramenta principal" já tem, adaptado pra um grid de checkboxes em vez de um combobox.
  - `handleSaveArchitecture` manda `solutionTypeIds` no lugar de `solutionTypes`/`projectKindId`.
- **`project-detail-sections.tsx`**, **`project-executive-slide.tsx`**, **`project-request-edit-form.tsx`**: hoje resolvem os labels via `SOLUTION_TYPES.find(...)` — passam a usar direto `project.solutionTypes.map((k) => k.name)` (o backend já devolve nome, não precisa mais resolver contra constante).
- **`project-card.tsx`**: badge única de `project.projectKind.name` vira lista de badges (uma por `project.solutionTypes[]`), truncando com "+N" além de um certo número (mesmo padrão visual já usado em outros lugares do app pra listas curtas, ex. badges de tema).
- **`project-kind-filter.tsx`** (renomeado o texto exibido, não o arquivo): filtro continua sendo um `Select` de seleção única (escolhe UM tipo pra filtrar por vez — não precisa virar multi-seleção), só que `filterProjectsByKind` troca a comparação de `p.projectKindId === kindFilter` para `p.solutionTypeIds?.includes(kindFilter)`.
- **`admin/configuracoes/categorias/page.tsx`**: renomeia o título da seção de "Tipos de Projeto" para "Tipos de Solução" e o texto auxiliar ("Opções do campo 'Tipo de projeto'..." → "Opções do campo 'Tipo de Solução'..."); nenhuma mudança de lógica (CRUD já funciona igual).
- **`shared/types/index.ts`**: `solutionTypes?: string[]` vira `solutionTypes?: { id: string; name: string }[]`; remove `projectKind`/`projectKindId`.

## XML "projeto completo" (export/import de round-trip do projeto)

Não é o XML de solicitação usado pra gerar projetos via IA (esse continua fora de escopo, como sempre) — é o formato usado pelo botão de import/export completo na tela do projeto (`ProjectXmlImportExport`).

- **`build-projeto-completo-xml.ts`**: remove a linha `tag("tipoDeProjeto", project.projectKind?.name)`; a lista `tiposDeSolucao`/`tipo` passa a vir de `project.solutionTypes.map((k) => k.name)` em vez de resolver contra `SOLUTION_TYPES`.
- **`parse-projeto-completo-xml.ts`**: `data.projectKindName` é removido; `data.solutionTypes` deixa de tentar casar contra a constante fixa (`matchValueByLabel(label, SOLUTION_TYPES)`) e passa a ser só a lista de nomes crus lida do XML (`data.solutionTypeNames = getListItems(root, "tiposDeSolucao", "tipo")`) — a resolução por nome (criar se não existir) já acontece no backend, no `importXml`. Por compatibilidade com XMLs exportados antes desta mudança (que ainda podem ter a tag antiga `<tipoDeProjeto>`), se essa tag existir no arquivo sendo importado, seu valor é adicionado à lista de `solutionTypeNames` (nada se perde ao importar um XML exportado antes da mudança).

## Fora de escopo

- Ferramenta de mesclar/deduplicar tipos que ficarem parecidos entre o que já existia em "Tipo de Projeto" e o que foi semeado (ex.: se já existisse um "Automação RPA" customizado, ele fica como entrada separada de "RPA" — pra mesclar, usa a edição manual de nome que a tela de Categorias já permite. `ProjectKind` não tem endpoint de merge hoje, ao contrário de Área/Tema).
- Mudar o XML de solicitação usado pra gerar projetos via IA — fora de escopo por padrão.
- Virar o filtro da listagem de projetos (`project-kind-filter.tsx`) em multi-seleção — continua seleção única (escolhe um tipo por vez pra filtrar), só a lógica de comparação muda internamente.
