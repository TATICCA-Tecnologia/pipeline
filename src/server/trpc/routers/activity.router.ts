import { z } from "zod";
import { router, publicProcedure } from "../trpc";

export const activityRouter = router({
  byProject: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db.activityLog.findMany({
        where: { projectId: input.projectId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return logs.map((l) => ({
        id: l.id,
        projectId: l.projectId,
        userId: l.userId,
        userName: l.user.name,
        action: l.action,
        details: l.details ?? undefined,
        createdAt: l.createdAt,
      }));
    }),
});
