"use client";

import { trpc } from "@/shared/trpc/client";
import { DetailSection } from "@/shared/components/detail-section";
import {
  MultiCreatableCombobox,
  type MultiCreatableComboboxOption,
} from "@/src/shared/components/ui/multi-creatable-combobox";
import { Badge } from "@/src/shared/components/ui/badge";
import type { Project } from "@/shared/types";

export function ProjectPeopleOfInterestCard({
  project,
  canEdit,
}: {
  project: Project;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const companyId = project.companyId;

  const { data: options = [] } = trpc.person.list.useQuery(
    { companyId: companyId ?? "" },
    { enabled: !!companyId }
  );

  const updateMutation = trpc.project.updatePeopleOfInterest.useMutation({
    onSuccess: () => utils.project.byId.invalidate({ id: project.id }),
  });

  const createMutation = trpc.person.create.useMutation({
    onSuccess: (person) => {
      utils.person.list.invalidate({ companyId: companyId ?? "" });
      updateMutation.mutate({ projectId: project.id, personIds: [...currentIds, person.id] });
    },
  });

  const currentIds = (project.peopleOfInterest ?? []).map((p) => p.id);

  const comboboxOptions: MultiCreatableComboboxOption[] = options.map((o) => ({
    value: o.id,
    label: o.name,
    meta: { isUnlinkedUser: o.isUnlinkedUser },
  }));

  if (!companyId) return null;

  if (!canEdit) {
    return (
      <DetailSection title="Pessoas de interesse">
        <div className="sm:col-span-2">
          {currentIds.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Não informado</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(project.peopleOfInterest ?? []).map((person) => (
                <Badge key={person.id} variant="secondary">
                  {person.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="Pessoas de interesse">
      <div className="sm:col-span-2">
        <MultiCreatableCombobox
          options={comboboxOptions}
          value={currentIds}
          onChange={(personIds) => updateMutation.mutate({ projectId: project.id, personIds })}
          onCreate={(name) => createMutation.mutate({ companyId, name })}
          placeholder="Adicionar pessoa..."
          emptyText="Nenhuma pessoa encontrada."
          disabled={updateMutation.isPending || createMutation.isPending}
        />
      </div>
    </DetailSection>
  );
}
