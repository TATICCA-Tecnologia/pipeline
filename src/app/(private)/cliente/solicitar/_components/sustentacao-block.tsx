"use client";

import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { trpc } from "@/shared/trpc/client";
import { Input } from "@/src/shared/components/ui/input";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Label } from "@/src/shared/components/ui/label";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { CreatableCombobox } from "@/src/shared/components/ui/creatable-combobox";
import { useToast } from "@/src/shared/hooks/use-toast";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
} from "../utils/solicitar.utils";
import { AutomationAccountsList } from "./automation-accounts-list";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface SustentacaoBlockProps {
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
  watch: UseFormWatch<SolicitarProjetoFormData>;
  setValue: UseFormSetValue<SolicitarProjetoFormData>;
  errors: FieldErrors<SolicitarProjetoFormData>;
  areas: { value: string; label: string; id?: string }[];
}

/**
 * Ficha completa da automação existente — só aparece quando
 * `hasCurrentApplication === "sim"`. Reúne os sete campos que já existiam no
 * passo Envolvidos antes desta task (hospedagem, autor, responsável, acessos,
 * em produção desde) com os critérios novos do cliente: ativo, cargo/setor do
 * responsável, entrada/saída de dados, contingência, substituto e as contas
 * que a automação usa.
 */
export function SustentacaoBlock({
  control,
  register,
  watch,
  setValue,
  errors,
  areas,
}: SustentacaoBlockProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const currentApplicationHosting = watch("currentApplicationHosting");
  const contingencyActions = watch("currentApplicationContingencyActions") ?? [];

  const areaOptions = areas.filter((a) => a.id).map((a) => ({ value: a.id as string, label: a.label }));

  const createArea = trpc.taxonomy.createArea.useMutation({
    onSuccess: (created) => {
      utils.taxonomy.listAreas.invalidate();
      toast({ title: `Área "${created.name}" criada` });
    },
    onError: (error) =>
      toast({
        title: "Não foi possível cadastrar a área",
        description: error.message,
        variant: "destructive",
      }),
  });

  function toggleContingency(key: string, checked: boolean | "indeterminate") {
    const isChecked = checked === true;
    setValue(
      "currentApplicationContingencyActions",
      isChecked
        ? [...contingencyActions, key]
        : contingencyActions.filter((c) => c !== key),
      { shouldDirty: true }
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Ficha da automação existente
        </Label>
        <p className="text-xs text-muted-foreground">
          Tudo opcional — ajuda o TI a saber onde a automação vive e quem
          cuida dela. O que você não souber, deixe em branco.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Onde essa automação roda hoje?</Label>
        <div className="flex gap-2">
          <Controller
            control={control}
            name="currentApplicationHosting"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  if (value !== "outro") setValue("currentApplicationHostingCustom", "");
                }}
              >
                <SelectTrigger
                  className={currentApplicationHosting === "outro" ? "w-40 shrink-0" : "w-full"}
                >
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENT_APPLICATION_HOSTING_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {currentApplicationHosting === "outro" && (
            <Input
              id="currentApplicationHostingCustom"
              {...register("currentApplicationHostingCustom")}
              placeholder="Descreva onde roda"
              className="flex-1"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentApplicationAssetId">Identificação do ativo</Label>
        <Input
          id="currentApplicationAssetId"
          {...register("currentApplicationAssetId")}
          placeholder="Hostname, IP ou nº de patrimônio — ex.: SRV-RPA-01"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currentApplicationAuthor">Quem desenvolveu?</Label>
          <Input
            id="currentApplicationAuthor"
            {...register("currentApplicationAuthor")}
            placeholder="Pessoa, equipe interna ou fornecedor"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentApplicationOwner">Quem cuida dela hoje?</Label>
          <Input
            id="currentApplicationOwner"
            {...register("currentApplicationOwner")}
            placeholder="Quem chamar quando para de funcionar"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="currentApplicationOwnerRole">Cargo do responsável</Label>
          <Input
            id="currentApplicationOwnerRole"
            {...register("currentApplicationOwnerRole")}
            placeholder="Ex.: Analista de Processos"
          />
        </div>
        <div className="space-y-2">
          <Label>Setor do responsável</Label>
          <Controller
            control={control}
            name="currentApplicationOwnerAreaId"
            render={({ field }) => (
              <CreatableCombobox
                options={areaOptions}
                value={field.value ?? ""}
                onChange={field.onChange}
                onCreate={(label) =>
                  createArea.mutate(
                    { name: label, slug: slugify(label), order: areas.length },
                    { onSuccess: (created) => field.onChange(created.id) }
                  )
                }
                placeholder="Selecione ou crie"
                disabled={createArea.isPending}
              />
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Onde ficam guardados os acessos que ela usa?</Label>
        <Controller
          control={control}
          name="currentApplicationAccessLocation"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentApplicationAccessReference">Onde encontrar</Label>
        <Input
          id="currentApplicationAccessReference"
          {...register("currentApplicationAccessReference")}
          maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
          placeholder="Ex.: cofre TI — pasta Automações; ou: com o João do Financeiro"
        />
        <p className="text-xs text-muted-foreground">
          Só a referência de onde procurar. Nunca escreva senhas, tokens ou
          chaves aqui.
        </p>
        {errors.currentApplicationAccessReference && (
          <p className="text-xs text-destructive">
            {errors.currentApplicationAccessReference.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentApplicationLiveSince">Em produção desde</Label>
        <Input
          id="currentApplicationLiveSince"
          type="date"
          {...register("currentApplicationLiveSince")}
          className="sm:w-48"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentApplicationDetails">
          O que a automação faz hoje e qual o objetivo dela
        </Label>
        <Textarea
          id="currentApplicationDetails"
          {...register("currentApplicationDetails")}
          placeholder="Qual o objetivo funcional? O que ela resolve, quais etapas cobre..."
          rows={4}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 border-t border-border pt-5">
        <div className="space-y-2">
          <Label>De onde vêm os dados de entrada?</Label>
          <Controller
            control={control}
            name="currentApplicationDataInput"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <Textarea
            id="currentApplicationDataInputDetails"
            {...register("currentApplicationDataInputDetails")}
            placeholder="Qual sistema, qual caminho, com que frequência..."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Para onde vão os dados de saída?</Label>
          <Controller
            control={control}
            name="currentApplicationDataOutput"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <Textarea
            id="currentApplicationDataOutputDetails"
            {...register("currentApplicationDataOutputDetails")}
            placeholder="Qual sistema, qual caminho, com que frequência..."
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          O que fazer se ela parar de funcionar?
        </Label>
        {CURRENT_APPLICATION_CONTINGENCY_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={contingencyActions.includes(option.key)}
              onCheckedChange={(v) => toggleContingency(option.key, v)}
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
        <Textarea
          id="currentApplicationContingencyDetails"
          {...register("currentApplicationContingencyDetails")}
          placeholder="Detalhe o passo a passo, se houver"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentApplicationBackupOwner">
          Se o responsável sair da empresa, quem assume?
        </Label>
        <Input
          id="currentApplicationBackupOwner"
          {...register("currentApplicationBackupOwner")}
          placeholder="Nome do responsável substituto"
        />
      </div>

      <div className="border-t border-border pt-5">
        <AutomationAccountsList control={control} register={register} />
      </div>
    </div>
  );
}
