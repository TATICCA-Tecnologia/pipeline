"use client";

import { useMemo, useState } from "react";
import { Merge } from "lucide-react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent } from "@/src/shared/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import { findSimilarPairs, type NamedRecord } from "@/shared/lib/similar-names";

/**
 * Faixa de sugestões de mesclagem para uma lista de taxonomia.
 *
 * Aparece só quando existem nomes suspeitos de serem a mesma coisa — em uma
 * lista limpa o componente não renderiza nada, para não virar ruído
 * permanente na tela de Categorias.
 *
 * A mesclagem é destrutiva e não tem desfazer (o registro de origem some), por
 * isso passa por confirmação explícita dizendo exatamente o que vai acontecer
 * e qual nome sobrevive.
 */

export type MergeType =
  | "mainTool"
  | "mainToolCategory"
  | "projectKind"
  | "costCategory"
  | "urgencyLevel";

interface MergeSuggestionsProps<T extends NamedRecord> {
  records: T[];
  type: MergeType;
  /** Como chamar o item no texto de confirmação (ex.: "ferramenta"). */
  label: string;
  /** Invalida as queries da tela depois de mesclar. */
  onMerged: () => void;
}

export function MergeSuggestions<T extends NamedRecord>({
  records,
  type,
  label,
  onMerged,
}: MergeSuggestionsProps<T>) {
  const [confirm, setConfirm] = useState<{ source: T; target: T } | null>(null);

  const merge = trpc.taxonomy.merge.useMutation({
    onSuccess: () => {
      setConfirm(null);
      onMerged();
    },
  });

  // Impacto real da mesclagem, buscado só quando o diálogo abre. Mesmo padrão
  // do `previewAreaMerge` que a mesclagem de Áreas já usava: a ação não tem
  // desfazer, então o número aparece ANTES de confirmar.
  const { data: preview } = trpc.taxonomy.previewMerge.useQuery(
    { type, sourceId: confirm?.source.id ?? "" },
    { enabled: confirm !== null }
  );

  const pairs = useMemo(() => findSimilarPairs(records), [records]);

  if (pairs.length === 0) return null;

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="space-y-2 pt-4">
          <p className="text-xs font-medium">
            {pairs.length === 1
              ? "1 possível duplicata encontrada"
              : `${pairs.length} possíveis duplicatas encontradas`}
          </p>
          {pairs.map((pair) => (
            <div
              key={`${pair.a.id}-${pair.b.id}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="text-muted-foreground">
                {pair.kind === "identico" ? "Mesmo nome:" : "Nomes parecidos:"}
              </span>
              <span className="font-medium">{pair.a.name}</span>
              <span className="text-muted-foreground">e</span>
              <span className="font-medium">{pair.b.name}</span>
              {/*
                Dois botões, um por direção, em vez de um único "mesclar": qual
                dos dois nomes deve sobreviver é uma decisão do usuário, e
                escolher por ele (o mais antigo, o mais usado) seria um palpite
                que ele não conseguiria desfazer.
              */}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => setConfirm({ source: pair.b, target: pair.a })}
              >
                <Merge className="mr-1 h-3 w-3" />
                Manter &quot;{pair.a.name}&quot;
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => setConfirm({ source: pair.a, target: pair.b })}
              >
                <Merge className="mr-1 h-3 w-3" />
                Manter &quot;{pair.b.name}&quot;
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mesclar {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tudo que hoje usa <strong>{confirm?.source.name}</strong> passa a usar{" "}
              <strong>{confirm?.target.name}</strong>, e {confirm?.source.name} é removido da
              lista. Esta ação não pode ser desfeita.
              {preview && (
                <>
                  {" "}
                  Serão movidos{" "}
                  <strong>
                    {preview.projectCount} projeto{preview.projectCount === 1 ? "" : "s"}
                  </strong>
                  {preview.extraLabel && preview.extraCount > 0 && (
                    <>
                      {" "}
                      e{" "}
                      <strong>
                        {preview.extraCount} {preview.extraLabel}
                        {preview.extraCount === 1 ? "" : "s"}
                      </strong>
                    </>
                  )}
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {merge.isError && (
            <p className="text-sm text-destructive">{merge.error.message}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merge.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={(event) => {
                // A ação do AlertDialog fecha o diálogo por padrão; aqui ele
                // precisa continuar aberto para mostrar erro ou o estado de
                // "mesclando", e só fechar no onSuccess da mutation.
                event.preventDefault();
                if (!confirm) return;
                merge.mutate({
                  type,
                  sourceId: confirm.source.id,
                  targetId: confirm.target.id,
                });
              }}
            >
              {merge.isPending ? "Mesclando..." : "Mesclar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
