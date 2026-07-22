"use client";

import type { Project } from "@/shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";

export const ALL_BUSINESS_AREAS_VALUE = "all";

interface BusinessAreaFilterProps {
  projects: Project[];
  value: string;
  onChange: (value: string) => void;
}

export function BusinessAreaFilter({ projects, value, onChange }: BusinessAreaFilterProps) {
  const areas = Array.from(
    new Map(
      projects
        .filter((p): p is Project & { area: { id: string; name: string } } => Boolean(p.area))
        .map((p) => [p.area!.id, p.area!.name] as const)
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  if (areas.length === 0) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Todas as áreas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BUSINESS_AREAS_VALUE}>Todas as áreas</SelectItem>
        {areas.map(([id, name]) => (
          <SelectItem key={id} value={id}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function filterProjectsByBusinessArea<T extends { area?: { id: string } }>(
  projects: T[],
  areaFilter: string
): T[] {
  if (areaFilter === ALL_BUSINESS_AREAS_VALUE) return projects;
  return projects.filter((p) => p.area?.id === areaFilter);
}
