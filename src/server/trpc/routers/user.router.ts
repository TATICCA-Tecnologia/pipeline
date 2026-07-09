import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashSync } from "bcryptjs";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { toFrontendRole, toPrismaRole } from "../mappers";

const PASSWORD_RESET_SALT_ROUNDS = 10;

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { companies: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: user.createdAt,
    };
  }),

  // Lista todos os usuários (qualquer role) com suas empresas vinculadas —
  // consumida pela tela /admin/clientes, que hoje gerencia pessoas de
  // qualquer role (não só CLIENT), cada uma podendo estar ligada a uma ou
  // mais empresas já cadastradas.
  list: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      include: { companies: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toFrontendRole(u.role),
      companies: u.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: u.createdAt,
    }));
  }),

  listDevelopers: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: { in: ["DEVELOPER", "SUPER_ADMIN"] }, isActive: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toFrontendRole(u.role),
      createdAt: u.createdAt,
    }));
  }),

  byId: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.id },
      include: { companies: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: toFrontendRole(user.role),
      companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
      createdAt: user.createdAt,
    };
  }),

  // Cria um usuário de qualquer role atribuível (client/developer/admin —
  // super_admin só via promoteToSuperAdmin) e opcionalmente já o vincula a
  // uma empresa existente (companyId) ou a uma nova (newCompanyName, criada
  // na hora). adminProcedure: criar contas com role elevado é ação sensível.
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["client", "developer", "admin"]).default("client"),
        companyId: z.string().optional(),
        newCompanyName: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let companyId = input.companyId;
      if (!companyId && input.newCompanyName?.trim()) {
        const company = await ctx.db.company.create({
          data: { name: input.newCompanyName.trim() },
        });
        companyId = company.id;
      }

      const user = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: toPrismaRole(input.role),
          ...(companyId ? { companies: { connect: { id: companyId } } } : {}),
        },
        include: { companies: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const user = await ctx.db.user.update({
        where: { id },
        data,
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        createdAt: user.createdAt,
      };
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
        },
        include: { companies: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),

  listMyCompanies: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { companies: true },
    });
    return (user?.companies ?? []).map((c) => ({ id: c.id, name: c.name }));
  }),

  listCompaniesForUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        include: { companies: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      return user.companies.map((c) => ({ id: c.id, name: c.name }));
    }),

  addCompanyToUser: adminProcedure
    .input(z.object({ userId: z.string(), companyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { companies: { connect: { id: input.companyId } } },
      });
      return { success: true };
    }),

  removeCompanyFromUser: adminProcedure
    .input(z.object({ userId: z.string(), companyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { companies: { disconnect: { id: input.companyId } } },
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.delete({ where: { id: input.id } });
      return { success: true };
    }),

  promoteToSuperAdmin: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data: { role: "SUPER_ADMIN" },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
      };
    }),

  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        newPassword: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const hashedPassword = hashSync(input.newPassword, PASSWORD_RESET_SALT_ROUNDS);
      await ctx.db.user.update({
        where: { id: input.userId },
        data: { password: hashedPassword },
      });
      return { success: true };
    }),
});
