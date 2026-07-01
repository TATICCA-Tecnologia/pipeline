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
