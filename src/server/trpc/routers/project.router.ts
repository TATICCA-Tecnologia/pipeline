import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { toFrontendStatus, toPrismaStatus } from "../mappers";
import type { FrontendProjectStatus } from "../mappers";

const projectStatusSchema = z.enum([
  "backlog",
  "todo",
  "in-progress",
  "review",
  "completed",
  "cancelled",
]);

export const projectRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          clientId: z.string().optional(),
          developerId: z.string().optional(),
          status: projectStatusSchema.optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {};
      if (input?.clientId) where.clientId = input.clientId;
      if (input?.developerId) where.developerId = input.developerId;
      if (input?.status) where.status = toPrismaStatus(input.status as FrontendProjectStatus);

      const projects = await ctx.db.project.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: {
          client: {
            select: { id: true, name: true, email: true, role: true },
          },
          developer: {
            select: { id: true, name: true, email: true },
          },
          company: {
            select: { id: true, name: true },
          },
          features: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      return projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        status: toFrontendStatus(p.status),
        priority: p.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: p.clientId,
        developerId: p.developerId ?? undefined,
        companyId: p.companyId ?? undefined,
        companyName: p.company?.name,
        projectType: p.platform ?? p.type,
        estimatedDeadline: p.deadline ?? undefined,
        targetAudience: p.targetAudience ?? undefined,
        expectedUsers: p.expectedUsers ?? undefined,
        urgency: p.urgency ?? undefined,
        features: p.features?.map((f) => f.name) ?? [],
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        client: p.client
          ? {
              id: p.client.id,
              name: p.client.name,
              email: p.client.email,
              role: p.client.role,
            }
          : undefined,
        developer: p.developer
          ? { id: p.developer.id, name: p.developer.name, email: p.developer.email }
          : undefined,
      }));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          client: { select: { id: true, name: true, email: true, role: true } },
          developer: { select: { id: true, name: true, email: true } },
          company: { select: { id: true, name: true } },
          tasks: true,
          features: true,
        },
      });
      if (!project)
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase() as "low" | "medium" | "high" | "urgent",
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        companyId: project.companyId ?? undefined,
        companyName: project.company?.name,
        projectType: project.platform ?? project.type,
        estimatedDeadline: project.deadline ?? undefined,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        solutionTypes: (project.solutionTypes as string[] | null) ?? [],
        mainTool: project.mainTool ?? undefined,
        executionStrategy: project.executionStrategy ?? undefined,
        architectNotes: project.architectNotes ?? undefined,
        features:
          project.features?.map((f) => ({
            id: f.id,
            name: f.name,
            completedAt: f.completedAt ?? undefined,
          })) ?? [],
        tasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
        })),
        client: project.client,
        developer: project.developer,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: projectStatusSchema.default("backlog"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        clientId: z.string(),
        developerId: z.string().optional(),
        companyId: z.string().optional(),
        projectType: z.string(),
        estimatedDeadline: z.date().optional(),
        targetAudience: z.string().optional(),
        expectedUsers: z.string().optional(),
        urgency: z.string().optional(),
        features: z.array(z.string()).optional(),
        // Campos novos do formulário de solicitação
        additionalInfo: z.string().optional(),
        hasExistingSystem: z.string().optional(),
        existingSystemDetails: z.string().optional(),
        projectNarrative: z.string().optional(),
        benefits: z.array(z.string()).optional(),
        benefitsDetails: z.string().optional(),
        monthlyHoursSaved: z.number().optional(),
        ratingErrorReduction: z.number().int().min(1).max(5).optional(),
        ratingProcessCriticality: z.number().int().min(1).max(5).optional(),
        ratingInternalImpact: z.number().int().min(1).max(5).optional(),
        ratingExternalImpact: z.number().int().min(1).max(5).optional(),
        ratingCompliance: z.number().int().min(1).max(5).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.user.findUnique({ where: { id: input.clientId } });
      if (!client) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cliente inválido (clientId não existe). Em ambiente local, rode o seed do Prisma ou selecione um cliente válido.",
        });
      }

      if (input.developerId) {
        const developer = await ctx.db.user.findUnique({ where: { id: input.developerId } });
        if (!developer) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Desenvolvedor inválido (developerId não existe). Selecione um desenvolvedor válido.",
          });
        }
      }

      const project = await ctx.db.project.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          type: "OUTRO",
          category: "OUTRO",
          status: toPrismaStatus(input.status as FrontendProjectStatus),
          priority: input.priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
          clientId: input.clientId,
          developerId: input.developerId ?? null,
          companyId: input.companyId ?? null,
          platform: input.projectType,
          deadline: input.estimatedDeadline ?? null,
          targetAudience: input.targetAudience ?? null,
          expectedUsers: input.expectedUsers ?? null,
          urgency: input.urgency ?? null,
          additionalInfo: input.additionalInfo ?? null,
          hasExistingSystem: input.hasExistingSystem ?? null,
          existingSystemDetails: input.existingSystemDetails ?? null,
          projectNarrative: input.projectNarrative ?? null,
          benefits: input.benefits ?? undefined,
          benefitsDetails: input.benefitsDetails ?? null,
          monthlyHoursSaved: input.monthlyHoursSaved ?? null,
          ratingErrorReduction: input.ratingErrorReduction ?? null,
          ratingProcessCriticality: input.ratingProcessCriticality ?? null,
          ratingInternalImpact: input.ratingInternalImpact ?? null,
          ratingExternalImpact: input.ratingExternalImpact ?? null,
          ratingCompliance: input.ratingCompliance ?? null,
          features:
            input.features && input.features.length
              ? {
                  create: input.features.map((name) => ({ name })),
                }
              : undefined,
        },
        include: {
          client: { select: { id: true, name: true, email: true } },
          developer: { select: { id: true, name: true, email: true } },
          features: true,
        },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: "Projeto criado",
        },
      });
      return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase(),
        clientId: project.clientId,
        developerId: project.developerId ?? undefined,
        projectType: project.platform ?? "",
        estimatedDeadline: project.deadline ?? undefined,
        targetAudience: project.targetAudience ?? undefined,
        expectedUsers: project.expectedUsers ?? undefined,
        urgency: project.urgency ?? undefined,
        features: project.features?.map((f) => f.name) ?? [],
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        status: projectStatusSchema.optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        developerId: z.string().nullable().optional(),
        companyId: z.string().nullable().optional(),
        estimatedDeadline: z.date().nullable().optional(),
        solutionTypes: z.array(z.string()).optional(),
        mainTool: z.string().nullable().optional(),
        executionStrategy: z.string().nullable().optional(),
        architectNotes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const data: Record<string, unknown> = {};
      if (rest.title != null) data.title = rest.title;
      if (rest.description != null) data.description = rest.description;
      if (rest.status != null) data.status = toPrismaStatus(rest.status as FrontendProjectStatus);
      if (rest.priority != null) data.priority = rest.priority.toUpperCase();
      if (rest.developerId !== undefined) data.developerId = rest.developerId;
      if (rest.companyId !== undefined) data.companyId = rest.companyId;
      if (rest.estimatedDeadline !== undefined) data.deadline = rest.estimatedDeadline;
      if (rest.solutionTypes !== undefined) data.solutionTypes = rest.solutionTypes;
      if (rest.mainTool !== undefined) data.mainTool = rest.mainTool;
      if (rest.executionStrategy !== undefined) data.executionStrategy = rest.executionStrategy;
      if (rest.architectNotes !== undefined) data.architectNotes = rest.architectNotes;

      const project = await ctx.db.project.update({
        where: { id },
        data,
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: "Projeto atualizado",
        },
      });
      return {
        ...project,
        status: toFrontendStatus(project.status),
        priority: project.priority.toLowerCase(),
        developerId: project.developerId ?? undefined,
        estimatedDeadline: project.deadline ?? undefined,
      };
    }),

  move: protectedProcedure
    .input(z.object({ id: z.string(), status: projectStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.update({
        where: { id: input.id },
        data: { status: toPrismaStatus(input.status as FrontendProjectStatus) },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: project.id,
          userId: ctx.userId,
          action: `Status alterado para ${input.status}`,
        },
      });
      return { ...project, status: toFrontendStatus(project.status) };
    }),
});
