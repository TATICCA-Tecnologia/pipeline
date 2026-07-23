"use client";

import { use, useState } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Button } from "@/src/shared/components/ui/button";
import { useToast } from "@/src/shared/hooks/use-toast";
import { ArrowLeft, Download } from "lucide-react";
import { getTrpcUserId } from "@/shared/trpc/auth-header";
import { slugifyFilename } from "@/shared/utils";

interface Props {
  params: Promise<{ id: string }>;
}

interface DownloadOption {
  id: string;
  endpoint: string;
  filenamePrefix: string;
  extension: string;
  title: string;
  description: string;
  errorTitle: string;
}

// Downloads disponíveis para uma empresa — adicionar um novo download no
// futuro é só acrescentar uma entrada aqui, sem reestruturar a página.
const DOWNLOAD_OPTIONS: DownloadOption[] = [
  {
    id: "deck",
    endpoint: "deck",
    filenamePrefix: "diagnostico",
    extension: "pptx",
    title: "Diagnóstico completo",
    description: "Deck consolidado (.pptx) com o diagnóstico completo da empresa.",
    errorTitle: "Erro ao exportar diagnóstico",
  },
  {
    id: "deck-automacoes-existentes",
    endpoint: "deck-automacoes-existentes",
    filenamePrefix: "automacoes-existentes",
    extension: "pptx",
    title: "Automações existentes",
    description: "Deck (.pptx) com as automações já existentes/entregues para a empresa.",
    errorTitle: "Erro ao exportar automações existentes",
  },
  {
    id: "xml-agregado",
    endpoint: "xml-agregado",
    filenamePrefix: "xml-agregado",
    extension: "xml",
    title: "XML agregado de projetos",
    description:
      "XML com todos os projetos da empresa, organizados por área, para processamento externo ao sistema.",
    errorTitle: "Erro ao exportar XML agregado",
  },
];

export default function DownloadsPage({ params }: Props) {
  const { id: companyId } = use(params);
  const { toast } = useToast();
  const { maskCompanyName } = useDemoMode();
  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Rotas de deck/XML exigem o header x-user-id (mesma auth do resto do
  // app), que uma navegação simples de <a href> não incluiria — por isso
  // fazemos um fetch manual com o header, convertemos em blob e disparamos
  // o download por um link temporário (mesma técnica já usada antes em
  // admin/empresas/page.tsx).
  async function handleDownload(option: DownloadOption) {
    setDownloadingId(option.id);
    try {
      const response = await fetch(`/api/empresas/${companyId}/${option.endpoint}`, {
        headers: { "x-user-id": getTrpcUserId() },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const safeName = company ? slugifyFilename(company.name) || companyId : companyId;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${option.filenamePrefix}-${safeName}.${option.extension}`;
      try {
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast({
        title: option.errorTitle,
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Downloads</h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DOWNLOAD_OPTIONS.map((option) => (
          <Card key={option.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                {option.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{option.description}</p>
              <Button
                size="sm"
                disabled={downloadingId === option.id}
                onClick={() => handleDownload(option)}
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadingId === option.id ? "Gerando..." : "Baixar"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
