"use client";

import type { Project } from "@/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";

export const ALL_COMPANIES_VALUE = "all";

interface CompanyFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

export function CompanyFilter({ projects, value, onChange }: CompanyFilterProps) {
  const companies = Array.from(
    new Map(
      projects
        .filter((p): p is Project & { companyId: string; companyName: string } =>
          Boolean(p.companyId && p.companyName)
        )
        .map((p) => [p.companyId, p.companyName] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  if (companies.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todas as empresas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_COMPANIES_VALUE}>Todas as empresas</SelectItem>
        {companies.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByCompany<T extends { companyId?: string }>(
  projects: T[],
  companyFilter: string
): T[] {
  if (companyFilter === ALL_COMPANIES_VALUE) return projects;
  return projects.filter((p) => p.companyId === companyFilter);
}
