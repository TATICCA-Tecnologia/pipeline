# Indicador visual de card sendo editado por outro usuário (Design)

## Contexto

O Kanban de projetos (`kanban-board.tsx` → `kanban-column.tsx` → `project-card.tsx`) e o modal de detalhes (`project-details.modal.tsx`) não têm nenhum mecanismo de concorrência hoje: dois usuários podem abrir o mesmo card ao mesmo tempo e sobrescrever as edições um do outro sem aviso nenhum. `project.byId` é só uma query simples via `httpBatchLink` (sem websocket configurado no `TRPCProvider`), e `Project` não tem nenhum campo de lock/versão.

O objetivo é um indicador de presença **advisory** (não bloqueante): quando um usuário está com o modal de um projeto aberto, os outros usuários veem esse card com uma cor diferente no Kanban e um aviso "sendo editado por Fulano" — tanto no card quanto dentro do próprio modal, caso alguém abra o mesmo card em seguida. Ninguém é impedido de editar/salvar.

## Requisitos confirmados com o usuário

1. **Gatilho do lock**: abrir o modal de detalhes já conta como "editando" — não precisa detectar alteração de campo específico. O mesmo modal serve tanto para visualizar quanto editar, então essa distinção não existe na prática hoje.
2. **Soft lock apenas**: o aviso é só informativo. Nenhum campo ou botão de salvar é desabilitado para o segundo usuário.
3. **Onde avisar**: card do Kanban (cor diferente + badge com o nome) **e** um banner dentro do modal, caso um segundo usuário abra o mesmo card enquanto o primeiro ainda está com ele aberto.
4. Lock nunca deve "prender" um card indefinidamente — se alguém fechar a aba/navegador sem o cleanup rodar, o lock precisa expirar sozinho.

## Modelo de dados

Nova tabela, sem alterar `Project`:

```prisma
model ProjectLock {
  projectId String   @id
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  userName  String
  lockedAt  DateTime @updatedAt

  @@map("project_locks")
}
```

- Chave primária é `projectId`: representa "quem tem este card aberto agora", não um histórico por usuário.
- `userName` fica denormalizado (evita um join extra em toda leitura de `activeLocks`, que é polled com frequência).
- `lockedAt` usa `@updatedAt` — toda escrita (criação ou heartbeat) atualiza o timestamp automaticamente.
- **TTL de 45s**: um lock só é considerado ativo se `lockedAt >= now - 45s`. Isso é a única forma de expiração — não existe job de limpeza. Um lock "morto" (aba fechada sem o `releaseLock` rodar) simplesmente para de aparecer como ativo depois de 45s; a linha física fica no banco até a próxima vez que alguém abrir aquele card (quando é sobrescrita pelo próximo `acquireLock`).

## Backend (`project.router.ts`)

Segue o mesmo padrão de `move`/`update` (protectedProcedure, `ctx.userId`, `ActivityLog` não é necessário aqui — não é uma mudança de dado do projeto).

```
LOCK_TTL_MS = 45_000
```

- **`acquireLock({ projectId })`** — `protectedProcedure`.
  - Busca o lock atual (`findUnique`) e o `name` do usuário chamador (`ctx.db.user.findUnique`).
  - Se não existe, está expirado (`lockedAt` mais velho que `LOCK_TTL_MS`), ou já pertence ao próprio `ctx.userId` → `upsert` gravando `{userId: ctx.userId, userName, lockedAt: now}` (o `lockedAt` é implícito via `@updatedAt`).
  - Se existe, não expirou, e pertence a outro usuário → **não sobrescreve**. Isso evita "roubar" o lock e ficar trocando de dono a cada heartbeat de 20s enquanto dois usuários estiverem com o card aberto ao mesmo tempo.
  - Retorna sempre o holder atual (`{ userId, userName, lockedAt }`), inclusive quando quem chamou não conseguiu o lock — é o que o modal usa pra decidir se mostra o banner.

- **`releaseLock({ projectId })`** — `protectedProcedure`.
  - `deleteMany({ where: { projectId, userId: ctx.userId } })` — só remove se o lock pertencer a quem chamou (no-op silencioso caso contrário, ex: usuário B chamando release sem nunca ter sido o holder).

- **`activeLocks()`** — `protectedProcedure`, sem input.
  - `findMany({ where: { lockedAt: { gte: new Date(Date.now() - LOCK_TTL_MS) } } })`.
  - Retorna `{ projectId, userId, userName, lockedAt }[]`. Query leve (tabela pequena, sem joins pesados) — pensada para ser feita com `refetchInterval` curto sem sobrecarregar o banco.

## Frontend

### `ProjectDetailsModal` (`project-details.modal.tsx`)

- Ao montar (quando `data.project.id` está disponível): chama `acquireLock` uma vez.
- Heartbeat: `setInterval` de 20s chamando `acquireLock` de novo enquanto o modal estiver montado (20s dá margem segura contra o TTL de 45s mesmo com alguma latência de rede).
- Ao desmontar: chama `releaseLock` (best-effort — se o navegador fechar abruptamente isso não roda, mas o TTL cobre esse caso).
- Guarda o `holder` retornado por `acquireLock`/pela query de lock: se `holder.userId !== user?.id`, renderiza um banner no topo do modal (mesmo estilo âmbar já usado em `priorizacao/page.tsx` para os avisos de gap de cronograma) com o texto `"{holder.userName} está editando este projeto agora."`.

### Board (onde `KanbanBoard` é usado — páginas admin/desenvolvedor)

- Adiciona `trpc.project.activeLocks.useQuery(undefined, { refetchInterval: 10_000 })` no componente que já busca `projects` (mesmo nível de `useProjects()`/`project.list`).
- Constrói `Record<string, { userId: string; userName: string }>` por `projectId` e passa como prop opcional (`locksByProjectId`) através de `KanbanBoard` → `KanbanColumn` → `ProjectCard`.

### `ProjectCard` (`project-card.tsx`)

- Recebe `lock?: { userId: string; userName: string }`.
- Se `lock` existe e `lock.userId !== user?.id`:
  - Troca a borda/fundo do `Card` para uma variante âmbar (reaproveita a paleta `amber-500/…` já usada nos badges de "Melhoria" e nos avisos da priorização, mantendo consistência visual).
  - Mostra um badge pequeno com ícone (ex.: `Lock`/`Pencil` do `lucide-react`, já é a lib de ícones usada no card) e texto truncado `"Editando: {lock.userName}"`.
- Se `lock.userId === user?.id` (o próprio usuário, outra aba) → não mostra nada, é o mesmo comportamento de hoje.

## Fora de escopo

- Bloquear salvamento do segundo usuário — decidido explicitamente como soft lock apenas.
- Detectar edição campo-a-campo (dirty state) — abrir o modal já é o gatilho.
- Websocket/tempo real instantâneo — a solução usa polling (10s no board, 20s de heartbeat no modal), consistente com a infra atual (`httpBatchLink` sem `wsLink`). Latência de alguns segundos é aceitável para um indicador advisory.
- Job de limpeza de linhas antigas em `ProjectLock` — o TTL já resolve a expiração funcional; linhas antigas são inofensivas e são sobrescritas no próximo uso do mesmo projeto.
