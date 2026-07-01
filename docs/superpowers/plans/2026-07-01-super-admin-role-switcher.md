# Super Admin + Seletor de Perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SUPER_ADMIN` role that can switch, at any time, between the Admin / Desenvolvedor / Cliente views of the same account, with a visible way back and a minimal server-side guard against spoofing.

**Architecture:** Split the logged-in identity (`actualUser`) from the "effective" identity the rest of the app already reads (`user`). A super admin's `viewState` (stored in `localStorage`, mirroring the existing auth pattern) decides what `user` resolves to: itself-as-admin, itself-as-developer, or a picked client's profile. tRPC requests carry the real identity in `x-user-id` and, only while impersonating a client, an additional `x-acting-as-id` header that the server only honors if the real user is `SUPER_ADMIN` in the database.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, Prisma 6 (PostgreSQL), React 19, shadcn/ui (Radix + cmdk), no test runner is configured in this repo (no jest/vitest/*.test.* files exist) — verification steps below use `tsc`/manual runtime checks instead of automated tests.

---

## Important notes before starting

- This repo has **no test framework installed**. Do not add one as part of this plan (out of scope) — each task is verified with `pnpm tsc --noEmit` (or `pnpm build` where noted) and, for the final task, a manual click-through.
- `pnpm prisma generate` only reads `schema.prisma` and does **not** need a reachable database. `pnpm prisma migrate dev` **does** need a valid `DATABASE_URL` in `.env` pointing at a real Postgres instance. If no `.env` exists yet in the execution environment, run schema edits + `generate` (so TypeScript everywhere else compiles), but flag the `migrate dev` step for the user to run themselves against their real database.
- Commit after every task.

---

### Task 1: Add `SUPER_ADMIN` to the Prisma schema

**Files:**
- Modify: `prisma/schema.prisma:87-91`

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, change:

```prisma
enum UserRole {
  ADMIN
  DEVELOPER
  CLIENT
}
```

to:

```prisma
enum UserRole {
  ADMIN
  DEVELOPER
  CLIENT
  SUPER_ADMIN
}
```

- [ ] **Step 2: Regenerate the Prisma client (no DB needed)**

Run: `pnpm prisma generate`
Expected: `✔ Generated Prisma Client` — no errors. This updates the TypeScript types (`PrismaUserRole`) used later in this plan.

- [ ] **Step 3: Create and apply the migration (needs a reachable DATABASE_URL)**

Run: `pnpm prisma migrate dev --name add_super_admin_role`
Expected: a new folder appears under `prisma/migrations/` containing `migration.sql` with `ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';`, and the command reports the migration was applied.

If this fails because there is no reachable database in the current environment (no `.env` / `DATABASE_URL`), skip running it now, note it, and tell the user to run this exact command themselves once they have `.env` configured with their real `DATABASE_URL`. Do not fake or hand-write the migration folder — let Prisma generate it when a real database is available, since this is a straightforward additive enum change.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add SUPER_ADMIN role to UserRole enum"
```

(If Step 3 was skipped, only `prisma/schema.prisma` will be staged — that's fine, commit what exists.)

---

### Task 2: Map `SUPER_ADMIN` in the backend role mapper

**Files:**
- Modify: `src/server/trpc/mappers.ts:29-35`

- [ ] **Step 1: Update `FrontendUserRole` and the mapping table**

Change:

```ts
export type FrontendUserRole = "client" | "developer" | "admin";

const PRISMA_TO_FRONTEND_ROLE: Record<PrismaUserRole, FrontendUserRole> = {
  CLIENT: "client",
  DEVELOPER: "developer",
  ADMIN: "admin",
};
```

to:

```ts
export type FrontendUserRole = "client" | "developer" | "admin" | "super_admin";

const PRISMA_TO_FRONTEND_ROLE: Record<PrismaUserRole, FrontendUserRole> = {
  CLIENT: "client",
  DEVELOPER: "developer",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: no new errors referencing `mappers.ts` (there will still be errors elsewhere until later tasks are done — that's expected; re-run this same command after every task from here on and confirm the error count only shrinks).

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/mappers.ts
git commit -m "feat: map SUPER_ADMIN prisma role to frontend role"
```

---

### Task 3: Widen the frontend `UserRole` type

**Files:**
- Modify: `src/shared/types/index.ts:2`

- [ ] **Step 1: Add `"super_admin"` to the union**

Change:

```ts
export type UserRole = "client" | "developer" | "admin";
```

to:

```ts
export type UserRole = "client" | "developer" | "admin" | "super_admin";
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `src/shared/types/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat: allow super_admin in shared UserRole type"
```

---

### Task 4: Treat `SUPER_ADMIN` as admin-equivalent in backend guards

**Files:**
- Modify: `src/server/trpc/trpc.ts:25-37`
- Modify: `src/server/trpc/routers/user.router.ts:39-51`

- [ ] **Step 1: Update `enforceAdmin`**

In `src/server/trpc/trpc.ts`, change:

```ts
const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  }
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

to:

```ts
const enforceAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  }
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { role: true },
  });
  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
```

- [ ] **Step 2: Include `SUPER_ADMIN` in the developer-assignment list**

In `src/server/trpc/routers/user.router.ts`, change:

```ts
  listDevelopers: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: "DEVELOPER", isActive: true },
      orderBy: { name: "asc" },
    });
```

to:

```ts
  listDevelopers: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: { in: ["DEVELOPER", "SUPER_ADMIN"] }, isActive: true },
      orderBy: { name: "asc" },
    });
```

This makes the super admin selectable in the "assign developer" dropdown, matching the requirement that they can act as "one more developer."

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `trpc.ts` or `user.router.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/trpc.ts src/server/trpc/routers/user.router.ts
git commit -m "feat: treat SUPER_ADMIN as admin-equivalent in backend guards"
```

---

### Task 5: Dual identity in the tRPC context (real user vs. acting-as)

**Files:**
- Modify: `src/server/trpc/context.ts` (full file)

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/server/trpc/context.ts` with:

```ts
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "../db";

const MOCK_USERS_BY_ID: Record<
  string,
  { id: string; name: string; email: string; role: "ADMIN" | "DEVELOPER" | "CLIENT" }
> = {
  "mock-1": { id: "mock-1", name: "João Silva", email: "cliente@email.com", role: "CLIENT" },
  "mock-2": { id: "mock-2", name: "Maria Santos", email: "dev@email.com", role: "DEVELOPER" },
  "mock-3": { id: "mock-3", name: "Carlos Admin", email: "admin@email.com", role: "ADMIN" },
};

export async function createContext(opts: FetchCreateContextFnOptions) {
  const realUserId = opts.req.headers.get("x-user-id") ?? null;
  if (realUserId) {
    const mock = MOCK_USERS_BY_ID[realUserId];
    if (mock) {
      await db.user.upsert({
        where: { id: mock.id },
        update: {
          name: mock.name,
          email: mock.email,
          role: mock.role,
          isActive: true,
        },
        create: {
          id: mock.id,
          name: mock.name,
          email: mock.email,
          role: mock.role,
          isActive: true,
        },
      });
    }
  }

  // Super admins may send "x-acting-as-id" to make requests on behalf of another
  // user (used by the profile switcher to impersonate a client). Only honored
  // when the real, authenticated user is SUPER_ADMIN in the database — this is
  // the one server-side check standing between this header and full spoofing,
  // since the rest of this app already trusts "x-user-id" without a real session.
  const actingAsId = opts.req.headers.get("x-acting-as-id") ?? null;
  let userId = realUserId;
  if (actingAsId && realUserId) {
    const realUser = await db.user.findUnique({
      where: { id: realUserId },
      select: { role: true },
    });
    if (realUser?.role === "SUPER_ADMIN") {
      userId = actingAsId;
    }
  }

  return {
    db,
    userId,
    realUserId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `context.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/server/trpc/context.ts
git commit -m "feat: resolve acting-as identity in tRPC context for super admins"
```

---

### Task 6: Send the acting-as header from the frontend

**Files:**
- Modify: `src/shared/trpc/auth-header.ts` (full file)
- Modify: `src/shared/trpc/trpc-provider.tsx:8,32-36`

- [ ] **Step 1: Add an acting-as-id slot next to the existing user-id slot**

Replace the entire contents of `src/shared/trpc/auth-header.ts` with:

```ts
let currentUserId: string | null = null;
let currentActingAsId: string | null = null;

export function setTrpcUserId(userId: string | null) {
  currentUserId = userId;
}

export function getTrpcUserId(): string {
  return currentUserId ?? "";
}

export function setTrpcActingAsId(actingAsId: string | null) {
  currentActingAsId = actingAsId;
}

export function getTrpcActingAsId(): string {
  return currentActingAsId ?? "";
}
```

- [ ] **Step 2: Send the header when present**

In `src/shared/trpc/trpc-provider.tsx`, change the import:

```ts
import { getTrpcUserId } from "./auth-header";
```

to:

```ts
import { getTrpcUserId, getTrpcActingAsId } from "./auth-header";
```

and change:

```ts
          headers() {
            return {
              "x-user-id": getTrpcUserId(),
            };
          },
```

to:

```ts
          headers() {
            const headers: Record<string, string> = {
              "x-user-id": getTrpcUserId(),
            };
            const actingAsId = getTrpcActingAsId();
            if (actingAsId) {
              headers["x-acting-as-id"] = actingAsId;
            }
            return headers;
          },
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `auth-header.ts` or `trpc-provider.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/trpc/auth-header.ts src/shared/trpc/trpc-provider.tsx
git commit -m "feat: send x-acting-as-id header when impersonating a client"
```

---

### Task 7: Rewrite the auth context (real identity, view state, view-as actions)

**Files:**
- Modify: `src/shared/context/auth-context.tsx` (full file)

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `src/shared/context/auth-context.tsx` with:

```tsx
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
import { setTrpcUserId, setTrpcActingAsId } from "@/shared/trpc/auth-header";

export interface PickedClient {
  id: string;
  name: string;
  email: string;
  company?: string;
}

export type ViewState =
  | { role: "admin" }
  | { role: "developer" }
  | { role: "client"; client: PickedClient };

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
  viewAsClient: (client: PickedClient) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USERS: Record<string, User> = {
  "cliente@email.com": {
    id: "mock-1",
    name: "João Silva",
    email: "cliente@email.com",
    role: "client",
    company: "Tech Corp",
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
    if (parsed?.role === "admin" || parsed?.role === "developer") {
      return { role: parsed.role };
    }
    if (parsed?.role === "client" && parsed?.client?.id) {
      return { role: "client", client: parsed.client };
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
    const actingAsId =
      actualUser?.role === "super_admin" && viewState.role === "client"
        ? viewState.client.id
        : null;
    setTrpcActingAsId(actingAsId);
  }, [actualUser, viewState]);

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

  const viewAsClient = useCallback(
    (client: PickedClient) => {
      if (actualUser?.role !== "super_admin") return;
      const next: ViewState = { role: "client", client };
      setViewState(next);
      localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(next));
    },
    [actualUser]
  );

  const user: User | null = (() => {
    if (!actualUser) return null;
    if (actualUser.role !== "super_admin") return actualUser;
    if (viewState.role === "client") {
      return {
        id: viewState.client.id,
        name: viewState.client.name,
        email: viewState.client.email,
        role: "client",
        company: viewState.client.company,
        createdAt: actualUser.createdAt,
      };
    }
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
```

Note: `UserRole` is no longer imported because it's not referenced directly by name in this file anymore (roles are used as string literals matching the type) — this avoids an unused-import lint error.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: errors should now only come from files not yet updated (`app-sidebar.tsx` referencing the old `logout`/`user` shape is fine since those didn't change name; genuinely new errors would come from Task 9's `ClientPickerDialog` and Task 11's sidebar wiring, which don't exist yet — that's expected at this point).

- [ ] **Step 3: Commit**

```bash
git add src/shared/context/auth-context.tsx
git commit -m "feat: split real user from view state in auth context"
```

---

### Task 8: Fix the post-login redirect for `super_admin`

**Files:**
- Modify: `src/app/(public)/login/page.tsx:41-47`

- [ ] **Step 1: Add the missing branch**

Change:

```tsx
      if (normalizedUser.role === "admin") {
        router.push("/admin");
      } else if (normalizedUser.role === "developer") {
        router.push("/desenvolvedor");
      } else {
        router.push("/cliente");
      }
```

to:

```tsx
      if (normalizedUser.role === "admin" || normalizedUser.role === "super_admin") {
        router.push("/admin");
      } else if (normalizedUser.role === "developer") {
        router.push("/desenvolvedor");
      } else {
        router.push("/cliente");
      }
```

Without this, a super admin logging in would fall through to the `else` branch and land on `/cliente`.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `login/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/login/page.tsx"
git commit -m "fix: redirect super_admin to /admin after login"
```

---

### Task 9: Client picker dialog

**Files:**
- Create: `src/shared/components/client-picker-dialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

`trpc.user.listClients` already exists (`src/server/trpc/routers/user.router.ts:23-37`) and returns `{ id, name, email, role, company, createdAt }[]` — no backend changes needed for this task.

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `client-picker-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/client-picker-dialog.tsx
git commit -m "feat: add client picker dialog for super admin impersonation"
```

---

### Task 10: Impersonation banner

**Files:**
- Create: `src/shared/components/impersonation-banner.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useAuth } from "@/shared/context/auth-context";
import { Button } from "@/src/shared/components/ui/button";
import { Undo2 } from "lucide-react";

export function ImpersonationBanner() {
  const { isImpersonating, viewState, viewAsAdmin } = useAuth();

  if (!isImpersonating) return null;

  const label =
    viewState.role === "developer"
      ? "Visualizando como Desenvolvedor"
      : viewState.role === "client"
        ? `Visualizando como Cliente: ${viewState.client.name}${
            viewState.client.company ? ` (${viewState.client.company})` : ""
          }`
        : null;

  if (!label) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
      <span className="font-medium">{label}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        onClick={viewAsAdmin}
      >
        <Undo2 className="h-3.5 w-3.5" />
        Voltar para Super Admin
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `impersonation-banner.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/impersonation-banner.tsx
git commit -m "feat: add impersonation banner with quick return to super admin"
```

---

### Task 11: Wire the switcher into the sidebar, and the banner into the private layout

**Files:**
- Modify: `src/shared/components/app-sidebar.tsx` (full file)
- Modify: `src/app/(private)/layout.tsx` (full file)

- [ ] **Step 1: Replace the whole sidebar file**

Replace the entire contents of `src/shared/components/app-sidebar.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/shared/context/auth-context";
import { cn, getInitials } from "@/shared/utils";
import { Avatar, AvatarFallback } from "@/src/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import { ClientPickerDialog } from "@/shared/components/client-picker-dialog";
import {
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Shield,
  Tag,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const clientSections: NavSection[] = [
  {
    label: "Projetos",
    items: [
      { href: "/cliente/solicitar", label: "Solicitar Projeto", icon: PlusCircle },
      { href: "/cliente", label: "Meus Projetos", icon: FolderKanban },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/cliente/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const developerSections: NavSection[] = [
  {
    label: "Trabalho",
    items: [
      { href: "/desenvolvedor", label: "Projetos", icon: FolderKanban },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/desenvolvedor/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const adminSections: NavSection[] = [
  {
    label: "Visão Geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Gestão",
    items: [
      { href: "/admin/projetos", label: "Projetos", icon: FolderKanban },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/configuracoes/categorias", label: "Categorias", icon: Tag },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    logout,
    isSuperAdmin,
    viewAsAdmin,
    viewAsDeveloper,
    viewAsClient,
  } = useAuth();
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const sections =
    user?.role === "admin"
      ? adminSections
      : user?.role === "developer"
        ? developerSections
        : clientSections;

  const rootHrefs = new Set(["/", "/cliente", "/desenvolvedor", "/admin"]);
  const allHrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const activeHref = allHrefs
    .filter(
      (href) =>
        pathname === href ||
        (!rootHrefs.has(href) && pathname.startsWith(href + "/"))
    )
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border/60"
      >
        <Image
          src="/logo.png"
          alt="TATICCA Pipeline"
          width={28}
          height={28}
          className="rounded"
        />
        <span className="text-sm font-semibold tracking-tight">
          TATICCA{" "}
          <span className="text-muted-foreground/80 font-normal">Pipeline</span>
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === activeHref;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="border-t border-sidebar-border/60 p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
                aria-label="Abrir menu do usuário"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {user.email}
                  </p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56"
              align="end"
              side="top"
              sideOffset={8}
            >
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </DropdownMenuItem>
              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Shield className="mr-2 h-4 w-4" />
                      Ver como
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onSelect={() => {
                          viewAsAdmin();
                          router.push("/admin");
                        }}
                      >
                        Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          viewAsDeveloper();
                          router.push("/desenvolvedor");
                        }}
                      >
                        Desenvolvedor
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setClientPickerOpen(true)}
                      >
                        Cliente...
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {isSuperAdmin && (
        <ClientPickerDialog
          open={clientPickerOpen}
          onOpenChange={setClientPickerOpen}
          onSelect={(client) => {
            viewAsClient(client);
            router.push("/cliente");
          }}
        />
      )}
    </aside>
  );
}
```

The `clientPickerOpen` state lives in `AppSidebar` (not inside the dropdown's own subtree), so the dialog keeps working correctly after Radix unmounts the closed dropdown menu content.

- [ ] **Step 2: Render the impersonation banner in the private layout**

Replace the entire contents of `src/app/(private)/layout.tsx` with:

```tsx
"use client";

import { useAuth } from "@/shared/context/auth-context";
import { AppSidebar } from "@/shared/components";
import { ImpersonationBanner } from "@/shared/components/impersonation-banner";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/src/shared/components/ui/spinner";
import { ModalProvider } from "@/src/shared/context/modal-context";
import { NestedModal } from "@/src/shared/components/modals/nested-modal";

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ModalProvider>
      <div className="min-h-screen bg-background">
        <AppSidebar />
        <main className="ml-64">
          <ImpersonationBanner />
          <div className="p-6">{children}</div>
        </main>
      </div>
    </ModalProvider>
  );
}
```

Only the `<main>` block changed (banner added above the padded content wrapper) — the rest of the file, including the pre-existing unused `NestedModal` import, is kept exactly as it was.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: zero errors across the whole project now.

Run: `pnpm build`
Expected: build succeeds (this also catches any Next.js-specific issues `tsc` alone wouldn't).

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/app-sidebar.tsx "src/app/(private)/layout.tsx"
git commit -m "feat: wire profile switcher and impersonation banner into private layout"
```

---

### Task 12: Script to create/promote the real Super Admin user

**Files:**
- Create: `prisma/create-super-admin.ts`
- Modify: `package.json:10-13`

- [ ] **Step 1: Create the script**

```ts
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  const name = process.env.SUPER_ADMIN_NAME;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    console.error(
      "Defina SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD antes de rodar este script."
    );
    process.exit(1);
    return;
  }

  const hashedPassword = hashSync(password, SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    create: {
      name,
      email,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log(`Super Admin pronto: ${user.email} (id: ${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Add an npm script for it**

In `package.json`, change:

```json
    "db:seed": "prisma db seed"
```

to:

```json
    "db:seed": "prisma db seed",
    "db:create-super-admin": "tsx prisma/create-super-admin.ts"
```

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no errors from `prisma/create-super-admin.ts`.

(Do not run the script itself yet — it needs `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` and a reachable database. That happens in Task 13 once the real person's details are provided.)

- [ ] **Step 4: Commit**

```bash
git add prisma/create-super-admin.ts package.json
git commit -m "feat: add script to create or promote a super admin user"
```

---

### Task 13: End-to-end verification (manual)

This app has no automated test suite, so the final check is a manual walkthrough. Requires a reachable `DATABASE_URL` (Task 1 Step 3 must have been applied against it) and at least one existing `CLIENT` user in the database (the seed script `prisma/seed.ts` already creates `cliente@email.com`).

- [ ] **Step 1: Create a super admin locally**

```bash
SUPER_ADMIN_NAME="Admin Geral" SUPER_ADMIN_EMAIL="superadmin@local.test" SUPER_ADMIN_PASSWORD="troque-esta-senha" pnpm db:create-super-admin
```

(On Windows PowerShell: `$env:SUPER_ADMIN_NAME="Admin Geral"; $env:SUPER_ADMIN_EMAIL="superadmin@local.test"; $env:SUPER_ADMIN_PASSWORD="troque-esta-senha"; pnpm db:create-super-admin`)

Expected: `Super Admin pronto: superadmin@local.test (id: ...)`.

- [ ] **Step 2: Run the app and log in**

Run: `pnpm dev`
Open `http://localhost:3000/login`, log in with `superadmin@local.test` / the password from Step 1.
Expected: redirected to `/admin`, admin sidebar sections visible, no impersonation banner.

- [ ] **Step 3: Switch to Desenvolvedor**

Open the user menu at the bottom of the sidebar → "Ver como" → "Desenvolvedor".
Expected: redirected to `/desenvolvedor`, sidebar now shows developer sections, an amber banner reading "Visualizando como Desenvolvedor" appears with a "Voltar para Super Admin" button.

- [ ] **Step 4: Switch to Cliente**

Open the user menu → "Ver como" → "Cliente..." → pick "João Silva" (or whichever client exists) from the search dialog.
Expected: redirected to `/cliente`, sidebar shows client sections, banner reads "Visualizando como Cliente: João Silva (Tech Corp)" (company shown only if present), and creating a project request on this screen should attribute it to that client (verify via Prisma Studio or the admin's project list that the new request's `clientId` matches the impersonated client, not the super admin).

- [ ] **Step 5: Return to Super Admin**

Click "Voltar para Super Admin" in the banner.
Expected: redirected to `/admin`, banner disappears.

- [ ] **Step 6: Confirm a non-super-admin never sees the switcher**

Log out, log back in as `admin@email.com` (the existing demo admin).
Expected: the user menu has no "Ver como" item at all.

- [ ] **Step 7: Confirm the server-side guard**

While still logged in as `admin@email.com` (a regular ADMIN, not SUPER_ADMIN), open the browser devtools network tab and manually replay any tRPC request with an added `x-acting-as-id` header pointing at a different user's id.
Expected: the response still reflects `admin@email.com`'s own identity — the header is ignored because `context.ts` only honors it when the real user's DB role is `SUPER_ADMIN`.

No commit for this task (verification only, not a code change). If any step fails, fix the underlying task before moving on.
