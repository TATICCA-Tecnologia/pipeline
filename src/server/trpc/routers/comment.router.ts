import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

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
      return comments.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        userId: c.userId,
        userName: c.user.name,
        userRole: c.user.role.toLowerCase() as "client" | "developer" | "admin",
        content: c.content,
        visibility: c.visibility,
        isIncident: c.isIncident,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        content: z.string().min(1),
        visibility: z.enum(["GLOBAL", "INTERNAL"]).default("GLOBAL"),
        isIncident: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.comment.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          content: input.content,
          visibility: input.visibility,
          isIncident: input.isIncident,
        },
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
