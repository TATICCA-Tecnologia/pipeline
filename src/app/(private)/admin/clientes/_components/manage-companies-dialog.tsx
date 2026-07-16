"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import { toast } from "sonner";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { Badge } from "@/src/shared/components/ui/badge";
import { X, Plus } from "lucide-react";
import type { User } from "@/shared/types";
import { useDemoMode } from "@/shared/context/demo-mode-context";

interface ManageCompaniesDialogProps {
  client: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCompaniesDialog({
  client,
  open,
  onOpenChange,
}: ManageCompaniesDialogProps) {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const { maskPersonName, maskCompanyName } = useDemoMode();

  const { data: userCompanies = [], refetch: refetchUserCompanies } =
    trpc.user.listCompaniesForUser.useQuery(
      { userId: client?.id ?? "" },
      { enabled: open && !!client?.id }
    );
  const { data: allCompanies = [] } = trpc.company.list.useQuery(undefined, {
    enabled: open,
  });

  const addMutation = trpc.user.addCompanyToUser.useMutation({
    onSuccess: () => {
      refetchUserCompanies();
      utils.user.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao vincular empresa: ${error.message}`),
  });

  const removeMutation = trpc.user.removeCompanyFromUser.useMutation({
    onSuccess: () => {
      refetchUserCompanies();
      utils.user.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao remover empresa: ${error.message}`),
  });

  const createMutation = trpc.company.create.useMutation({
    onSuccess: (company) => {
      if (client) addMutation.mutate({ userId: client.id, companyId: company.id });
      utils.company.list.invalidate();
      setSearch("");
    },
    onError: (error) => toast.error(`Erro ao criar empresa: ${error.message}`),
  });

  if (!client) return null;

  const linkedIds = new Set(userCompanies.map((c) => c.id));
  const searchLower = search.trim().toLowerCase();
  const matches = allCompanies.filter(
    (c) => !linkedIds.has(c.id) && c.name.toLowerCase().includes(searchLower)
  );
  const exactMatchExists = allCompanies.some(
    (c) => c.name.toLowerCase() === searchLower
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresas de {maskPersonName(client.id, client.name, "cliente")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-sm font-medium">Empresas vinculadas</p>
          {userCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma empresa vinculada ainda.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {userCompanies.map((company) => (
                <Badge
                  key={company.id}
                  variant="secondary"
                  className="pl-3 pr-1 py-1.5 flex items-center gap-1"
                >
                  {maskCompanyName(company.id, company.name)}
                  <button
                    type="button"
                    onClick={() =>
                      removeMutation.mutate({
                        userId: client.id,
                        companyId: company.id,
                      })
                    }
                    className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remover ${maskCompanyName(company.id, company.name)}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <p className="text-sm font-medium">Vincular empresa</p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ou digitar nome de empresa nova..."
          />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {matches.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() =>
                  addMutation.mutate({ userId: client.id, companyId: company.id })
                }
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {maskCompanyName(company.id, company.name)}
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
            {searchLower && !exactMatchExists && (
              <button
                type="button"
                onClick={() => createMutation.mutate({ name: search.trim() })}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar empresa &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
