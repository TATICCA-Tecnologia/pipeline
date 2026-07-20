# Notificar participantes anteriores do chat (Design)

## Contexto

Hoje `comment.create` (`comment.router.ts`) só cria uma `Notification` quando o autor @menciona alguém explicitamente. Se um usuário já mandou mensagem num chat e outra pessoa responde sem mencioná-lo, ele não é avisado de nenhuma forma — precisa entrar no projeto manualmente pra ver a resposta.

## Requisitos confirmados com o usuário

1. **Escopo por canal**: participar do canal GLOBAL só inscreve pra notificações do GLOBAL daquele projeto; INTERNAL é separado (mesma lógica pro contrário) — evita vazar aviso de um canal que o usuário talvez nem enxergue (cliente não vê INTERNAL).
2. **Uma notificação por mensagem**: sem agrupamento/upsert — cada mensagem nova gera uma `Notification` por destinatário, mesmo padrão já usado pra menção.
3. Quem já recebeu a notificação de **menção** pra aquela mensagem não recebe uma segunda notificação de "participante" pra ela mesma (evita duplicidade).

## Mudança

### `comment.router.ts` — `create`

Depois de resolver `mentionedIds` (lógica de menção já existente, sem mudança), adiciona:

```ts
const priorParticipants = await ctx.db.comment.findMany({
  where: {
    projectId: input.projectId,
    visibility: input.visibility,
    userId: { not: ctx.userId },
  },
  distinct: ["userId"],
  select: { userId: true },
});
const participantIds = priorParticipants
  .map((p) => p.userId)
  .filter((id) => !mentionedIds.includes(id));
```

`visibility` do filtro é a da mensagem **sendo criada agora** (`input.visibility`) — cumpre o requisito 1: só considera quem já postou nesse mesmo canal. `userId: { not: ctx.userId } ` exclui o próprio autor (se ele já postou antes, não notifica a si mesmo). O `.filter` final exclui quem já está em `mentionedIds`, cumprindo o requisito 3.

A busca do `Project` (pro título usado na mensagem) e a criação das notificações de menção (bloco já existente) passam a rodar dentro de um `if (mentionedIds.length > 0 || participantIds.length > 0)`, pra não pagar essa query em mensagens sem menção nem participante prévio (ex.: a primeira mensagem de um chat). Reaproveita o `NotificationType.COMMENT`, que já existe no enum e nunca foi usado por nenhum código — não precisa de mudança de schema:

```ts
if (participantIds.length > 0) {
  await ctx.db.notification.createMany({
    data: participantIds.map((userId) => ({
      userId,
      type: "COMMENT" as const,
      title: "Nova mensagem no chat",
      message: `${comment.user.name} respondeu no chat do projeto "${project?.title ?? ""}"`,
      link: `/projeto/${input.projectId}`,
    })),
  });
}
```

Nenhuma mudança de schema, de outro router, ou de frontend — o `NotificationBell` já é agnóstico ao `type` (só mostra `title`/`message`).

## Fora de escopo

- Preferências de notificação (opt-out por usuário/projeto) — não existe nenhuma UI de configuração de notificações hoje; fica pra um pedido futuro se algum canal ficar barulhento demais.
- Agrupar/atualizar uma notificação existente em vez de criar uma nova a cada mensagem — decidido explicitamente que não é necessário agora.
- Notificar sobre `INTERNAL` quem só participou do `GLOBAL` (ou vice-versa) — decidido explicitamente que fica separado por canal.
