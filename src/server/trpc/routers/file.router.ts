import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { uploadToMinio } from "@/shared/lib/minio";

export const fileRouter = router({
  byProject: publicProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const files = await ctx.db.projectFile.findMany({
        where: { projectId: input.projectId },
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return files.map((f) => ({
        id: f.id,
        projectId: f.projectId,
        name: f.name,
        url: `/api/files/${f.id}`,
        type: f.type,
        size: f.size,
        uploadedBy: f.uploadedBy.name,
        createdAt: f.createdAt,
      }));
    }),

  // Upload completo via MinIO (recomendado)
  upload: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        type: z.string().optional(),
        size: z.number(),
        data: z.string(), // base64 (sem prefixo data:)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.data, "base64");

      const result = await uploadToMinio({
        bucket: "project-files",
        fileName: input.name,
        buffer,
        contentType: input.type || "application/octet-stream",
        prefix: input.projectId,
      });

      const file = await ctx.db.projectFile.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          url: result.url,
          type: input.type || "application/octet-stream",
          size: input.size,
          uploadedById: ctx.userId,
        },
        include: { uploadedBy: { select: { name: true } } },
      });

      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Arquivo anexado",
          details: file.name,
        },
      });

      return {
        id: file.id,
        projectId: file.projectId,
        name: file.name,
        url: `/api/files/${file.id}`,
        type: file.type,
        size: file.size,
        uploadedBy: file.uploadedBy.name,
        createdAt: file.createdAt,
      };
    }),

  // Mantido por compatibilidade (caso já possua URL pronta)
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        url: z.string(),
        type: z.string(),
        size: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.projectFile.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          url: input.url,
          type: input.type,
          size: input.size,
          uploadedById: ctx.userId,
        },
        include: { uploadedBy: { select: { name: true } } },
      });

      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Arquivo anexado",
          details: file.name,
        },
      });

      return {
        id: file.id,
        projectId: file.projectId,
        name: file.name,
        url: `/api/files/${file.id}`,
        type: file.type,
        size: file.size,
        uploadedBy: file.uploadedBy.name,
        createdAt: file.createdAt,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.projectFile.findUnique({
        where: { id: input.id },
      });

      await ctx.db.projectFile.delete({ where: { id: input.id } });

      if (file) {
        await ctx.db.activityLog.create({
          data: {
            projectId: file.projectId,
            userId: ctx.userId,
            action: "Arquivo removido",
            details: file.name,
          },
        });
      }
      return { success: true };
    }),
});
