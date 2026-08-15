/**
 * Regras da Ficha de ambiente — a página técnica do slide de automações que
 * já rodam em produção. Módulo puro de propósito: sem React, sem Prisma, sem
 * pptxgenjs. As duas superfícies que desenham a ficha (o componente React em
 * src/shared/components/slide/environment-sheet-page.tsx e o slide .pptx em
 * src/server/deck/build-existing-automations-deck.ts) mapeiam sua própria
 * fonte para `EnvironmentSheetSource` e consomem o mesmo resultado — é isso
 * que impede as duas de divergirem na regra de omissão.
 *
 * Quem decide SE a ficha existe é `isExistingAutomation`, em
 * src/shared/lib/opportunity-classification.ts — este módulo só monta o
 * conteúdo dela.
 *
 * Ver docs/superpowers/specs/2026-08-14-slide-ambiente-automacoes-existentes-design.md
 */
import {
  CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS,
  CURRENT_APPLICATION_CONTINGENCY_OPTIONS,
  SENSITIVE_DATA_CATEGORY_OPTIONS,
  resolveLabel,
  resolveCurrentApplicationHostingLabel,
  resolveDataEndpointLabel,
  resolveAccountTypeLabel,
  resolveSensitiveDataAnswerLabel,
  resolveKeyLabels,
} from "@/shared/constants/project-taxonomy";
import { formatDate } from "@/shared/utils";

/** Sistema-alvo já normalizado (nome do catálogo ou customName resolvido). */
export type EnvironmentSystem = {
  name: string;
  category: string | null;
  accessPoint: string | null;
  accessNotes: string | null;
};

/**
 * Conta como ela CHEGA — `type` é slug de AUTOMATION_ACCOUNT_TYPE_OPTIONS.
 * A saída é `SheetAccount`, com o label já resolvido: os dois formatos têm
 * nomes de tipo e de campo diferentes de propósito. Reusar o mesmo tipo nos
 * dois lados deixaria `type` significando slug na entrada e label na saída, e
 * quem resolvesse de novo no consumidor não veria erro nenhum —
 * `resolveLabel` devolve o próprio valor quando não acha a opção.
 */
export type EnvironmentAccount = {
  username: string;
  type: string | null;
  system: string | null;
  owner: string | null;
  notes: string | null;
};

/** Conta pronta para desenhar: `typeLabel` já é texto de exibição. */
export type SheetAccount = {
  username: string;
  typeLabel: string | null;
  system: string | null;
  owner: string | null;
  notes: string | null;
};

export type EnvironmentPerson = { name: string; role: string | null };

/**
 * Formato normalizado que as duas superfícies produzem. Achatado de propósito
 * (sem objetos aninhados de Prisma nem do tipo Project do cliente): é o que
 * permite o React mascarar os textos livres DURANTE o mapeamento, sem que este
 * módulo precise saber que modo demonstração existe.
 */
export type EnvironmentSheetSource = {
  hosting: string | null;
  hostingCustom: string | null;
  assetId: string | null;
  robotSchedule: string | null;
  liveSince: Date | null;
  dataInput: string | null;
  dataInputDetails: string | null;
  dataOutput: string | null;
  dataOutputDetails: string | null;
  author: string | null;
  owner: string | null;
  ownerRole: string | null;
  ownerArea: string | null;
  backupOwner: string | null;
  peopleOfInterest: EnvironmentPerson[];
  accessLocation: string | null;
  accessReference: string | null;
  contingencyActions: unknown;
  contingencyDetails: string | null;
  handlesSensitiveData: string | null;
  sensitiveDataCategories: unknown;
  sensitiveDataDetails: string | null;
  systems: EnvironmentSystem[];
  accounts: EnvironmentAccount[];
};

export type SheetLine = { label: string; value: string };
export type FlowBox = { title: string; lines: string[] };

export type EnvironmentSheet = {
  flow: { input?: FlowBox; runtime?: FlowBox; output?: FlowBox };
  people: SheetLine[];
  peopleOfInterest: EnvironmentPerson[];
  access: SheetLine[];
  systems: EnvironmentSystem[];
  accounts: SheetAccount[];
  sensitive: SheetLine[];
  /** systems + accounts + peopleOfInterest — entrada do tier de densidade. */
  itemCount: number;
};

/** Texto livre só conta como preenchido se sobrar algo depois do trim. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Descarta as entradas sem valor — o coração da regra de omissão. */
function lines(entries: { label: string; value: string | null }[]): SheetLine[] {
  return entries.filter((e): e is SheetLine => e.value !== null);
}

/** Junta partes não vazias com separador; tudo vazio vira null. */
function join(parts: (string | null)[], separator: string): string | null {
  const kept = parts.filter((p): p is string => p !== null && p !== "");
  return kept.length > 0 ? kept.join(separator) : null;
}

/**
 * Linhas repetidas são descartadas. Isso não é cosmética: no modo
 * demonstração `maskFreeText` troca TODO texto livre pela mesma string, então
 * hospedagem-custom e ativo (ou ativo e agendamento) viram a mesma linha e a
 * caixa mostraria o mesmo texto duas vezes na frente de um cliente.
 */
