import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";

// Resolve nome/id dos usuários mencionados (Comment.mentionedUserIds) — usado
// tanto na listagem quanto na criação, pra destacar "@Nome" na renderização
// sem o client precisar de outra query.
async function resolveMentionedUsers(
  db: PrismaClient,
  mentionedUserIds: unknown
): Promise<{ id: string; name: string }[]> {
  const ids = Array.isArray(mentionedUserIds) ? (mentionedUserIds as string[]) : [];
  if (ids.length === 0) return [];
  return db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
}

export const commentRouter = router({
  byProject: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        visibility: z.enum(["GLOBAL", "INTERNAL", "ALL"]).default("ALL"),
      })
    )
    .query(async ({ ctx, input }) => {
      const requestingUser = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });

      // Clientes só podem ver mensagens do canal global
      const isClient = requestingUser?.role === "CLIENT";
      const effectiveVisibility = isClient ? "GLOBAL" : input.visibility;

      const comments = await ctx.db.comment.findMany({
        where: {
          projectId: input.projectId,
          ...(effectiveVisibility !== "ALL" ? { visibility: effectiveVisibility } : {}),
        },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      });
      return Promise.all(
        comments.map(async (c) => ({
          id: c.id,
          projectId: c.projectId,
          userId: c.userId,
          userName: c.user.name,
          userRole: c.user.role.toLowerCase() as "client" | "developer" | "admin",
          content: c.content,
          visibility: c.visibility,
          isIncident: c.isIncident,
          mentionedUsers: await resolveMentionedUsers(ctx.db, c.mentionedUserIds),
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))
      );
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        content: z.string().min(1),
        visibility: z.enum(["GLOBAL", "INTERNAL"]).default("GLOBAL"),
        isIncident: z.boolean().optional().default(false),
        mentionedUserIds: z.array(z.string()).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const mentionedIds = Array.from(
        new Set(input.mentionedUserIds.filter((id) => id !== ctx.userId))
      );

      const comment = await ctx.db.comment.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          content: input.content,
          visibility: input.visibility,
          isIncident: input.isIncident,
          mentionedUserIds: mentionedIds,
        },
        include: { user: { select: { name: true, role: true } } },
      });

      if (mentionedIds.length > 0) {
        const project = await ctx.db.project.findUnique({
          where: { id: input.projectId },
          select: { title: true },
        });
        await ctx.db.notification.createMany({
          data: mentionedIds.map((userId) => ({
            userId,
            type: "MENTION" as const,
            title: "Você foi mencionado",
            message: `${comment.user.name} mencionou você no chat do projeto "${project?.title ?? ""}"`,
            link: `/projeto/${input.projectId}`,
          })),
        });
      }

      return {
        id: comment.id,
        projectId: comment.projectId,
        userId: comment.userId,
        userName: comment.user.name,
        userRole: comment.user.role.toLowerCase(),
        content: comment.content,
        visibility: comment.visibility,
        isIncident: comment.isIncident,
        mentionedUsers: await resolveMentionedUsers(ctx.db, mentionedIds),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.update({
        where: { id: input.id },
        data: { content: input.content },
        include: { user: { select: { name: true, role: true } } },
      });
      return {
        id: comment.id,
        projectId: comment.projectId,
        userId: comment.userId,
        userName: comment.user.name,
        userRole: comment.user.role.toLowerCase(),
        content: comment.content,
        visibility: comment.visibility,
        isIncident: comment.isIncident,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.comment.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
