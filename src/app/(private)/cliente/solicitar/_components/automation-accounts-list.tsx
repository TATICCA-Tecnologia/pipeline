"use client";

import { useMemo } from "react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegister,
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
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  AUTOMATION_ACCOUNT_TYPE_OPTIONS,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
} from "../utils/solicitar.utils";

interface AutomationAccountsListProps {
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
}

/**
 * Contas/usernames que a automação existente utiliza — nunca senha, só o
 * identificador (regra de segurança da spec de julho, reforçada aqui).
 *
 * `systemIndex` referencia a POSIÇÃO da linha em `targetSystems`, não um id
 * estável — por isso o rótulo de cada opção do Select é resolvido ao vivo via
 * `useWatch`, e o valor exibido do Select de cada conta também vem de
 * `Controller` (não do snapshot de `fields` do próprio useFieldArray): se o
 * usuário remover uma linha de sistema, `TargetSystemsList` reescreve os
 * `systemIndex` de todas as contas por `setValue`, e este componente precisa
 * refletir isso imediatamente, mesmo sem disparar o próprio `remove`/`append`.
 */
export function AutomationAccountsList({ control, register }: AutomationAccountsListProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "automationAccounts" });
  const { data: targetSystemsCatalog = [] } = trpc.taxonomy.listTargetSystems.useQuery();
  const catalogNameById = useMemo(
    () => new Map(targetSystemsCatalog.map((s) => [s.id, s.name])),
    [targetSystemsCatalog]
  );

  const watchedSystems = useWatch({ control, name: "targetSystems" }) ?? [];
  const systemOptions = watchedSystems.map((system, index) => ({
    index,
    label:
      (system.targetSystemId && catalogNameById.get(system.targetSystemId)) ||
      system.customName ||
      `Sistema ${index + 1} (sem nome)`,
  }));

  function handleAdd() {
    append({ username: "", systemIndex: null, accountType: "", ownerName: "", notes: "" });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Contas que a automação utiliza
        </Label>
        <p className="text-xs text-muted-foreground">
          Só o login de cada conta — nunca a senha.
        </p>
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor={`automationAccounts.${index}.username`}>Usuário/login</Label>
              <Input
                id={`automationAccounts.${index}.username`}
                {...register(`automationAccounts.${index}.username`)}
                maxLength={AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH}
                placeholder="Ex.: rpa_sap"
              />
              <p className="text-xs text-muted-foreground">
                Só o login. Nunca escreva a senha aqui.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 shrink-0"
              onClick={() => remove(index)}
              aria-label="Remover conta"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de conta</Label>
              <Controller
                control={control}
                name={`automationAccounts.${index}.accountType`}
                render={({ field: selectField }) => (
                  <Select value={selectField.value} onValueChange={selectField.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTOMATION_ACCOUNT_TYPE_OPTIONS.map((option) => (
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
              <Label>Sistema</Label>
              <Controller
                control={control}
                name={`automationAccounts.${index}.systemIndex`}
                render={({ field: selectField }) => (
                  <Select
                    value={selectField.value != null ? String(selectField.value) : undefined}
                    onValueChange={(value) => selectField.onChange(Number(value))}
                    disabled={systemOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          systemOptions.length === 0
                            ? "Nenhum sistema cadastrado ainda"
                            : "Selecione"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {systemOptions.map((option) => (
                        <SelectItem key={option.index} value={String(option.index)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`automationAccounts.${index}.ownerName`}>De quem é a conta</Label>
              <Input
                id={`automationAccounts.${index}.ownerName`}
                {...register(`automationAccounts.${index}.ownerName`)}
                placeholder="Quem responde por essa conta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`automationAccounts.${index}.notes`}>Observações</Label>
              <Input
                id={`automationAccounts.${index}.notes`}
                {...register(`automationAccounts.${index}.notes`)}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar conta
      </Button>
    </div>
  );
}
