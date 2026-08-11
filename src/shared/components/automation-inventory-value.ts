// Tipos e funções PURAS do inventário de automação (sistemas-alvo + contas)
// — sem React, de propósito. É aqui que mora toda a aritmética de índice
// (systemIndex <-> id, remap ao remover uma linha, filtro de linhas em
// branco) que pode gravar um vínculo trocado sem erro se ficar espalhada.
// A UI (`automation-inventory-fields.tsx`) reexporta tudo daqui — os três
// chamadores (wizard, ficha, Especificação) continuam importando do arquivo
// de UI sem precisar saber que o módulo foi dividido.
import type { ProjectTargetSystemView, ProjectAutomationAccountView } from "@/shared/types";

export interface TargetSystemFormRow {
  targetSystemId: string;
  customName: string;
  accessPoint: string;
  accessNotes: string;
}

export interface AutomationAccountFormRow {
  username: string;
  systemIndex: number | null;
  accountType: string;
  ownerName: string;
  notes: string;
}

export interface AutomationInventoryValue {
  systems: TargetSystemFormRow[];
  accounts: AutomationAccountFormRow[];
}

export const EMPTY_TARGET_SYSTEM_ROW: TargetSystemFormRow = {
  targetSystemId: "",
  customName: "",
  accessPoint: "",
  accessNotes: "",
};

export const EMPTY_AUTOMATION_ACCOUNT_ROW: AutomationAccountFormRow = {
  username: "",
  systemIndex: null,
  accountType: "",
  ownerName: "",
  notes: "",
};

/**
 * Remove a linha `index` de `systems` e devolve o inventário com `accounts`
 * já remapeadas: contas que apontavam para a linha removida perdem o vínculo
 * (`systemIndex: null`), e as que apontavam para índices maiores decrementam
 * uma posição. Centralizada aqui — não em cada tela que usa este componente —
 * porque sistemas e contas viajam juntos no servidor (`automationInventory`
 * em `project.router.ts`, que resolve `systemIndex` -> id na mesma
 * transação): duplicar este remapeamento em cada chamador é exatamente onde
 * nasce um vínculo trocado sem erro.
 */
export function removeTargetSystemRow(
  value: AutomationInventoryValue,
  index: number
): AutomationInventoryValue {
  return {
    systems: value.systems.filter((_, i) => i !== index),
    accounts: value.accounts.map((account) => {
      if (account.systemIndex == null) return account;
      if (account.systemIndex === index) return { ...account, systemIndex: null };
      if (account.systemIndex > index) return { ...account, systemIndex: account.systemIndex - 1 };
      return account;
    }),
  };
}

/**
 * Converte as listas de LEITURA (`ProjectTargetSystemView[]` /
 * `ProjectAutomationAccountView[]`, como devolvidas por `project.byId`) para
 * o formato de FORMULÁRIO deste componente. Usada para hidratar a edição
 * (ficha do projeto, aba Especificação) a partir de um projeto existente.
 *
 * Ponto crítico: `ProjectAutomationAccountView.projectTargetSystemId`
 * referencia o id ESTÁVEL da linha de sistema; o formulário referencia por
 * ÍNDICE (`systemIndex`), porque é assim que o servidor grava
 * (`replaceAutomationInventory` em `project.router.ts` recria as linhas do
 * zero a cada save e resolve índice -> id na mesma transação). O mapa
 * id->índice é construído a partir da MESMA lista `systems` que alimenta o
 * formulário — nunca de uma lista paralela — para que o índice devolvido
 * aqui seja garantidamente a posição real da linha depois de convertida.
 *
 * `ProjectTargetSystemView.name` já vem RESOLVIDO (nome do catálogo, ou o
 * customName quando a linha não está no catálogo). Para reconstruir o
 * formulário: se `targetSystemId` não é nulo, a linha veio do catálogo e
 * `customName` volta vazio; se é nulo, `name` inteiro volta como `customName`.
 */
export function buildAutomationInventoryValue(
  systems: ProjectTargetSystemView[] | undefined,
  accounts: ProjectAutomationAccountView[] | undefined
): AutomationInventoryValue {
  const rows: TargetSystemFormRow[] = (systems ?? []).map((s) => ({
    targetSystemId: s.targetSystemId ?? "",
    customName: s.targetSystemId ? "" : s.name,
    accessPoint: s.accessPoint ?? "",
    accessNotes: s.accessNotes ?? "",
  }));

  // Índice = posição na MESMA lista `systems` acima (não em `rows` — mas as
  // duas têm exatamente a mesma ordem e o mesmo tamanho, por construção).
  const indexById = new Map<string, number>((systems ?? []).map((s, index) => [s.id, index]));

  const accountRows: AutomationAccountFormRow[] = (accounts ?? []).map((a) => ({
    username: a.username,
    systemIndex:
      a.projectTargetSystemId != null ? indexById.get(a.projectTargetSystemId) ?? null : null,
    accountType: a.accountType ?? "",
    ownerName: a.ownerName ?? "",
    notes: a.notes ?? "",
  }));

  return { systems: rows, accounts: accountRows };
}

/** Payload aceito por `project.update`/`project.create` em `automationInventory`. */
export interface AutomationInventoryInput {
  systems: {
    targetSystemId?: string;
    customName?: string;
    accessPoint?: string;
    accessNotes?: string;
  }[];
  accounts: {
    username: string;
    systemIndex?: number;
    accountType?: string;
    ownerName?: string;
    notes?: string;
  }[];
}

/**
 * Converte o valor do formulário para o payload que `project.update` espera
 * em `automationInventory`. Linhas em branco são descartadas — o servidor as
 * rejeita (`targetSystemInputSchema` exige catálogo ou nome; `automationAccountInputSchema`
 * exige username não vazio). O índice de cada conta é remapeado para a lista
 * JÁ FILTRADA de sistemas: descartar uma linha vazia no meio desloca as
 * seguintes, e a conta precisa acompanhar — mesma regra que
 * `build-project-payload.ts` aplica no wizard.
 */
export function toAutomationInventoryInput(value: AutomationInventoryValue): AutomationInventoryInput {
  const indexMap = new Map<number, number>();
  const systems = value.systems.flatMap((s, originalIndex) => {
    if (!s.targetSystemId && !s.customName.trim()) return [];
    indexMap.set(originalIndex, indexMap.size);
    return [
      {
        targetSystemId: s.targetSystemId || undefined,
        customName: s.customName.trim() || undefined,
        accessPoint: s.accessPoint.trim() || undefined,
        accessNotes: s.accessNotes.trim() || undefined,
      },
    ];
  });

  const accounts = value.accounts
    .filter((a) => a.username.trim())
    .map((a) => ({
      username: a.username.trim(),
      systemIndex: a.systemIndex != null ? indexMap.get(a.systemIndex) : undefined,
      accountType: a.accountType || undefined,
      ownerName: a.ownerName.trim() || undefined,
      notes: a.notes.trim() || undefined,
    }));

  return { systems, accounts };
}
