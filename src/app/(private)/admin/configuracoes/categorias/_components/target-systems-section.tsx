"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type TargetSystemCategoryItem = RouterOutputs["taxonomy"]["listAllTargetSystemCategories"][number];
type TargetSystemItem = RouterOutputs["taxonomy"]["listAllTargetSystems"][number];

import { Button } from "@/src/shared/components/ui/button";
import { MergeSuggestions } from "@/src/shared/components/merge-suggestions";
import { Input } from "@/src/shared/components/ui/input";
import { Card, CardContent } from "@/src/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
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
import { Plus, Pencil, Trash2, Network, Server } from "lucide-react";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const NO_CATEGORY_VALUE = "__none__";

/**
 * Admin do catálogo de sistemas-alvo: os sistemas e sites sobre os quais as
 * automações atuam (SAP, Protheus, portal da Receita...), agrupados por
 * categoria. Eixo distinto de `MainToolCategory`/`MainTool` — aquele é a
 * ferramenta com que a solução foi construída, este é o sistema sobre o qual
 * ela age.
 *
 * Componente à parte (em vez de inline em `page.tsx`, que já tem >1500
 * linhas) carregando o próprio estado, mutations e dialogs — mesma convenção
 * de `_components/` usada em outras telas de admin do repositório.
 */
