"use client";

import {
  Controller,
  useFieldArray,
  type Control,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { Plus, X } from "lucide-react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
import { useToast } from "@/src/shared/hooks/use-toast";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import { CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH } from "../utils/solicitar.utils";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface TargetSystemsListProps {
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
  getValues: UseFormGetValues<SolicitarProjetoFormData>;
  setValue: UseFormSetValue<SolicitarProjetoFormData>;
}

/**
 * Sistemas sobre os quais a automação atua (SAP, portal da Receita...) — vale
 * para todo projeto, novo ou de melhoria: mesmo uma automação nova age sobre
 * sistemas, e é essa informação que dimensiona o esforço.
 *
 * O combobox de sistema usa exatamente o mesmo padrão de
 * architecture-tab.tsx (linhas ~360-374) para "Produto" (mainTool): catálogo
 * vindo de `taxonomy.listTargetSystems`, com cadastro inline via
 * `taxonomy.createTargetSystem`. Como essa mutation é `adminProcedure`,
 * clientes sem papel de admin recebem um toast de erro ao tentar criar — o
 * mesmo comportamento já aceito em `project-request-edit-form.tsx` para
 * criar nível de urgência.
 */
export function TargetSystemsList({ control, register, getValues, setValue }: TargetSystemsListProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: targetSystemsCatalog = [] } = trpc.taxonomy.listTargetSystems.useQuery();
  const { fields, append, remove } = useFieldArray({ control, name: "targetSystems" });

  const createTargetSystem = trpc.taxonomy.createTargetSystem.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listTargetSystems.invalidate();
      toast({ title: `Sistema "${created.name}" criado` });
    },
    onError: (error) =>
      toast({
        title: "Não foi possível cadastrar o sistema",
        description: error.message,
        variant: "destructive",
      }),
  });

  const systemOptions = targetSystemsCatalog.map((s) => ({ value: s.id, label: s.name }));

  function handleAdd() {
    append({ targetSystemId: "", customName: "", accessPoint: "", accessNotes: "" });
  }

  // O índice de cada conta em `automationAccounts` aponta para a POSIÇÃO da
  // linha de sistema, não para um id estável. Remover uma linha do meio
  // desloca todas as seguintes — sem este ajuste, uma conta que apontava para
  // o sistema 3 passaria a apontar (em silêncio) para quem quer que tenha
  // ficado na posição 2 depois da remoção.
  function handleRemove(index: number) {
    const accounts = getValues("automationAccounts") ?? [];
    const adjusted = accounts.map((account) => {
      if (account.systemIndex == null) return account;
      if (account.systemIndex === index) return { ...account, systemIndex: null };
      if (account.systemIndex > index) return { ...account, systemIndex: account.systemIndex - 1 };
      return account;
    });
    setValue("automationAccounts", adjusted, { shouldDirty: true });
    remove(index);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Sistemas sobre os quais a automação atua
        </Label>
        <p className="text-xs text-muted-foreground">
          SAP, um portal do governo, o site de um banco... tudo opcional.
        </p>
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <Label>Sistema</Label>
              <Controller
                control={control}
                name={`targetSystems.${index}.targetSystemId`}
                render={({ field: comboboxField }) => (
                  <CreatableCombobox
                    options={systemOptions}
                    value={comboboxField.value ?? ""}
                    onChange={comboboxField.onChange}
                    onCreate={(label) =>
                      createTargetSystem.mutate(
                        {
                          name: label,
                          slug: slugify(label),
                          order: targetSystemsCatalog.length,
                          categoryId: null,
                        },
                        { onSuccess: (created) => comboboxField.onChange(created.id) }
                      )
                    }
                    placeholder="Selecione ou crie"
                    disabled={createTargetSystem.isPending}
                  />
                )}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 shrink-0"
              onClick={() => handleRemove(index)}
              aria-label="Remover sistema"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`targetSystems.${index}.accessPoint`}>
              Onde é acessado (URL, servidor ou instância)
            </Label>
            <Input
              id={`targetSystems.${index}.accessPoint`}
              {...register(`targetSystems.${index}.accessPoint`)}
              placeholder="Ex.: srv-sap.empresa.local, ou o link do portal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`targetSystems.${index}.accessNotes`}>Como acessar</Label>
            <Input
              id={`targetSystems.${index}.accessNotes`}
              {...register(`targetSystems.${index}.accessNotes`)}
              maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
              placeholder="Ex.: cofre de senhas do TI"
            />
            <p className="text-xs text-muted-foreground">
              Onde encontrar o acesso — nunca escreva senhas ou tokens aqui.
            </p>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar sistema
      </Button>
    </div>
  );
}
