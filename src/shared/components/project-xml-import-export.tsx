"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import type { Project } from "@/shared/types";
import { buildProjetoCompletoXml } from "@/shared/xml/build-projeto-completo-xml";
import { parseProjetoCompletoXml } from "@/shared/xml/parse-projeto-completo-xml";

function toUrgencyOptions(levels: { name: string; slug: string }[]) {
  return levels.map((l) => ({ value: l.slug, label: l.name }));
}

// new Date("YYYY-MM-DD") interpreta a string como UTC meia-noite, o que no
// fuso do Brasil (UTC-3) cai no dia anterior — construímos a partir dos
// componentes locais em vez de deixar o Date parsear a string diretamente
// (mesmo problema/solução já usados na tela de Entrevistas de Levantamento).
function parseLocalDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function ProjectXmlImportExport({ project }: { project: Project }) {
  const utils = trpc.useUtils();
  const { data: dbUrgencyLevels = [] } = trpc.taxonomy.listUrgencyLevels.useQuery();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const importMutation = trpc.project.importXml.useMutation({
    onSuccess: (result) => {
      utils.project.byId.invalidate({ id: project.id });
      if (result.warnings.length > 0) {
        toast.warning("XML importado com avisos", {
          description: result.warnings.join(" • "),
        });
      } else {
        toast.success("XML importado com sucesso.");
      }
    },
    onError: (error) => {
      toast.error("Erro ao importar XML", { description: error.message });
    },
    onSettled: () => setIsImporting(false),
  });

  function handleExport() {
    const xml = buildProjetoCompletoXml(project, toUrgencyOptions(dbUrgencyLevels));
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projeto-${project.id}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const text = await file.text();
    const parsed = parseProjetoCompletoXml(text, toUrgencyOptions(dbUrgencyLevels));
    if (!parsed.ok) {
      toast.error("Não foi possível importar o XML", { description: parsed.error });
      return;
    }

    if (parsed.data.projetoId && parsed.data.projetoId !== project.id) {
      const confirmed = window.confirm(
        "Este XML foi exportado de outro projeto. Aplicar mesmo assim neste projeto?"
      );
      if (!confirmed) return;
    }

    setIsImporting(true);
    const {
      projetoId: _projetoId,
      estimatedDeadline,
      currentApplicationLiveSince,
      ...rest
    } = parsed.data;
    importMutation.mutate({
      projectId: project.id,
      ...rest,
      ...(estimatedDeadline ? { estimatedDeadline: parseLocalDateInputValue(estimatedDeadline) } : {}),
      ...(currentApplicationLiveSince
        ? { currentApplicationLiveSince: parseLocalDateInputValue(currentApplicationLiveSince) }
        : {}),
    });
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Exportar XML
      </Button>
      <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Importar XML
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
