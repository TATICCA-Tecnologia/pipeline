"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { User } from "@/shared/types";
import { setTrpcUserId } from "@/shared/trpc/auth-header";

export type ViewState =
  | { role: "admin" }
  | { role: "developer" }
  | { role: "client" };

interface AuthContextType {
  user: User | null;
  actualUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isImpersonating: boolean;
  viewState: ViewState;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithUser: (user: User) => void;
  logout: () => void;
  viewAsAdmin: () => void;
  viewAsDeveloper: () => void;
  viewAsClient: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USERS: Record<string, User> = {
  "cliente@email.com": {
    id: "mock-1",
    name: "João Silva",
    email: "cliente@email.com",
    role: "client",
    companies: [{ id: "mock-company-1", name: "Tech Corp" }],
    createdAt: new Date(),
  },
  "dev@email.com": {
    id: "mock-2",
    name: "Maria Santos",
    email: "dev@email.com",
    role: "developer",
    createdAt: new Date(),
  },
  "admin@email.com": {
    id: "mock-3",
    name: "Carlos Admin",
    email: "admin@email.com",
    role: "admin",
    createdAt: new Date(),
  },
};

const AUTH_STORAGE_KEY = "kanban_auth_user";
const VIEW_STATE_STORAGE_KEY = "super_admin_view_state";
const DEFAULT_VIEW_STATE: ViewState = { role: "admin" };

function readStoredViewState(): ViewState {
  const raw = localStorage.getItem(VIEW_STATE_STORAGE_KEY);
  if (!raw) return DEFAULT_VIEW_STATE;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.role === "admin" ||
      parsed?.role === "developer" ||
      parsed?.role === "client"
    ) {
      return { role: parsed.role };
    }
  } catch {
    // ignora e usa o padrão
  }
  return DEFAULT_VIEW_STATE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewState, setViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);

  useEffect(() => {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setActualUser(parsedUser);
        if (parsedUser.role === "super_admin") {
          setViewState(readStoredViewState());
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    setTrpcUserId(actualUser?.id ?? null);
  }, [actualUser]);

  const login = useCallback(async (email: string, _password: string) => {
    const mockUser = MOCK_USERS[email];
    if (mockUser) {
      setActualUser(mockUser);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockUser));
      setViewState(DEFAULT_VIEW_STATE);
      localStorage.removeItem(VIEW_STATE_STORAGE_KEY);
      return true;
    }
    return false;
  }, []);

  const loginWithUser = useCallback((newUser: User) => {
    setActualUser(newUser);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
    setViewState(DEFAULT_VIEW_STATE);
    localStorage.removeItem(VIEW_STATE_STORAGE_KEY);
  }, []);

  const logout = useCallback(() => {
    setActualUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setViewState(DEFAULT_VIEW_STATE);
    localStorage.removeItem(VIEW_STATE_STORAGE_KEY);
  }, []);

  const viewAsAdmin = useCallback(() => {
    if (actualUser?.role !== "super_admin") return;
    setViewState(DEFAULT_VIEW_STATE);
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(DEFAULT_VIEW_STATE));
  }, [actualUser]);

  const viewAsDeveloper = useCallback(() => {
    if (actualUser?.role !== "super_admin") return;
    const next: ViewState = { role: "developer" };
    setViewState(next);
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(next));
  }, [actualUser]);

  const viewAsClient = useCallback(() => {
    if (actualUser?.role !== "super_admin") return;
    const next: ViewState = { role: "client" };
    setViewState(next);
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(next));
  }, [actualUser]);

  const user: User | null = (() => {
    if (!actualUser) return null;
    if (actualUser.role !== "super_admin") return actualUser;
    return { ...actualUser, role: viewState.role };
  })();

  const isSuperAdmin = actualUser?.role === "super_admin";
  const isImpersonating = isSuperAdmin && viewState.role !== "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        actualUser,
        isAuthenticated: !!actualUser,
        isLoading,
        isSuperAdmin,
        isImpersonating,
        viewState,
        login,
        loginWithUser,
        logout,
        viewAsAdmin,
        viewAsDeveloper,
        viewAsClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
