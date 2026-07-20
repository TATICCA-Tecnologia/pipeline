# @Menção no chat do projeto + notificação (Design)

## Contexto

O chat do projeto (`project-chat.tsx`, backend em `comment.router.ts`) hoje é só texto livre — não existe nenhuma forma de referenciar um usuário específico numa mensagem. O componente é renderizado numa única página, `src/app/(private)/projeto/[id]/page.tsx`, que é compartilhada por todos os papéis (não é exclusiva de cliente — tem ações de admin como atribuir desenvolvedor/empresa), então qualquer link de notificação pra esse chat funciona pra qualquer papel.

O schema já tem um model `Notification` (`prisma/schema.prisma:425-439`) e um tipo `Notification` no frontend (`shared/types/index.ts:156-164`), mas ambos estão **100% mortos**: não existe `notification.router.ts`, nenhuma mutation cria uma linha em `Notification`, e nenhum componente lê notificações. Os dois formatos nem batem entre si (o enum do backend é `PROJECT_UPDATE|COMMENT|FILE_UPLOAD|STATUS_CHANGE|PAYMENT|SYSTEM`, o tipo do frontend é `"info"|"success"|"warning"`) — confirma que foi só scaffolding nunca conectado.

## Requisitos confirmados com o usuário

1. **Quem é mencionável**: o cliente-dono do projeto + todo usuário com role `ADMIN`, `SUPER_ADMIN` ou `DEVELOPER` (não só o desenvolvedor atribuído a este projeto específico — qualquer developer).
2. **Efeito da menção**: além do destaque visual na mensagem, cria uma notificação de verdade (`Notification` no banco) pro usuário mencionado.
3. **Onde funciona**: nos dois canais do chat (Chat do Projeto/GLOBAL e Chat de Execução/INTERNAL).

## Modelo de dados

### `Comment.mentionedUserIds`

```prisma
model Comment {
  // ...campos existentes...
  mentionedUserIds Json? // array de userId (string[]) mencionados nesta mensagem
}
```

Mesmo padrão já usado em `Project.benefits Json?`/`Project.solutionTypes Json?` — uma lista simples, sem tabela de junção, porque a única leitura necessária é "quem foi mencionado nesta mensagem" (pra destacar o nome na renderização), não "em quais mensagens fulano foi mencionado".

### `NotificationType.MENTION`

```prisma
enum NotificationType {
  PROJECT_UPDATE
  COMMENT
  FILE_UPLOAD
  STATUS_CHANGE
  PAYMENT
  SYSTEM
  MENTION
}
```

Adição aditiva (novo valor de enum) — não afeta linhas existentes.

## Backend

### `user.router.ts` — novo procedure `listMentionable`

```ts
listMentionable: protectedProcedure
  .input(z.object({ projectId: z.string() }))
  .query(async ({ ctx, input }) => {
    const project = await ctx.db.project.findUnique({
      where: { id: input.projectId },
      select: { clientId: true },
    });
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

    const users = await ctx.db.user.findMany({
      where: {
        OR: [
          { id: project.clientId },
          { role: { in: ["ADMIN", "SUPER_ADMIN", "DEVELOPER"] } },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({ id: u.id, name: u.name, role: toFrontendRole(u.role) }));
  }),
```

`protectedProcedure` (não `adminProcedure`) porque o cliente também precisa ver essa lista pra mencionar no chat GLOBAL.

### `comment.router.ts` — `create`

Aceita `mentionedUserIds?: string[]` (default `[]`). Depois de criar o comentário:

1. Deduplica e remove o próprio autor da lista (`mentionedUserIds.filter((id, i, arr) => id !== ctx.userId && arr.indexOf(id) === i)`).
2. Salva a lista original (já sem o autor) em `Comment.mentionedUserIds`.
3. Busca o projeto (`title`) e o nome do autor (já disponível via `ctx.db.user` — reaproveita a mesma query que já busca `user: {select: {name, role}}` pro retorno do comentário).
4. Para cada id mencionado, `ctx.db.notification.create({ data: { userId: mentionedId, type: "MENTION", title: "Você foi mencionado", message: \`${authorName} mencionou você no chat do projeto "${project.title}"\`, link: \`/projeto/${input.projectId}\` } })`.

Sem checagem de "o mencionado tem acesso a este projeto" — mesma postura do resto do arquivo (não existe controle de acesso por projeto em nenhuma query de comentário hoje); os mencionáveis já vêm filtrados por `listMentionable` no client, então na prática só participantes plausíveis aparecem pra escolher.

