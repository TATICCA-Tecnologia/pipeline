import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";

const UNLINKED_USER_PREFIX = "user:";

export async function resolvePersonForUser(db: PrismaClient, companyId: string, userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });
  return db.person.upsert({
    where: { companyId_userId: { companyId, userId } },
    update: {},
    create: { companyId, userId, name: user.name },
  });
}

export async function resolvePersonIds(
  db: PrismaClient,
  companyId: string,
  rawIds: string[]
): Promise<string[]> {
  const resolved: string[] = [];
  for (const rawId of rawIds) {
    if (rawId.startsWith(UNLINKED_USER_PREFIX)) {
      const userId = rawId.slice(UNLINKED_USER_PREFIX.length);
      const person = await resolvePersonForUser(db, companyId, userId);
      resolved.push(person.id);
    } else {
      resolved.push(rawId);
    }
  }
  return resolved;
}

export async function resolvePersonIdsByName(
  db: PrismaClient,
  companyId: string,
  names: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const existing = await db.person.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      ids.push(existing.id);
    } else {
      const created = await db.person.create({ data: { companyId, name } });
      ids.push(created.id);
    }
  }
  return Array.from(new Set(ids));
}

export const personRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [people, users] = await Promise.all([
        ctx.db.person.findMany({
          where: { companyId: input.companyId },
          orderBy: { name: "asc" },
        }),
        ctx.db.user.findMany({
          where: { companies: { some: { id: input.companyId } } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);

      const linkedUserIds = new Set(
        people.filter((p) => p.userId).map((p) => p.userId as string)
      );

      const personOptions = people.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role ?? undefined,
        userId: p.userId ?? undefined,
        isUnlinkedUser: false,
      }));

      const unlinkedUserOptions = users
        .filter((u) => !linkedUserIds.has(u.id))
        .map((u) => ({
          id: `${UNLINKED_USER_PREFIX}${u.id}`,
          name: u.name,
          role: undefined,
          userId: u.id,
          isUnlinkedUser: true,
        }));

      return [...personOptions, ...unlinkedUserOptions];
    }),

  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        name: z.string().trim().min(1),
        role: z.string().trim().min(1).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.person.create({
        data: {
          companyId: input.companyId,
          name: input.name.trim(),
          role: input.role?.trim() || null,
        },
      });
    }),
});
