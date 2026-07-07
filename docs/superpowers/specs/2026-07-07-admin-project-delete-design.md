# Excluir Projeto (Design)

## Contexto

Hoje não existe nenhuma forma de excluir um projeto no Pipeline — nem endpoint no backend (`project.router.ts` só tem `list`, `byId`, `create`, `update`, `move`), nem botão em nenhuma tela. O usuário, como admin, quer esse poder.

## Requisitos confirmados com o usuário

1. **Hard delete.** Exclusão permanente e em cascata, sem soft-delete/arquivamento e sem possibilidade de recuperação.
2. **Permissão: `admin` e `super_admin`.** Segue o padrão já usado no código (`adminProcedure`) para outras exclusões destrutivas (`deletePhase`, `deleteArea`, `deleteTheme`). `developer` e `client` não têm acesso.
3. **Único ponto de entrada: modal de detalhes do projeto** (`ProjectDetailsModal`). Não haverá ícone/ação de exclusão direto no card do Kanban, para reduzir risco de clique acidental numa área que já tem drag-and-drop.

## Backend

Nova mutation `delete` em `src/server/trpc/routers/project.router.ts`, usando `adminProcedure`:

```ts
delete: adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    try {
      await ctx.db.project.delete({ where: { id: input.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }
      throw err;
    }
    return { success: true };
  }),
```

O schema Prisma já tem `onDelete: Cascade` em todas as relações filhas de `Project` (`ProjectFeature`, `ProjectPhase` — e `PhaseTask` via `ProjectPhase` —, `Task`, `Comment`, `ProjectFile`, `ActivityLog`), então um único `project.delete` já remove tudo em cascata no banco. Não há storage externo de arquivo (`ProjectFile.url` é só uma URL) para limpar à parte.

Não é registrado em `ActivityLog` — o log é escopado por projeto e seria apagado junto pela própria cascata.

## Frontend

**`src/shared/context/projects-context.tsx`:**
- Novo `trpc.project.delete.useMutation({ onSuccess: () => utils.project.list.invalidate() })`.
- Novo `deleteProject(id: string)` exposto em `ProjectsContextType` e no valor do provider, espelhando o padrão de `moveProject`.

**`src/app/(private)/admin/projetos/_components/project-details.modal.tsx`:**
- Novo botão destrutivo "Excluir projeto" (`variant="destructive"`), visível apenas quando `user?.role === "admin" || user?.role === "super_admin"`, posicionado no lado esquerdo da barra de ações (separado de Fechar/Especificação/Ver detalhes, que ficam à direita).
- Ao clicar, abre um `AlertDialog` (mesmo componente/padrão de `src/app/(private)/admin/configuracoes/categorias/page.tsx`):
  - Título: "Excluir projeto"
  - Descrição: aviso de que a ação é permanente e remove tarefas, fases, comentários e arquivos do projeto — sem possibilidade de recuperação.
  - Ações: "Cancelar" / "Excluir" (destrutivo).
- Confirmado → chama `deleteProject(project.id)`; em caso de sucesso, `toast.success("Projeto excluído")` e `onClose()` (fecha o modal); o Kanban some com o card sozinho via invalidação da query `project.list`.
- Em caso de erro (ex.: já excluído por outra aba/corrida), `toast.error(error.message)`, modal permanece aberto.

## Fora de escopo

- Soft-delete/arquivamento e restauração.
- Exclusão em massa (múltiplos projetos de uma vez).
- Ícone/ação de exclusão no card do Kanban.
- Confirmação por digitação do nome do projeto (ex.: "digite o nome para confirmar") — o `AlertDialog` padrão já usado no projeto é suficiente.

## Testes manuais

- Como `admin`/`super_admin`: abrir detalhes de um projeto com tasks/fases/arquivos, excluir, confirmar que some do Kanban e que os registros filhos (tasks, phases, comments, files, activity logs) também deixam de existir no banco.
- Como `developer`/`client`: confirmar que o botão "Excluir projeto" não aparece no modal.
- Cancelar no `AlertDialog` não deve disparar a mutation.
