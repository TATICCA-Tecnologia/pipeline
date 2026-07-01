"use client";

import { useState } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { useClients } from "@/shared/context/clients-context";
import { useProjects } from "@/shared/context/projects-context";
import { trpc } from "@/shared/trpc/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Building2,
  FolderKanban,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import type { User } from "@/shared/types";
import { ManageCompaniesDialog } from "./_components/manage-companies-dialog";

export default function ClientesPage() {
  const { clients, addClient, updateClient, deleteClient, refetch } = useClients();
  const { projects } = useProjects();
  const [search, setSearch] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true })
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [isManageCompaniesOpen, setIsManageCompaniesOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<User | null>(null);
  const [clientToDelete, setClientToDelete] = useState<User | null>(null);
  const [clientToPromote, setClientToPromote] = useState<User | null>(null);
  const [clientToResetPassword, setClientToResetPassword] = useState<User | null>(null);
  const [clientForCompanies, setClientForCompanies] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
  });

  const promoteMutation = trpc.user.promoteToSuperAdmin.useMutation({
    onSuccess: (promotedUser) => {
      toast.success(`${promotedUser.name} agora é Super Admin.`);
      refetch();
      setIsPromoteDialogOpen(false);
      setClientToPromote(null);
    },
    onError: (error) => {
      toast.error(`Erro ao promover: ${error.message}`);
    },
  });

  const resetPasswordMutation = trpc.user.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(`Senha de ${clientToResetPassword?.name} atualizada.`);
      setIsResetPasswordDialogOpen(false);
      setClientToResetPassword(null);
      setNewPassword("");
    },
    onError: (error) => {
      toast.error(`Erro ao redefinir senha: ${error.message}`);
    },
  });

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase()) ||
      (client.companies ?? []).some((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
  );

  const getClientProjectCount = (clientId: string) => {
    return projects.filter((p) => p.clientId === clientId).length;
  };

  const handleOpenDialog = (client?: User) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        email: client.email,
        company: client.company || "",
      });
    } else {
      setEditingClient(null);
      setFormData({ name: "", email: "", company: "" });
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.email) return;

    if (editingClient) {
      updateClient(editingClient.id, formData);
    } else {
      addClient(formData);
    }

    setIsDialogOpen(false);
    setFormData({ name: "", email: "", company: "" });
    setEditingClient(null);
  };

  const handleDelete = () => {
    if (clientToDelete) {
      deleteClient(clientToDelete.id);
      setIsDeleteDialogOpen(false);
      setClientToDelete(null);
    }
  };

  const confirmDelete = (client: User) => {
    setClientToDelete(client);
    setIsDeleteDialogOpen(true);
  };

  const confirmPromote = (client: User) => {
    setClientToPromote(client);
    setIsPromoteDialogOpen(true);
  };

  const handlePromote = () => {
    if (clientToPromote) {
      promoteMutation.mutate({ userId: clientToPromote.id });
    }
  };

  const openResetPasswordDialog = (client: User) => {
    setClientToResetPassword(client);
    setNewPassword("");
    setIsResetPasswordDialogOpen(true);
  };

  const openManageCompanies = (client: User) => {
    setClientForCompanies(client);
    setIsManageCompaniesOpen(true);
  };

  const handleResetPassword = () => {
    if (clientToResetPassword && newPassword.length >= 6) {
      resetPasswordMutation.mutate({
        userId: clientToResetPassword.id,
        newPassword,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Clientes
          </h1>
          <p className="text-muted-foreground">
            Gerencie os clientes cadastrados no sistema
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Clientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Com Projetos Ativos
            </CardTitle>
            <FolderKanban className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {clients.filter((c) => getClientProjectCount(c.id) > 0).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Novos este Mês
            </CardTitle>
            <Plus className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {
                clients.filter((c) => {
                  const now = new Date();
                  const clientDate = new Date(c.createdAt);
                  return (
                    clientDate.getMonth() === now.getMonth() &&
                    clientDate.getFullYear() === now.getFullYear()
                  );
                }).length
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Projetos</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Nenhum cliente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {client.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {client.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.companies && client.companies.length > 0 ? (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {client.companies.map((c) => c.name).join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getClientProjectCount(client.id)} projetos
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(client.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenDialog(client)}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openResetPasswordDialog(client)}
                          >
                            <KeyRound className="h-4 w-4 mr-2" />
                            Redefinir Senha
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openManageCompanies(client)}
                          >
                            <Building2 className="h-4 w-4 mr-2" />
                            Gerenciar Empresas
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => confirmPromote(client)}
                          >
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Promover a Super Admin
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => confirmDelete(client)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClient ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Empresa (opcional)</label>
              <Input
                value={formData.company}
                onChange={(e) =>
                  setFormData({ ...formData, company: e.target.value })
                }
                placeholder="Nome da empresa"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingClient ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja excluir o cliente{" "}
            <strong>{clientToDelete?.name}</strong>? Esta ação não pode ser
            desfeita.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promote to Super Admin Confirmation Dialog */}
      <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promover a Super Admin</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja promover{" "}
            <strong>{clientToPromote?.name}</strong> a Super Admin? Essa pessoa
            passará a ter acesso total ao sistema, incluindo a capacidade de
            visualizar e agir como qualquer outro perfil.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPromoteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handlePromote} disabled={promoteMutation.isPending}>
              {promoteMutation.isPending ? "Promovendo..." : "Promover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={isResetPasswordDialogOpen}
        onOpenChange={setIsResetPasswordDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">
              Nova senha para {clientToResetPassword?.name}
            </label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsResetPasswordDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending
                ? "Salvando..."
                : "Redefinir Senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageCompaniesDialog
        client={clientForCompanies}
        open={isManageCompaniesOpen}
        onOpenChange={setIsManageCompaniesOpen}
      />
    </div>
  );
}
