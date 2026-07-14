import { z } from "zod";
import { hashSync, compareSync } from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc";
import { toFrontendRole } from "../mappers";

const SALT_ROUNDS = 10;

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
        include: { companies: true },
      });
      if (!user || !user.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      if (!user.password || !compareSync(input.password, user.password)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Email ou senha inválidos" });
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: toFrontendRole(user.role),
        companies: user.companies.map((c) => ({ id: c.id, name: c.name })),
        createdAt: user.createdAt,
      };
    }),

  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        email: z.string().email("Email inválido"),
        password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
        company: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Este email já está em uso" });
      }
      let companyId: string | null = null;
      if (input.company?.trim()) {
        let company = await ctx.db.company.findFirst({
          where: { name: input.company.trim() },
        });
        if (!company) {
          company = await ctx.db.company.create({
            data: { name: input.company.trim() },
          });
        }
        companyId = company.id;
      }
      const hashedPassword = hashSync(input.password, SALT_ROUNDS);
      const user = await ctx.db.user.create({
        data: {
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          password: hashedPassword,
          role: "CLIENT",
          phone: input.phone?.trim() || null,
          companies: companyId ? { connect: { id: companyId } } : undefined,
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
});
