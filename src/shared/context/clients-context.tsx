"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "@/shared/types";
import { trpc } from "@/shared/trpc/client";
import { useAuth } from "@/shared/context/auth-context";

interface ClientsContextType {
  clients: User[];
  isLoading: boolean;
  addClient: (client: Omit<User, "id" | "createdAt" | "role">) => void;
  updateClient: (id: string, updates: Partial<User>) => void;
  deleteClient: (id: string) => void;
  getClientById: (id: string) => User | undefined;
  refetch: () => void;
}

const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

function mapUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  companies?: { id: string; name: string }[];
  createdAt: Date;
}): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as User["role"],
    companies: u.companies ?? [],
    createdAt: u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt),
  };
}

export function ClientsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: clientsData = [], isLoading } = trpc.user.listClients.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
  const createClientMutation = trpc.user.createClient.useMutation({
    onSuccess: () => utils.user.listClients.invalidate(),
  });
  const updateClientMutation = trpc.user.update.useMutation({
    onSuccess: () => utils.user.listClients.invalidate(),
  });
  const deleteClientMutation = trpc.user.delete.useMutation({
    onSuccess: () => utils.user.listClients.invalidate(),
  });

  const clients: User[] = Array.isArray(clientsData)
    ? clientsData.map((c: Record<string, unknown>) =>
        mapUser(c as Parameters<typeof mapUser>[0])
      )
    : [];

  const addClient = useCallback(
    (client: Omit<User, "id" | "createdAt" | "role">) => {
      createClientMutation.mutate({
        name: client.name,
        email: client.email,
      });
    },
    [createClientMutation]
  );

  const updateClient = useCallback(
    (id: string, updates: Partial<User>) => {
      updateClientMutation.mutate({
        id,
        name: updates.name,
        email: updates.email,
      });
    },
    [updateClientMutation]
  );

  const deleteClient = useCallback(
    (id: string) => {
      deleteClientMutation.mutate({ id });
    },
    [deleteClientMutation]
  );

  const getClientById = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients]
  );

  const refetch = useCallback(() => {
    void utils.user.listClients.invalidate();
  }, [utils]);

  return (
    <ClientsContext.Provider
      value={{
        clients,
        isLoading,
        addClient,
        updateClient,
        deleteClient,
        getClientById,
        refetch,
      }}
    >
      {children}
    </ClientsContext.Provider>
  );
}

export function useClients() {
  const context = useContext(ClientsContext);
  if (context === undefined) {
    throw new Error("useClients deve ser usado dentro de um ClientsProvider");
  }
  return context;
}
