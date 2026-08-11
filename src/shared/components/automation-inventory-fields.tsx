"use client";

import { useMemo } from "react";
import { Plus, X } from "lucide-react";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import { useToast } from "@/src/shared/hooks/use-toast";
import {
  AUTOMATION_ACCOUNT_TYPE_OPTIONS,
  AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH,
  CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH,
} from "@/shared/constants/project-taxonomy";
import type { ProjectTargetSystemView, ProjectAutomationAccountView } from "@/shared/types";

// Cópia local de propósito — o mesmo helper já vive duplicado em
// `project-request-edit-form.tsx` e `architecture-tab.tsx`. Importar de
// `app/(private)/cliente/solicitar/utils/solicitar.utils.ts` inverteria a
// direção de dependência (shared/ não deve depender de app/).
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

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

interface AutomationInventoryFieldsProps {
  /** Inventário completo — sistemas E contas, mesmo quando `section` só renderiza um dos dois. */
  value: AutomationInventoryValue;
  /**
   * Sempre recebe o inventário inteiro (as duas listas), mesmo quando só uma
   * mudou. Mantém o contrato único de leitura/escrita que o servidor espera —
   * ver `removeTargetSystemRow` acima.
   */
  onChange: (value: AutomationInventoryValue) => void;
  /**
   * Qual bloco renderizar neste ponto de montagem. Existem dois porque as
   * telas que consomem este componente posicionam sistemas e contas em
   * lugares diferentes da página (ex.: no wizard, contas ficam dentro do
   * bloco de sustentação, sistemas ficam soltos antes dele) — mas ambos os
   * pontos de montagem compartilham o mesmo `value`/`onChange`, então o
   * remapeamento ao remover um sistema nunca fica duplicado ou fora de sincronia.
   */
  section: "systems" | "accounts";
  /** Só usado por `section="systems"` — controla o botão "Cadastrar no catálogo". */
  canRegisterTaxonomy?: boolean;
}

export function AutomationInventoryFields({
  value,
  onChange,
  section,
  canRegisterTaxonomy = false,
}: AutomationInventoryFieldsProps) {
  if (section === "systems") {
    return (
      <TargetSystemsSection
        value={value}
        onChange={onChange}
        canRegisterTaxonomy={canRegisterTaxonomy}
      />
    );
  }
  return <AutomationAccountsSection value={value} onChange={onChange} />;
}

/**
 * Sistemas sobre os quais a automação atua (SAP, portal da Receita...) — vale
 * para todo projeto, novo ou de melhoria: mesmo uma automação nova age sobre
 * sistemas, e é essa informação que dimensiona o esforço.
 *
 * Dois controles visíveis por linha: um Select do catálogo (`targetSystemId`)
 * e um campo de texto livre sempre disponível (`customName`) para o sistema
 * que não está cadastrado. Selecionar um do catálogo limpa o texto livre e
 * vice-versa (uma linha usa um ou outro, nunca os dois).
 *
 * Cadastrar o nome digitado como entrada PERMANENTE do catálogo
 * (`taxonomy.createTargetSystem`) só é oferecido a quem pode
 * (`canRegisterTaxonomy`, checado pelo servidor via `adminProcedure`) — para
 * os demais usuários o texto livre já resolve o caso sem depender de rede.
 */
