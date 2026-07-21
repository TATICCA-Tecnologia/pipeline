import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { resolvePersonIds } from "./person.router";

const interviewStatusSchema = z.enum(["realizado", "agendado", "cancelado"]);

export const interviewRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.interview.findMany({
        where: { companyId: input.companyId },
        include: { area: true, participants: { include: { person: true } } },
        orderBy: { scheduledDate: "desc" },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        personIds: z.array(z.string()).min(1),
        status: interviewStatusSchema.default("realizado"),
        scheduledDate: z.coerce.date(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resolvedIds = Array.from(
        new Set(await resolvePersonIds(ctx.db, input.companyId, input.personIds))
      );
      return ctx.db.interview.create({
        data: {
          companyId: input.companyId,
          status: input.status,
          scheduledDate: input.scheduledDate,
          areaId: input.areaId || null,
          participants: { create: resolvedIds.map((personId) => ({ personId })) },
        },
        include: { area: true, participants: { include: { person: true } } },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        personIds: z.array(z.string()).min(1).optional(),
        status: interviewStatusSchema.optional(),
        scheduledDate: z.coerce.date().optional(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, personIds, ...data } = input;
      if (personIds) {
        const interview = await ctx.db.interview.findUniqueOrThrow({
          where: { id },
          select: { companyId: true },
        });
        const resolvedIds = Array.from(
          new Set(await resolvePersonIds(ctx.db, interview.companyId, personIds))
        );
        await ctx.db.interviewParticipant.deleteMany({ where: { interviewId: id } });
        await ctx.db.interviewParticipant.createMany({
          data: resolvedIds.map((personId) => ({ interviewId: id, personId })),
        });
      }
      return ctx.db.interview.update({
        where: { id },
        data: {
          ...data,
          ...(data.areaId !== undefined && { areaId: data.areaId || null }),
        },
        include: { area: true, participants: { include: { person: true } } },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.interview.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
