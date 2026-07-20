import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const notificationRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({ where: { userId: ctx.userId, read: false } });
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }),

  markAsRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // updateMany (não update) porque é um no-op silencioso e seguro quando
      // o id não pertence a quem chamou, em vez de vazar/alterar notificação
      // de outro usuário — mesmo padrão de releaseLock em project.router.ts.
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.userId },
        data: { read: true },
      });
      return { success: true };
    }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.userId, read: false },
      data: { read: true },
    });
    return { success: true };
  }),
});
