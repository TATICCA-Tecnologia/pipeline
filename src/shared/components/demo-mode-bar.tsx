"use client";

import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Button } from "@/src/shared/components/ui/button";
import { cn } from "@/shared/utils";
import { Eye, EyeOff } from "lucide-react";

export function DemoModeBar() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-4 py-2 text-sm",
        isDemoMode
          ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : "border-border/60 bg-background text-muted-foreground"
      )}
    >
      <span className="font-medium">
        {isDemoMode
          ? "Modo demonstração ativo — dados sensíveis ocultos"
          : "Modo demonstração"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        onClick={toggleDemoMode}
      >
        {isDemoMode ? (
          <>
            <EyeOff className="h-3.5 w-3.5" />
            Desativar
          </>
        ) : (
          <>
            <Eye className="h-3.5 w-3.5" />
            Ativar
          </>
        )}
      </Button>
    </div>
  );
}
