"use client";

import { useState } from "react";
import type { ModalProps } from "@/shared/types/modal";
import { Button } from "@/src/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { trpc } from "@/shared/trpc/client";
import { useProjectActions } from "../hooks/project.action";

interface AssignCompanyData {
  projectId: string;
  clientId: string;
}

export function ProjectAssignCompanyModal({
  data,
  onClose,
}: ModalProps<AssignCompanyData>) {
  if (!data) return null;

  const { data: companies = [] } = trpc.user.listCompaniesForUser.useQuery({
    userId: data.clientId,
  });
  const { updateProjectMutation } = useProjectActions(data.projectId);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();

  return (
    <div className="w-full max-w-md space-y-4 p-4">
      <h2 className="text-lg font-semibold">Definir empresa do projeto</h2>
      <p className="text-sm text-muted-foreground">
        Escolha a empresa do cliente para a qual este projeto é.
      </p>

      {companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este cliente não tem nenhuma empresa vinculada. Vincule uma empresa a
          ele em Clientes → Gerenciar Empresas antes de definir aqui.
        </p>
      ) : (
        <Select
          value={selectedCompanyId ?? ""}
          onValueChange={(value) => setSelectedCompanyId(value || undefined)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione uma empresa" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={!selectedCompanyId}
          onClick={async () => {
            if (!selectedCompanyId) return;
            await updateProjectMutation.mutateAsync({
              id: data.projectId,
              companyId: selectedCompanyId,
            });
            onClose();
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
