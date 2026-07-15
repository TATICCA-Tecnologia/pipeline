# Merge de Área e Tema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar merge de Área e de Tema na tela `/admin/configuracoes/categorias` — escolher uma área/tema de destino, ver um preview do impacto, e migrar tudo (temas, projetos, entrevistas, sugestões) antes de remover a origem.

**Architecture:** Nenhuma migration nova — o merge só reatribui foreign keys que já existem. Quatro novos procedures em `taxonomy.router.ts` (`previewAreaMerge`, `mergeArea`, `previewThemeMerge`, `mergeTheme`), executando a reatribuição em `ctx.db.$transaction([...])`. Na UI, um botão "Mesclar" novo ao lado de editar/excluir em cada Área e cada Tema, abrindo um diálogo com seletor de destino + preview + confirmação.

**Tech Stack:** Next.js (App Router) + tRPC + Prisma (PostgreSQL) + shadcn/ui + Tailwind. Sem framework de teste e sem banco local neste repo — validação é `pnpm exec tsc --noEmit` e `pnpm build` (não há `eslint` instalado, é uma lacuna pré-existente, não faz parte deste plano). Deploy é automático via push pra `main` (GitHub Actions + Docker entrypoint rodando `prisma migrate deploy`) — como não há migration nova aqui, nem isso é necessário além do deploy padrão de código.

---

## Task 1: Backend — procedures de merge

**Files:**
- Modify: `src/server/trpc/routers/taxonomy.router.ts`

- [ ] **Step 1: Adicionar os 4 procedures de merge**

