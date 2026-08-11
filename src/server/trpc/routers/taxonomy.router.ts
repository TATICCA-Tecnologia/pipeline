import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

/**
 * Taxonomias que suportam mesclagem genérica (`previewMerge`/`merge`).
 *
 * Área e Tema ficam de fora de propósito: têm mesclagem própria
 * (`mergeArea`/`mergeTheme`) porque precisam tratar colisão de temas entre as
 * duas áreas, o que não existe nestas outras.
 */
const MERGE_TYPE = z.enum([
  "mainTool",
  "mainToolCategory",
  "targetSystem",
  "targetSystemCategory",
  "projectKind",
  "costCategory",
  "urgencyLevel",
]);

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
      if (!target.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível mesclar para uma área inativa" });
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
      if (!target.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível mesclar para um tema inativo" });
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
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { order: "asc" },
    });
  }),

  createMainTool: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
        categoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Idempotente por slug, em vez de CONFLICT: `listMainTools` só devolve
      // ferramentas ativas, e a tela de Arquitetura ainda filtra por categoria
      // — então uma ferramenta que existe mas está inativa (ou está em outra
      // categoria) fica invisível para o usuário, que naturalmente tenta
      // criá-la. Com CONFLICT ele entrava num beco sem saída: não conseguia
      // nem ver nem criar. Aqui a ferramenta existente é reativada, recebe a
      // categoria caso ainda não tenha uma, e é devolvida como se tivesse sido
      // criada — que é exatamente o que o usuário pediu.
      const exists = await ctx.db.mainTool.findUnique({ where: { slug: input.slug } });
      if (exists) {
        return ctx.db.mainTool.update({
          where: { id: exists.id },
          data: {
            isActive: true,
            // Não sobrescreve uma categoria já definida: o usuário pode estar
            // criando a partir de outra categoria sem querer remanejar a
            // ferramenta existente.
            ...(exists.categoryId == null && input.categoryId != null
              ? { categoryId: input.categoryId }
              : {}),
          },
        });
      }
      return ctx.db.mainTool.create({ data: input });
    }),

  updateMainTool: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
        categoryId: z.string().nullable().optional(),
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

  // ==========================================
  // SISTEMA-ALVO
  // ==========================================

  listTargetSystems: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.targetSystem.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllTargetSystems: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.targetSystem.findMany({
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: { order: "asc" },
    });
  }),

  createTargetSystem: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
        categoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Idempotente por slug, em vez de CONFLICT: `listTargetSystems` só devolve
      // sistemas ativos, e a tela de seleção vai filtrar por categoria — então
      // um sistema que existe mas está inativo (ou está em outra categoria)
      // ficaria invisível para o usuário, que naturalmente tentaria recriá-lo.
      // Com CONFLICT ele entraria num beco sem saída: não conseguiria nem ver
      // nem criar. Aqui o sistema existente é reativado, recebe a categoria
      // caso ainda não tenha uma, e é devolvido como se tivesse sido criado —
      // que é exatamente o que o usuário pediu.
      const exists = await ctx.db.targetSystem.findUnique({ where: { slug: input.slug } });
      if (exists) {
        return ctx.db.targetSystem.update({
          where: { id: exists.id },
          data: {
            isActive: true,
            // Não sobrescreve uma categoria já definida: o usuário pode estar
            // criando a partir de outra categoria sem querer remanejar o
            // sistema existente.
            ...(exists.categoryId == null && input.categoryId != null
              ? { categoryId: input.categoryId }
              : {}),
          },
        });
      }
      return ctx.db.targetSystem.create({ data: input });
    }),

  updateTargetSystem: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
        order: z.number().int().optional(),
        categoryId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.targetSystem.update({ where: { id }, data });
    }),

  deleteTargetSystem: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const system = await ctx.db.targetSystem.findUnique({ where: { id: input.id } });
      if (!system) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sistema não encontrado" });
      }
      await ctx.db.$transaction(async (tx) => {
        // SetNull deixaria a linha sem targetSystemId E sem customName — exatamente o
        // que o comentário de ProjectTargetSystem chama de "linha sem sentido", com
        // accessPoint, accessNotes e contas penduradas em nada. Rebaixar para texto
        // livre preserva a informação: o projeto continua registrando que atua sobre
        // esse sistema, só não aponta mais para o catálogo.
        await tx.projectTargetSystem.updateMany({
          where: { targetSystemId: input.id, customName: null },
          data: { customName: system.name },
        });
        await tx.targetSystem.delete({ where: { id: input.id } });
      });
      return { success: true };
    }),

  // ==========================================
  // TIPO DE PROJETO
  // ==========================================

  listProjectKinds: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.projectKind.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllProjectKinds: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.projectKind.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createProjectKind: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.projectKind.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe um tipo de projeto com este slug" });
      return ctx.db.projectKind.create({ data: input });
    }),

  updateProjectKind: adminProcedure
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
      return ctx.db.projectKind.update({ where: { id }, data });
    }),

  deleteProjectKind: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.projectKind.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // CATEGORIAS DE CUSTO DE EMPRESA
  // ==========================================

  listCostCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.companyCostCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllCostCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.companyCostCategory.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createCostCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.companyCostCategory.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma categoria de custo com este slug" });
      return ctx.db.companyCostCategory.create({ data: input });
    }),

  updateCostCategory: adminProcedure
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
      return ctx.db.companyCostCategory.update({ where: { id }, data });
    }),

  deleteCostCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const itemCount = await ctx.db.companyCostItem.count({ where: { categoryId: input.id } });
      if (itemCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Não é possível excluir uma categoria com itens de custo vinculados. Mova ou exclua os itens primeiro.",
        });
      }
      await ctx.db.companyCostCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // CATEGORIA DE FERRAMENTA
  // ==========================================

  listMainToolCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.mainToolCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllMainToolCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.mainToolCategory.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createMainToolCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Mesmo motivo do createMainTool acima: uma categoria inativa some do
      // `listMainToolCategories` e o usuário não conseguia nem selecioná-la nem
      // recriá-la.
      const exists = await ctx.db.mainToolCategory.findUnique({ where: { slug: input.slug } });
      if (exists) {
        return ctx.db.mainToolCategory.update({
          where: { id: exists.id },
          data: { isActive: true },
        });
      }
      return ctx.db.mainToolCategory.create({ data: input });
    }),

  updateMainToolCategory: adminProcedure
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
      return ctx.db.mainToolCategory.update({ where: { id }, data });
    }),

  deleteMainToolCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.mainToolCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // CATEGORIA DE SISTEMA-ALVO
  // ==========================================

  listTargetSystemCategories: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.targetSystemCategory.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllTargetSystemCategories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.targetSystemCategory.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createTargetSystemCategory: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Mesmo motivo do createTargetSystem acima: uma categoria inativa some do
      // `listTargetSystemCategories` e o usuário não conseguia nem selecioná-la nem
      // recriá-la.
      const exists = await ctx.db.targetSystemCategory.findUnique({ where: { slug: input.slug } });
      if (exists) {
        return ctx.db.targetSystemCategory.update({
          where: { id: exists.id },
          data: { isActive: true },
        });
      }
      return ctx.db.targetSystemCategory.create({ data: input });
    }),

  updateTargetSystemCategory: adminProcedure
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
      return ctx.db.targetSystemCategory.update({ where: { id }, data });
    }),

  deleteTargetSystemCategory: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.targetSystemCategory.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ==========================================
  // NIVEL DE URGENCIA
  // ==========================================

  listUrgencyLevels: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.urgencyLevel.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  }),

  listAllUrgencyLevels: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.urgencyLevel.findMany({
      orderBy: { order: "asc" },
    });
  }),

  createUrgencyLevel: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
        order: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.urgencyLevel.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: "CONFLICT", message: "Já existe um nível de urgência com este slug" });
      return ctx.db.urgencyLevel.create({ data: input });
    }),

  updateUrgencyLevel: adminProcedure
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
      return ctx.db.urgencyLevel.update({ where: { id }, data });
    }),

  deleteUrgencyLevel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.urgencyLevel.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /**
   * Mescla dois registros de taxonomia: tudo que apontava para `sourceId`
   * passa a apontar para `targetId`, e o registro de origem é apagado.
   *
   * Existe porque as taxonomias podem ser criadas na hora, direto do combobox
   * de um formulário — o que é bom para não travar quem está preenchendo, mas
   * inevitavelmente gera duplicatas ("Power Automate" e "Power-Automate",
   * "Python" e "Python 3"). Sem uma forma de juntar, a lista degrada com o
   * tempo e os rankings por ferramenta ficam divididos entre grafias.
   *
   * Tudo numa transação: repontar sem apagar deixaria duplicata viva, e apagar
   * sem repontar perderia o vínculo dos projetos (as FKs são `onDelete:
   * SetNull`, então a falha seria silenciosa — o projeto simplesmente ficaria
   * sem ferramenta).
   */
  /**
   * Quantos registros a mesclagem vai mover. Mesma ideia do
   * `previewAreaMerge`: mesclagem não tem desfazer, então a confirmação precisa
   * dizer o tamanho do estrago antes, não depois.
   */
  previewMerge: adminProcedure
    .input(z.object({ type: MERGE_TYPE, sourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { type, sourceId } = input;
      switch (type) {
        case "mainTool":
          return {
            projectCount: await ctx.db.project.count({ where: { mainToolId: sourceId } }),
            extraCount: 0,
            extraLabel: null,
          };
        case "mainToolCategory":
          return {
            projectCount: await ctx.db.project.count({
              where: { mainToolCategoryId: sourceId },
            }),
            extraCount: await ctx.db.mainTool.count({ where: { categoryId: sourceId } }),
            extraLabel: "ferramenta",
          };
        case "targetSystem":
          // Ao contrário de `mainTool`, `Project` não tem FK direta para
          // `TargetSystem` — o vínculo passa pela tabela de junção
          // `ProjectTargetSystem`.
          return {
            projectCount: await ctx.db.projectTargetSystem.count({
              where: { targetSystemId: sourceId },
            }),
            extraCount: 0,
            extraLabel: null,
          };
        case "targetSystemCategory":
          // Diferente de `mainToolCategory`, `Project` não tem uma FK direta
          // para a categoria de sistema-alvo (só para o sistema em si, via
          // `ProjectTargetSystem`) — então não existe "projeto que selecionou
          // só a categoria" para contar aqui.
          return {
            projectCount: 0,
            extraCount: await ctx.db.targetSystem.count({ where: { categoryId: sourceId } }),
            extraLabel: "sistema",
          };
        case "projectKind":
          return {
            projectCount: await ctx.db.project.count({
              where: { solutionTypes: { some: { id: sourceId } } },
            }),
            extraCount: 0,
            extraLabel: null,
          };
        case "costCategory":
          return {
            projectCount: 0,
            extraCount: await ctx.db.companyCostItem.count({
              where: { categoryId: sourceId },
            }),
            extraLabel: "item de custo",
          };
        case "urgencyLevel": {
          const source = await ctx.db.urgencyLevel.findUnique({ where: { id: sourceId } });
          return {
            projectCount: source
              ? await ctx.db.project.count({
                  where: { OR: [{ urgency: source.name }, { urgency: source.slug }] },
                })
              : 0,
            extraCount: 0,
            extraLabel: null,
          };
        }
      }
    }),

  merge: adminProcedure
    .input(
      z.object({
        type: MERGE_TYPE,
        sourceId: z.string(),
        targetId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { type, sourceId, targetId } = input;
      if (sourceId === targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não é possível mesclar um registro com ele mesmo.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        switch (type) {
          case "mainTool": {
            await tx.project.updateMany({
              where: { mainToolId: sourceId },
              data: { mainToolId: targetId },
            });
            await tx.mainTool.delete({ where: { id: sourceId } });
            break;
          }
          case "mainToolCategory": {
            await tx.project.updateMany({
              where: { mainToolCategoryId: sourceId },
              data: { mainToolCategoryId: targetId },
            });
            // As ferramentas da categoria de origem também precisam migrar,
            // senão ficariam órfãs (categoryId vira null pelo SetNull) e
            // sumiriam dos filtros por categoria.
            await tx.mainTool.updateMany({
              where: { categoryId: sourceId },
              data: { categoryId: targetId },
            });
            await tx.mainToolCategory.delete({ where: { id: sourceId } });
            break;
          }
          case "targetSystem": {
            // Ao contrário de `mainTool`, o vínculo com projeto não é uma
            // coluna de `Project`, e sim linhas de `ProjectTargetSystem` — o
            // reponte é sobre essa tabela de junção.
            await tx.projectTargetSystem.updateMany({
              where: { targetSystemId: sourceId },
              data: { targetSystemId: targetId },
            });
            await tx.targetSystem.delete({ where: { id: sourceId } });
            break;
          }
          case "targetSystemCategory": {
            // Os sistemas da categoria de origem também precisam migrar,
            // senão ficariam órfãos (categoryId vira null pelo SetNull) e
            // sumiriam dos filtros por categoria.
            await tx.targetSystem.updateMany({
              where: { categoryId: sourceId },
              data: { categoryId: targetId },
            });
            await tx.targetSystemCategory.delete({ where: { id: sourceId } });
            break;
          }
          case "projectKind": {
            // Relação N-N: não há coluna para atualizar. Cada projeto ligado à
            // origem passa a se ligar ao destino; `connect` é idempotente, então
            // projetos que já tinham os dois não viram duplicata.
            const linked = await tx.project.findMany({
              where: { solutionTypes: { some: { id: sourceId } } },
              select: { id: true },
            });
            for (const project of linked) {
              await tx.project.update({
                where: { id: project.id },
                data: {
                  solutionTypes: {
                    connect: { id: targetId },
                    disconnect: { id: sourceId },
                  },
                },
              });
            }
            await tx.projectKind.delete({ where: { id: sourceId } });
            break;
          }
          case "costCategory": {
            // FK com `onDelete: Restrict`: sem repontar antes, o delete falha.
            await tx.companyCostItem.updateMany({
              where: { categoryId: sourceId },
              data: { categoryId: targetId },
            });
            await tx.companyCostCategory.delete({ where: { id: sourceId } });
            break;
          }
          case "urgencyLevel": {
            // `Project.urgency` é texto livre, sem FK — então além de apagar o
            // nível de origem é preciso reescrever os projetos que guardaram o
            // nome antigo, senão eles ficariam com um valor que não existe mais
            // em nenhuma lista.
            const [source, target] = await Promise.all([
              tx.urgencyLevel.findUnique({ where: { id: sourceId } }),
              tx.urgencyLevel.findUnique({ where: { id: targetId } }),
            ]);
            if (!source || !target) {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Nível de urgência não encontrado.",
              });
            }
            await tx.project.updateMany({
              where: { urgency: source.name },
              data: { urgency: target.name },
            });
            await tx.project.updateMany({
              where: { urgency: source.slug },
              data: { urgency: target.slug },
            });
            await tx.urgencyLevel.delete({ where: { id: sourceId } });
            break;
          }
        }
        return { success: true };
      });
    }),
});
