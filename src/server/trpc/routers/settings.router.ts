import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const WEIGHT_SUM_MIN = 0.99;
const WEIGHT_SUM_MAX = 1.01;

export const settingsRouter = router({
  // Garante que a linha "default" existe e a retorna (com os defaults do schema
  // na primeira vez).
  getSettings: protectedProcedure.query(async ({ ctx }) => {
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
        qualWeightErrorReduction: z.number().optional(),
        qualWeightProcessCriticality: z.number().optional(),
        qualWeightInternalImpact: z.number().optional(),
        qualWeightExternalImpact: z.number().optional(),
        qualWeightCompliance: z.number().optional(),
        scoreWeightEconomia: z.number().optional(),
        scoreWeightQualitativo: z.number().optional(),
        scoreWeightComplexidade: z.number().optional(),
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

      if (qualSum < WEIGHT_SUM_MIN || qualSum > WEIGHT_SUM_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A soma dos pesos qualitativos deve ser 1.0 (valor somado: ${qualSum.toFixed(2)}).`,
        });
      }

      if (scoreSum < WEIGHT_SUM_MIN || scoreSum > WEIGHT_SUM_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A soma dos pesos do score combinado deve ser 1.0 (valor somado: ${scoreSum.toFixed(2)}).`,
        });
      }

      return ctx.db.systemSettings.update({
        where: { id: "default" },
        data: input,
      });
    }),
});
