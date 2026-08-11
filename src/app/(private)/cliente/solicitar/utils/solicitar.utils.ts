// Compartilhado por `page.tsx` (área/tema) e pelos `_components/` que
// cadastram taxonomia inline. Antes desta função existia em três cópias
// idênticas; uma só, aqui, onde os outros compartilhamentos deste diretório
// já moram. (`AutomationInventoryFields`, em shared/components/, tem sua
// própria cópia local — shared/ não pode depender de app/.)
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export {
  DEFAULT_PLATFORM_VALUE,
  PROJECT_AREAS,
  PROJECT_THEMES_BY_AREA,
  buildClienteProjectTypeLabel,
  PLATFORMS,
  URGENCY_LEVELS,
  TARGET_AUDIENCES,
  FEATURE_SUGGESTION_GROUPS,
  PROCESS_FREQUENCIES,
  PROCESS_FREQUENCY_MULTIPLIERS,
  HAS_EXISTING_SYSTEM_OPTIONS,
  HAS_CURRENT_APPLICATION_OPTIONS,
  CURRENT_APPLICATION_HOSTING_OPTIONS,
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
  CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  AUTOMATION_ACCOUNT_TYPE_OPTIONS,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
  SENSITIVE_DATA_ANSWER_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
  BENEFIT_OPTIONS,
} from "@/shared/constants/project-taxonomy";
