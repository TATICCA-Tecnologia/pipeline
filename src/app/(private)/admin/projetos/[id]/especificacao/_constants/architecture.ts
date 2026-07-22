export const EXECUTION_STRATEGIES = [
  { value: "agendada", label: "Agendada" },
  { value: "manual", label: "Manual" },
  { value: "trigger-email", label: "Trigger por e-mail" },
  { value: "trigger-api", label: "Trigger por API" },
  { value: "tempo-real", label: "Tempo real" },
] as const;
