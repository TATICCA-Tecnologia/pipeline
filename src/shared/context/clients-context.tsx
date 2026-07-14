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
import { toast } from "sonner";

/** Roles atribuíveis na criação de um usuário — super_admin só via promoção. */
export type CreatableRole = "client" | "developer" | "admin";

export interface NewUserInput {
  name: string;
  email: string;
  role: CreatableRole;
  /** Vincula a uma empresa já existente. Ignorado se newCompanyName for informado. */
  companyId?: string;
  /** Cria e vincula uma empresa nova em vez de escolher uma existente. */
  newCompanyName?: string;
}

interface ClientsContextType {
  clients: User[];
  isLoading: boolean;
  addClient: (input: NewUserInput) => Promise<{ temporaryPassword: string } | undefined>;
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
  const { data: clientsData = [], isLoading } = trpc.user.list.useQuery(
    undefined,
    { enabled: !!user?.id }
  );
  const createClientMutation = trpc.user.create.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
    onError: (error) => toast.error(`Erro ao criar usuário: ${error.message}`),
  });
  const updateClientMutation = trpc.user.update.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
    onError: (error) => toast.error(`Erro ao salvar: ${error.message}`),
  });
  const deleteClientMutation = trpc.user.delete.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
  });

  const clients: User[] = Array.isArray(clientsData)
    ? clientsData.map((c: Record<string, unknown>) =>
        mapUser(c as Parameters<typeof mapUser>[0])
      )
    : [];

  const addClient = useCallback(
    async (input: NewUserInput) => {
      try {
        return await createClientMutation.mutateAsync(input);
      } catch {
        return undefined;
      }
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
    void utils.user.list.invalidate();
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