function TargetSystemsSection({
  value,
  onChange,
  canRegisterTaxonomy,
}: {
  value: AutomationInventoryValue;
  onChange: (value: AutomationInventoryValue) => void;
  canRegisterTaxonomy: boolean;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: targetSystemsCatalog = [] } = trpc.taxonomy.listTargetSystems.useQuery();
  const systemOptions = targetSystemsCatalog.map((s) => ({ value: s.id, label: s.name }));

  const createTargetSystem = trpc.taxonomy.createTargetSystem.useMutation({
    onError: (error) =>
      toast({
        title: "Não foi possível cadastrar o sistema",
        description: error.message,
        variant: "destructive",
      }),
  });

  function updateRow(index: number, patch: Partial<TargetSystemFormRow>) {
    onChange({
      ...value,
      systems: value.systems.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function handleAdd() {
    onChange({ ...value, systems: [...value.systems, { ...EMPTY_TARGET_SYSTEM_ROW }] });
  }

  function handleRemove(index: number) {
    onChange(removeTargetSystemRow(value, index));
  }

  function handleRegisterInCatalog(index: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    createTargetSystem.mutate(
      { name: trimmed, slug: slugify(trimmed), order: targetSystemsCatalog.length, categoryId: null },
      {
        onSuccess: (created) => {
          utils.taxonomy.listTargetSystems.invalidate();
          toast({ title: `Sistema "${created.name}" criado` });
          updateRow(index, { targetSystemId: created.id, customName: "" });
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Sistemas sobre os quais a automação atua
        </Label>
        <p className="text-xs text-muted-foreground">
          SAP, um portal do governo, o site de um banco... tudo opcional.
        </p>
      </div>

      {/*
        Chave por posição — de propósito, não uma sobra do array bruto. Toda
        linha aqui é totalmente controlada (o valor vem de `value`, nunca de
        estado interno do input), e cada edição de campo já cria um objeto
        novo para a linha (`updateRow`) — uma chave estável por objeto faria o
        React desmontar o input a cada tecla digitada (perde o foco). Índice
        muda só ao inserir/remover, que é exatamente quando faz sentido o
        React tratar como uma linha "diferente".
      */}
      {value.systems.map((row, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <Label>Sistema do catálogo</Label>
              <Select
                value={row.targetSystemId || undefined}
                onValueChange={(v) => updateRow(index, { targetSystemId: v, customName: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione, se estiver no catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {systemOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 shrink-0"
              onClick={() => handleRemove(index)}
              aria-label="Remover sistema"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`target-system-${index}-customName`}>
              Ou informe um sistema fora do catálogo
            </Label>
            <div className="flex gap-2">
              <Input
                id={`target-system-${index}-customName`}
                value={row.customName}
                onChange={(e) => {
                  const nextCustomName = e.target.value;
                  updateRow(index, {
                    customName: nextCustomName,
                    targetSystemId: nextCustomName.trim() ? "" : row.targetSystemId,
                  });
                }}
                placeholder="Ex.: sistema interno de faturamento"
                className="flex-1"
              />
              {canRegisterTaxonomy && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!row.customName.trim() || createTargetSystem.isPending}
                  onClick={() => handleRegisterInCatalog(index, row.customName)}
                >
                  Cadastrar no catálogo
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`target-system-${index}-accessPoint`}>
              Onde é acessado (URL, servidor ou instância)
            </Label>
            <Input
              id={`target-system-${index}-accessPoint`}
              value={row.accessPoint}
              onChange={(e) => updateRow(index, { accessPoint: e.target.value })}
              placeholder="Ex.: srv-sap.empresa.local, ou o link do portal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`target-system-${index}-accessNotes`}>Como acessar</Label>
            <Input
              id={`target-system-${index}-accessNotes`}
              value={row.accessNotes}
              onChange={(e) => updateRow(index, { accessNotes: e.target.value })}
              maxLength={CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH}
              placeholder="Ex.: cofre de senhas do TI"
            />
            <p className="text-xs text-muted-foreground">
              Onde encontrar o acesso — nunca escreva senhas ou tokens aqui.
            </p>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar sistema
      </Button>
    </div>
  );
}

/**
 * Contas/usernames que a automação existente utiliza — nunca senha, só o
 * identificador.
 *
 * `systemIndex` referencia a POSIÇÃO da linha em `value.systems`, não um id
 * estável — os rótulos do Select "Sistema" são resolvidos a partir do mesmo
 * `value.systems` recebido via props, então uma edição na seção de sistemas
 * (renderizada em outro ponto de montagem, ver `AutomationInventoryFields`)
 * se reflete aqui imediatamente, no próximo render.
 */
function AutomationAccountsSection({
  value,
  onChange,
}: {
  value: AutomationInventoryValue;
  onChange: (value: AutomationInventoryValue) => void;
}) {
  const { data: targetSystemsCatalog = [] } = trpc.taxonomy.listTargetSystems.useQuery();
  const catalogNameById = useMemo(
    () => new Map(targetSystemsCatalog.map((s) => [s.id, s.name])),
    [targetSystemsCatalog]
  );

  // Linhas de sistema ainda sem nome resolvível (nem catálogo, nem texto
  // livre) ficam de fora das opções: vincular uma conta a um sistema que
  // ainda não existe de verdade só confunde, mesmo que o payload descarte
  // essa linha de sistema depois por estar vazia.
  const systemOptions = value.systems
    .map((system, index) => ({
      index,
      label: (system.targetSystemId && catalogNameById.get(system.targetSystemId)) || system.customName,
    }))
    .filter((option): option is { index: number; label: string } => Boolean(option.label));

  function updateRow(index: number, patch: Partial<AutomationAccountFormRow>) {
    onChange({
      ...value,
      accounts: value.accounts.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function handleAdd() {
    onChange({ ...value, accounts: [...value.accounts, { ...EMPTY_AUTOMATION_ACCOUNT_ROW }] });
  }

  function handleRemove(index: number) {
    onChange({ ...value, accounts: value.accounts.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Contas que a automação utiliza
        </Label>
        <p className="text-xs text-muted-foreground">
          Tudo opcional. Só o login de cada conta — nunca a senha.
        </p>
      </div>

      {/* Chave por posição — mesmo raciocínio de `TargetSystemsSection` acima. */}
      {value.accounts.map((row, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor={`automation-account-${index}-username`}>Usuário/login</Label>
              <Input
                id={`automation-account-${index}-username`}
                value={row.username}
                onChange={(e) => updateRow(index, { username: e.target.value })}
                maxLength={AUTOMATION_ACCOUNT_USERNAME_MAX_LENGTH}
                placeholder="Ex.: rpa_sap"
              />
              <p className="text-xs text-muted-foreground">
                Só o login. Nunca escreva a senha aqui.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 shrink-0"
              onClick={() => handleRemove(index)}
              aria-label="Remover conta"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de conta</Label>
              <Select
                value={row.accountType || undefined}
                onValueChange={(v) => updateRow(index, { accountType: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sistema</Label>
              <Select
                value={row.systemIndex != null ? String(row.systemIndex) : undefined}
                onValueChange={(v) => updateRow(index, { systemIndex: Number(v) })}
                disabled={systemOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      systemOptions.length === 0
                        ? "Nenhum sistema cadastrado ainda"
                        : "Selecione"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {systemOptions.map((option) => (
                    <SelectItem key={option.index} value={String(option.index)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`automation-account-${index}-ownerName`}>De quem é a conta</Label>
              <Input
                id={`automation-account-${index}-ownerName`}
                value={row.ownerName}
                onChange={(e) => updateRow(index, { ownerName: e.target.value })}
                placeholder="Quem responde por essa conta"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`automation-account-${index}-notes`}>Observações</Label>
              <Input
                id={`automation-account-${index}-notes`}
                value={row.notes}
                onChange={(e) => updateRow(index, { notes: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
        <Plus className="mr-2 h-4 w-4" />
        Adicionar conta
      </Button>
    </div>
  );
}
