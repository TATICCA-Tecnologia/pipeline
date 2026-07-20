import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { callAiChatCompletion, type AiProvider } from "@/server/ai/ai-provider-client";
import { XML_GENERATION_SYSTEM_PROMPT } from "@/server/ai/xml-generation-prompt";
import { extractXmlEntriesFromAiResponse } from "@/server/ai/extract-xml-entries";

export const aiOpportunityRouter = router({
  // Não recebe companyId: a empresa é sempre escolhida no client ANTES de
  // gerar e é forçada em cada XML resultante ali (ver
  // useXmlOpportunityImporter, forcedCompanyId) — a tag <empresa> que a IA
  // eventualmente preencher é ignorada, então não precisa nem ser informada
  // aqui pra melhorar a geração.
  generateFromTranscript: adminProcedure
    .input(z.object({ transcript: z.string().min(1, "Cole a transcrição da reunião.") }))
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.systemSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: {},
      });

      if (!settings.aiProvider || !settings.aiModel || !settings.aiApiKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Nenhuma API de IA configurada. Acesse Configurações → Integração de IA antes de gerar oportunidades.",
        });
      }

      let rawResponse: string;
      try {
        rawResponse = await callAiChatCompletion(
          {
            provider: settings.aiProvider as AiProvider,
            apiKey: settings.aiApiKey,
            model: settings.aiModel,
            baseUrl: settings.aiBaseUrl,
          },
          { systemPrompt: XML_GENERATION_SYSTEM_PROMPT, userMessage: input.transcript }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao chamar a IA: ${message}`,
        });
      }

      const xmlEntries = extractXmlEntriesFromAiResponse(rawResponse);
      if (xmlEntries.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A IA não retornou nenhum XML reconhecível. Resposta bruta:\n\n${rawResponse.slice(0, 4000)}`,
        });
      }

      return { xmlEntries };
    }),
});
