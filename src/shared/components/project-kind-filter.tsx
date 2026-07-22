"use client";

import type { Project } from "@/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";

export const ALL_PROJECT_KINDS_VALUE = "all";

interface ProjectKindFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

export function ProjectKindFilter({ projects, value, onChange }: ProjectKindFilterProps) {
  const kinds = Array.from(
    new Map(
      projects
        .flatMap((p) => p.solutionTypes ?? [])
        .map((k) => [k.id, k.name] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  if (kinds.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Todos os tipos" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROJECT_KINDS_VALUE}>Todos os tipos</SelectItem>
        {kinds.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByKind<T extends { solutionTypes?: { id: string }[] }>(
  projects: T[],
  kindFilter: string
): T[] {
  if (kindFilter === ALL_PROJECT_KINDS_VALUE) return projects;
  return projects.filter((p) => p.solutionTypes?.some((k) => k.id === kindFilter));
}
