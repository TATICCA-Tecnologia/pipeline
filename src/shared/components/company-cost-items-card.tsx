"use client";

import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { useToast } from "@/src/shared/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/shared/utils";

/**
 * CRUD dos itens de custo de estrutura (`CompanyCostItem`: pessoas, licenças,
 * infraestrutura) de uma empresa. Componente autossuficiente — busca e grava
 * seus próprios dados a partir de `companyId` — porque é usado em dois lugares:
 * a página /admin/empresas/[id]/custos e a aba Payback da priorização, onde
 * esses custos entram na curva. Duplicar a tabela + dialog nos dois lugares era
 * a alternativa; um componente só evita que as duas telas divirjam.
 */

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CostItem = RouterOutputs["company"]["listCostItems"][number];

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface CompanyCostItemsCardProps {
  companyId: string;
  /** Texto opcional abaixo do título, para contextualizar em cada tela. */
  description?: string;
}

export function CompanyCostItemsCard({ companyId, description }: CompanyCostItemsCardProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.company.listCostItems.useQuery({ companyId });
  const { data: categories = [] } = trpc.taxonomy.listCostCategories.useQuery();

  const [dialog, setDialog] = useState<{ open: boolean; editing?: CostItem }>({ open: false });
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    type: "recorrente" as "recorrente" | "pontual",
    amountBRL: "",
    startDate: toDateInputValue(new Date()),
    endDate: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id?: string;
    label?: string;
  }>({ open: false });

  // Se o item sendo editado tem uma categoria que foi desativada depois (e por
  // isso não aparece mais em `categories`, que só lista ativas), injeta ela
  // mesmo assim na lista de opções — senão o Select mostraria o campo em
  // branco mesmo com `form.categoryId` preenchido, dando a impressão de que
  // nada está selecionado.
  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => ({ id: c.id, name: c.name }));
    if (dialog.editing && !opts.some((o) => o.id === dialog.editing!.categoryId)) {
      opts.push({ id: dialog.editing.categoryId, name: dialog.editing.category.name });
    }
    return opts;
  }, [categories, dialog.editing]);

  const invalidateAll = () => {
    utils.company.listCostItems.invalidate({ companyId });
    utils.company.getCostSummary.invalidate({ companyId });
  };

  const createMutation = trpc.company.createCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo criado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMutation = trpc.company.updateCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo atualizado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = trpc.company.deleteCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Item de custo removido" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setForm({
      name: "",
      categoryId: "",
      type: "recorrente",
      amountBRL: "",
      startDate: toDateInputValue(new Date()),
      endDate: "",
    });
    setDialog({ open: true });
  }

  function openEdit(item: CostItem) {
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      type: item.type as "recorrente" | "pontual",
      amountBRL: String(item.amountBRL),
      startDate: toDateInputValue(item.startDate),
      endDate: toDateInputValue(item.endDate),
    });
    setDialog({ open: true, editing: item });
  }

  function submit() {
    const payload = {
      categoryId: form.categoryId,
      name: form.name,
      type: form.type,
      amountBRL: parseFloat(form.amountBRL) || 0,
      startDate: new Date(form.startDate),
      endDate: form.type === "recorrente" && form.endDate ? new Date(form.endDate) : null,
    };
    if (dialog.editing) {
      updateMutation.mutate({ id: dialog.editing.id, ...payload });
    } else {
      createMutation.mutate({ companyId, ...payload });
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Itens de custo</CardTitle>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item de custo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Nenhum item de custo cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category.name}</TableCell>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.amountBRL)}
                      {item.type === "recorrente" ? "/mês" : ""}
                    </TableCell>
                    <TableCell>{formatDate(item.startDate)}</TableCell>
                    <TableCell>{item.endDate ? formatDate(item.endDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteConfirm({ open: true, id: item.id, label: item.name })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.editing ? "Editar item de custo" : "Novo item de custo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Analista RPA - João"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v as "recorrente" | "pontual" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente (mensal)</SelectItem>
                  <SelectItem value="pontual">Pontual (único)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.type === "recorrente" ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amountBRL}
                onChange={(e) => setForm((f) => ({ ...f, amountBRL: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            {form.type === "recorrente" && (
              <div className="space-y-1.5">
                <Label>Data de fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Vazio = custo em andamento.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={!form.name || !form.categoryId || !form.amountBRL || !form.startDate}
            >
              {dialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm.label}</strong>? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm.id) deleteMutation.mutate({ id: deleteConfirm.id });
                setDeleteConfirm({ open: false });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
