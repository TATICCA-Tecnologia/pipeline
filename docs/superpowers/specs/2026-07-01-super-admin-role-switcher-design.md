# Super Admin + Seletor de Perfil (Design)

## Contexto

O sistema hoje tem três papéis (`UserRole` no Prisma): `ADMIN`, `DEVELOPER`, `CLIENT`. Cada um enxerga uma sidebar e rotas diferentes (`/admin`, `/desenvolvedor`, `/cliente`). A autenticação é customizada (tRPC + `localStorage`, sem NextAuth): o usuário logado fica em `localStorage["kanban_auth_user"]` e o `id` desse usuário é enviado em todo request tRPC via header `x-user-id`, sem verificação de sessão real no servidor.

Objetivo: criar um papel **Super Admin** que consegue alternar rapidamente entre as três visões existentes (Admin / Desenvolvedor / Cliente) sem precisar de três contas separadas, através de um menu de troca.

## Requisitos confirmados com o usuário

1. Os três perfis alternáveis são os já existentes: Admin, Desenvolvedor, Cliente.
2. **Ver como Admin**: usa a própria identidade do Super Admin, tratada como admin.
3. **Ver como Desenvolvedor**: usa a própria identidade do Super Admin — ele passa a poder ser atribuído a projetos como "mais um desenvolvedor" (sem escolher outra pessoa).
4. **Ver como Cliente**: o Super Admin escolhe um cliente específico (pessoa/empresa) já cadastrado e atua exatamente como aquele cliente faria (visualizar e criar solicitações etc.), não uma visão agregada.
5. A troca deve ser rápida e reversível a qualquer momento, com indicação visual de qual perfil está ativo.
6. Fora de escopo: RBAC granular, proteção de rotas por papel no servidor, e qualquer reforço geral da autenticação. Essas são fragilidades pré-existentes do sistema (não introduzidas por esta feature) e ficam para uma etapa futura separada.

## Modelo de dados

### `prisma/schema.prisma`
- Adicionar `SUPER_ADMIN` ao enum `UserRole`:
  ```prisma
  enum UserRole {
    ADMIN
    DEVELOPER
    CLIENT
    SUPER_ADMIN
  }
  ```
- Gerar migration Prisma para o novo valor de enum.

### `src/server/trpc/mappers.ts`
- `FrontendUserRole` passa a incluir `"super_admin"`.
- `PRISMA_TO_FRONTEND_ROLE` ganha `SUPER_ADMIN: "super_admin"`.

### Pontos que checam papel e precisam tratar `SUPER_ADMIN` como equivalente/superior a `ADMIN`
- `src/server/trpc/trpc.ts` → `enforceAdmin`: aceitar `role === "ADMIN" || role === "SUPER_ADMIN"`.
- `src/server/trpc/routers/user.router.ts` → `listDevelopers`: filtro passa de `role: "DEVELOPER"` para `role: { in: ["DEVELOPER", "SUPER_ADMIN"] }` (mantendo `isActive: true`), para que o Super Admin apareça nos dropdowns de atribuição de desenvolvedor.
- `src/shared/components/app-sidebar.tsx` → lógica `sections = user.role === "admin" ? adminSections : ...` precisa considerar o papel **efetivo** (ver seção "Estado de visão" abaixo), não o papel real do banco.

## Estado de "visão atual" (view state)

Hoje `useAuth()` expõe um único `user` usado por toda a UI e nas chamadas tRPC. Isso muda para:

- **`actualUser`**: identidade real do usuário logado (o Super Admin). Nunca muda ao trocar de visão. Vem do login normal, sem alterações.
- **`user`** (perfil efetivo, mantém o nome/formato atual para não quebrar consumidores existentes): o que a tela deve exibir e usar nas ações.
- **`viewState`** (novo, interno ao `AuthProvider`): `{ role: "admin" | "developer" | "client"; impersonatedClientId?: string }`.
  - Só é relevante/alterável quando `actualUser.role === "super_admin"`.
  - Para os demais usuários, `viewState.role` sempre espelha `actualUser.role` e não há seletor na UI.

