# Suporte a Múltiplas Empresas por Cliente (Design)

## Contexto

Hoje um usuário (`User`) só pode estar vinculado a **uma** empresa (`User.companyId`, FK opcional). O modelo `Company` existe e é rico (CNPJ, contato, endereço), mas é subutilizado: `Project.companyId` existe no schema desde o início mas **nunca é gravado** em nenhum fluxo — todo projeto hoje só sabe "quem pediu" (`clientId`), não "para qual empresa".

Isso ficou evidente ao usar a funcionalidade de Super Admin: ao "Ver como Cliente" usando a própria conta, não havia nenhuma forma clara de saber (ou escolher) para qual empresa um projeto solicitado pertenceria — e o mesmo problema já existia, de forma mais sutil, para clientes reais que pudessem representar mais de uma empresa.

## Requisitos confirmados com o usuário

1. Um usuário pode estar vinculado a **várias** empresas (não só uma).
2. Só o **Admin** associa/desassocia empresas de um usuário — em `/admin/clientes`. O cliente não adiciona empresas sozinho.
3. Ao solicitar um projeto, o cliente escolhe para qual das suas empresas é o projeto:
   - 0 empresas vinculadas → segue sem empresa definida (admin corrige depois).
   - 1 empresa → já vem selecionada, mas visível.
   - 2+ empresas → escolha obrigatória.
4. Se um projeto ficar sem empresa, o Admin corrige depois na tela de detalhes do projeto (`/projeto/[id]`), não na listagem.
5. Fora de escopo (etapa futura): corrigir o campo de empresa hoje quebrado no diálogo "Novo Cliente" de `/admin/clientes`, e migrar o campo de texto livre de empresa que existe no formulário público antigo de solicitação (`ProjectRequest.company`).

## Modelo de dados

### `prisma/schema.prisma`

Remover a relação 1-para-muitos atual entre `User` e `Company`:

```prisma
// User — remover:
company          Company?       @relation(fields: [companyId], references: [id])
companyId        String?
```

Adicionar uma relação muitos-para-muitos implícita (Prisma cria a tabela de junção automaticamente):

```prisma
// User — adicionar:
companies Company[] @relation("UserCompanies")
```

```prisma
// Company — adicionar (lado inverso da relação):
users User[] @relation("UserCompanies")
```

(A relação inversa `Company.users` que já existe hoje, ligada ao antigo `User.companyId`, é removida junto — vira a mesma relação nomeada acima.)

`Project.companyId` **não muda de tipo** — já é `String?` com relação opcional para `Company`. Só passa a ser efetivamente utilizado pelos fluxos de criação/edição de projeto.

### Migração de dados

A migration Prisma faz, nesta ordem:
1. Cria a tabela de junção implícita `_UserCompanies`.
2. Para cada `User` com `companyId` não nulo, insere uma linha em `_UserCompanies` ligando esse usuário à mesma empresa.
3. Remove a coluna `User.companyId`.

Isso preserva 100% dos vínculos empresa-usuário já existentes — ninguém perde a empresa que já tinha, ela só passa a viver na nova relação.

## Backend (tRPC)

### `src/server/trpc/routers/user.router.ts`

- `me`, `listClients`, `byId`: trocar `include: { company: true }` por `include: { companies: true }`; campo de retorno passa de `company?: string` para `companies: { id: string; name: string }[]`.
- `updateProfile`: remover a lógica de `companyName` (find-or-create + set companyId) — edição de empresa deixa de ser self-service do cliente.
- `register` (em `auth.router.ts`, ver abaixo): mantém a criação de empresa no cadastro público, mas agora conecta via `companies: { connect: { id: companyId } }` em vez de `companyId`.
- Novo procedure `listMyCompanies`: `protectedProcedure`, sem input, retorna as empresas do `ctx.userId` atual — usado pelo formulário de "Solicitar Projeto".
- Novo procedure `listCompaniesForUser`: `adminProcedure`, input `{ userId: string }`, retorna as empresas de um usuário específico — usado pelo modal de "Definir empresa" no projeto (o admin vendo as empresas do cliente daquele projeto).
- Novo procedure `addCompanyToUser`: `adminProcedure`, input `{ userId: string, companyId: string }`, conecta a empresa ao usuário (`connect`).
- Novo procedure `removeCompanyFromUser`: `adminProcedure`, input `{ userId: string, companyId: string }`, desconecta (`disconnect`).

