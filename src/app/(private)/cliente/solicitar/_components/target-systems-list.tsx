"use client";

import {
  Controller,
  useFieldArray,
  useWatch,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { useToast } from "@/src/shared/hooks/use-toast";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import { CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH, slugify } from "../utils/solicitar.utils";

interface TargetSystemsListProps {
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
  getValues: UseFormGetValues<SolicitarProjetoFormData>;
  setValue: UseFormSetValue<SolicitarProjetoFormData>;
  canRegisterTaxonomy: boolean;
}

/**
 * Sistemas sobre os quais a automação atua (SAP, portal da Receita...) — vale
 * para todo projeto, novo ou de melhoria: mesmo uma automação nova age sobre
 * sistemas, e é essa informação que dimensiona o esforço.
 *
 * Dois controles visíveis por linha, no mesmo espírito de `projectArea` +
 * `customProjectArea` em `page.tsx`: um Select do catálogo (`targetSystemId`)
 * e um campo de texto livre sempre disponível (`customName`) para o sistema
 * que não está cadastrado — sem isso, `customName` existia no schema e no
 * payload, mas nenhuma tela alcançava. Selecionar um do catálogo limpa o
 * texto livre e vice-versa (uma linha usa um ou outro, nunca os dois).
 *
 * Cadastrar o nome digitado como entrada PERMANENTE do catálogo
 * (`taxonomy.createTargetSystem`) só é oferecido a quem pode
 * (`canRegisterTaxonomy`, checado pelo servidor via `adminProcedure`) — para
 * os demais usuários o texto livre já resolve o caso sem depender de rede.
 */
export function TargetSystemsList({
  control,
  register,
  getValues,
  setValue,
  canRegisterTaxonomy,
}: TargetSystemsListProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: targetSystemsCatalog = [] } = trpc.taxonomy.listTargetSystems.useQuery();
  const { fields, append, remove } = useFieldArray({ control, name: "targetSystems" });

  const createTargetSystem = trpc.taxonomy.createTargetSystem.useMutation({
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

  function handleRegisterInCatalog(index: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    createTargetSystem.mutate(
      { name: trimmed, slug: slugify(trimmed), order: targetSystemsCatalog.length, categoryId: null },
      {
        onSuccess: (created) => {
          utils.taxonomy.listTargetSystems.invalidate();
          toast({ title: `Sistema "${created.name}" criado` });
          setValue(`targetSystems.${index}.targetSystemId`, created.id, { shouldDirty: true });
          setValue(`targetSystems.${index}.customName`, "", { shouldDirty: true });
        },
      }
    );
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
        <TargetSystemRow
          key={field.id}
          index={index}
          control={control}
          register={register}
          setValue={setValue}
          systemOptions={systemOptions}
          canRegisterTaxonomy={canRegisterTaxonomy}
          isRegistering={createTargetSystem.isPending}
          onRegisterInCatalog={handleRegisterInCatalog}
          onRemove={handleRemove}
        />
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar sistema
      </Button>
    </div>
  );
}

interface TargetSystemRowProps {
  index: number;
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
  setValue: UseFormSetValue<SolicitarProjetoFormData>;
  systemOptions: { value: string; label: string }[];
  canRegisterTaxonomy: boolean;
  isRegistering: boolean;
  onRegisterInCatalog: (index: number, name: string) => void;
  onRemove: (index: number) => void;
}

/**
 * Linha isolada num subcomponente (em vez de inline no `.map()`) para poder
 * usar `useWatch`/`Controller` por linha — hooks não podem ser chamados
 * dentro do callback de `.map()` do componente pai. É esse `useWatch` de
 * `customName` que mantém o botão "Cadastrar no catálogo" habilitado/desabilitado
 * refletindo o que foi digitado, mesmo com o input em si registrado via
 * `register` (não controlado).
 */
function TargetSystemRow({
  index,
  control,
  register,
  setValue,
  systemOptions,
  canRegisterTaxonomy,
  isRegistering,
  onRegisterInCatalog,
  onRemove,
}: TargetSystemRowProps) {
  const customName = useWatch({ control, name: `targetSystems.${index}.customName` });
  const customNameField = register(`targetSystems.${index}.customName`);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Label>Sistema do catálogo</Label>
          <Controller
            control={control}
            name={`targetSystems.${index}.targetSystemId`}
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValue(`targetSystems.${index}.customName`, "", { shouldDirty: true });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione, se estiver no catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {systemOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 shrink-0"
          onClick={() => onRemove(index)}
          aria-label="Remover sistema"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`targetSystems.${index}.customName`}>
          Ou informe um sistema fora do catálogo
        </Label>
        <div className="flex gap-2">
          <Input
            id={`targetSystems.${index}.customName`}
            {...customNameField}
            onChange={(e) => {
              customNameField.onChange(e);
              if (e.target.value.trim()) {
                setValue(`targetSystems.${index}.targetSystemId`, "", { shouldDirty: true });
              }
            }}
            placeholder="Ex.: sistema interno de faturamento"
            className="flex-1"
          />
          {canRegisterTaxonomy && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!customName?.trim() || isRegistering}
              onClick={() => onRegisterInCatalog(index, customName ?? "")}
            >
              Cadastrar no catálogo
            </Button>
          )}
        </div>
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
  );
}
