"use client";

import { useEffect, useMemo, useRef } from "react";
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
import {
  EMPTY_AUTOMATION_ACCOUNT_ROW,
  EMPTY_TARGET_SYSTEM_ROW,
  removeTargetSystemRow,
  type AutomationAccountFormRow,
  type AutomationInventoryValue,
  type TargetSystemFormRow,
} from "@/shared/components/automation-inventory-value";

// Tipos e funções puras (conversão leitura<->formulário, remapeamento de
// índice) moraram neste arquivo antes; agora vivem isoladas em
// `automation-inventory-value.ts`, sem depender de React — é a parte que
// mais precisa ser lida sozinha, longe do ruído de JSX. Reexportadas aqui
// para que os três chamadores (wizard, ficha, Especificação) continuem
// importando de `automation-inventory-fields` sem mudar nada.
export * from "@/shared/components/automation-inventory-value";

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

interface AutomationInventoryFieldsProps {
  /** Inventário completo — sistemas E contas, mesmo quando `section` só renderiza um dos dois. */
  value: AutomationInventoryValue;
  /**
   * Sempre recebe o inventário inteiro (as duas listas), mesmo quando só uma
   * mudou. Mantém o contrato único de leitura/escrita que o servidor espera —
   * ver `removeTargetSystemRow` em automation-inventory-value.ts.
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

  // `createTargetSystem.mutate` é ida-e-volta de rede: o `onSuccess` roda em
  // um render futuro, não no render em que o usuário clicou "Cadastrar no
  // catálogo". Se `onSuccess` fechasse sobre `value` (a prop deste render),
  // qualquer edição feita enquanto a requisição está no ar — em QUALQUER
  // linha, de sistema ou de conta, já que as duas seções compartilham o
  // mesmo `value` — seria silenciosamente descartada: `onSuccess` recriaria
  // o inventário inteiro a partir do snapshot velho mais o próprio patch.
  // `valueRef` sempre aponta pro `value` mais recente, atualizado a cada
  // render (sem lista de dependências), então `onSuccess` lê o estado vivo.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

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
          // Lê o inventário mais recente via ref (ver comentário acima), não
          // `value`/`updateRow` — que fechariam sobre o snapshot de quando o
          // botão foi clicado, revertendo qualquer edição feita nesse meio-tempo.
          const current = valueRef.current;
          onChange({
            ...current,
            systems: current.systems.map((row, i) =>
              i === index ? { ...row, targetSystemId: created.id, customName: "" } : row
            ),
          });
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
