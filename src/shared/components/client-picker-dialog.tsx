"use client";

import { trpc } from "@/shared/trpc/client";
import type { PickedClient } from "@/shared/context/auth-context";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/src/shared/components/ui/command";

interface ClientPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (client: PickedClient) => void;
}

export function ClientPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: ClientPickerDialogProps) {
  const { data: clients, isLoading } = trpc.user.listClients.useQuery(undefined, {
    enabled: open,
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ver como Cliente"
      description="Escolha o cliente que deseja visualizar"
    >
      <CommandInput placeholder="Buscar cliente por nome ou empresa..." />
      <CommandList>
        <CommandEmpty>
          {isLoading ? "Carregando..." : "Nenhum cliente encontrado."}
        </CommandEmpty>
        <CommandGroup heading="Clientes">
          {(clients ?? []).map((client) => (
            <CommandItem
              key={client.id}
              value={`${client.name} ${client.company ?? ""} ${client.email}`}
              onSelect={() => {
                onSelect({
                  id: client.id,
                  name: client.name,
                  email: client.email,
                  company: client.company,
                });
                onOpenChange(false);
              }}
            >
              <div className="flex flex-col">
                <span>{client.name}</span>
                <span className="text-xs text-muted-foreground">
                  {client.company ?? "Sem empresa"} · {client.email}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
