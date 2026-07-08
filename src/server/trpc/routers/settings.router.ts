import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const WEIGHT_SUM_MIN = 0.99;
const WEIGHT_SUM_MAX = 1.01;

export const settingsRouter = router({
  // Garante que a linha "default" existe e a retorna (com os defaults do schema
  // na primeira vez). Admin-only: o registro carrega campos sensíveis
  // (pixKey, companyEmail, maintenanceMode, etc.) que não devem vazar para
  // usuários autenticados não-admin. A página que consome isto vive sob /admin/.
  getSettings: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
  }),

  // Atualiza os pesos de priorização. Aceita um subconjunto dos 8 campos; a
  // validação da soma (~1.0 por grupo) considera os valores novos combinados
  // com os atuais do banco para os campos não enviados.
  updateScoringWeights: adminProcedure
    .input(
      z.object({
        qualWeightErrorReduction: z.number().min(0).max(1).optional(),
        qualWeightProcessCriticality: z.number().min(0).max(1).optional(),
        qualWeightInternalImpact: z.number().min(0).max(1).optional(),
        qualWeightExternalImpact: z.number().min(0).max(1).optional(),
        qualWeightCompliance: z.number().min(0).max(1).optional(),
        scoreWeightEconomia: z.number().min(0).max(1).optional(),
        scoreWeightQualitativo: z.number().min(0).max(1).optional(),
        scoreWeightComplexidade: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {},
      });

      // Mescla valores novos sobre os atuais para validar a soma de cada grupo.
      const merged = { ...current, ...input };

      const qualSum =
        merged.qualWeightErrorReduction +
        merged.qualWeightProcessCriticality +
        merged.qualWeightInternalImpact +
        merged.qualWeightExternalImpact +
        merged.qualWeightCompliance;

      const scoreSum =
        merged.scoreWeightEconomia +
        merged.scoreWeightQualitativo +
        merged.scoreWeightComplexidade;

      if (!Number.isFinite(qualSum) || qualSum < WEIGHT_SUM_MIN || qualSum > WEIGHT_SUM_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A soma dos pesos qualitativos deve ser 1.0 (valor somado: ${Number.isFinite(qualSum) ? qualSum.toFixed(2) : "inválido"}).`,
        });
      }

      if (!Number.isFinite(scoreSum) || scoreSum < WEIGHT_SUM_MIN || scoreSum > WEIGHT_SUM_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A soma dos pesos do score combinado deve ser 1.0 (valor somado: ${Number.isFinite(scoreSum) ? scoreSum.toFixed(2) : "inválido"}).`,
        });
      }

      return ctx.db.systemSettings.update({
        where: { id: "default" },
        data: input,
      });
    }),
});
