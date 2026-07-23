# YouTube → transcrição na tela "Gerar Oportunidades por IA" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "paste a YouTube link → get its transcript" utility to the `admin/oportunidades/gerar-ia` screen — it fills the existing transcript textarea and downloads a `.txt`, using YouTube's own captions (no API key needed).

**Architecture:** New tRPC mutation (`aiOpportunity.fetchYoutubeTranscript`) wraps the `youtube-transcript-plus` npm package (Node equivalent of the `youtube-transcript-api` approach already used in the SocialMedia project) with pt-BR-first language fallback and typed-error → `TRPCError` mapping. A new self-contained component (`YoutubeTranscriptFetcher`, mirroring the existing `ProjectXmlImportExport` pattern) calls that mutation, feeds the result back into the page via a callback, and triggers a client-side `.txt` download.

**Tech Stack:** Next.js App Router, tRPC, `youtube-transcript-plus` (already installed in this working tree via `pnpm add`, verified against a live video during design). No test runner is configured in this repo — verification uses `tsc --noEmit`, `npm run build`, and (where feasible) a real network call via a throwaway `tsx` script, same approach used in the previous plan in this repo.

**Reference spec:** `docs/superpowers/specs/2026-07-23-youtube-transcricao-gerar-ia-design.md`

**Note:** `youtube-transcript-plus` was already added to `package.json`/`pnpm-lock.yaml` in this working tree during design-phase research (to verify its real API against a live YouTube video — see the design doc). Task 1 below just commits that already-installed dependency; skip the install step if `node_modules/youtube-transcript-plus` and the `package.json` entry are already present, otherwise run the install command shown.

---

## Task 1: Add the `youtube-transcript-plus` dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Confirm it's installed (or install it)**

Run: `cat node_modules/youtube-transcript-plus/package.json | grep '"version"'`

If that fails (package missing), run: `pnpm add youtube-transcript-plus`

Expected: `package.json` has a new `"youtube-transcript-plus": "^2.0.0"` (or similar) entry under `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add youtube-transcript-plus dependency"
```

---

## Task 2: Add the `fetchYoutubeTranscript` tRPC mutation

**Files:**
- Modify: `src/server/trpc/routers/ai-opportunity.router.ts`

This is the same router that already backs the `gerar-ia` screen (`generateFromTranscript`). The new procedure fetches a YouTube video's transcript given its URL, tries `pt-BR` first, falls back to whatever language the video actually has (using the library's own reported `availableLangs`), and maps every failure mode to a specific Portuguese `TRPCError` message.

- [ ] **Step 1: Add the import**

Old string:

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { callAiChatCompletion, type AiProvider } from "@/server/ai/ai-provider-client";
import { XML_GENERATION_SYSTEM_PROMPT } from "@/server/ai/xml-generation-prompt";
import { extractXmlEntriesFromAiResponse } from "@/server/ai/extract-xml-entries";
```

New string:

```ts
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
```

- [ ] **Step 2: Add the new procedure to the router**

Old string:

```ts
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
```

New string:

```ts
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
```

- [ ] **Step 3: Manually verify against a real video**

There's no test runner in this repo. Create a throwaway script at the repo root, `tmp-verify-fetch-youtube-transcript.ts`:

```ts
import { fetchTranscript, YoutubeTranscriptNotAvailableLanguageError } from "youtube-transcript-plus";

