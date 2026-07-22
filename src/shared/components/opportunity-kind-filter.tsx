"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { isExistingAutomation } from "@/shared/lib/opportunity-classification";

export const ALL_OPPORTUNITY_KINDS_VALUE = "all";
const NOVO_VALUE = "novo";
const MELHORIA_VALUE = "melhoria";

interface OpportunityKindFilterProps {
  value: string;
  onChange: (value: string) => void;
}

// Mesma classificação usada no badge "Novo"/"Melhoria" do card do Kanban
// (ver isExistingAutomation) — filtra pelo mesmo critério que o usuário já vê
// no card, em vez de uma classificação paralela que poderia divergir.
export function OpportunityKindFilter({ value, onChange }: OpportunityKindFilterProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Novo e Melhoria" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_OPPORTUNITY_KINDS_VALUE}>Novo e Melhoria</SelectItem>
        <SelectItem value={NOVO_VALUE}>Novo</SelectItem>
        <SelectItem value={MELHORIA_VALUE}>Melhoria</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByOpportunityKind<
  T extends { hasCurrentApplication?: string; status: string },
>(projects: T[], kindFilter: string): T[] {
  if (kindFilter === ALL_OPPORTUNITY_KINDS_VALUE) return projects;
  const wantsExisting = kindFilter === MELHORIA_VALUE;
  return projects.filter((p) => isExistingAutomation(p) === wantsExisting);
}
