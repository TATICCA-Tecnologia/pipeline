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
  type FetchParams,
} from "youtube-transcript-plus";

// DIAGNOSTICO TEMPORARIO — remover quando a causa em producao estiver fechada.
// A busca de transcricao funciona em dev (IP residencial) e falha em producao
// (IP de datacenter, que o YouTube trata de forma bem mais agressiva). A lib faz
// tres requisicoes em sequencia e colapsa qualquer falha numa mensagem generica,
// entao aqui envolvemos cada uma para produção dizer em QUAL etapa ela morre.
const DIAG_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function describeStage(stage: string, res: Response, text: string): string {
  const head = `[${stage}] http=${res.status} bytes=${text.length}`;
  if (stage === "watch") {
    return (
      `${head} apiKey=${/"INNERTUBE_API_KEY":"|INNERTUBE_API_KEY\\":\\"/.test(text) ? "sim" : "NAO"}` +
      ` recaptcha=${text.includes('class="g-recaptcha"') ? "SIM" : "nao"}` +
      ` consent=${/consent\.youtube\.com|CONSENT_FLOW/.test(text) ? "SIM" : "nao"}`
    );
  }
  if (stage === "player") {
    try {
      const json = JSON.parse(text);
      const tracks = json?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      return (
        `${head} playability=${json?.playabilityStatus?.status ?? "?"}` +
        ` captions=${json?.captions ? "sim" : "NAO"}` +
        ` tracks=${
          Array.isArray(tracks)
            ? tracks.map((t: { languageCode?: string; kind?: string }) =>
                `${t.languageCode}${t.kind === "asr" ? "(auto)" : ""}`).join(",") || "vazio"
            : "-"
        }`
      );
    } catch {
      return `${head} json=ILEGIVEL`;
    }
  }
  // transcript: o caso silencioso é o YouTube devolver 200 com corpo vazio
  return `${head} inicio=${JSON.stringify(text.slice(0, 120))}`;
}

// Reproduz o defaultFetch da lib, mas registra o resultado antes de devolver.
// O corpo é lido aqui, então repassamos uma Response nova com o mesmo texto.
function traceFetch(stage: string, trace: string[]) {
  return async (params: FetchParams): Promise<Response> => {
    const { url, lang, userAgent, method = "GET", body, headers = {}, signal } = params;
    const res = await fetch(url, {
      method,
      headers: {
        "User-Agent": userAgent ?? DIAG_USER_AGENT,
        ...(lang ? { "Accept-Language": lang } : {}),
        ...headers,
      },
      ...(body && method === "POST" ? { body } : {}),
      signal,
    });
    const text = await res.text();
    trace.push(describeStage(stage, res, text));
    return new Response(text, { status: res.status, statusText: res.statusText });
  };
}

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
      const trace: string[] = [];
      const diag = {
        videoFetch: traceFetch("watch", trace),
        playerFetch: traceFetch("player", trace),
        transcriptFetch: traceFetch("transcript", trace),
      };
      try {
        let result: TranscriptResult;
        try {
          result = await fetchTranscript(input.url, {
            lang: "pt-BR",
            videoDetails: true,
            ...diag,
          });
        } catch (error) {
          if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
            const fallbackLang =
              error.availableLangs.find((l) => l.startsWith("pt")) ?? error.availableLangs[0];
            trace.push(`[fallback] pt-BR indisponivel, tentando "${fallbackLang}"`);
            result = await fetchTranscript(input.url, {
              lang: fallbackLang,
              videoDetails: true,
              ...diag,
            });
          } else {
            throw error;
          }
        }

        const transcript = result.segments.map((s) => s.text).join(" ");
        return { transcript, videoTitle: result.videoDetails.title };
      } catch (error) {
        let code: TRPCError["code"] = "INTERNAL_SERVER_ERROR";
        let message: string;

        if (error instanceof YoutubeTranscriptDisabledError) {
          code = "BAD_REQUEST";
          message = "Este vídeo tem as transcrições/legendas desativadas pelo autor.";
        } else if (
          error instanceof YoutubeTranscriptNotAvailableError ||
          error instanceof YoutubeTranscriptNotAvailableLanguageError
        ) {
          code = "BAD_REQUEST";
          message = "Nenhuma transcrição disponível para este vídeo.";
        } else if (error instanceof YoutubeTranscriptVideoUnavailableError) {
          code = "BAD_REQUEST";
          message = "Vídeo não encontrado ou indisponível.";
        } else if (error instanceof YoutubeTranscriptInvalidVideoIdError) {
          code = "BAD_REQUEST";
          message = "Link do YouTube inválido.";
        } else if (error instanceof YoutubeTranscriptTooManyRequestError) {
          code = "TOO_MANY_REQUESTS";
          message = "YouTube limitou as requisições. Tente novamente em alguns minutos.";
        } else {
          message = `Falha ao buscar transcrição: ${
            error instanceof Error ? error.message : "Erro desconhecido"
          }`;
        }

        // DIAGNOSTICO TEMPORARIO — o trace revela em qual das tres requisicoes o
        // YouTube corta em producao. Sai no log do container e tambem na tela
        // (rota é adminProcedure, so admin ve).
        const detail = trace.length > 0 ? trace.join(" | ") : "nenhuma requisicao completou";
        console.error("[fetchYoutubeTranscript]", input.url, "->", error, "| trace:", detail);
        throw new TRPCError({ code, message: `${message}\n\n[diag] ${detail}` });
      }
    }),
});