async function main() {
  const videoId = "dQw4w9WgXcQ";
  try {
    const result = await fetchTranscript(videoId, { lang: "pt-BR", videoDetails: true });
    console.log("OK:", result.videoDetails.title, "segments:", result.segments.length);
  } catch (error) {
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      console.log("Fallback needed. availableLangs:", error.availableLangs);
    } else {
      throw error;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Run: `npx tsx tmp-verify-fetch-youtube-transcript.ts`

Expected: prints `OK: Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) segments: 60` (this was already confirmed live during design — YouTube auto-translates captions to pt-BR on request for this video, so the primary path succeeds directly without needing the fallback branch. If YouTube's behavior for this specific video changes and it instead prints the "Fallback needed" branch, that's fine too — it just means the fallback path is what's exercised).

- [ ] **Step 4: Delete the throwaway script**

```bash
rm tmp-verify-fetch-youtube-transcript.ts
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `ai-opportunity.router.ts` (this repo has pre-existing unrelated errors in `src/shared/components/ui/chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — ignore those).

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/ai-opportunity.router.ts
git commit -m "feat: add tRPC mutation to fetch a YouTube video's transcript"
```

---

## Task 3: Create the `YoutubeTranscriptFetcher` component

**Files:**
- Create: `src/shared/components/youtube-transcript-fetcher.tsx`

Self-contained component (same spirit as `src/shared/components/project-xml-import-export.tsx`): owns its own URL input state and mutation, and only talks to its parent through the `onTranscriptFetched` callback.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/src/shared/components/ui/alert";
import { AlertTriangle, Loader2, Youtube } from "lucide-react";
import { slugifyFilename } from "@/shared/utils";

interface Props {
  onTranscriptFetched: (transcript: string) => void;
}

export function YoutubeTranscriptFetcher({ onTranscriptFetched }: Props) {
  const [url, setUrl] = useState("");
  const fetchMutation = trpc.aiOpportunity.fetchYoutubeTranscript.useMutation();

  function downloadTranscriptTxt(transcript: string, videoTitle: string) {
    const safeName = slugifyFilename(videoTitle) || "video";
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `transcricao-youtube-${safeName}.txt`;
    try {
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function handleFetch() {
    if (!url.trim()) return;
    try {
      const result = await fetchMutation.mutateAsync({ url: url.trim() });
      onTranscriptFetched(result.transcript);
      downloadTranscriptTxt(result.transcript, result.videoTitle);
      setUrl("");
    } catch {
      // Erro já fica exposto de forma persistente na tela via fetchMutation.error
      // (mesmo padrão do handleGenerate em gerar-ia/page.tsx).
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole o link do vídeo do YouTube"
        />
        <Button
          type="button"
          variant="outline"
          onClick={handleFetch}
          disabled={!url.trim() || fetchMutation.isPending}
        >
          {fetchMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Youtube className="h-4 w-4" />
          )}
          <span className="ml-2">Buscar transcrição</span>
        </Button>
      </div>
      {fetchMutation.isError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Falha ao buscar transcrição do YouTube</AlertTitle>
          <AlertDescription>{fetchMutation.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `youtube-transcript-fetcher.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/youtube-transcript-fetcher.tsx
git commit -m "feat: add YoutubeTranscriptFetcher component"
```

---

## Task 4: Wire the component into the `gerar-ia` screen

**Files:**
- Modify: `src/app/(private)/admin/oportunidades/gerar-ia/page.tsx`

- [ ] **Step 1: Add the import**

Old string:

```tsx
import { XmlOpportunityResolutionDialogs } from "@/shared/components/xml-opportunity-resolution-dialogs";
```

New string:

```tsx
import { XmlOpportunityResolutionDialogs } from "@/shared/components/xml-opportunity-resolution-dialogs";
import { YoutubeTranscriptFetcher } from "@/shared/components/youtube-transcript-fetcher";
```

- [ ] **Step 2: Render it above the transcript textarea**

Old string:

```tsx
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcrição da reunião</Label>
```

New string:

```tsx
          <div className="space-y-2">
            <Label>Ou busque a partir de um vídeo do YouTube</Label>
            <YoutubeTranscriptFetcher onTranscriptFetched={setTranscript} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcrição da reunião</Label>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `gerar-ia/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(private)/admin/oportunidades/gerar-ia/page.tsx"
git commit -m "feat: add YouTube transcript utility to Gerar Oportunidades por IA screen"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck across all touched files**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "ai-opportunity.router|youtube-transcript-fetcher|gerar-ia/page"
```

Expected: no output (no errors in any file touched by this plan).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, and the route table includes `/admin/oportunidades/gerar-ia` as before (no new route — this feature only adds a component and a tRPC procedure, not a page).

- [ ] **Step 3: Manual browser check (if a running environment with network egress is available)**

Open `/admin/oportunidades/gerar-ia`, paste a real YouTube video URL that has captions into the new "Ou busque a partir de um vídeo do YouTube" field, click "Buscar transcrição". Confirm:
- The "Transcrição da reunião" textarea fills with the transcript text.
- A `.txt` file downloads named `transcricao-youtube-{video-title-slug}.txt` with the same content.
- Pasting a link to a video with captions disabled (or a non-YouTube URL) shows a clear error message in place, and does not alter the textarea.

Note: this requires the environment running the app to have outbound network access to `youtube.com` — if verifying in a sandboxed/local environment without a `.env`/live deploy (as was the case for the previous plan in this repo), this step may need to happen post-deploy instead. State explicitly which was possible, rather than assuming success.
