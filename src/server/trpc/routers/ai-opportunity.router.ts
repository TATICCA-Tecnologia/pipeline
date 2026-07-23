import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { callAiChatCompletion, type AiProvider } from "@/server/ai/ai-provider-client";
import { XML_GENERATION_SYSTEM_PROMPT } from "@/server/ai/xml-generation-prompt";
import { extractXmlEntriesFromAiResponse } from "@/server/ai/extract-xml-entries";
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptInvalidVideoIdError,
  YoutubeTranscriptTooManyRequestError,
  type TranscriptResult,
} from "youtube-transcript-plus";

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

  // Busca a transcricao/legenda de um video do YouTube (gerada pelo proprio
  // YouTube, sem precisar de nenhuma API key) para popular o campo de
  // transcricao acima sem exigir copiar/colar manual. Tenta pt-BR primeiro;
  // se o video nao tiver legenda nesse idioma, usa o fallback reportado pela
  // propria lib (availableLangs) preferindo qualquer variante "pt".
  fetchYoutubeTranscript: adminProcedure
    .input(z.object({ url: z.string().min(1, "Cole o link do vídeo do YouTube.") }))
    .mutation(async ({ input }) => {
      try {
        let result: TranscriptResult;
        try {
          result = await fetchTranscript(input.url, { lang: "pt-BR", videoDetails: true });
        } catch (error) {
          if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
            const fallbackLang =
              error.availableLangs.find((l) => l.startsWith("pt")) ?? error.availableLangs[0];
            result = await fetchTranscript(input.url, { lang: fallbackLang, videoDetails: true });
          } else {
            throw error;
          }
        }

        const transcript = result.segments.map((s) => s.text).join(" ");
        return { transcript, videoTitle: result.videoDetails.title };
      } catch (error) {
        if (error instanceof YoutubeTranscriptDisabledError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este vídeo tem as transcrições/legendas desativadas pelo autor.",
          });
        }
        if (
          error instanceof YoutubeTranscriptNotAvailableError ||
          error instanceof YoutubeTranscriptNotAvailableLanguageError
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhuma transcrição disponível para este vídeo.",
          });
        }
        if (error instanceof YoutubeTranscriptVideoUnavailableError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vídeo não encontrado ou indisponível.",
          });
        }
        if (error instanceof YoutubeTranscriptInvalidVideoIdError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Link do YouTube inválido." });
        }
        if (error instanceof YoutubeTranscriptTooManyRequestError) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "YouTube limitou as requisições. Tente novamente em alguns minutos.",
          });
        }
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao buscar transcrição: ${message}`,
        });
      }
    }),
});