Derivação de `user` a partir de `viewState` (quando `actualUser.role === "super_admin"`):
- `role: "admin"` → `user = { ...actualUser, role: "admin" }`.
- `role: "developer"` → `user = { ...actualUser, role: "developer" }`.
- `role: "client"` com `impersonatedClientId` definido → `user` é substituído pelos dados do cliente escolhido (buscados via `user.byId`), mantendo `role: "client"`.
- `role: "client"` sem `impersonatedClientId` (estado transitório antes de escolher alguém) → mantém a visão anterior até que uma escolha seja feita; a troca para "Cliente" só se efetiva depois de selecionar alguém na lista.

Persistência: `localStorage` (chave nova, ex.: `super_admin_view_state`), separada da chave de auth existente. Limpa no logout.

### Header tRPC (`x-user-id` vs. impersonação)

Hoje `setTrpcUserId` grava o `id` enviado como `x-user-id` em todo request. Isso precisa virar dois headers:
- `x-user-id`: sempre o `id` do `actualUser` (identidade real).
- `x-acting-as-id` (novo, opcional): enviado **apenas** quando `viewState.role === "client"` e `impersonatedClientId` está definido (e é diferente do próprio `actualUser.id`). Para `viewState.role === "admin"` ou `"developer"` este header não é enviado — `ctx.userId` resolve para o próprio `actualUser.id`, que já é o comportamento desejado.

No servidor (`src/server/trpc/context.ts`):
- `ctx.realUserId` = valor de `x-user-id`.
- `ctx.userId` = valor de `x-acting-as-id` **se e somente se** o usuário de `x-user-id` existir no banco com `role === "SUPER_ADMIN"`; caso contrário, `ctx.userId = ctx.realUserId` (ignora silenciosamente qualquer tentativa de spoof por não-Super-Admin).

Isso mantém o modelo de confiança atual (header client-supplied, sem sessão real) mas impede que um usuário comum finja ser outro só setando um header a mais.

## Interface

### Onde fica o seletor
Dentro do menu de usuário já existente na sidebar (`app-sidebar.tsx`, linhas ~197-217), abaixo do separador e acima de "Sair". Só renderizado quando `actualUser.role === "super_admin"`.

Estrutura do menu adicional "Ver como":
- Admin
- Desenvolvedor
- Cliente → abre um sub-diálogo/combobox com busca, listando clientes via `trpc.user.listClients` (já existe e retorna nome + empresa), agrupado ou rotulado por empresa.

Ao selecionar qualquer opção:
1. Atualiza `viewState` (e `impersonatedClientId` quando aplicável).
2. Redireciona (`router.push`) para a rota raiz do perfil escolhido: `/admin`, `/desenvolvedor` ou `/cliente`.

### Indicador de visão ativa
Enquanto `viewState` não representa a identidade "nativa" de Super Admin visualizando como Admin (ou seja, sempre que estiver como Desenvolvedor ou como um Cliente específico), mostrar uma faixa fixa no topo da área de conteúdo (`main` em `src/app/(private)/layout.tsx`):

> "Visualizando como Cliente: João Silva (Tech Corp) — [Voltar para Super Admin]"
> "Visualizando como Desenvolvedor — [Voltar para Super Admin]"

O botão "Voltar" reseta `viewState` para `{ role: "admin" }` e navega para `/admin`.

### Ajuste na sidebar (`app-sidebar.tsx`)
A escolha de `sections` passa a usar o `user.role` efetivo (que já reflete `viewState` via `useAuth()`), então nenhuma mudança estrutural é necessária além de garantir que `"super_admin"` sem override caia em `adminSections` por padrão (primeiro acesso, antes de qualquer troca).

## Cadastro do Super Admin real

Não haverá cadastro por UI nesta primeira entrega (só o usuário pedirá para promover sua conta). Isso será feito via script de seed/promoção (`prisma/seed.ts` ou script avulso), seguindo o padrão de `upsert` já usado no arquivo. Dados necessários do usuário, a serem pedidos após a implementação:
- Nome completo
- E-mail de login
- Senha (será hasheada com `bcryptjs`, mesmo padrão de `auth.router.ts`)

## Fora de escopo (confirmado)

- Middleware/validação de rota por papel no servidor (hoje inexistente para a maioria das rotas).
- Qualquer reforço geral do modelo de autenticação além da checagem mínima de `x-acting-as-id` descrita acima.
- Seletor de "visão agregada por empresa" (múltiplos clientes de uma mesma empresa ao mesmo tempo) — a troca é sempre para um cliente específico, uma pessoa por vez.