### Novo `src/server/trpc/routers/company.router.ts`

- `list`: `adminProcedure`, sem input, retorna todas as empresas ativas (`isActive: true`), ordenadas por nome — usado para a busca/seleção no diálogo "Gerenciar Empresas".
- `create`: `adminProcedure`, input `{ name: string }` (mínimo necessário; outros campos do modelo `Company` ficam para uma etapa futura de gestão completa), cria e retorna a empresa.

Registrar `companyRouter` no root router (`src/server/trpc/root.ts` ou equivalente).

### `src/server/trpc/routers/project.router.ts`

- `create`: adicionar input opcional `companyId: z.string().optional()`; se vier, gravar no `data.companyId` do projeto. Nenhuma validação cruzada de "empresa pertence ao cliente" no backend (o frontend só oferece as empresas do próprio usuário; é uma garantia de UX, não de segurança crítica, consistente com o nível de rigor já usado no resto do app).
- `update`: adicionar input opcional `companyId: z.string().nullable().optional()` para permitir o admin definir ou trocar a empresa de um projeto existente.
- `list` e `byId`: incluir `company: { select: { id: true, name: true } }` no `include` e no retorno mapeado.

## Frontend

### `src/app/(private)/cliente/solicitar/page.tsx`

- Busca `trpc.user.listMyCompanies.useQuery()`.
- Se `companies.length === 0`: nenhum campo de empresa é exibido; envio do formulário não inclui `companyId`.
- Se `companies.length === 1`: mostra um campo somente informativo (ex.: um card "Empresa: {nome}", não editável) já com aquele `companyId` embutido no envio.
- Se `companies.length >= 2`: mostra um `Select` obrigatório (mesmo padrão visual do `ProjectAssignDeveloperModal`) listando as empresas por nome; usuário deve escolher uma antes de conseguir avançar/enviar.

### `src/app/(private)/cliente/configuracoes/page.tsx`

- Remove o `Input` editável de "Empresa" (e o envio de `companyName` para `updateProfile`).
- Em seu lugar, mostra uma lista somente-leitura: "Empresas vinculadas: {nome1}, {nome2}, ..." ou, se vazio, "Nenhuma empresa vinculada — fale com o administrador."

### `src/app/(private)/admin/clientes/page.tsx`

- Novo item no menu "⋯" de cada linha: "Gerenciar Empresas" (ícone `Building2`), abrindo um novo diálogo:
  - Lista as empresas atuais do cliente (via `listCompaniesForUser`), cada uma com botão "Remover" (chama `removeCompanyFromUser`).
  - Um campo de busca/combobox (reaproveitando o padrão `Command`/`CommandDialog` já usado no seletor de cliente do Super Admin) que busca em `company.list`; ao digitar um nome que não existe, oferece "Criar empresa '{nome}'" (chama `company.create` e na sequência `addCompanyToUser`).
  - Selecionar uma empresa existente da busca chama `addCompanyToUser` diretamente.

### `src/app/(private)/projeto/[id]/` (detalhe do projeto)

- No card "Equipe" (onde já existe "Definir responsável", só para admin), adicionar um botão "Definir empresa" (só admin) que abre um novo modal `ProjectAssignCompanyModal` — mesmo padrão de `ProjectAssignDeveloperModal`, mas usando `listCompaniesForUser({ userId: project.clientId })` para listar as opções e chamando `project.update({ id, companyId })` ao salvar.
- Mostrar a empresa atual do projeto (nome ou "Sem empresa definida") ao lado do botão, mesmo padrão visual usado para o desenvolvedor atribuído.

### `src/app/(private)/admin/projetos/page.tsx` (listagem)

- Adicionar uma coluna/informação "Empresa" mostrando `project.company?.name ?? "—"`.

## Fora de escopo (confirmado)

- Corrigir o campo de empresa hoje quebrado/ignorado no diálogo "Novo Cliente" de `/admin/clientes` (continua como está, campo de texto que não é salvo).
- Migrar o campo de texto livre `ProjectRequest.company` do formulário público antigo de solicitação de projeto.
- Gestão completa dos demais campos do modelo `Company` (CNPJ, endereço, etc.) — a criação rápida via "Gerenciar Empresas" só pede o nome.