function flowBox(title: string, boxLines: (string | null)[]): FlowBox | undefined {
  const kept = Array.from(
    new Set(boxLines.filter((l): l is string => l !== null && l !== ""))
  );
  return kept.length > 0 ? { title, lines: kept } : undefined;
}

/**
 * Monta a ficha aplicando a regra de omissão em todos os níveis: campo vazio
 * não vira linha, bloco sem linha vira array vazio (quem desenha não o
 * desenha), e ficha sem nada devolve `null` — nesse caso a página/slide não
 * chega a existir.
 */
export function buildEnvironmentSheet(source: EnvironmentSheetSource): EnvironmentSheet | null {
  const hosting = resolveCurrentApplicationHostingLabel(
    source.hosting,
    clean(source.hostingCustom) ?? undefined
  );

  const flow = {
    input: flowBox("Entrada", [
      resolveDataEndpointLabel(source.dataInput) ?? null,
      clean(source.dataInputDetails),
    ]),
    runtime: flowBox("Onde roda", [
      hosting ?? null,
      clean(source.assetId),
      clean(source.robotSchedule),
      source.liveSince ? `Em produção desde ${formatDate(source.liveSince)}` : null,
    ]),
    output: flowBox("Saída", [
      resolveDataEndpointLabel(source.dataOutput) ?? null,
      clean(source.dataOutputDetails),
    ]),
  };

  const people = lines([
    { label: "Quem desenvolveu", value: clean(source.author) },
    {
      label: "Responsável hoje",
      value: join(
        [clean(source.owner), clean(source.ownerRole), clean(source.ownerArea)],
        " · "
      ),
    },
    { label: "Substituto", value: clean(source.backupOwner) },
  ]);

  const contingency = resolveKeyLabels(
    source.contingencyActions,
    CURRENT_APPLICATION_CONTINGENCY_OPTIONS
  );
  const access = lines([
    {
      label: "Onde ficam os acessos",
      value:
        resolveLabel(source.accessLocation, CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS) ?? null,
    },
    { label: "Referência", value: clean(source.accessReference) },
    {
      label: "Se parar",
      value: join(
        [contingency.length > 0 ? contingency.join(", ") : null, clean(source.contingencyDetails)],
        " — "
      ),
    },
  ]);

  const categories = resolveKeyLabels(source.sensitiveDataCategories, SENSITIVE_DATA_CATEGORY_OPTIONS);
  const sensitive = lines([
    {
      label: "Dados sigilosos",
      value: resolveSensitiveDataAnswerLabel(source.handlesSensitiveData) ?? null,
    },
    { label: "Categorias", value: categories.length > 0 ? categories.join(", ") : null },
    { label: "Detalhes", value: clean(source.sensitiveDataDetails) },
  ]);

  // Conta com username vazio é dado inconsistente (o formulário não permite) —
  // descartada aqui em vez de renderizar uma linha em branco.
  const accounts: SheetAccount[] = source.accounts
    .filter((a) => clean(a.username) !== null)
    .map((a) => ({
      username: a.username.trim(),
      typeLabel: resolveAccountTypeLabel(a.type) ?? null,
      system: clean(a.system),
      owner: clean(a.owner),
      notes: clean(a.notes),
    }));

  const systems = source.systems
    .filter((s) => clean(s.name) !== null)
    .map((s) => ({
      name: s.name.trim(),
      category: clean(s.category),
      accessPoint: clean(s.accessPoint),
      accessNotes: clean(s.accessNotes),
    }));

  const peopleOfInterest = source.peopleOfInterest
    .filter((p) => clean(p.name) !== null)
    .map((p) => ({ name: p.name.trim(), role: clean(p.role) }));

  const itemCount = systems.length + accounts.length + peopleOfInterest.length;

  const isEmpty =
    !flow.input &&
    !flow.runtime &&
    !flow.output &&
    people.length === 0 &&
    access.length === 0 &&
    sensitive.length === 0 &&
    itemCount === 0;

  if (isEmpty) return null;

  return { flow, people, peopleOfInterest, access, systems, accounts, sensitive, itemCount };
}

/**
 * Nível de compactação da ficha. Sistemas, contas e pessoas de interesse são
 * listas sem teto no banco, e a exigência é que TUDO caiba na página — nada de
 * "+N adicionais". O tier baixa fonte e altura de linha juntas conforme o
 * volume; abaixo dele ainda existem o reflow de colunas (splitIntoColumns) e,
 * só no React, o auto-shrink da própria página.
 */
export type DensityTier = "comfortable" | "dense" | "compact";

export function densityTierFor(itemCount: number): DensityTier {
  if (itemCount <= 12) return "comfortable";
  if (itemCount <= 24) return "dense";
  return "compact";
}

/** Acima deste número de itens a lista passa a ocupar duas sub-colunas. */
export const COLUMN_SPLIT_THRESHOLD = 6;

/**
 * Devolve sempre pelo menos uma coluna (mesmo vazia), para quem desenha poder
 * iterar sem checar tamanho. A primeira coluna fica com a sobra em lista
 * ímpar — ler de cima para baixo, esquerda para direita, exige isso.
 */
export function splitIntoColumns<T>(items: T[], threshold = COLUMN_SPLIT_THRESHOLD): T[][] {
  if (items.length <= threshold) return [items];
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}
