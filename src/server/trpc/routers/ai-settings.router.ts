import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { AI_PROVIDERS, callAiChatCompletion, type AiProvider } from "@/server/ai/ai-provider-client";

function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

const aiConfigInputShape = {
  provider: z.enum(AI_PROVIDERS as [AiProvider, ...AiProvider[]]),
  model: z.string().min(1, "Informe o modelo."),
  // Vazio/ausente = manter a chave já salva (nunca sobrescreve com vazio).
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
};

export const aiSettingsRouter = router({
  // Nunca retorna aiApiKey em texto puro — só mascarado, e só um booleano
  // hasApiKey pra a UI saber se já existe alguma chave salva.
  getAiConfig: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
    return {
      provider: (settings.aiProvider as AiProvider | null) ?? null,
      model: settings.aiModel,
      baseUrl: settings.aiBaseUrl,
      hasApiKey: !!settings.aiApiKey,
      apiKeyMasked: maskApiKey(settings.aiApiKey),
    };
  }),

  updateAiConfig: adminProcedure
    .input(z.object(aiConfigInputShape))
    .mutation(async ({ ctx, input }) => {
      if (input.provider === "custom" && !input.baseUrl?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL base é obrigatória para o provedor Custom.",
        });
      }
      const current = await ctx.db.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {},
      });
      await ctx.db.systemSettings.update({
        where: { id: "default" },
        data: {
          aiProvider: input.provider,
          aiModel: input.model,
          aiBaseUrl: input.provider === "custom" ? input.baseUrl!.trim() : null,
          aiApiKey: input.apiKey?.trim() ? input.apiKey.trim() : current.aiApiKey,
        },
      });
      return { success: true };
    }),

  // Testa a conexão SEM salvar — usa a apiKey enviada, ou (se o campo do
  // formulário foi deixado em branco) a que já está salva, pra permitir
  // testar sem precisar redigitar uma chave que o admin já configurou antes.
  testAiConnection: adminProcedure
    .input(z.object(aiConfigInputShape))
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.db.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {},
      });
      const apiKey = input.apiKey?.trim() || current.aiApiKey;
      if (!apiKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma API key para testar." });
      }
      if (input.provider === "custom" && !input.baseUrl?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "URL base é obrigatória para o provedor Custom.",
        });
      }
      try {
        const text = await callAiChatCompletion(
          { provider: input.provider, apiKey, model: input.model, baseUrl: input.baseUrl },
          { systemPrompt: "Responda apenas com a palavra: ok", userMessage: "teste de conexão" }
        );
        return { success: true, sample: text.slice(0, 200) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        throw new TRPCError({ code: "BAD_REQUEST", message: `Falha ao conectar: ${message}` });
      }
    }),
});
