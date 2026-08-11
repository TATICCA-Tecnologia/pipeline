"use client";

import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { Label } from "@/src/shared/components/ui/label";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { Checkbox } from "@/src/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import type { SolicitarProjetoFormData } from "@/shared/schema/solicitar-projeto";
import {
  SENSITIVE_DATA_ANSWER_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
} from "../utils/solicitar.utils";

interface SensitiveDataBlockProps {
  control: Control<SolicitarProjetoFormData>;
  register: UseFormRegister<SolicitarProjetoFormData>;
  watch: UseFormWatch<SolicitarProjetoFormData>;
  setValue: UseFormSetValue<SolicitarProjetoFormData>;
  errors: FieldErrors<SolicitarProjetoFormData>;
}

/**
 * "Esta automação mexe com dados sigilosos?" — vale para todo projeto, novo
 * ou de melhoria, por isso vive no passo Básico, não no passo Sistemas.
 * Mesmo padrão checkbox-list + textarea de detalhes que BENEFIT_OPTIONS já
 * usa no passo Benefícios, mas as categorias marcadas moram no formulário
 * (react-hook-form), não em um useState local da página.
 */
export function SensitiveDataBlock({
  control,
  register,
  watch,
  setValue,
  errors,
}: SensitiveDataBlockProps) {
  const handlesSensitiveData = watch("handlesSensitiveData");
  const sensitiveDataCategories = watch("sensitiveDataCategories") ?? [];

  function toggleCategory(key: string, checked: boolean | "indeterminate") {
    const isChecked = checked === true;
    setValue(
      "sensitiveDataCategories",
      isChecked
        ? [...sensitiveDataCategories, key]
        : sensitiveDataCategories.filter((c) => c !== key),
      { shouldDirty: true }
    );
  }

  return (
    <div className="space-y-5 border-t border-border pt-5">
      <div className="space-y-2">
        <Label>Esta automação mexe com dados sigilosos?</Label>
        <Controller
          control={control}
          name="handlesSensitiveData"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVE_DATA_ANSWER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {handlesSensitiveData === "sim" && (
        <div className="space-y-5 rounded-lg border border-border p-4">
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Quais categorias?
            </Label>
            {SENSITIVE_DATA_CATEGORY_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex items-start gap-3 cursor-pointer"
              >
                <Checkbox
                  checked={sensitiveDataCategories.includes(option.key)}
                  onCheckedChange={(v) => toggleCategory(option.key, v)}
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sensitiveDataDetails">
              Detalhes{" "}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="sensitiveDataDetails"
              {...register("sensitiveDataDetails")}
              placeholder="Que tipo de dado, de quem, com que finalidade..."
              rows={3}
            />
            {errors.sensitiveDataDetails && (
              <p className="text-xs text-destructive">
                {errors.sensitiveDataDetails.message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