Em `src/server/trpc/routers/taxonomy.router.ts`, encontre o fim da seção de Temas (logo antes do comentário de Sugestões):
```typescript
  deleteTheme: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectTheme.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // SUGESTOES DE FUNCIONALIDADES
  // ==========================================
```
Substitua por (insere uma nova seção entre as duas):
```typescript
  deleteTheme: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectTheme.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // MERGE (AREA E TEMA)
  // ==========================================

  previewAreaMerge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [source, target] = await Promise.all([
        ctx.db.projectArea.findUnique({ where: { id: input.sourceId }, include: { themes: true } }),
        ctx.db.projectArea.findUnique({ where: { id: input.targetId }, include: { themes: true } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Área não encontrada" });
      }

      const targetSlugs = new Map(target.themes.map((t) => [t.slug, t.name]));
      const collisions = source.themes
        .filter((t) => targetSlugs.has(t.slug))
        .map((t) => ({
          slug: t.slug,
          sourceThemeName: t.name,
          targetThemeName: targetSlugs.get(t.slug)!,
        }));

      const [projectCount, interviewCount, suggestionCount] = await Promise.all([
        ctx.db.project.count({ where: { areaId: input.sourceId } }),
        ctx.db.interview.count({ where: { areaId: input.sourceId } }),
        ctx.db.featureSuggestion.count({ where: { areaSlug: source.slug } }),
      ]);

      return {
        themeCount: source.themes.length,
        projectCount,
        interviewCount,
        suggestionCount,
        collisions,
      };
    }),

  mergeArea: adminProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma área de destino diferente da origem" });
      }
      const [source, target] = await Promise.all([
        ctx.db.projectArea.findUnique({ where: { id: input.sourceId }, include: { themes: true } }),
        ctx.db.projectArea.findUnique({ where: { id: input.targetId }, include: { themes: true } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Área não encontrada" });
      }

      const targetSlugs = new Set(target.themes.map((t) => t.slug));
      const collisions = source.themes.filter((t) => targetSlugs.has(t.slug));
      if (collisions.length > 0) {
        const names = collisions.map((t) => `"${t.name}"`).join(", ");
        throw new TRPCError({
          code: "CONFLICT",
          message: `Não é possível mesclar: os temas ${names} já existem na área de destino. Mescle ou renomeie esses temas primeiro.`,
        });
      }

      await ctx.db.$transaction([
        ctx.db.projectTheme.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.project.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.interview.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.featureSuggestion.updateMany({ where: { areaSlug: source.slug }, data: { areaSlug: target.slug } }),
        ctx.db.projectArea.delete({ where: { id: input.sourceId } }),
      ]);

      return { success: true };
    }),

  previewThemeMerge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectCount = await ctx.db.project.count({ where: { themeId: input.sourceId } });
      return { projectCount };
    }),

  mergeTheme: adminProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um tema de destino diferente da origem" });
      }
      const [source, target] = await Promise.all([
        ctx.db.projectTheme.findUnique({ where: { id: input.sourceId } }),
        ctx.db.projectTheme.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      }

      await ctx.db.$transaction([
        ctx.db.project.updateMany({
          where: { themeId: input.sourceId },
          data: { themeId: input.targetId, areaId: target.areaId },
        }),
        ctx.db.projectTheme.delete({ where: { id: input.sourceId } }),
      ]);

      return { success: true };
    }),

  // ==========================================
  // SUGESTOES DE FUNCIONALIDADES
  // ==========================================
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `taxonomy.router.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/routers/taxonomy.router.ts
git commit -m "feat: add area/theme merge procedures to taxonomy router"
```

---

## Task 2: Frontend — botões e diálogos de merge

**Files:**
- Modify: `src/app/(private)/admin/configuracoes/categorias/page.tsx`

- [ ] **Step 1: Adicionar imports (Select e ícone Merge)**

Encontre:
```tsx
import { Badge } from "@/src/shared/components/ui/badge";
import { Switch } from "@/src/shared/components/ui/switch";
import { Label } from "@/src/shared/components/ui/label";
import { useToast } from "@/src/shared/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  Lightbulb,
  Database,
  Wrench,
} from "lucide-react";
```
Substitua por:
```tsx
import { Badge } from "@/src/shared/components/ui/badge";
import { Switch } from "@/src/shared/components/ui/switch";
import { Label } from "@/src/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { useToast } from "@/src/shared/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Tag,
  Lightbulb,
  Database,
  Wrench,
  Merge,
} from "lucide-react";
```

- [ ] **Step 2: Adicionar estado e mutations de merge de Área**

Encontre:
```tsx
  // — TEMA —
  const [themeDialog, setThemeDialog] = useState<{ open: boolean; areaId?: string; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
```
Substitua por:
```tsx
  // — MESCLAR ÁREA —
  const [areaMergeDialog, setAreaMergeDialog] = useState<{ open: boolean; source?: AreaItem }>({ open: false });
  const [areaMergeTargetId, setAreaMergeTargetId] = useState<string>("");

  const { data: areaMergePreview } = trpc.taxonomy.previewAreaMerge.useQuery(
    { sourceId: areaMergeDialog.source?.id ?? "", targetId: areaMergeTargetId },
    { enabled: areaMergeDialog.open && !!areaMergeDialog.source && !!areaMergeTargetId }
  );

  const mergeArea = trpc.taxonomy.mergeArea.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllAreas.invalidate();
      utils.taxonomy.listAllSuggestions.invalidate();
      setAreaMergeDialog({ open: false });
      setAreaMergeTargetId("");
      toast({ title: "Área mesclada" });
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openMergeArea(area: AreaItem) {
    setAreaMergeTargetId("");
    setAreaMergeDialog({ open: true, source: area });
  }
  function confirmMergeArea() {
    if (!areaMergeDialog.source || !areaMergeTargetId) return;
    mergeArea.mutate({ sourceId: areaMergeDialog.source.id, targetId: areaMergeTargetId });
  }

  // — TEMA —
  const [themeDialog, setThemeDialog] = useState<{ open: boolean; areaId?: string; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
```

- [ ] **Step 3: Adicionar estado e mutations de merge de Tema**

Encontre:
```tsx
  // — SUGESTÕES —
  const { data: suggestions = [] } = trpc.taxonomy.listAllSuggestions.useQuery();
```
Substitua por:
```tsx
  // — MESCLAR TEMA —
  const [themeMergeDialog, setThemeMergeDialog] = useState<{ open: boolean; source?: { id: string; name: string } }>({ open: false });
  const [themeMergeTargetId, setThemeMergeTargetId] = useState<string>("");

  const { data: themeMergePreview } = trpc.taxonomy.previewThemeMerge.useQuery(
    { sourceId: themeMergeDialog.source?.id ?? "", targetId: themeMergeTargetId },
    { enabled: themeMergeDialog.open && !!themeMergeDialog.source && !!themeMergeTargetId }
  );

  const mergeTheme = trpc.taxonomy.mergeTheme.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllAreas.invalidate();
      setThemeMergeDialog({ open: false });
      setThemeMergeTargetId("");
      toast({ title: "Tema mesclado" });
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openMergeTheme(theme: { id: string; name: string }) {
    setThemeMergeTargetId("");
    setThemeMergeDialog({ open: true, source: theme });
  }
  function confirmMergeTheme() {
    if (!themeMergeDialog.source || !themeMergeTargetId) return;
    mergeTheme.mutate({ sourceId: themeMergeDialog.source.id, targetId: themeMergeTargetId });
  }

  // — SUGESTÕES —
  const { data: suggestions = [] } = trpc.taxonomy.listAllSuggestions.useQuery();
```

- [ ] **Step 4: Botão "Mesclar" na linha de cada Área**

Encontre:
```tsx
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={area.isActive}
                        onCheckedChange={(v) => toggleArea.mutate({ id: area.id, isActive: v })}
                        className="scale-90"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditArea(area)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm({ open: true, type: "area", id: area.id, label: area.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
```
Substitua por:
```tsx
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={area.isActive}
                        onCheckedChange={(v) => toggleArea.mutate({ id: area.id, isActive: v })}
                        className="scale-90"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditArea(area)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openMergeArea(area)}>
                        <Merge className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm({ open: true, type: "area", id: area.id, label: area.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
```

- [ ] **Step 5: Botão "Mesclar" em cada chip de Tema**

Encontre:
```tsx
                              <button onClick={() => openEditTheme(theme)} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ open: true, type: "theme", id: theme.id, label: theme.name })}
                                className="text-destructive/60 hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
```
Substitua por:
```tsx
                              <button onClick={() => openEditTheme(theme)} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button onClick={() => openMergeTheme(theme)} className="text-muted-foreground hover:text-foreground">
                                <Merge className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ open: true, type: "theme", id: theme.id, label: theme.name })}
                                className="text-destructive/60 hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
