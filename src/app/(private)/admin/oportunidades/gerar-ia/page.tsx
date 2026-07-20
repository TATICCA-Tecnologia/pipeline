"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/context/auth-context";
import { trpc } from "@/shared/trpc/client";
import { useTaxonomy } from "@/src/app/(private)/cliente/solicitar/utils/use-taxonomy";
import { useXmlOpportunityImporter } from "@/shared/hooks/use-xml-opportunity-importer";
import { XmlOpportunityResolutionDialogs } from "@/shared/components/xml-opportunity-resolution-dialogs";
import { parseSolicitacaoXml } from "@/src/app/(private)/cliente/solicitar/utils/xml-import";
import { Button } from "@/src/shared/components/ui/button";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { useToast } from "@/src/shared/hooks/use-toast";
import { ArrowLeft, Sparkles, Upload, Loader2 } from "lucide-react";

interface ReviewEntry {
  xmlText: string;
  title: string;
  hasWarnings: boolean;
  areaLabel: string;
  themeLabel: string;
  parseError: string | null;
  selected: boolean;
}

export default function GerarOportunidadesPorIaPage() {
  const { user, actualUser } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const canRegisterTaxonomy = actualUser?.role === "admin" || actualUser?.role === "super_admin";

  const { data: companies = [], isLoading: companiesLoading } = trpc.company.list.useQuery();
  const { areas: PROJECT_AREAS, themesByArea: PROJECT_THEMES_BY_AREA, buildTypeLabel } = useTaxonomy();

  const [companyId, setCompanyId] = useState<string | undefined>();
  const [transcript, setTranscript] = useState("");
  const [reviewEntries, setReviewEntries] = useState<ReviewEntry[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const generateMutation = trpc.aiOpportunity.generateFromTranscript.useMutation();

  const importer = useXmlOpportunityImporter({
    userId: user?.id,
    areas: PROJECT_AREAS,
    themesByArea: PROJECT_THEMES_BY_AREA,
    companies,
    buildTypeLabel,
    forcedCompanyId: companyId,
  });

  function handleUploadTxt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file.text().then((text) => setTranscript(text));
  }

  async function handleGenerate() {
    if (!companyId || !transcript.trim()) return;
    setReviewEntries(null);
    try {
      const result = await generateMutation.mutateAsync({ transcript: transcript.trim() });
      const entries: ReviewEntry[] = result.xmlEntries.map((xmlText) => {
        const parsed = parseSolicitacaoXml(xmlText, {
          areas: PROJECT_AREAS,
          themesByArea: PROJECT_THEMES_BY_AREA,
          companies,
        });
        if (!parsed.ok) {
          return {
            xmlText,
            title: "(erro ao interpretar)",
            hasWarnings: false,
            areaLabel: "",
            themeLabel: "",
            parseError: parsed.error,
            selected: false,
          };
        }
        const areaLabel =
          parsed.formData.projectArea === "outro"
            ? parsed.formData.customProjectArea
            : PROJECT_AREAS.find((a) => a.value === parsed.formData.projectArea)?.label ?? "";
        const themeLabel =
          parsed.formData.projectTheme === "outro"
            ? parsed.formData.customProjectTheme
            : (PROJECT_THEMES_BY_AREA[parsed.formData.projectArea] ?? []).find(
                (t) => t.value === parsed.formData.projectTheme
              )?.label ?? "";
        return {
          xmlText,
          title: parsed.formData.title,
          hasWarnings: parsed.warnings.length > 0,
          areaLabel,
          themeLabel,
          parseError: null,
          selected: true,
        };
      });
      setReviewEntries(entries);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast({ title: "Falha ao gerar oportunidades", description: message, variant: "destructive" });
    }
  }

  function toggleEntry(index: number, checked: boolean) {
    setReviewEntries((prev) =>
      prev ? prev.map((entry, i) => (i === index ? { ...entry, selected: checked } : entry)) : prev
    );
  }

  async function handleCreateSelected() {
    if (!reviewEntries) return;
    const toCreate = reviewEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.selected && !entry.parseError);
    if (toCreate.length === 0) return;

    setIsCreating(true);
    try {
      let successCount = 0;
      for (const { entry, index } of toCreate) {
        const outcome = await importer.importXmlEntry(entry.xmlText, {
          label: entry.title,
          index: index + 1,
          total: toCreate.length,
        });
        if (outcome.ok) {
          successCount++;
        } else {
          toast({
            title: `Erro ao criar "${entry.title}"`,
            description: outcome.error,
            variant: "destructive",
          });
        }
      }
      toast({
        title: "Oportunidades criadas",
        description: `${successCount} de ${toCreate.length} oportunidade(s) criada(s).`,
      });
      if (successCount > 0) router.push("/admin/projetos");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <header className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar Oportunidades por IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Cole a transcrição de uma reunião de levantamento — a IA identifica as oportunidades de
            automação e gera as solicitações, prontas para revisão.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId} disabled={companiesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={companiesLoading ? "Carregando..." : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="transcript">Transcrição da reunião</Label>
              <label className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                <Upload className="mr-1 inline h-3 w-3" />
                Carregar arquivo .txt
                <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleUploadTxt} />
              </label>
            </div>
            <Textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Cole aqui a transcrição da reunião..."
              rows={16}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleGenerate}
              disabled={!companyId || !transcript.trim() || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar oportunidades"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {reviewEntries && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {reviewEntries.length} oportunidade(s) identificada(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewEntries.map((entry, index) => (
              <div
                key={index}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <Checkbox
                  checked={entry.selected}
                  disabled={!!entry.parseError}
                  onCheckedChange={(checked) => toggleEntry(index, checked === true)}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{entry.title}</p>
                  {entry.parseError ? (
                    <p className="text-xs text-destructive">{entry.parseError}</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {entry.areaLabel}
                        {entry.themeLabel ? ` · ${entry.themeLabel}` : ""}
                      </p>
                      {entry.hasWarnings && (
                        <p className="text-xs text-amber-600">
                          Alguns valores não foram reconhecidos — revise em &quot;Informações
                          adicionais&quot; após criar.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleCreateSelected}
                disabled={isCreating || reviewEntries.every((e) => !e.selected || e.parseError)}
              >
                {isCreating
                  ? "Criando..."
                  : `Criar ${reviewEntries.filter((e) => e.selected && !e.parseError).length} selecionada(s)`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <XmlOpportunityResolutionDialogs
        pendingXmlImport={importer.pendingXmlImport}
        chosenCompanyId={importer.chosenCompanyId}
        setChosenCompanyId={importer.setChosenCompanyId}
        closeCompanyResolutionDialog={importer.closeCompanyResolutionDialog}
        companies={companies}
        pendingTaxonomyResolution={importer.pendingTaxonomyResolution}
        chosenTaxonomyId={importer.chosenTaxonomyId}
        setChosenTaxonomyId={importer.setChosenTaxonomyId}
        creatingNewTaxonomy={importer.creatingNewTaxonomy}
        setCreatingNewTaxonomy={importer.setCreatingNewTaxonomy}
        closeTaxonomyResolutionDialog={importer.closeTaxonomyResolutionDialog}
        availableTaxonomyOptions={importer.availableTaxonomyOptions}
        canRegisterTaxonomy={canRegisterTaxonomy}
      />
    </div>
  );
}
