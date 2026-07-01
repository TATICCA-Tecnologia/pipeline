import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashSync } from "bcryptjs";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { toFrontendRole } from "../mappers";

const PASSWORD_RESET_SALT_ROUNDS = 10;

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { company: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      company: user.company?.name ?? "",
      createdAt: user.createdAt,
    };
  }),

  listClients: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { role: "CLIENT" },
      include: { company: true },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: toFrontendRole(u.role),
      company: u.company?.name,
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
      include: { company: true },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: toFrontendRole(user.role),
      company: user.company?.name,
      createdAt: user.createdAt,
    };
  }),

  createClient: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        company: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: "CLIENT",
        },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
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
        companyName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let companyId: string | null = null;
      if (input.companyName != null && input.companyName.trim() !== "") {
        let company = await ctx.db.company.findFirst({
          where: { name: input.companyName.trim() },
        });
        if (!company) {
          company = await ctx.db.company.create({
            data: { name: input.companyName.trim() },
          });
        }
        companyId = company.id;
      }
      const user = await ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          ...(input.name != null && { name: input.name }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
          ...(companyId !== null && { companyId }),
        },
        include: { company: true },
      });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? "",
        company: user.company?.name ?? "",
        createdAt: user.createdAt,
      };
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
