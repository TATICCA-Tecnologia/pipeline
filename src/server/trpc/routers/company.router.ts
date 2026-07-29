import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";

export const companyRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const companies = await ctx.db.company.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return companies.map((c) => ({ id: c.id, name: c.name }));
  }),

  listAll: adminProcedure.query(async ({ ctx }) => {
    const companies = await ctx.db.company.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, projects: true } } },
    });
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      document: c.document ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      isActive: c.isActive,
      usersCount: c._count.users,
      projectsCount: c._count.projects,
      developerHourlyRateBRL: c.developerHourlyRateBRL,
      maintenanceHourlyRateBRL: c.maintenanceHourlyRateBRL,
      createdAt: c.createdAt,
    }));
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        document: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.document?.trim()) {
        const existing = await ctx.db.company.findUnique({
          where: { document: input.document.trim() },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe uma empresa cadastrada com esse CNPJ/CPF.",
          });
        }
      }
      const company = await ctx.db.company.create({
        data: {
          name: input.name.trim(),
          document: input.document?.trim() || null,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
        },
      });
      return { id: company.id, name: company.name };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        document: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
        // null = volta a herdar a taxa global de SystemSettings.
        developerHourlyRateBRL: z.number().min(0).nullable().optional(),
        maintenanceHourlyRateBRL: z.number().min(0).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, document, email, phone, ...rest } = input;
      if (document?.trim()) {
        const existing = await ctx.db.company.findFirst({
          where: { document: document.trim(), NOT: { id } },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe uma empresa cadastrada com esse CNPJ/CPF.",
          });
        }
      }
      const company = await ctx.db.company.update({
        where: { id },
        data: {
          ...rest,
          ...(document !== undefined && { document: document.trim() || null }),
          ...(email !== undefined && { email: email.trim() || null }),
          ...(phone !== undefined && { phone: phone.trim() || null }),
        },
      });
      return { id: company.id, name: company.name };
    }),

  // ==========================================
  // CUSTOS E ESTRUTURA (Pessoas, Licenças, etc.)
  // ==========================================

  listCostItems: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.companyCostItem.findMany({
        where: { companyId: input.companyId },
        include: { category: true },
        orderBy: { startDate: "desc" },
      });
    }),

  createCostItem: adminProcedure
    .input(
      z.object({
        companyId: z.string(),
        categoryId: z.string(),
        name: z.string().min(1),
        type: z.enum(["recorrente", "pontual"]),
        amountBRL: z.number().min(0),
        startDate: z.date(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.companyCostItem.create({ data: input, include: { category: true } });
    }),

  updateCostItem: adminProcedure
    .input(
      z.object({
        id: z.string(),
        categoryId: z.string().optional(),
        name: z.string().min(1).optional(),
        type: z.enum(["recorrente", "pontual"]).optional(),
        amountBRL: z.number().min(0).optional(),
        startDate: z.date().optional(),
        endDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.companyCostItem.update({ where: { id }, data, include: { category: true } });
    }),

  deleteCostItem: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.companyCostItem.delete({ where: { id: input.id } });
      return { success: true };
    }),

  getCostSummary: adminProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.companyCostItem.findMany({
        where: { companyId: input.companyId },
      });
      const now = new Date();
      const totalMonthlyRecurring = items
        .filter(
          (i) =>
            i.type === "recorrente" &&
            i.startDate <= now &&
            (i.endDate == null || i.endDate >= now)
        )
        .reduce((sum, i) => sum + i.amountBRL, 0);
      const totalOneTime = items
        .filter((i) => i.type === "pontual" && i.startDate <= now)
        .reduce((sum, i) => sum + i.amountBRL, 0);
      return { totalMonthlyRecurring, totalOneTime };
    }),
});