export function TargetSystemsSection() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // — CATEGORIAS DE SISTEMA —
  const { data: categories = [] } = trpc.taxonomy.listAllTargetSystemCategories.useQuery();
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", order: 0 });

  // As quatro invalidam também `listAllTargetSystems`: o nome/remoção de uma
  // categoria muda o badge de categoria exibido em cada sistema (e apagar uma
  // categoria vira `categoryId: null` via SetNull nos sistemas dela), então a
  // lista de sistemas ficaria com dado obsoleto até um refetch acidental.
  const createCategory = trpc.taxonomy.createTargetSystemCategory.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllTargetSystemCategories.invalidate();
      utils.taxonomy.listAllTargetSystems.invalidate();
      setCategoryDialog({ open: false });
      toast({ title: "Categoria de sistema criada" });
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateCategory = trpc.taxonomy.updateTargetSystemCategory.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllTargetSystemCategories.invalidate();
      utils.taxonomy.listAllTargetSystems.invalidate();
      setCategoryDialog({ open: false });
      toast({ title: "Categoria de sistema atualizada" });
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteCategory = trpc.taxonomy.deleteTargetSystemCategory.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllTargetSystemCategories.invalidate();
      utils.taxonomy.listAllTargetSystems.invalidate();
      toast({ title: "Categoria de sistema removida" });
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const toggleCategory = trpc.taxonomy.updateTargetSystemCategory.useMutation({
    onSuccess: () => {
      utils.taxonomy.listAllTargetSystemCategories.invalidate();
      utils.taxonomy.listAllTargetSystems.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openNewCategory() {
    setCategoryForm({ name: "", slug: "", order: categories.length });
    setCategoryDialog({ open: true });
  }
  function openEditCategory(cat: { id: string; name: string; slug: string; order: number }) {
    setCategoryForm({ name: cat.name, slug: cat.slug, order: cat.order });
    setCategoryDialog({ open: true, editing: cat });
  }
  function submitCategory() {
    if (categoryDialog.editing) {
      updateCategory.mutate({ id: categoryDialog.editing.id, name: categoryForm.name, order: categoryForm.order });
    } else {
      createCategory.mutate({ name: categoryForm.name, slug: categoryForm.slug, order: categoryForm.order });
    }
  }

  // — SISTEMAS —
  const { data: systems = [] } = trpc.taxonomy.listAllTargetSystems.useQuery();
  const [systemDialog, setSystemDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number; categoryId: string | null } }>({ open: false });
  const [systemForm, setSystemForm] = useState({ name: "", slug: "", order: 0, categoryId: "" });

  const createSystem = trpc.taxonomy.createTargetSystem.useMutation({
    onSuccess: () => { utils.taxonomy.listAllTargetSystems.invalidate(); setSystemDialog({ open: false }); toast({ title: "Sistema criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateSystem = trpc.taxonomy.updateTargetSystem.useMutation({
    onSuccess: () => { utils.taxonomy.listAllTargetSystems.invalidate(); setSystemDialog({ open: false }); toast({ title: "Sistema atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteSystem = trpc.taxonomy.deleteTargetSystem.useMutation({
    onSuccess: () => { utils.taxonomy.listAllTargetSystems.invalidate(); toast({ title: "Sistema removido" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const toggleSystem = trpc.taxonomy.updateTargetSystem.useMutation({
    onSuccess: () => utils.taxonomy.listAllTargetSystems.invalidate(),
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openNewSystem() {
    setSystemForm({ name: "", slug: "", order: systems.length, categoryId: "" });
    setSystemDialog({ open: true });
  }
  function openEditSystem(system: { id: string; name: string; slug: string; order: number; categoryId: string | null }) {
    setSystemForm({ name: system.name, slug: system.slug, order: system.order, categoryId: system.categoryId ?? "" });
    setSystemDialog({ open: true, editing: system });
  }
  function submitSystem() {
    if (systemDialog.editing) {
      updateSystem.mutate({
        id: systemDialog.editing.id,
        name: systemForm.name,
        order: systemForm.order,
        categoryId: systemForm.categoryId || null,
      });
    } else {
      createSystem.mutate({
        name: systemForm.name,
        slug: systemForm.slug,
        order: systemForm.order,
        categoryId: systemForm.categoryId || null,
      });
    }
  }

  // — DELETE CONFIRM —
  // Estado próprio, separado do `deleteConfirm` de `page.tsx`: este
  // componente cuida do seu próprio recorte da tela, sem tocar no union da
  // página-mãe.
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "targetSystemCategory" | "targetSystem"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "targetSystemCategory") deleteCategory.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "targetSystem") deleteSystem.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }

  return (
    <>
      {/* Categorias de Sistema */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Categorias de Sistema</h2>
            <p className="text-sm text-muted-foreground">
              Agrupam os sistemas em que as automações atuam (ex.: &quot;ERP&quot; agrupa SAP, Protheus...).
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewCategory}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </Button>
        </div>
        <MergeSuggestions
          records={categories}
          type="targetSystemCategory"
          label="categoria de sistema"
          onMerged={() => {
            utils.taxonomy.listAllTargetSystemCategories.invalidate();
            utils.taxonomy.listAllTargetSystems.invalidate();
          }}
        />
        {categories.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Network className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma categoria de sistema cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {categories.map((cat: TargetSystemCategoryItem) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!cat.isActive ? "opacity-50" : ""}`}
                >
                  <span>{cat.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{cat.slug}</Badge>
                  <Switch
                    checked={cat.isActive}
                    onCheckedChange={(v) => toggleCategory.mutate({ id: cat.id, isActive: v })}
                    className="scale-75"
                  />
                  <button
                    onClick={() => openEditCategory(cat)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Editar ${cat.name}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "targetSystemCategory", id: cat.id, label: cat.name })}
                    className="text-destructive/60 hover:text-destructive"
                    aria-label={`Remover ${cat.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sistemas em que as automações atuam */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sistemas em que as automações atuam</h2>
            <p className="text-sm text-muted-foreground">
              Ex.: SAP dentro de ERP — os sistemas e sites sobre os quais os robôs agem, não a ferramenta com que foram construídos.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewSystem}>
            <Plus className="mr-2 h-4 w-4" />
            Novo sistema
          </Button>
        </div>
        <MergeSuggestions
          records={systems}
          type="targetSystem"
          label="sistema"
          onMerged={() => utils.taxonomy.listAllTargetSystems.invalidate()}
        />
        {systems.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Server className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum sistema cadastrado</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {systems.map((system: TargetSystemItem) => (
                <div
                  key={system.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!system.isActive ? "opacity-50" : ""}`}
                >
                  <span>{system.name}</span>
                  {system.category && (
                    <Badge variant="outline" className="text-[10px]">{system.category.name}</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">{system.slug}</Badge>
                  <Switch
                    checked={system.isActive}
                    onCheckedChange={(v) => toggleSystem.mutate({ id: system.id, isActive: v })}
                    className="scale-75"
                  />
                  <button
                    onClick={() => openEditSystem(system)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Editar ${system.name}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "targetSystem", id: system.id, label: system.name })}
                    className="text-destructive/60 hover:text-destructive"
                    aria-label={`Remover ${system.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Categoria de Sistema */}
      <Dialog open={categoryDialog.open} onOpenChange={(o) => setCategoryDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog.editing ? "Editar categoria de sistema" : "Nova categoria de sistema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCategoryForm((f) => ({
                    ...f,
                    name,
                    slug: categoryDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: ERP"
              />
            </div>
            {!categoryDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={categoryForm.slug}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: erp"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={categoryForm.order}
                onChange={(e) => setCategoryForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitCategory} disabled={!categoryForm.name || (!categoryDialog.editing && !categoryForm.slug)}>
              {categoryDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Sistema */}
      <Dialog open={systemDialog.open} onOpenChange={(o) => setSystemDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{systemDialog.editing ? "Editar sistema" : "Novo sistema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={systemForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setSystemForm((f) => ({
                    ...f,
                    name,
                    slug: systemDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: SAP"
              />
            </div>
            {!systemDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={systemForm.slug}
                  onChange={(e) => setSystemForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: sap"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={systemForm.categoryId || NO_CATEGORY_VALUE}
                onValueChange={(v) =>
                  setSystemForm((f) => ({ ...f, categoryId: v === NO_CATEGORY_VALUE ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY_VALUE}>Sem categoria</SelectItem>
                  {categories.map((cat: TargetSystemCategoryItem) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={systemForm.order}
                onChange={(e) => setSystemForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSystemDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitSystem} disabled={!systemForm.name || (!systemDialog.editing && !systemForm.slug)}>
              {systemDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => setDeleteConfirm({ open: o })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm.label}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
