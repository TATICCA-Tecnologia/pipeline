# Excluir Projeto (Admin) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que `admin`/`super_admin` excluam permanentemente um projeto (e tudo relacionado, via cascade) a partir do modal "Detalhes do projeto".

**Architecture:** Nova mutation tRPC `project.delete` (via `adminProcedure`) que apaga o projeto e deixa o Prisma cascatear a remoção dos registros filhos. No frontend, um `deleteProject` novo no `ProjectsProvider` e um botão destrutivo + `AlertDialog` de confirmação no `ProjectDetailsModal`, visível só para admin/super_admin.

**Tech Stack:** Next.js (App Router), tRPC, Prisma, React, shadcn/ui (`AlertDialog`, `Button`), `sonner` (toast).

**Nota sobre testes:** este repositório não tem test runner configurado (sem Jest/Vitest/Playwright, sem scripts de teste no `package.json`). A verificação de cada task é feita via `npx tsc --noEmit` (checagem de tipos), `npm run lint` e teste manual no navegador — não via testes automatizados novos.

---

### Task 1: Mutation `project.delete` no backend

**Files:**
- Modify: `src/server/trpc/routers/project.router.ts:1-6` (import) e final do router (após `move`, antes do `});` de fechamento, por volta da linha 425)

- [ ] **Step 1: Adicionar `adminProcedure` ao import do topo do arquivo**

Em `src/server/trpc/routers/project.router.ts:3`, troque:

```ts
import { router, publicProcedure, protectedProcedure } from "../trpc";
```

por:

```ts
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
```

- [ ] **Step 2: Adicionar a mutation `delete` logo após `move` (antes do `});` final do `projectRouter`)**

Em `src/server/trpc/routers/project.router.ts`, localize o bloco `move: protectedProcedure...` (linhas 410-425) e adicione a mutation `delete` logo depois dele, ainda dentro de `export const projectRouter = router({ ... })`:

```ts
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      await ctx.db.project.delete({ where: { id: input.id } });
      return { success: true };
    }),
```

Isso segue o mesmo padrão de `deletePhase` (`src/server/trpc/routers/specification.router.ts:125-142`): busca antes para dar um erro `NOT_FOUND` claro, depois deleta. O Prisma já cascateia a remoção de `ProjectFeature`, `ProjectPhase` (e `PhaseTask` via phase), `Task`, `Comment`, `ProjectFile` e `ActivityLog` (todos com `onDelete: Cascade` no `prisma/schema.prisma`), então não é necessário apagar nada manualmente antes.

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `project.router.ts` (o projeto pode já ter warnings pré-existentes em outros arquivos — foque em não introduzir novos).

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/project.router.ts
git commit -m "feat: add admin-only project.delete mutation"
```

---

### Task 2: `deleteProject` no `ProjectsProvider`

**Files:**
- Modify: `src/shared/context/projects-context.tsx`

- [ ] **Step 1: Adicionar `deleteProject` à interface `ProjectsContextType`**

Em `src/shared/context/projects-context.tsx:19-33`, adicione a assinatura logo após `moveProject`:

```ts
interface ProjectsContextType {
  projects: Project[];
  requests: ProjectRequest[];
  activityLogs: ActivityLog[];
  isLoading: boolean;
  addProject: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  moveProject: (id: string, status: ProjectStatus) => void;
  deleteProject: (id: string) => Promise<void>;
  addRequest: (request: Omit<ProjectRequest, "id" | "createdAt">) => void;
  approveRequest: (requestId: string, developerId?: string) => void;
  getProjectsByStatus: (status: ProjectStatus) => Project[];
  getProjectsByClient: (clientId: string) => Project[];
  getProjectsByDeveloper: (developerId: string) => Project[];
  refetch: () => void;
}
```

- [ ] **Step 2: Adicionar a mutation logo após `moveProjectMutation`**

Em `src/shared/context/projects-context.tsx:143-145`, logo depois de:

```ts
  const moveProjectMutation = trpc.project.move.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
```

adicione:

```ts
  const deleteProjectMutation = trpc.project.delete.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
```

- [ ] **Step 3: Adicionar o callback `deleteProject` logo após `moveProject`**

Em `src/shared/context/projects-context.tsx:229-234`, logo depois de:

```ts
  const moveProject = useCallback(
    (id: string, status: ProjectStatus) => {
      moveProjectMutation.mutate({ id, status });
    },
    [moveProjectMutation]
  );
```

adicione:

```ts
  const deleteProject = useCallback(
    async (id: string) => {
      await deleteProjectMutation.mutateAsync({ id });
    },
    [deleteProjectMutation]
  );
```

- [ ] **Step 4: Expor `deleteProject` no valor do provider**

Em `src/shared/context/projects-context.tsx:279-297`, dentro do `<ProjectsContext.Provider value={{ ... }}>`, adicione `deleteProject,` logo após `moveProject,`:

```ts
    <ProjectsContext.Provider
      value={{
        projects,
        requests,
        activityLogs,
        isLoading,
        addProject,
        updateProject,
        moveProject,
        deleteProject,
        addRequest,
        approveRequest,
        getProjectsByStatus,
        getProjectsByClient,
        getProjectsByDeveloper,
        refetch,
      }}
    >
