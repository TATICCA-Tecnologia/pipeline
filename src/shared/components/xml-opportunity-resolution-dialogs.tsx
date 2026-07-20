"use client";

import { Button } from "@/src/shared/components/ui/button";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/shared/components/ui/dialog";
import { useToast } from "@/src/shared/hooks/use-toast";
import { trpc } from "@/shared/trpc/client";
import type {
  BatchContext,
  TaxonomyResolutionState,
  TaxonomyResult,
} from "@/shared/hooks/use-xml-opportunity-importer";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export interface XmlOpportunityResolutionDialogsProps {
  pendingXmlImport: { rawCompanyName: string; batchContext?: BatchContext } | null;
  chosenCompanyId: string | undefined;
  setChosenCompanyId: (id: string | undefined) => void;
  closeCompanyResolutionDialog: (companyId: string | null) => void;
  companies: { id: string; name: string }[];

  pendingTaxonomyResolution: TaxonomyResolutionState | null;
  chosenTaxonomyId: string | undefined;
  setChosenTaxonomyId: (id: string | undefined) => void;
  creatingNewTaxonomy: boolean;
  setCreatingNewTaxonomy: (value: boolean) => void;
  closeTaxonomyResolutionDialog: (result: TaxonomyResult | null) => void;
  availableTaxonomyOptions: { value: string; label: string; id?: string }[];
  canRegisterTaxonomy: boolean;
}

/**
 * Diálogos de resolução de empresa/área/tema ambíguos, reaproveitados pelo
 * import de XML/zip em /cliente/solicitar e pela geração de oportunidades por
 * IA em /admin/oportunidades/gerar-ia — todo o estado vem de
 * useXmlOpportunityImporter (mesmo hook, dois consumidores).
 */
export function XmlOpportunityResolutionDialogs({
  pendingXmlImport,
  chosenCompanyId,
  setChosenCompanyId,
  closeCompanyResolutionDialog,
  companies,
  pendingTaxonomyResolution,
  chosenTaxonomyId,
  setChosenTaxonomyId,
  creatingNewTaxonomy,
  setCreatingNewTaxonomy,
  closeTaxonomyResolutionDialog,
  availableTaxonomyOptions,
  canRegisterTaxonomy,
}: XmlOpportunityResolutionDialogsProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const createAreaMutation = trpc.taxonomy.createArea.useMutation();
  const createThemeMutation = trpc.taxonomy.createTheme.useMutation();

  return (
    <>
      <Dialog
        open={pendingXmlImport !== null}
        onOpenChange={(open) => {
          if (!open) closeCompanyResolutionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione a empresa</DialogTitle>
            <DialogDescription>
              {pendingXmlImport?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Item {pendingXmlImport.batchContext.index} de {pendingXmlImport.batchContext.total}:{" "}
                  {pendingXmlImport.batchContext.label}
                </span>
              )}
              {pendingXmlImport?.rawCompanyName
                ? `O XML indica a empresa "${pendingXmlImport.rawCompanyName}", que não corresponde a nenhuma empresa disponível.`
                : "O XML não indica uma empresa."}{" "}
              Escolha para qual empresa este processo deve ser criado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={chosenCompanyId} onValueChange={setChosenCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => closeCompanyResolutionDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!chosenCompanyId}
              onClick={() => {
                if (!chosenCompanyId) return;
                closeCompanyResolutionDialog(chosenCompanyId);
              }}
            >
              Confirmar e criar processo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingTaxonomyResolution !== null}
        onOpenChange={(open) => {
          if (!open) closeTaxonomyResolutionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingTaxonomyResolution?.kind === "area" ? "Área não cadastrada" : "Tema não cadastrado"}
            </DialogTitle>
            <DialogDescription>
              {pendingTaxonomyResolution?.batchContext && (
                <span className="mb-1 block font-medium text-foreground">
                  Item {pendingTaxonomyResolution.batchContext.index} de{" "}
                  {pendingTaxonomyResolution.batchContext.total}: {pendingTaxonomyResolution.batchContext.label}
                </span>
              )}
              O XML indica{" "}
              {pendingTaxonomyResolution?.kind === "area" ? "a área" : "o tema"} &quot;
              {pendingTaxonomyResolution?.rawValue}&quot;, que não corresponde a nenhuma opção cadastrada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>
                Usar {pendingTaxonomyResolution?.kind === "area" ? "uma área" : "um tema"} já cadastrado
              </Label>
              <Select
                value={creatingNewTaxonomy ? "" : chosenTaxonomyId}
                onValueChange={(value) => {
                  setChosenTaxonomyId(value);
                  setCreatingNewTaxonomy(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {availableTaxonomyOptions
                    .filter((opt): opt is typeof opt & { id: string } => Boolean(opt.id))
                    .map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {canRegisterTaxonomy &&
              !(pendingTaxonomyResolution?.kind === "theme" && !pendingTaxonomyResolution?.areaIdForTheme) && (
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3">
                  <Checkbox
                    checked={creatingNewTaxonomy}
                    onCheckedChange={(checked) => {
                      setCreatingNewTaxonomy(checked === true);
                      if (checked === true) setChosenTaxonomyId(undefined);
                    }}
                  />
                  <span className="text-sm">
                    Cadastrar &quot;{pendingTaxonomyResolution?.rawValue}&quot; como{" "}
                    {pendingTaxonomyResolution?.kind === "area" ? "nova área" : "novo tema"} permanente
                  </span>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => closeTaxonomyResolutionDialog(null)}>
              Manter como &quot;Outro&quot;
            </Button>
            <Button
              disabled={
                (!chosenTaxonomyId && !creatingNewTaxonomy) ||
                createAreaMutation.isPending ||
                createThemeMutation.isPending
              }
              onClick={async () => {
                if (!pendingTaxonomyResolution) return;
                if (creatingNewTaxonomy) {
                  const name = pendingTaxonomyResolution.rawValue;
                  const slug = slugify(name);
                  try {
                    if (pendingTaxonomyResolution.kind === "area") {
                      const created = await createAreaMutation.mutateAsync({ name, slug, order: 0 });
                      utils.taxonomy.listAreas.invalidate();
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    } else if (pendingTaxonomyResolution.areaIdForTheme) {
                      const created = await createThemeMutation.mutateAsync({
                        name,
                        slug,
                        areaId: pendingTaxonomyResolution.areaIdForTheme,
                        order: 0,
                      });
                      utils.taxonomy.listAreas.invalidate();
                      closeTaxonomyResolutionDialog({ id: created.id, slug: created.slug, name: created.name });
                    }
                  } catch (error) {
                    console.error("Erro ao cadastrar categoria:", error);
                    const message = error instanceof Error ? error.message : "Tente novamente.";
                    toast({
                      title: "Não foi possível cadastrar a categoria",
                      description: message,
                      variant: "destructive",
                    });
                  }
                } else if (chosenTaxonomyId) {
                  const picked = availableTaxonomyOptions.find((o) => o.id === chosenTaxonomyId);
                  if (picked?.id) {
                    closeTaxonomyResolutionDialog({ id: picked.id, slug: picked.value, name: picked.label });
                  }
                }
              }}
            >
              {createAreaMutation.isPending || createThemeMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
