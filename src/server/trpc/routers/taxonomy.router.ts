import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const taxonomyRouter = router({
  // ==========================================
  // AREAS
  // ==========================================

  listAreas: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.projectArea.findMany({
      where: { isActive: true },
      include: {
        themes: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { order: "asc" },
    });
  }),

  listAllAreas: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.projectArea.findMany({
      include: {
        themes: { orderBy: { order: "asc" } },
      },
      orderBy: { order: "asc" },
    });
  }),

  createArea: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.projectArea.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma área com este slug" });
      return ctx.db.projectArea.create({ data: input, include: { themes: true } });
    }),

  updateArea: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.projectArea.update({ where: { id }, data, include: { themes: true } });
    }),

  deleteArea: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectArea.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // TEMAS
  // ==========================================

  createTheme: adminProcedure
    .input(
      z.object({
        areaId: z.string(),
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.projectTheme.findUnique({
        where: { slug_areaId: { slug: input.slug, areaId: input.areaId } },
      });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe um tema com este slug nesta área" });
      return ctx.db.projectTheme.create({ data: input });
    }),

  updateTheme: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.projectTheme.update({ where: { id }, data });
    }),

  deleteTheme: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectTheme.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // MERGE (AREA E TEMA)
  // ==========================================

  previewAreaMerge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [source, target] = await Promise.all([
        ctx.db.projectArea.findUnique({ where: { id: input.sourceId }, include: { themes: true } }),
        ctx.db.projectArea.findUnique({ where: { id: input.targetId }, include: { themes: true } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Área não encontrada" });
      }

      const targetSlugs = new Map(target.themes.map((t) => [t.slug, t.name]));
      const collisions = source.themes
        .filter((t) => targetSlugs.has(t.slug))
        .map((t) => ({
          slug: t.slug,
          sourceThemeName: t.name,
          targetThemeName: targetSlugs.get(t.slug)!,
        }));

      const [projectCount, interviewCount, suggestionCount] = await Promise.all([
        ctx.db.project.count({ where: { areaId: input.sourceId } }),
        ctx.db.interview.count({ where: { areaId: input.sourceId } }),
        ctx.db.featureSuggestion.count({ where: { areaSlug: source.slug } }),
      ]);

      return {
        themeCount: source.themes.length,
        projectCount,
        interviewCount,
        suggestionCount,
        collisions,
      };
    }),

  mergeArea: adminProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma área de destino diferente da origem" });
      }
      const [source, target] = await Promise.all([
        ctx.db.projectArea.findUnique({ where: { id: input.sourceId }, include: { themes: true } }),
        ctx.db.projectArea.findUnique({ where: { id: input.targetId }, include: { themes: true } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Área não encontrada" });
      }

      const targetSlugs = new Set(target.themes.map((t) => t.slug));
      const collisions = source.themes.filter((t) => targetSlugs.has(t.slug));
      if (collisions.length > 0) {
        const names = collisions.map((t) => `"${t.name}"`).join(", ");
        throw new TRPCError({
          code: "CONFLICT",
          message: `Não é possível mesclar: os temas ${names} já existem na área de destino. Mescle ou renomeie esses temas primeiro.`,
        });
      }

      await ctx.db.$transaction([
        ctx.db.projectTheme.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.project.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.interview.updateMany({ where: { areaId: input.sourceId }, data: { areaId: input.targetId } }),
        ctx.db.featureSuggestion.updateMany({ where: { areaSlug: source.slug }, data: { areaSlug: target.slug } }),
        ctx.db.projectArea.delete({ where: { id: input.sourceId } }),
      ]);

      return { success: true };
    }),

  previewThemeMerge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projectCount = await ctx.db.project.count({ where: { themeId: input.sourceId } });
      return { projectCount };
    }),

  mergeTheme: adminProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um tema de destino diferente da origem" });
      }
      const [source, target] = await Promise.all([
        ctx.db.projectTheme.findUnique({ where: { id: input.sourceId } }),
        ctx.db.projectTheme.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source || !target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tema não encontrado" });
      }

      await ctx.db.$transaction([
        ctx.db.project.updateMany({
          where: { themeId: input.sourceId },
          data: { themeId: input.targetId, areaId: target.areaId },
        }),
        ctx.db.projectTheme.delete({ where: { id: input.sourceId } }),
      ]);

      return { success: true };
    }),

  // ==========================================
  // SUGESTOES DE FUNCIONALIDADES
  // ==========================================

  listSuggestions: publicProcedure
    .input(z.object({ areaSlug: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.featureSuggestion.findMany({
        where: {
          isActive: true,
          ...(input.areaSlug ? { areaSlug: input.areaSlug } : {}),
        },
        orderBy: [{ areaSlug: "asc" }, { order: "asc" }],
      });
    }),

  listAllSuggestions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.featureSuggestion.findMany({
      orderBy: [{ areaSlug: "asc" }, { order: "asc" }],
    });
  }),

  createSuggestion: adminProcedure
    .input(
      z.object({
        label: z.string().min(1),
        areaSlug: z.string().min(1),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.featureSuggestion.create({ data: input });
    }),

  updateSuggestion: adminProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1).optional(),
        areaSlug: z.string().optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.featureSuggestion.update({ where: { id }, data });
    }),

  deleteSuggestion: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.featureSuggestion.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Seed: popula com os dados padrão do sistema (idempotente)
  seedDefaults: adminProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.projectArea.count();
    if (existing > 0) return { skipped: true };

    const defaultAreas = [
      {
        name: "Contabilidade",
        slug: "contabilidade",
        order: 0,
        themes: [
          { name: "Gestão fiscal", slug: "gestao-fiscal", order: 0 },
          { name: "Folha de pagamento", slug: "folha-pagamento", order: 1 },
          { name: "Balanço e DRE", slug: "balanco-dre", order: 2 },
          { name: "Obrigações acessórias", slug: "obrigacoes-acessorias", order: 3 },
          { name: "Consultoria contábil", slug: "consultoria-contabil", order: 4 },
        ],
        suggestions: [
          "Emissão de notas fiscais",
          "Cálculo automático de impostos",
          "Conciliação bancária",
          "Contas a pagar e a receber",
          "Geração de guias (DARF, GPS, DAS)",
          "Balancete e DRE automatizados",
        ],
      },
      {
        name: "RPA",
        slug: "rpa",
        order: 1,
        themes: [
          { name: "Automação de processos", slug: "automacao-processos", order: 0 },
          { name: "Integração de sistemas", slug: "integracao-sistemas", order: 1 },
          { name: "Extração de dados", slug: "extracao-dados", order: 2 },
          { name: "Geração de relatórios", slug: "geracao-relatorios", order: 3 },
          { name: "Validação e conferência", slug: "validacao-conferencia", order: 4 },
        ],
        suggestions: [
          "Leitura de XMLs e NF-e",
          "Preenchimento automático em sistemas",
          "Extração de dados de PDFs",
          "Envio automático de e-mails",
          "Validação de cadastros",
          "Integração com ERP",
        ],
      },
      {
        name: "Desenvolvimento",
        slug: "desenvolvimento",
        order: 2,
        themes: [
          { name: "Sistema web / SaaS", slug: "sistema-web", order: 0 },
          { name: "Aplicativo mobile", slug: "app-mobile", order: 1 },
          { name: "API / backend", slug: "api-backend", order: 2 },
          { name: "Website / landing page", slug: "website", order: 3 },
          { name: "Portal / intranet", slug: "portal-intranet", order: 4 },
          { name: "Manutenção / melhorias", slug: "manutencao", order: 5 },
          { name: "Integração de sistemas", slug: "integracao-sistemas", order: 6 },
        ],
        suggestions: [
          "Login e cadastro de usuários",
          "Dashboard / painel administrativo",
          "Relatórios e gráficos",
          "Notificações (e-mail / push)",
          "Upload de arquivos",
          "Integração com APIs externas",
          "Exportação de dados (PDF / Excel)",
          "Controle de permissões e usuários",
        ],
      },
      {
        name: "Consultoria técnica",
        slug: "consultoria",
        order: 3,
        themes: [{ name: "Consultoria técnica", slug: "consultoria-tecnica", order: 0 }],
        suggestions: [],
      },
      {
        name: "Outro",
        slug: "outro",
        order: 4,
        themes: [{ name: "Outro / a definir", slug: "outro-definir", order: 0 }],
        suggestions: [],
      },
    ];

    for (const area of defaultAreas) {
      const created = await ctx.db.projectArea.create({
        data: {
          name: area.name,
          slug: area.slug,
          order: area.order,
          themes: {
            create: area.themes,
          },
        },
      });
      for (let i = 0; i < area.suggestions.length; i++) {
        await ctx.db.featureSuggestion.create({
          data: { label: area.suggestions[i], areaSlug: created.slug, order: i },
        });
      }
    }

    return { seeded: true };
  }),

  // ==========================================
  // FERRAMENTA PRINCIPAL
  // ==========================================

  listMainTools: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllMainTools: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainTool.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createMainTool: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.mainTool.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma ferramenta com este slug" });
      return ctx.db.mainTool.create({ data: input });
    }),

  updateMainTool: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.mainTool.update({ where: { id }, data });
    }),

  deleteMainTool: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainTool.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