```

- [ ] **Step 5: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `projects-context.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/context/projects-context.tsx
git commit -m "feat: expose deleteProject from ProjectsProvider"
```

---

### Task 3: Botão "Excluir projeto" + confirmação no modal

**Files:**
- Modify: `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`

- [ ] **Step 1: Adicionar os imports necessários**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx:1-12`, troque o bloco de imports por:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { ModalProps } from "@/shared/types/modal";
import type { Project } from "@/shared/types";
import { Button } from "@/src/shared/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import { ProjectDetailSections } from "@/shared/components/project-detail-sections";
import { useAuth } from "@/shared/context/auth-context";
import { useModal } from "@/shared/context/modal-context";
import { useProjects } from "@/shared/context/projects-context";
import { trpc } from "@/shared/trpc/client";
import { Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";
import { ProjectExecutiveSlideModal } from "./project-executive-slide.modal";
```

- [ ] **Step 2: Adicionar estado local e o handler de exclusão dentro do componente**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`, logo após a linha `const { user } = useAuth();` (linha 22 original) e antes de `const { openModal } = useModal();`, adicione:

```tsx
  const { deleteProject } = useProjects();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!data?.project.id) return;
    setDeleting(true);
    try {
      await deleteProject(data.project.id);
      toast.success("Projeto excluído");
      setConfirmOpen(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir projeto");
    } finally {
      setDeleting(false);
    }
  }
```

- [ ] **Step 3: Adicionar o botão destrutivo na barra de ações e o `AlertDialog`**

Em `src/app/(private)/admin/projetos/_components/project-details.modal.tsx`, localize o rodapé do modal (linhas 62-95 originais):

```tsx
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <Button variant="outline" className="cursor-pointer" type="button" onClick={onClose}>
          Fechar
        </Button>
        <div className="flex gap-2">
```

Troque por (adiciona o botão "Excluir projeto" à esquerda, ao lado de "Fechar", só para admin/super_admin):

```tsx
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <div className="flex gap-2">
          <Button variant="outline" className="cursor-pointer" type="button" onClick={onClose}>
            Fechar
          </Button>
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <Button
              variant="destructive"
              className="cursor-pointer"
              type="button"
              onClick={() => setConfirmOpen(true)}
            >
              Excluir projeto
            </Button>
          )}
        </div>
        <div className="flex gap-2">
```

E, logo antes do fechamento do componente (depois do `</div>` final que fecha o rodapé, antes do `</div>` que fecha o container raiz — linhas 94-95 originais: `      </div>\n    </div>\n  );`), adicione o `AlertDialog`:

```tsx
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e remove o projeto, suas tarefas, fases, comentários e
              arquivos. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `project-details.modal.tsx`.

- [ ] **Step 5: Lint**

Run: `cd "c:/Users/danie/Pipeline" && npm run lint`
Expected: sem novos erros no arquivo modificado.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/admin/projetos/_components/project-details.modal.tsx"
git commit -m "feat: add delete-project button and confirmation to project details modal"
```

---

### Task 4: Verificação manual no navegador

**Files:** nenhum (só teste manual)

- [ ] **Step 1: Subir o servidor de dev**

Run: `cd "c:/Users/danie/Pipeline" && npm run dev`

- [ ] **Step 2: Testar como `admin` ou `super_admin`**

1. Logar com um usuário `admin` ou `super_admin`.
2. Ir em `/admin/projetos`, escolher um projeto que tenha ao menos uma task e um comentário/arquivo (para validar a cascata), clicar no card para abrir "Detalhes do projeto".
3. Confirmar que o botão vermelho "Excluir projeto" aparece ao lado de "Fechar".
4. Clicar em "Excluir projeto" → confirmar que abre o `AlertDialog` com o aviso.
5. Clicar em "Cancelar" → dialog fecha, projeto continua no Kanban (nada foi deletado).
6. Abrir de novo, clicar em "Excluir projeto" → "Excluir" → confirmar: toast "Projeto excluído", modal fecha, o card some do Kanban.
7. Verificar no Prisma Studio (`npx prisma studio`) que o projeto e seus `Task`/`Comment`/`ProjectFile`/`ProjectPhase`/`ActivityLog` relacionados não existem mais.

- [ ] **Step 3: Testar como `developer` ou `client`**

1. Logar com um usuário `developer` (ou `client`, se esse papel tiver acesso a `/admin/projetos` — caso não tenha, pular).
2. Abrir "Detalhes do projeto" de qualquer projeto.
3. Confirmar que o botão "Excluir projeto" **não aparece**.

- [ ] **Step 4: Commit final (se algo precisar de ajuste)**

Se algum ajuste for necessário durante a verificação manual, aplique a mudança e:

```bash
git add -A
git commit -m "fix: adjustments from manual verification of project delete"
```
