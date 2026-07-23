# YouTube → transcrição na tela "Gerar Oportunidades por IA"

## Contexto

A tela `admin/oportunidades/gerar-ia` já recebe uma transcrição de reunião
(colada manualmente ou via upload de `.txt`) e usa IA para extrair
oportunidades de automação a partir dela. Objetivo: adicionar uma utilidade
que, a partir de um link de vídeo do YouTube, baixa a transcrição/legenda
gerada pelo próprio YouTube e (a) preenche automaticamente o campo de
transcrição da tela e (b) disponibiliza o texto como download `.txt`.

## Pesquisa: o que o projeto SocialMedia já faz

`SocialMedia/youtube_para_artigo.py` (`BuscadorYouTube.buscar_snippets_raw`)
usa a lib Python `youtube-transcript-api`, que **não exige API key** — ela lê
a legenda diretamente do YouTube a partir do `video_id`. A `YOUTUBE_API_KEY`
existente no `.env` daquele projeto é usada só para a YouTube Data API v3
(buscar vídeos recentes por canal/playlist) — não se aplica aqui, já que o
usuário vai colar o link de um vídeo específico.

**Conclusão: nenhuma API key nova é necessária para esta funcionalidade.**

Como o Pipeline é Node/TypeScript (não Python), a lib equivalente escolhida é
`youtube-transcript-plus` (mantida ativamente, sem API key, Node ≥20 — este
repo roda Node 22). Ela aceita a URL bruta do YouTube diretamente (faz o
parsing do video ID internamente) e expõe erros tipados para cada modo de
falha (legendas desativadas, idioma indisponível, vídeo indisponível,
rate-limit do YouTube, ID inválido).

## Escopo

1. Adicionar a dependência `youtube-transcript-plus`.
2. Nova mutation tRPC `aiOpportunity.fetchYoutubeTranscript` que busca a
   transcrição de um vídeo do YouTube dado seu link.
3. Novo componente `YoutubeTranscriptFetcher`, renderizado na tela
   `gerar-ia`, que usa essa mutation, preenche o campo de transcrição da
   tela e dispara o download do `.txt`.

Fora de escopo: qualquer busca por canal/playlist (YouTube Data API v3),
suporte a múltiplos vídeos de uma vez, ou processamento de vídeos sem
legenda (nesse caso, erro claro é exibido).

## 1. Backend — `aiOpportunity.fetchYoutubeTranscript`

**Arquivo:** `src/server/trpc/routers/ai-opportunity.router.ts` (mesmo router
que já serve a tela `gerar-ia` via `generateFromTranscript`).

```ts
fetchYoutubeTranscript: adminProcedure
  .input(z.object({ url: z.string().min(1, "Cole o link do vídeo do YouTube.") }))
  .mutation(async ({ input }) => {
    // implementação na seção de tasks
  }),
```

Comportamento:

1. Tenta `fetchTranscript(input.url, { lang: "pt-BR", videoDetails: true })`.
2. Se o vídeo tem legenda mas não em `pt-BR`, a lib lança
   `YoutubeTranscriptNotAvailableLanguageError` com `availableLangs` — nesse
   caso, tenta de novo com o primeiro idioma de `availableLangs` que comece
   com `"pt"`, ou o primeiro disponível se nenhum for português (comportamento
   "português primeiro, com fallback" confirmado com o usuário).
3. Concatena `segments[].text` com espaço, igual ao
   `" ".join(s["text"] for s in snippets)` do SocialMedia.
4. Retorna `{ transcript: string, videoTitle: string | null }` —
   `videoTitle` vem de `videoDetails.title` (usado só para nome de arquivo no
   front, não afeta o texto da transcrição).

Mapeamento de erros para `TRPCError` (mensagens em pt-BR, mesmo estilo já
usado em `generateFromTranscript`):

| Erro da lib | `TRPCError.code` | Mensagem |
|---|---|---|
| `YoutubeTranscriptDisabledError` | `BAD_REQUEST` | "Este vídeo tem as transcrições/legendas desativadas pelo autor." |
| `YoutubeTranscriptNotAvailableError` | `BAD_REQUEST` | "Nenhuma transcrição disponível para este vídeo." |
| `YoutubeTranscriptNotAvailableLanguageError` (após o retry de fallback também falhar) | `BAD_REQUEST` | "Nenhuma transcrição disponível para este vídeo." |
| `YoutubeTranscriptVideoUnavailableError` | `BAD_REQUEST` | "Vídeo não encontrado ou indisponível." |
| `YoutubeTranscriptInvalidVideoIdError` | `BAD_REQUEST` | "Link do YouTube inválido." |
| `YoutubeTranscriptTooManyRequestError` | `TOO_MANY_REQUESTS` | "YouTube limitou as requisições. Tente novamente em alguns minutos." |
| qualquer outro erro | `INTERNAL_SERVER_ERROR` | `"Falha ao buscar transcrição: {mensagem}"` |

## 2. Frontend — `YoutubeTranscriptFetcher`

**Arquivo novo:** `src/shared/components/youtube-transcript-fetcher.tsx`

Componente autocontido (mesmo espírito de `ProjectXmlImportExport`): estado
próprio (`url`, mutation, erro), sem depender de estado da página pai além
de um callback.

```tsx
interface Props {
  onTranscriptFetched: (transcript: string) => void;
}
```

UI: um `Input` (placeholder "Cole o link do vídeo do YouTube") + `Button`
"Buscar transcrição" (com spinner `Loader2` enquanto `isPending`, mesmo
padrão já usado em `gerar-ia/page.tsx`). Erro exibido em `Alert
variant="destructive"` abaixo, mesmo padrão da tela.

Ao suceder:
1. Chama `onTranscriptFetched(result.transcript)` — a página pai faz
   `setTranscript(...)`.
2. Dispara download do `.txt` imediatamente (Blob client-side + link
   temporário, mesma técnica já usada em `project-xml-import-export.tsx` e
   nas rotas de download de `admin/empresas`), nome de arquivo
   `transcricao-youtube-${slugifyFilename(videoTitle) || "video"}.txt`.
3. Limpa o campo de input da URL (pronto para o próximo vídeo, se
   necessário).

## 3. Integração na tela `gerar-ia`

**Arquivo:** `src/app/(private)/admin/oportunidades/gerar-ia/page.tsx`

Renderiza `<YoutubeTranscriptFetcher onTranscriptFetched={setTranscript} />`
dentro do mesmo `Card` que já contém o campo de transcrição, imediatamente
acima do `Label`/`Textarea` existente — mantendo o fluxo de upload de `.txt`
já existente intacto (as duas formas de preencher a transcrição convivem:
colar/upload manual, ou buscar do YouTube).

## Testes / verificação

- Vídeo com legenda em pt-BR: transcrição preenche a textarea e o `.txt`
  baixado tem o mesmo conteúdo.
- Vídeo só com legenda em outro idioma (ex.: inglês): fallback funciona, sem
  erro.
- Vídeo sem legenda/transcrição desativada: erro claro aparece no `Alert`,
  textarea não é alterada.
- Link inválido (não é uma URL do YouTube): erro claro, sem crash.
- Fluxo de upload/colagem manual de transcrição continua funcionando sem
  nenhuma mudança de comportamento.
