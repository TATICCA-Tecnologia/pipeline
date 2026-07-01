"use client";

import { useAuth } from "@/shared/context/auth-context";
import { Button } from "@/src/shared/components/ui/button";
import { Undo2 } from "lucide-react";

export function ImpersonationBanner() {
  const { isImpersonating, viewState, viewAsAdmin } = useAuth();

  if (!isImpersonating) return null;

  const label =
    viewState.role === "developer"
      ? "Visualizando como Desenvolvedor"
      : viewState.role === "client"
        ? `Visualizando como Cliente: ${viewState.client.name}${
            viewState.client.company ? ` (${viewState.client.company})` : ""
          }`
        : null;

  if (!label) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
      <span className="font-medium">{label}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        onClick={viewAsAdmin}
      >
        <Undo2 className="h-3.5 w-3.5" />
        Voltar para Super Admin
      </Button>
    </div>
  );
}
