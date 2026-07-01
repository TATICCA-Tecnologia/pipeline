import { z } from "zod";
import { router, adminProcedure } from "../trpc";

export const companyRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const companies = await ctx.db.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return companies.map((c) => ({ id: c.id, name: c.name }));
  }),

  create: adminProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.db.company.create({
        data: { name: input.name.trim() },
      });
      return { id: company.id, name: company.name };
    }),
});
