"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type AreaItem = RouterOutputs["taxonomy"]["listAllAreas"][number];
type SuggestionItem = RouterOutputs["taxonomy"]["listAllSuggestions"][number];
type MainToolItem = RouterOutputs["taxonomy"]["listAllMainTools"][number];
type ProjectKindItem = RouterOutputs["taxonomy"]["listAllProjectKinds"][number];
type CostCategoryItem = RouterOutputs["taxonomy"]["listAllCostCategories"][number];

import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Card, CardContent, CardHeader } from "@/src/shared/components/ui/card";
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
  Layers,
  Merge,
  Wallet,
} from "lucide-react";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export default function CategoriasPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: areas = [], isLoading } = trpc.taxonomy.listAllAreas.useQuery();

  const seedMutation = trpc.taxonomy.seedDefaults.useMutation({
    onSuccess: (res: { skipped?: boolean; seeded?: boolean }) => {
      if (res.skipped) {
        toast({ title: "Dados padrão já existem", description: "As categorias padrão já foram carregadas anteriormente." });
      } else {
        toast({ title: "Dados padrão carregados!", description: "As categorias e sugestões padrão foram criadas com sucesso." });
        utils.taxonomy.listAllAreas.invalidate();
        utils.taxonomy.listAllSuggestions.invalidate();
      }
    },
  });

  // — ÁREA —
  const [areaDialog, setAreaDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [areaForm, setAreaForm] = useState({ name: "", slug: "", order: 0 });

  const createArea = trpc.taxonomy.createArea.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); setAreaDialog({ open: false }); toast({ title: "Área criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateArea = trpc.taxonomy.updateArea.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); setAreaDialog({ open: false }); toast({ title: "Área atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteArea = trpc.taxonomy.deleteArea.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); toast({ title: "Área removida" }); },
  });
  const toggleArea = trpc.taxonomy.updateArea.useMutation({
    onSuccess: () => utils.taxonomy.listAllAreas.invalidate(),
  });

  function openNewArea() {
    setAreaForm({ name: "", slug: "", order: areas.length });
    setAreaDialog({ open: true });
  }
  function openEditArea(area: { id: string; name: string; slug: string; order: number }) {
    setAreaForm({ name: area.name, slug: area.slug, order: area.order });
    setAreaDialog({ open: true, editing: area });
  }
  function submitArea() {
    if (areaDialog.editing) {
      updateArea.mutate({ id: areaDialog.editing.id, name: areaForm.name, order: areaForm.order });
    } else {
      createArea.mutate({ name: areaForm.name, slug: areaForm.slug, order: areaForm.order });
    }
  }

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
  const [themeForm, setThemeForm] = useState({ name: "", slug: "", order: 0 });

  const createTheme = trpc.taxonomy.createTheme.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); setThemeDialog({ open: false }); toast({ title: "Tema criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateTheme = trpc.taxonomy.updateTheme.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); setThemeDialog({ open: false }); toast({ title: "Tema atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteTheme = trpc.taxonomy.deleteTheme.useMutation({
    onSuccess: () => { utils.taxonomy.listAllAreas.invalidate(); toast({ title: "Tema removido" }); },
  });
  const toggleTheme = trpc.taxonomy.updateTheme.useMutation({
    onSuccess: () => utils.taxonomy.listAllAreas.invalidate(),
  });

  function openNewTheme(areaId: string, currentCount: number) {
    void areas.find((a: AreaItem) => a.id === areaId);
    setThemeForm({ name: "", slug: "", order: currentCount });
    setThemeDialog({ open: true, areaId });
  }
  function openEditTheme(theme: { id: string; name: string; slug: string; order: number }) {
    setThemeForm({ name: theme.name, slug: theme.slug, order: theme.order });
    setThemeDialog({ open: true, editing: theme });
  }
  function submitTheme() {
    if (themeDialog.editing) {
      updateTheme.mutate({ id: themeDialog.editing.id, name: themeForm.name, order: themeForm.order });
    } else if (themeDialog.areaId) {
      createTheme.mutate({ areaId: themeDialog.areaId, name: themeForm.name, slug: themeForm.slug, order: themeForm.order });
    }
  }

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
  const [suggDialog, setSuggDialog] = useState<{ open: boolean; areaSlug?: string; editing?: { id: string; label: string; areaSlug: string; order: number } }>({ open: false });
  const [suggForm, setSuggForm] = useState({ label: "", areaSlug: "", order: 0 });

  const createSugg = trpc.taxonomy.createSuggestion.useMutation({
    onSuccess: () => { utils.taxonomy.listAllSuggestions.invalidate(); setSuggDialog({ open: false }); toast({ title: "Sugestão criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateSugg = trpc.taxonomy.updateSuggestion.useMutation({
    onSuccess: () => { utils.taxonomy.listAllSuggestions.invalidate(); setSuggDialog({ open: false }); toast({ title: "Sugestão atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteSugg = trpc.taxonomy.deleteSuggestion.useMutation({
    onSuccess: () => utils.taxonomy.listAllSuggestions.invalidate(),
  });
  const toggleSugg = trpc.taxonomy.updateSuggestion.useMutation({
    onSuccess: () => utils.taxonomy.listAllSuggestions.invalidate(),
  });

  function openNewSugg(areaSlug: string) {
    const count = suggestions.filter((s: SuggestionItem) => s.areaSlug === areaSlug).length;
    setSuggForm({ label: "", areaSlug, order: count });
    setSuggDialog({ open: true, areaSlug });
  }
  function openEditSugg(s: { id: string; label: string; areaSlug: string; order: number }) {
    setSuggForm({ label: s.label, areaSlug: s.areaSlug, order: s.order });
    setSuggDialog({ open: true, editing: s });
  }
  function submitSugg() {
    if (suggDialog.editing) {
      updateSugg.mutate({ id: suggDialog.editing.id, label: suggForm.label, order: suggForm.order });
    } else {
      createSugg.mutate({ label: suggForm.label, areaSlug: suggForm.areaSlug, order: suggForm.order });
    }
  }

  // — FERRAMENTAS PRINCIPAIS —
  const { data: mainTools = [] } = trpc.taxonomy.listAllMainTools.useQuery();
  const [mainToolDialog, setMainToolDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [mainToolForm, setMainToolForm] = useState({ name: "", slug: "", order: 0 });

  const createMainTool = trpc.taxonomy.createMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); setMainToolDialog({ open: false }); toast({ title: "Ferramenta criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMainTool = trpc.taxonomy.updateMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); setMainToolDialog({ open: false }); toast({ title: "Ferramenta atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMainTool = trpc.taxonomy.deleteMainTool.useMutation({
    onSuccess: () => { utils.taxonomy.listAllMainTools.invalidate(); toast({ title: "Ferramenta removida" }); },
  });
  const toggleMainTool = trpc.taxonomy.updateMainTool.useMutation({
    onSuccess: () => utils.taxonomy.listAllMainTools.invalidate(),
  });

  function openNewMainTool() {
    setMainToolForm({ name: "", slug: "", order: mainTools.length });
    setMainToolDialog({ open: true });
  }
  function openEditMainTool(tool: { id: string; name: string; slug: string; order: number }) {
    setMainToolForm({ name: tool.name, slug: tool.slug, order: tool.order });
    setMainToolDialog({ open: true, editing: tool });
  }
  function submitMainTool() {
    if (mainToolDialog.editing) {
      updateMainTool.mutate({ id: mainToolDialog.editing.id, name: mainToolForm.name, order: mainToolForm.order });
    } else {
      createMainTool.mutate({ name: mainToolForm.name, slug: mainToolForm.slug, order: mainToolForm.order });
    }
  }

  // — TIPOS DE PROJETO —
  const { data: projectKinds = [] } = trpc.taxonomy.listAllProjectKinds.useQuery();
  const [projectKindDialog, setProjectKindDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [projectKindForm, setProjectKindForm] = useState({ name: "", slug: "", order: 0 });

  const createProjectKind = trpc.taxonomy.createProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de solução criado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); setProjectKindDialog({ open: false }); toast({ title: "Tipo de solução atualizado" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteProjectKind = trpc.taxonomy.deleteProjectKind.useMutation({
    onSuccess: () => { utils.taxonomy.listAllProjectKinds.invalidate(); toast({ title: "Tipo de solução removido" }); },
  });
  const toggleProjectKind = trpc.taxonomy.updateProjectKind.useMutation({
    onSuccess: () => utils.taxonomy.listAllProjectKinds.invalidate(),
  });

  function openNewProjectKind() {
    setProjectKindForm({ name: "", slug: "", order: projectKinds.length });
    setProjectKindDialog({ open: true });
  }
  function openEditProjectKind(kind: { id: string; name: string; slug: string; order: number }) {
    setProjectKindForm({ name: kind.name, slug: kind.slug, order: kind.order });
    setProjectKindDialog({ open: true, editing: kind });
  }
  function submitProjectKind() {
    if (projectKindDialog.editing) {
      updateProjectKind.mutate({ id: projectKindDialog.editing.id, name: projectKindForm.name, order: projectKindForm.order });
    } else {
      createProjectKind.mutate({ name: projectKindForm.name, slug: projectKindForm.slug, order: projectKindForm.order });
    }
  }

  // — CATEGORIAS DE CUSTO —
  const { data: costCategories = [] } = trpc.taxonomy.listAllCostCategories.useQuery();
  const [costCategoryDialog, setCostCategoryDialog] = useState<{ open: boolean; editing?: { id: string; name: string; slug: string; order: number } }>({ open: false });
  const [costCategoryForm, setCostCategoryForm] = useState({ name: "", slug: "", order: 0 });

  const createCostCategory = trpc.taxonomy.createCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); setCostCategoryDialog({ open: false }); toast({ title: "Categoria de custo criada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateCostCategory = trpc.taxonomy.updateCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); setCostCategoryDialog({ open: false }); toast({ title: "Categoria de custo atualizada" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteCostCategory = trpc.taxonomy.deleteCostCategory.useMutation({
    onSuccess: () => { utils.taxonomy.listAllCostCategories.invalidate(); toast({ title: "Categoria de custo removida" }); },
    onError: (e: { message: string }) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const toggleCostCategory = trpc.taxonomy.updateCostCategory.useMutation({
    onSuccess: () => utils.taxonomy.listAllCostCategories.invalidate(),
  });

  function openNewCostCategory() {
    setCostCategoryForm({ name: "", slug: "", order: costCategories.length });
    setCostCategoryDialog({ open: true });
  }
  function openEditCostCategory(cat: { id: string; name: string; slug: string; order: number }) {
    setCostCategoryForm({ name: cat.name, slug: cat.slug, order: cat.order });
    setCostCategoryDialog({ open: true, editing: cat });
  }
  function submitCostCategory() {
    if (costCategoryDialog.editing) {
      updateCostCategory.mutate({ id: costCategoryDialog.editing.id, name: costCategoryForm.name, order: costCategoryForm.order });
    } else {
      createCostCategory.mutate({ name: costCategoryForm.name, slug: costCategoryForm.slug, order: costCategoryForm.order });
    }
  }

  // — DELETE CONFIRM —
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type?: "area" | "theme" | "suggestion" | "mainTool" | "projectKind" | "costCategory"; id?: string; label?: string }>({ open: false });

  function confirmDelete() {
    if (!deleteConfirm.id || !deleteConfirm.type) return;
    if (deleteConfirm.type === "area") deleteArea.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "theme") deleteTheme.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "suggestion") deleteSugg.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "mainTool") deleteMainTool.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "projectKind") deleteProjectKind.mutate({ id: deleteConfirm.id });
    if (deleteConfirm.type === "costCategory") deleteCostCategory.mutate({ id: deleteConfirm.id });
    setDeleteConfirm({ open: false });
  }

  // — EXPANDED AREAS —
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Carregando categorias...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorias e Temas</h1>
          <p className="text-muted-foreground text-sm">
            Configure as áreas, temas e sugestões de funcionalidades exibidos no formulário de solicitação.
          </p>
        </div>
        <div className="flex gap-2">
          {areas.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Database className="mr-2 h-4 w-4" />
              Carregar padrões
            </Button>
          )}
          <Button onClick={openNewArea}>
            <Plus className="mr-2 h-4 w-4" />
            Nova área
          </Button>
        </div>
      </div>

      {areas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Tag className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Nenhuma área cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique em "Carregar padrões" para usar as categorias padrão do sistema ou crie suas próprias.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {areas.map((area: AreaItem) => {
            const areaSuggestions = suggestions.filter((s: SuggestionItem) => s.areaSlug === area.slug);
            const isOpen = expanded[area.id] ?? false;
            return (
              <Card key={area.id} className={!area.isActive ? "opacity-60" : undefined}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(area.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-semibold">{area.name}</span>
                      <Badge variant="secondary" className="text-xs">{area.slug}</Badge>
                      {!area.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">Inativa</Badge>}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {area.themes.length} tema{area.themes.length !== 1 ? "s" : ""}
                        {" · "}
                        {areaSuggestions.length} sugestão{areaSuggestions.length !== 1 ? "ões" : ""}
                      </span>
                    </button>
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
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="px-4 pb-4 space-y-4">
                    {/* Temas */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" />
                          Temas
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => openNewTheme(area.id, area.themes.length)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Novo tema
                        </Button>
                      </div>
                      {area.themes.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhum tema cadastrado.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {area.themes.map((theme: AreaItem["themes"][number]) => (
                            <div
                              key={theme.id}
                              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!theme.isActive ? "opacity-50" : ""}`}
                            >
                              <span>{theme.name}</span>
                              <Switch
                                checked={theme.isActive}
                                onCheckedChange={(v) => toggleTheme.mutate({ id: theme.id, isActive: v })}
                                className="scale-75"
                              />
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
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Sugestões de funcionalidades */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5" />
                          Sugestões de funcionalidades
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => openNewSugg(area.slug)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Nova sugestão
                        </Button>
                      </div>
                      {areaSuggestions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nenhuma sugestão cadastrada.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {areaSuggestions.map((s: SuggestionItem) => (
                            <div
                              key={s.id}
                              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${!s.isActive ? "opacity-50" : "bg-muted/40"}`}
                            >
                              <span>{s.label}</span>
                              <Switch
                                checked={s.isActive}
                                onCheckedChange={(v) => toggleSugg.mutate({ id: s.id, isActive: v })}
                                className="scale-75"
                              />
                              <button onClick={() => openEditSugg(s)} className="text-muted-foreground hover:text-foreground">
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm({ open: true, type: "suggestion", id: s.id, label: s.label })}
                                className="text-destructive/60 hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Ferramentas principais */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ferramentas principais</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Ferramenta principal&quot; na tela de arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewMainTool}>
            <Plus className="mr-2 h-4 w-4" />
            Nova ferramenta
          </Button>
        </div>
        {mainTools.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Wrench className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma ferramenta cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {mainTools.map((tool: MainToolItem) => (
                <div
                  key={tool.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!tool.isActive ? "opacity-50" : ""}`}
                >
                  <span>{tool.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{tool.slug}</Badge>
                  <Switch
                    checked={tool.isActive}
                    onCheckedChange={(v) => toggleMainTool.mutate({ id: tool.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditMainTool(tool)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "mainTool", id: tool.id, label: tool.name })}
                    className="text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tipos de Projeto */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tipos de Solução</h2>
            <p className="text-sm text-muted-foreground">
              Opções do campo &quot;Tipo de Solução&quot; na tela de arquitetura.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewProjectKind}>
            <Plus className="mr-2 h-4 w-4" />
            Novo tipo de solução
          </Button>
        </div>
        {projectKinds.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Layers className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum tipo de solução cadastrado</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {projectKinds.map((kind: ProjectKindItem) => (
                <div
                  key={kind.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!kind.isActive ? "opacity-50" : ""}`}
                >
                  <span>{kind.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{kind.slug}</Badge>
                  <Switch
                    checked={kind.isActive}
                    onCheckedChange={(v) => toggleProjectKind.mutate({ id: kind.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditProjectKind(kind)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "projectKind", id: kind.id, label: kind.name })}
                    className="text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Categorias de custo */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Categorias de custo</h2>
            <p className="text-sm text-muted-foreground">
              Categorias usadas nos itens de custo em &quot;Custos e Estrutura&quot; de cada empresa.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewCostCategory}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </Button>
        </div>
        {costCategories.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-10 text-center">
            <Wallet className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma categoria de custo cadastrada</p>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-4">
              {costCategories.map((cat: CostCategoryItem) => (
                <div
                  key={cat.id}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${!cat.isActive ? "opacity-50" : ""}`}
                >
                  <span>{cat.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{cat.slug}</Badge>
                  <Switch
                    checked={cat.isActive}
                    onCheckedChange={(v) => toggleCostCategory.mutate({ id: cat.id, isActive: v })}
                    className="scale-75"
                  />
                  <button onClick={() => openEditCostCategory(cat)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ open: true, type: "costCategory", id: cat.id, label: cat.name })}
                    className="text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog: Área */}
      <Dialog open={areaDialog.open} onOpenChange={(o) => setAreaDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{areaDialog.editing ? "Editar área" : "Nova área"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={areaForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setAreaForm((f) => ({
                    ...f,
                    name,
                    slug: areaDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Contabilidade"
              />
            </div>
            {!areaDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={areaForm.slug}
                  onChange={(e) => setAreaForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: contabilidade"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={areaForm.order}
                onChange={(e) => setAreaForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAreaDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitArea} disabled={!areaForm.name || (!areaDialog.editing && !areaForm.slug)}>
              {areaDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tema */}
      <Dialog open={themeDialog.open} onOpenChange={(o) => setThemeDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{themeDialog.editing ? "Editar tema" : "Novo tema"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={themeForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setThemeForm((f) => ({
                    ...f,
                    name,
                    slug: themeDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Gestão fiscal"
              />
            </div>
            {!themeDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={themeForm.slug}
                  onChange={(e) => setThemeForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: gestao-fiscal"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={themeForm.order}
                onChange={(e) => setThemeForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitTheme} disabled={!themeForm.name || (!themeDialog.editing && !themeForm.slug)}>
              {themeDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
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
            {areaMergeTargetId && !areaMergePreview && (
              <p className="text-sm text-muted-foreground">Calculando impacto...</p>
            )}
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
            {themeMergeTargetId && !themeMergePreview && (
              <p className="text-sm text-muted-foreground">Calculando impacto...</p>
            )}
            {themeMergeTargetId && themeMergePreview && (
              <p className="text-sm text-muted-foreground">
                Isso vai mover <strong>{themeMergePreview.projectCount} projeto{themeMergePreview.projectCount !== 1 ? "s" : ""}</strong>
                {" "}de &quot;{themeMergeDialog.source?.name}&quot; para o tema selecionado. Essa ação não pode ser desfeita.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setThemeMergeDialog({ open: false })}>Cancelar</Button>
            <Button onClick={confirmMergeTheme} disabled={!themeMergeTargetId || !themeMergePreview || mergeTheme.isPending}>
              Confirmar mesclagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Sugestão */}
      <Dialog open={suggDialog.open} onOpenChange={(o) => setSuggDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{suggDialog.editing ? "Editar sugestão" : "Nova sugestão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Texto da sugestão</Label>
              <Input
                value={suggForm.label}
                onChange={(e) => setSuggForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Login e cadastro de usuários"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={suggForm.order}
                onChange={(e) => setSuggForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitSugg} disabled={!suggForm.label}>
              {suggDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ferramenta principal */}
      <Dialog open={mainToolDialog.open} onOpenChange={(o) => setMainToolDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mainToolDialog.editing ? "Editar ferramenta" : "Nova ferramenta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={mainToolForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setMainToolForm((f) => ({
                    ...f,
                    name,
                    slug: mainToolDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: UiPath"
              />
            </div>
            {!mainToolDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={mainToolForm.slug}
                  onChange={(e) => setMainToolForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: uipath"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={mainToolForm.order}
                onChange={(e) => setMainToolForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMainToolDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitMainTool} disabled={!mainToolForm.name || (!mainToolDialog.editing && !mainToolForm.slug)}>
              {mainToolDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Tipo de Projeto */}
      <Dialog open={projectKindDialog.open} onOpenChange={(o) => setProjectKindDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{projectKindDialog.editing ? "Editar tipo de solução" : "Novo tipo de solução"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={projectKindForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setProjectKindForm((f) => ({
                    ...f,
                    name,
                    slug: projectKindDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Automação"
              />
            </div>
            {!projectKindDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={projectKindForm.slug}
                  onChange={(e) => setProjectKindForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: automacao"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={projectKindForm.order}
                onChange={(e) => setProjectKindForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectKindDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitProjectKind} disabled={!projectKindForm.name || (!projectKindDialog.editing && !projectKindForm.slug)}>
              {projectKindDialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Categoria de custo */}
      <Dialog open={costCategoryDialog.open} onOpenChange={(o) => setCostCategoryDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{costCategoryDialog.editing ? "Editar categoria de custo" : "Nova categoria de custo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={costCategoryForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCostCategoryForm((f) => ({
                    ...f,
                    name,
                    slug: costCategoryDialog.editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Ex: Suporte técnico"
              />
            </div>
            {!costCategoryDialog.editing && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={costCategoryForm.slug}
                  onChange={(e) => setCostCategoryForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="Ex: suporte-tecnico"
                />
                <p className="text-xs text-muted-foreground">Identificador único. Não pode ser alterado após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={costCategoryForm.order}
                onChange={(e) => setCostCategoryForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCostCategoryDialog({ open: false })}>Cancelar</Button>
            <Button onClick={submitCostCategory} disabled={!costCategoryForm.name || (!costCategoryDialog.editing && !costCategoryForm.slug)}>
              {costCategoryDialog.editing ? "Salvar" : "Criar"}
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
    </div>
  );
}
