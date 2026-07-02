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
});
