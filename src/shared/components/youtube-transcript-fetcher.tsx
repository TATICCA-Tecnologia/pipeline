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
