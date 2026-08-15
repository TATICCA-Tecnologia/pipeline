import type { Project } from "@/shared/types";
import type { EnvironmentSheetSource } from "@/shared/lib/existing-automation";

/**
 * Assinatura exata de `maskFreeText` do useDemoMode (ver
 * src/shared/context/demo-mode-context.tsx:37) — ela devolve `undefined` quando
 * recebe `undefined`, então o tipo de retorno precisa incluí-lo. Recebida como
 * parâmetro, e não importada do contexto, para este módulo continuar puro e
 * verificável pelo script tsx, que não roda dentro de um provider React.
 */
export type MaskFn = (value: string | null | undefined) => string | null | undefined;

/**
 * Traduz o projeto vindo de `project.byId` para o formato normalizado da ficha,
 * aplicando a máscara do modo demonstração DURANTE o mapeamento.
 *
 * Quatro dos campos aqui são exatamente os que não podem vazar numa demo para
 * outro cliente: `currentApplicationAssetId` (hostname/IP), `username` (login
 * real), `accessPoint` (URL do servidor) e `accessReference`/`accessNotes`
 * (onde a credencial mora). Se um campo novo de texto livre entrar na ficha, ele
 * passa por `mask` aqui — não existe segunda barreira depois deste ponto.
 *
 * Slugs de taxonomia (hosting, dataInput, accountType, accessLocation,
 * handlesSensitiveData) NÃO são mascarados: são valores de lista fechada, não
 * revelam nada do cliente, e mascará-los quebraria a resolução do label.
 */
export function projectToEnvironmentSource(project: Project, mask: MaskFn): EnvironmentSheetSource {
  // `?? null` em todo retorno de `mask`: os campos de EnvironmentSheetSource são
  // `string | null`, e maskFreeText devolve `undefined` quando recebe `undefined`.
  const m = (value: string | null | undefined): string | null => mask(value) ?? null;

  return {
    hosting: project.currentApplicationHosting ?? null,
    hostingCustom: m(project.currentApplicationHostingCustom),
    assetId: m(project.currentApplicationAssetId),
    robotSchedule: m(project.robotSchedule),
    liveSince: project.currentApplicationLiveSince
      ? new Date(project.currentApplicationLiveSince)
      : null,
    dataInput: project.currentApplicationDataInput ?? null,
    dataInputDetails: m(project.currentApplicationDataInputDetails),
    dataOutput: project.currentApplicationDataOutput ?? null,
    dataOutputDetails: m(project.currentApplicationDataOutputDetails),
    author: m(project.currentApplicationAuthor),
    owner: m(project.currentApplicationOwner),
    ownerRole: m(project.currentApplicationOwnerRole),
    ownerArea: project.currentApplicationOwnerAreaName ?? null,
    backupOwner: m(project.currentApplicationBackupOwner),
    peopleOfInterest: (project.peopleOfInterest ?? []).map((p) => ({
      name: m(p.name) ?? "",
      role: m(p.role),
    })),
    accessLocation: project.currentApplicationAccessLocation ?? null,
    accessReference: m(project.currentApplicationAccessReference),
    contingencyActions: project.currentApplicationContingencyActions ?? null,
    contingencyDetails: m(project.currentApplicationContingencyDetails),
    handlesSensitiveData: project.handlesSensitiveData ?? null,
    sensitiveDataCategories: project.sensitiveDataCategories ?? null,
    sensitiveDataDetails: m(project.sensitiveDataDetails),
    systems: (project.targetSystems ?? []).map((s) => ({
      name: m(s.name) ?? "",
      category: s.categoryName,
      accessPoint: m(s.accessPoint),
      accessNotes: m(s.accessNotes),
    })),
    accounts: (project.automationAccounts ?? []).map((a) => ({
      username: m(a.username) ?? "",
      type: a.accountType,
      system: m(a.systemName),
      owner: m(a.ownerName),
      notes: m(a.notes),
    })),
  };
}
