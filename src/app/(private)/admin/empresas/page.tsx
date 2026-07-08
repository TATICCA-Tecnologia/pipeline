"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent } from "@/src/shared/components/ui/card";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Switch } from "@/src/shared/components/ui/switch";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { useToast } from "@/src/shared/hooks/use-toast";
import { Building2, Plus, Search, Pencil, ListOrdered, Users, Download } from "lucide-react";
import Link from "next/link";
import { getTrpcUserId } from "@/shared/trpc/auth-header";

const EMPTY_FORM = { name: "", document: "", email: "", phone: "" };

export default function EmpresasPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: companies = [], isLoading } = trpc.company.listAll.useQuery();

  const [search, setSearch] = useState("");
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; editingId?: string }>({
    open: false,
  });
  const [form, setForm] = useState(EMPTY_FORM);

  const createMutation = trpc.company.create.useMutation({
    onSuccess: () => {
      utils.company.listAll.invalidate();
      utils.company.list.invalidate();
      setDialog({ open: false });
      toast({ title: "Empresa criada" });
    },
    onError: (error) =>
      toast({ title: "Erro ao criar empresa", description: error.message, variant: "destructive" }),
  });

  const updateMutation = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.listAll.invalidate();
      utils.company.list.invalidate();
      setDialog({ open: false });
      toast({ title: "Empresa atualizada" });
    },
    onError: (error) =>
      toast({ title: "Erro ao salvar empresa", description: error.message, variant: "destructive" }),
  });

  const toggleActiveMutation = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.listAll.invalidate();
      utils.company.list.invalidate();
    },
    onError: (error) =>
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" }),
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setDialog({ open: true });
  }

  function openEdit(company: (typeof companies)[number]) {
    setForm({
      name: company.name,
      document: company.document,
      email: company.email,
      phone: company.phone,
    });
    setDialog({ open: true, editingId: company.id });
  }

  function submit() {
    if (dialog.editingId) {
      updateMutation.mutate({ id: dialog.editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  }

  // Download do deck consolidado (.pptx). A rota /api/empresas/[id]/deck exige
  // o header x-user-id (mesma auth do resto do app), que uma navegação simples
  // de <a href> não incluiria — por isso fazemos um fetch manual com o header,
  // convertemos em blob e disparamos o download por um link temporário.
  async function handleExportDeck(company: (typeof companies)[number]) {
    setExportingId(company.id);
    try {
      const response = await fetch(`/api/empresas/${company.id}/deck`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `diagnostico-${company.name}.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erro ao exportar diagnóstico",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setExportingId(null);
    }
  }

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Empresas
          </h1>
          <p className="text-muted-foreground">
            Cadastro central de empresas, independente de clientes vinculados
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar empresas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Clientes</TableHead>
                <TableHead>Projetos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Carregando empresas...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhuma empresa encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((company) => (
                  <TableRow key={company.id} className={!company.isActive ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.document || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.email || company.phone ? (
                        <div className="space-y-0.5">
                          {company.email && <p className="truncate">{company.email}</p>}
                          {company.phone && <p>{company.phone}</p>}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{company.usersCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{company.projectsCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={company.isActive}
                        onCheckedChange={(v) =>
                          toggleActiveMutation.mutate({ id: company.id, isActive: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/empresas/${company.id}/priorizacao`}>
                          <Button size="icon" variant="ghost" title="Priorização">
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/admin/empresas/${company.id}/entrevistas`}>
                          <Button size="icon" variant="ghost" title="Entrevistas">
                            <Users className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Exportar diagnóstico completo (.pptx)"
                          disabled={exportingId === company.id}
                          onClick={() => handleExportDeck(company)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(company)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Local Frio"
              />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ/CPF</Label>
              <Input
                value={form.document}
                onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {dialog.editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
