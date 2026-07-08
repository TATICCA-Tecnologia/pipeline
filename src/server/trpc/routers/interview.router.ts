import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

const interviewStatusSchema = z.enum(["realizado", "agendado", "cancelado"]);

export const interviewRouter = router({
  list: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.interview.findMany({
        where: { companyId: input.companyId },
        include: { area: true },
        orderBy: { scheduledDate: "desc" },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        participantName: z.string().trim().min(1),
        status: interviewStatusSchema.default("realizado"),
        scheduledDate: z.coerce.date(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.interview.create({
        data: {
          companyId: input.companyId,
          participantName: input.participantName.trim(),
          status: input.status,
          scheduledDate: input.scheduledDate,
          areaId: input.areaId || null,
        },
        include: { area: true },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        participantName: z.string().trim().min(1).optional(),
        status: interviewStatusSchema.optional(),
        scheduledDate: z.coerce.date().optional(),
        areaId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.interview.update({
        where: { id },
        data: {
          ...data,
          ...(data.participantName !== undefined && {
            participantName: data.participantName.trim(),
          }),
          ...(data.areaId !== undefined && { areaId: data.areaId || null }),
        },
        include: { area: true },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.interview.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