### `notification.router.ts` — novo router

```ts
export const notificationRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({ where: { userId: ctx.userId, read: false } });
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await ctx.db.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return notifications;
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.userId },
        data: { read: true },
      });
      return { success: true };
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }),
});
```

`markAsRead` usa `updateMany` com `userId: ctx.userId` no `where` (não `update` por `id` sozinho) pelo mesmo motivo de `releaseLock` no lock de presença: um no-op seguro caso o id não pertença a quem chamou, em vez de vazar/alterar notificação de outro usuário. Registrado em `src/server/trpc/root.ts` como `notification: notificationRouter`.

## Frontend

### Tipos (`shared/types/index.ts`)

- `Comment` ganha `mentionedUserIds?: string[]` e `mentionedUsers?: { id: string; name: string }[]` (resolvido no backend, pra renderizar o destaque sem precisar de outra query).
- `Notification` é corrigido pra bater com o formato real do backend: `type` vira `NotificationType` (mesmos valores do enum Prisma) e ganha `link: string | null`. Como não existe nenhum consumidor hoje, não é uma mudança que quebra nada.
- Novo `MentionableUser { id: string; name: string; role: UserRole }`.

### `comment.router.ts` também retorna `mentionedUsers`

No `byProject` e no `create`, junto com o `include: { user: ... }` já existente, resolve os nomes dos mencionados: `ctx.db.user.findMany({ where: { id: { in: mentionedUserIds } }, select: { id: true, name: true } })` (uma query extra só quando a mensagem tem menções).

### `project-chat.tsx` — input com autocomplete de menção

- Novo estado: `mentionQuery: string | null` (texto depois do último `@` não confirmado) e `selectedMentions: Map<string, string>` (nome → userId, dos já inseridos no texto).
- `trpc.user.listMentionable.useQuery({ projectId })`, filtrada em memória pelo `mentionQuery`.
- `onChange` do `Textarea`: acha o último `@` antes do cursor; se não tiver espaço entre o `@` e o cursor, isso vira o `mentionQuery` e abre o dropdown (renderizado logo abaixo do textarea — não segue a posição do cursor pixel a pixel, mais simples e robusto que medir posição de caractere numa textarea).
- Selecionar um item: substitui o trecho `@mentionQuery` por `@Nome ` no texto, guarda `selectedMentions.set(nome, userId)`, fecha o dropdown.
- Antes de enviar (`handleSendMessage`): filtra `selectedMentions` mantendo só entradas cujo `@Nome` ainda aparece literalmente no texto final (cobre o caso de o usuário apagar a menção depois de inserida) e manda os ids restantes como `mentionedUserIds`.
- Renderização da mensagem (`renderMessages`): se `comment.mentionedUsers` não for vazio, troca `<p>{comment.content}</p>` por uma versão que envolve cada ocorrência de `@Nome` (pra cada nome em `mentionedUsers`) num `<strong>` — mesmo texto, só destacando as ocorrências encontradas.
- Funciona nos dois canais (`GLOBAL` e `INTERNAL`) porque é o mesmo componente de input pros dois — nenhuma diferenciação por `activeTab` necessária.

### `NotificationBell` (novo componente) + `AppSidebar`

- Novo `src/shared/components/notification-bell.tsx`: ícone de sino na linha do topo da sidebar (ao lado da logo, `justify-between`), com um `Badge` de contagem (`trpc.notification.unreadCount.useQuery`, `refetchInterval: 30_000`) e um dropdown (`DropdownMenu`, mesmo primitivo já usado no resto da sidebar) listando `trpc.notification.list`. Clicar num item chama `markAsRead` e navega (`router.push(notification.link)`) se houver `link`.
- `app-sidebar.tsx`: a linha do topo (`<Link href="/" ...>`) vira um `<div className="flex items-center justify-between ...">` com o link da logo de um lado e `<NotificationBell />` do outro.

## Fora de escopo

- Popover de menção seguindo a posição exata do cursor no texto — a lista aparece fixa abaixo do campo.
- Qualquer outro `NotificationType` além de `MENTION` ganhar uma UI/fluxo de criação — os outros valores do enum continuam sem nenhum código que os crie; este design só liga o suficiente pra menções funcionarem.
- Marcar notificação como lida automaticamente ao abrir o projeto mencionado — só ao clicar na notificação em si.
- Enviar e-mail/push além da notificação in-app.
