import OpenAI from "openai";

export type AiProvider = "openai" | "anthropic" | "gemini" | "custom";

export const AI_PROVIDERS: AiProvider[] = ["openai", "anthropic", "gemini", "custom"];

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
}

// OpenAI, Anthropic e Google Gemini expõem (ou têm um modo de compatibilidade
// oficial para) o formato de Chat Completions da OpenAI — por isso os 3
// presets, mais "custom", reduzem a UM único cliente (`openai` SDK), variando
// só a baseURL. Se o endpoint de compatibilidade de algum provedor não
// funcionar pra uma conta específica (region lock, feature beta etc.), o
// admin sempre pode cair pro preset "Custom" com a URL exata que funciona
// pra ele — por isso a tela de configuração tem um botão "Testar conexão"
// (ver ai-settings.router.ts) antes de salvar.
const DEFAULT_BASE_URLS: Record<Exclude<AiProvider, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};

export function resolveBaseUrl(config: AiProviderConfig): string {
  if (config.provider === "custom") {
    if (!config.baseUrl?.trim()) {
      throw new Error("URL base é obrigatória para o provedor Custom.");
    }
    return config.baseUrl.trim();
  }
  return DEFAULT_BASE_URLS[config.provider];
}

/**
 * Chama o provedor de IA configurado com um prompt de sistema + uma mensagem
 * de usuário, retornando o texto bruto da resposta. Usado tanto pelo teste de
 * conexão (prompt curto) quanto pela geração de oportunidades (prompt +
 * transcrição inteira).
 */
export async function callAiChatCompletion(
  config: AiProviderConfig,
  params: { systemPrompt: string; userMessage: string }
): Promise<string> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: resolveBaseUrl(config) });

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0.2,
    max_tokens: 8000,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("A IA retornou uma resposta vazia.");
  }
  return text;
}
