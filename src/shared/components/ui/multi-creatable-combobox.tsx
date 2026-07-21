"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/src/shared/components/ui/button";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/src/shared/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/shared/components/ui/popover";

export interface MultiCreatableComboboxOption {
  value: string;
  label: string;
  meta?: { isUnlinkedUser?: boolean };
}

interface MultiCreatableComboboxProps {
  options: MultiCreatableComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onCreate: (label: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function MultiCreatableCombobox({
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado.",
  disabled,
}: MultiCreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedOptions = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is MultiCreatableComboboxOption => !!o);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, search]);

  const trimmedSearch = search.trim();
  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === trimmedSearch.toLowerCase()
  );
  const showCreate = trimmedSearch.length > 0 && !hasExactMatch;

  function toggle(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  }

  function remove(optionValue: string) {
    onChange(value.filter((v) => v !== optionValue));
  }

  function handleCreate() {
    onCreate(trimmedSearch);
    setSearch("");
  }

  return (
    <div className="space-y-2">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1 pr-1">
              {option.label}
              {option.meta?.isUnlinkedUser && (
                <span className="text-[10px] opacity-70">(usuário)</span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(option.value)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">{placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar ou criar..."
            />
            <CommandList>
              {filtered.length === 0 && !showCreate && (
                <CommandEmpty>{emptyText}</CommandEmpty>
              )}
              <CommandGroup>
                {filtered.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value.includes(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.label}
                    {option.meta?.isUnlinkedUser && (
                      <span className="ml-auto text-[10px] text-muted-foreground">usuário</span>
                    )}
                  </CommandItem>
                ))}
                {showCreate && (
                  <CommandItem value={`__create__${trimmedSearch}`} onSelect={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar &quot;{trimmedSearch}&quot;
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