```

- [ ] **Step 6: Diálogo de merge de Área**

Encontre o fim do diálogo de Tema (logo antes do comentário "Dialog: Sugestão"):
```tsx
      </Dialog>

      {/* Dialog: Sugestão */}
```
Substitua por (insere um novo diálogo antes):
```tsx
      </Dialog>

      {/* Dialog: Mesclar Área */}
      <Dialog
        open={areaMergeDialog.open}
        onOpenChange={(o) => {
          setAreaMergeDialog({ open: o });
          if (!o) setAreaMergeTargetId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar &quot;{areaMergeDialog.source?.name}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mesclar com</Label>
              <Select value={areaMergeTargetId} onValueChange={setAreaMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a área de destino" />
                </SelectTrigger>
                <SelectContent>
                  {areas
                    .filter((a: AreaItem) => a.isActive && a.id !== areaMergeDialog.source?.id)
                    .map((a: AreaItem) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {areaMergeTargetId && areaMergePreview && (
              areaMergePreview.collisions.length > 0 ? (
                <p className="text-sm text-destructive">
                  Não é possível mesclar: os temas{" "}
                  {areaMergePreview.collisions.map((c) => `"${c.sourceThemeName}"`).join(", ")}{" "}
                  já existem na área de destino. Mescle ou renomeie esses temas primeiro.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Isso vai mover <strong>{areaMergePreview.themeCount} tema{areaMergePreview.themeCount !== 1 ? "s" : ""}</strong>,{" "}
                  <strong>{areaMergePreview.projectCount} projeto{areaMergePreview.projectCount !== 1 ? "s" : ""}</strong>,{" "}
                  <strong>{areaMergePreview.interviewCount} entrevista{areaMergePreview.interviewCount !== 1 ? "s" : ""}</strong> e{" "}
                  <strong>{areaMergePreview.suggestionCount} sugest{areaMergePreview.suggestionCount !== 1 ? "ões" : "ão"}</strong>
                  {" "}de &quot;{areaMergeDialog.source?.name}&quot; para &quot;
                  {areas.find((a: AreaItem) => a.id === areaMergeTargetId)?.name}&quot;. Essa ação não pode ser desfeita.
                </p>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaMergeDialog({ open: false })}>Cancelar</Button>
            <Button
              onClick={confirmMergeArea}
              disabled={
                !areaMergeTargetId ||
                !areaMergePreview ||
                areaMergePreview.collisions.length > 0 ||
                mergeArea.isPending
              }
            >
              Confirmar mesclagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Mesclar Tema */}
      <Dialog
        open={themeMergeDialog.open}
        onOpenChange={(o) => {
          setThemeMergeDialog({ open: o });
          if (!o) setThemeMergeTargetId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar &quot;{themeMergeDialog.source?.name}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Mesclar com</Label>
              <Select value={themeMergeTargetId} onValueChange={setThemeMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tema de destino" />
                </SelectTrigger>
                <SelectContent>
                  {areas
                    .flatMap((a: AreaItem) =>
                      a.themes
                        .filter((t: AreaItem["themes"][number]) => t.isActive && t.id !== themeMergeDialog.source?.id)
                        .map((t: AreaItem["themes"][number]) => ({ id: t.id, label: `${a.name} > ${t.name}` }))
                    )
                    .map((opt: { id: string; label: string }) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {themeMergeTargetId && themeMergePreview && (
              <p className="text-sm text-muted-foreground">
                Isso vai mover <strong>{themeMergePreview.projectCount} projeto{themeMergePreview.projectCount !== 1 ? "s" : ""}</strong>
                {" "}de &quot;{themeMergeDialog.source?.name}&quot; para o tema selecionado. Essa ação não pode ser desfeita.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeMergeDialog({ open: false })}>Cancelar</Button>
            <Button onClick={confirmMergeTheme} disabled={!themeMergeTargetId || mergeTheme.isPending}>
              Confirmar mesclagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Sugestão */}
```

- [ ] **Step 7: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `categorias/page.tsx`.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/admin/configuracoes/categorias/page.tsx"
git commit -m "feat: add merge dialogs for área and tema to admin categorias page"
```

---

## Task 3: Validação final

**Files:** nenhum (só validação)

- [ ] **Step 1: Type-check completo**

Run: `pnpm exec tsc --noEmit`
Expected: sem erros novos (os erros pré-existentes em `chart.tsx`/`input-otp.tsx`/`sidebar.tsx`/`toaster.tsx` continuam, não são deste plano).

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Revisão manual da lógica de merge**

Releia os 4 procedures em `taxonomy.router.ts` (Task 1) e confirme: `mergeArea` recalcula colisões no servidor mesmo que a UI já tenha checado (nunca confia só no client); a transação só roda se não houver colisão; `mergeTheme` atualiza `areaId` do projeto junto com `themeId` (pra manter consistência quando o tema de destino é de outra área); nenhum dos dois mutations deixa a área/tema de origem "pela metade" (a `$transaction` garante atomicidade — se qualquer passo falhar, nada é commitado).

- [ ] **Step 4: Não fazer push automaticamente**

Reporte os resultados — o controlador decide quando dar push pra `main`.
