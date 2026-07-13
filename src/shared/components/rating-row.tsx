"use client";

import { cn } from "@/shared/utils";

export function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(n)}
              className={cn(
                "h-8 w-8 rounded-full border text-sm font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
