# Aba Payback Editável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar todos os custos que alimentam a curva de payback — taxa diária, dias úteis e economia por robô, e itens de custo de estrutura — editáveis diretamente na aba Payback de `/admin/empresas/[id]/priorizacao`, com recálculo imediato.

**Architecture:** Uma coluna nova (`Company.developerDailyRateBRL`, nullable, com fallback para o valor global) e um helper puro que resolve a taxa efetiva, consumido tanto pela tela quanto pelo gerador de deck. A aba Payback sai da página (827 linhas) para um componente próprio que possui suas próprias queries e mutations; o CRUD de custos de estrutura vira um componente compartilhado entre a aba Payback e a página `/custos`.

**Tech Stack:** Next.js 15 (App Router, client components), tRPC, Prisma/PostgreSQL, React Query (via tRPC), Recharts, shadcn/ui, sonner (toasts), date-fns.

**Nota sobre testes:** este repositório não tem infraestrutura de testes automatizados (sem vitest/jest, sem script `test` no `package.json`). Adicionar uma não faz parte deste plano. O portão de verificação de cada task é `npx tsc --noEmit` e, ao final, `npm run build` mais a conferência manual descrita na Task 8.

**Referência:** `docs/superpowers/specs/2026-07-28-payback-editavel-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma` (modificar) | Campo `Company.developerDailyRateBRL Float?` |
| `prisma/migrations/20260728130000_add_company_developer_daily_rate/migration.sql` (criar) | DDL da coluna |
| `src/shared/lib/payback.ts` (modificar) | Novo `resolveDeveloperDailyRate` — fonte única da taxa efetiva |
| `src/server/trpc/routers/company.router.ts` (modificar) | `update` aceita a taxa; `listAll` expõe o campo |
| `src/server/deck/build-diagnostic-deck.ts` (modificar) | Deck usa a taxa efetiva da empresa |
| `src/shared/components/company-cost-items-card.tsx` (criar) | CRUD de `CompanyCostItem`, autossuficiente, reutilizável |
| `src/app/(private)/admin/empresas/[id]/custos/page.tsx` (modificar) | Passa a consumir o card compartilhado |
| `src/shared/components/payback-tab.tsx` (criar) | A aba Payback inteira: premissas, gráfico, KPIs, composição editável, custos |
| `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx` (modificar) | Delega a aba Payback ao componente novo |

---

### Task 1: Coluna `developerDailyRateBRL` na empresa

**Files:**
- Modify: `prisma/schema.prisma:98-121` (model `Company`)
- Create: `prisma/migrations/20260728130000_add_company_developer_daily_rate/migration.sql`

- [ ] **Step 1: Adicionar o campo ao model `Company`**

Em `prisma/schema.prisma`, no model `Company`, logo depois da linha `isActive  Boolean  @default(true)`, insira:

```prisma
  /// Taxa diária do desenvolvedor usada no cálculo de payback desta empresa.
  /// `null` = herda SystemSettings.developerDailyRateBRL (ver
  /// resolveDeveloperDailyRate em src/shared/lib/payback.ts). Zero é um valor
  /// legítimo e vence o global — só null herda.
  developerDailyRateBRL Float?
```

- [ ] **Step 2: Criar a migration**

Crie o diretório `prisma/migrations/20260728130000_add_company_developer_daily_rate/` com o arquivo `migration.sql`:

```sql
-- Taxa diária do desenvolvedor por empresa, usada no cálculo de payback.
-- NULL = herda system_settings."developerDailyRateBRL". Sem backfill: todas as
-- empresas existentes continuam herdando o valor global, exatamente como antes.
ALTER TABLE "companies" ADD COLUMN "developerDailyRateBRL" DOUBLE PRECISION;
```

- [ ] **Step 3: Regenerar o Prisma Client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client (...) to .\node_modules\@prisma\client`

Não rode `prisma migrate dev` nem `db push`: a migration é aplicada automaticamente no deploy (push em `main` dispara build + migrate + deploy).

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260728130000_add_company_developer_daily_rate
git commit -m "feat: taxa diaria do desenvolvedor por empresa no schema"
```

---

### Task 2: Helper `resolveDeveloperDailyRate`

**Files:**
- Modify: `src/shared/lib/payback.ts` (adicionar no fim do arquivo)

- [ ] **Step 1: Adicionar o helper**

Acrescente ao final de `src/shared/lib/payback.ts`:

```ts
/**
 * Resolve a taxa diária do desenvolvedor efetiva de uma empresa.
 *
 * Precedência: valor da empresa > valor global de `SystemSettings` > 0.
 *
 * `0` na empresa é um valor legítimo e VENCE o global — só `null`/`undefined`
 * herdam. Isso permite modelar uma empresa cujo custo de desenvolvimento não
 * entra na conta sem que o valor global reapareça por baixo (por isso o `??`,
 * não o `||`).
 *
 * Fonte única: usada pela aba Payback e pelo gerador de deck
 * (src/server/deck/build-diagnostic-deck.ts) — se um dos dois calcular a taxa
 * por conta própria, o .pptx passa a divergir do gráfico da tela.
 */
export function resolveDeveloperDailyRate(
  companyRate: number | null | undefined,
  globalRate: number | null | undefined
): number {
  return companyRate ?? globalRate ?? 0;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso)

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/payback.ts
git commit -m "feat: helper de taxa diaria efetiva por empresa"
```

---

### Task 3: Expor e aceitar a taxa no router de empresa

**Files:**
- Modify: `src/server/trpc/routers/company.router.ts:14-29` (`listAll`) e `:64-104` (`update`)

- [ ] **Step 1: Expor o campo em `listAll`**

Em `listAll`, o `map` de retorno hoje termina com `createdAt: c.createdAt,`. Adicione a linha da taxa logo antes dela, de modo que o objeto fique:

```ts
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      document: c.document ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      isActive: c.isActive,
      usersCount: c._count.users,
      projectsCount: c._count.projects,
      developerDailyRateBRL: c.developerDailyRateBRL,
      createdAt: c.createdAt,
    }));
```

- [ ] **Step 2: Aceitar o campo em `update`**

No `.input(z.object({ ... }))` de `update`, depois de `isActive: z.boolean().optional(),`, adicione:

```ts
        // null = volta a herdar a taxa global de SystemSettings.
        developerDailyRateBRL: z.number().min(0).nullable().optional(),
```

O corpo da mutation espalha `...rest` em `data`, e `developerDailyRateBRL` cai em `rest` — nenhuma outra mudança é necessária no corpo. Como `.optional()` faz o campo sumir do objeto quando não enviado, chamadas existentes (que não mandam a taxa) continuam não tocando na coluna.

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso)

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/company.router.ts
git commit -m "feat: company.update e listAll com taxa diaria da empresa"
```

---

### Task 4: Deck usa a taxa efetiva da empresa

**Files:**
- Modify: `src/server/deck/build-diagnostic-deck.ts:148-151` (select da empresa), `:227-228` (chamadas dos slides), `:456-459` e `:541-546` (assinaturas), `:476` e `:559` (leitura da taxa)

- [ ] **Step 1: Importar o helper**

Localize o import existente de `@/shared/lib/payback` no topo do arquivo (traz `computePaybackCurve`, `computeStructureCostAt`, `findPaybackDate`, `StructureCostItem`) e acrescente `resolveDeveloperDailyRate` à lista de nomes importados.

- [ ] **Step 2: Carregar a taxa da empresa**

Substitua o select da empresa:

```ts
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
```

por:

```ts
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true, developerDailyRateBRL: true },
  });
```

- [ ] **Step 3: Resolver a taxa uma vez e passar para os dois slides**

Substitua as duas chamadas:

```ts
  addPaybackSlide(pres, rankingCombinado, settings, structureCosts);
  addPaybackCompositionSlide(pres, rankingCombinado, settings, structureCosts);
```

por:

```ts
  // Taxa efetiva resolvida UMA vez aqui: os slides de payback recebem um número
  // já decidido (empresa > global > 0) em vez de decidirem por conta própria,
  // que é o que mantém o .pptx idêntico à aba Payback da tela de priorização.
  const paybackSettings = {
    developerDailyRateBRL: resolveDeveloperDailyRate(
      company.developerDailyRateBRL,
      settings.developerDailyRateBRL
    ),
    wave1StartDate: settings.wave1StartDate,
  };
  addPaybackSlide(pres, rankingCombinado, paybackSettings, structureCosts);
  addPaybackCompositionSlide(pres, rankingCombinado, paybackSettings, structureCosts);
```

- [ ] **Step 4: Ajustar as assinaturas dos dois slides**

Em `addPaybackSlide` e em `addPaybackCompositionSlide`, troque o tipo do parâmetro `settings`:

```ts
  settings: { developerDailyRateBRL: number | null; wave1StartDate: Date | null },
```

por:

```ts
  settings: { developerDailyRateBRL: number; wave1StartDate: Date | null },
```

- [ ] **Step 5: Remover o fallback agora redundante**

Nas duas funções, troque:

```ts
  const dailyRate = settings.developerDailyRateBRL ?? 0;
```

por:

```ts
  const dailyRate = settings.developerDailyRateBRL;
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso). Se aparecer erro de tipo em `addPaybackSlide`/`addPaybackCompositionSlide`, é sinal de que algum ponto ainda passa o `settings` cru — passe `paybackSettings`.

- [ ] **Step 7: Commit**

```bash
git add src/server/deck/build-diagnostic-deck.ts
git commit -m "feat: deck de diagnostico usa a taxa diaria efetiva da empresa"
```

---

### Task 5: Extrair o CRUD de custos de estrutura para um componente compartilhado

**Files:**
- Create: `src/shared/components/company-cost-items-card.tsx`
- Modify: `src/app/(private)/admin/empresas/[id]/custos/page.tsx`

- [ ] **Step 1: Criar o componente**

Crie `src/shared/components/company-cost-items-card.tsx` com o conteúdo completo abaixo. É o bloco "Itens de custo" da página `/custos` (tabela + dialog de criação/edição + confirmação de exclusão), autossuficiente: faz suas próprias queries e mutations a partir de `companyId`.

```tsx
"use client";

import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/trpc/root";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/shared/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { useToast } from "@/src/shared/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/shared/utils";

/**
 * CRUD dos itens de custo de estrutura (`CompanyCostItem`: pessoas, licenças,
 * infraestrutura) de uma empresa. Componente autossuficiente — busca e grava
 * seus próprios dados a partir de `companyId` — porque é usado em dois lugares:
 * a página /admin/empresas/[id]/custos e a aba Payback da priorização, onde
 * esses custos entram na curva. Duplicar a tabela + dialog nos dois lugares era
 * a alternativa; um componente só evita que as duas telas divirjam.
 */

type RouterOutputs = inferRouterOutputs<AppRouter>;
type CostItem = RouterOutputs["company"]["listCostItems"][number];

function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface CompanyCostItemsCardProps {
  companyId: string;
  /** Texto opcional abaixo do título, para contextualizar em cada tela. */
  description?: string;
}

export function CompanyCostItemsCard({ companyId, description }: CompanyCostItemsCardProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.company.listCostItems.useQuery({ companyId });
  const { data: categories = [] } = trpc.taxonomy.listCostCategories.useQuery();

  const [dialog, setDialog] = useState<{ open: boolean; editing?: CostItem }>({ open: false });
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    type: "recorrente" as "recorrente" | "pontual",
    amountBRL: "",
    startDate: toDateInputValue(new Date()),
    endDate: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    id?: string;
    label?: string;
  }>({ open: false });

  // Se o item sendo editado tem uma categoria que foi desativada depois (e por
  // isso não aparece mais em `categories`, que só lista ativas), injeta ela
  // mesmo assim na lista de opções — senão o Select mostraria o campo em
  // branco mesmo com `form.categoryId` preenchido, dando a impressão de que
  // nada está selecionado.
  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => ({ id: c.id, name: c.name }));
    if (dialog.editing && !opts.some((o) => o.id === dialog.editing!.categoryId)) {
      opts.push({ id: dialog.editing.categoryId, name: dialog.editing.category.name });
    }
    return opts;
  }, [categories, dialog.editing]);

  const invalidateAll = () => {
    utils.company.listCostItems.invalidate({ companyId });
    utils.company.getCostSummary.invalidate({ companyId });
  };

  const createMutation = trpc.company.createCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo criado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMutation = trpc.company.updateCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      setDialog({ open: false });
      toast({ title: "Item de custo atualizado" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMutation = trpc.company.deleteCostItem.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Item de custo removido" });
    },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openNew() {
    setForm({
      name: "",
      categoryId: "",
      type: "recorrente",
      amountBRL: "",
      startDate: toDateInputValue(new Date()),
      endDate: "",
    });
    setDialog({ open: true });
  }

  function openEdit(item: CostItem) {
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      type: item.type as "recorrente" | "pontual",
      amountBRL: String(item.amountBRL),
      startDate: toDateInputValue(item.startDate),
      endDate: toDateInputValue(item.endDate),
    });
    setDialog({ open: true, editing: item });
  }

  function submit() {
    const payload = {
      categoryId: form.categoryId,
      name: form.name,
      type: form.type,
      amountBRL: parseFloat(form.amountBRL) || 0,
      startDate: new Date(form.startDate),
      endDate: form.type === "recorrente" && form.endDate ? new Date(form.endDate) : null,
    };
    if (dialog.editing) {
      updateMutation.mutate({ id: dialog.editing.id, ...payload });
    } else {
      createMutation.mutate({ companyId, ...payload });
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Itens de custo</CardTitle>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item de custo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Nenhum item de custo cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category.name}</TableCell>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.amountBRL)}
                      {item.type === "recorrente" ? "/mês" : ""}
                    </TableCell>
                    <TableCell>{formatDate(item.startDate)}</TableCell>
                    <TableCell>{item.endDate ? formatDate(item.endDate) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setDeleteConfirm({ open: true, id: item.id, label: item.name })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.editing ? "Editar item de custo" : "Novo item de custo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Analista RPA - João"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, type: v as "recorrente" | "pontual" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Recorrente (mensal)</SelectItem>
                  <SelectItem value="pontual">Pontual (único)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{form.type === "recorrente" ? "Valor mensal (R$)" : "Valor (R$)"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amountBRL}
                onChange={(e) => setForm((f) => ({ ...f, amountBRL: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            {form.type === "recorrente" && (
              <div className="space-y-1.5">
                <Label>Data de fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Vazio = custo em andamento.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={!form.name || !form.categoryId || !form.amountBRL || !form.startDate}
            >
              {dialog.editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm.label}</strong>? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm.id) deleteMutation.mutate({ id: deleteConfirm.id });
                setDeleteConfirm({ open: false });
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Reescrever a página `/custos` para consumir o componente**

Substitua **todo** o conteúdo de `src/app/(private)/admin/empresas/[id]/custos/page.tsx` por:

```tsx
"use client";

import { use } from "react";
import Link from "next/link";
import { trpc } from "@/shared/trpc/client";
import { useDemoMode } from "@/shared/context/demo-mode-context";
import { Button } from "@/src/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { CompanyCostItemsCard } from "@/src/shared/components/company-cost-items-card";
import { ArrowLeft, Wallet } from "lucide-react";
import { formatCurrency } from "@/shared/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default function CustosEstruturaPage({ params }: Props) {
  const { id: companyId } = use(params);

  const { data: companies = [] } = trpc.company.listAll.useQuery();
  const company = companies.find((c) => c.id === companyId);
  const { maskCompanyName } = useDemoMode();

  const { data: summary } = trpc.company.getCostSummary.useQuery({ companyId });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/empresas">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Custos e Estrutura</h1>
          <p className="text-muted-foreground">
            {maskCompanyName(companyId, company?.name) ?? "Carregando..."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo recorrente mensal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(summary?.totalMonthlyRecurring ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Custo pontual acumulado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary?.totalOneTime ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <CompanyCostItemsCard companyId={companyId} />
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso)

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/company-cost-items-card.tsx "src/app/(private)/admin/empresas/[id]/custos/page.tsx"
git commit -m "refactor: extrai CRUD de custos de estrutura para componente compartilhado"
```

---

### Task 6: Componente `PaybackTab`

**Files:**
- Create: `src/shared/components/payback-tab.tsx`

- [ ] **Step 1: Criar o componente**

Crie `src/shared/components/payback-tab.tsx` com o conteúdo completo abaixo.

```tsx
"use client";

import { useMemo, useState } from "react";
import { differenceInBusinessDays, differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/shared/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/shared/components/ui/card";
import { Input } from "@/src/shared/components/ui/input";
import { Label } from "@/src/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/shared/components/ui/table";
import { formatCurrency } from "@/shared/utils";
import {
  computePaybackCurve,
  computeStructureCostAt,
  findPaybackDate,
  resolveDeveloperDailyRate,
  type StructureCostItem,
} from "@/shared/lib/payback";
import type { WaveScheduleItem } from "@/shared/lib/wave-schedule";
import { PaybackChart } from "@/src/shared/components/payback-chart";
import { CompanyCostItemsCard } from "@/src/shared/components/company-cost-items-card";

/**
 * Aba "Payback" da tela de priorização — Passo 6 do blueprint de diagnóstico,
 * agora editável: taxa diária da empresa, dias úteis e economia anual de cada
 * robô, e os itens de custo de estrutura são ajustados aqui mesmo, gravando
 * direto no banco.
 *
 * A página dona (priorizacao/page.tsx) continua responsável pelos cronogramas
 * das ondas, porque a aba "Cronograma" usa os mesmos — recalculá-los aqui
 * duplicaria a lógica do Passo 5. Tudo que é exclusivo do payback (curva,
 * composição, custos de estrutura) vive neste componente.
 */

interface PaybackTabProps {
  companyId: string;
  isLoading: boolean;
  wave1Schedule: WaveScheduleItem[];
  wave2Schedule: WaveScheduleItem[];
  /** Economia anual por projeto, vinda do ranking já carregado pela página. */
  savingByProjectId: Map<string, number>;
  /** Esforço em dias úteis por projeto (null = ainda não estimado). */
  effortDaysByProjectId: Map<string, number | null>;
  /** Valor cru gravado na empresa — `null` significa "herda o global". */
  companyDailyRateBRL: number | null;
  /** Valor global de SystemSettings, usado como fallback e como placeholder. */
  globalDailyRateBRL: number | null;
  /** Usada como início de referência quando não há nenhum robô agendado. */
  wave1StartDate: Date;
}

/**
 * Input numérico que só grava no blur (ou no Enter) e reverte para o valor
 * atual quando o texto digitado é inválido. O rascunho local existe para o
 * usuário poder apagar e redigitar sem que cada tecla dispare uma mutation;
 * ao commitar, o rascunho é descartado e o input volta a refletir a prop —
 * que é atualizada pela invalidação da query logo em seguida.
 */
function EditableNumber({
  value,
  onCommit,
  allowEmpty = false,
  integer = false,
  className,
  step,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
  allowEmpty?: boolean;
  /** Rejeita decimais no cliente — `implementationEffortDays` é `z.number().int()` no servidor. */
  integer?: boolean;
  className?: string;
  step?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value != null ? String(value) : "");

  function commit() {
    if (draft === null) return; // nada foi digitado
    const trimmed = draft.trim();
    setDraft(null);
    if (trimmed === "") {
      if (allowEmpty) {
        if (value !== null) onCommit(null);
        return;
      }
      toast.error("Valor obrigatório — nada foi alterado.");
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Informe um número maior ou igual a zero.");
      return;
    }
    if (integer && !Number.isInteger(parsed)) {
      toast.error("Informe um número inteiro de dias.");
      return;
    }
    if (parsed === value) return;
    onCommit(parsed);
  }

  return (
    <Input
      type="number"
      min={0}
      step={step}
      className={className}
      value={text}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function KpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

export function PaybackTab({
  companyId,
  isLoading,
  wave1Schedule,
  wave2Schedule,
  savingByProjectId,
  effortDaysByProjectId,
  companyDailyRateBRL,
  globalDailyRateBRL,
  wave1StartDate,
}: PaybackTabProps) {
  const utils = trpc.useUtils();

  const dailyRate = resolveDeveloperDailyRate(companyDailyRateBRL, globalDailyRateBRL);

  const { data: costItems = [] } = trpc.company.listCostItems.useQuery({ companyId });

  const structureCosts: StructureCostItem[] = useMemo(
    () =>
      costItems.map((item) => ({
        type: item.type as "recorrente" | "pontual",
        amountBRL: item.amountBRL,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    [costItems]
  );

  const companyMutation = trpc.company.update.useMutation({
    onSuccess: () => {
      utils.company.listAll.invalidate();
      toast.success("Taxa diária atualizada.");
    },
    onError: (error) => {
      toast.error("Erro ao salvar a taxa diária", { description: error.message });
    },
  });

  const projectMutation = trpc.project.update.useMutation({
    onSuccess: () => {
      // Sem filtro de input: a página troca `sortBy`, e cada variação é uma
      // entrada de cache diferente do mesmo ranking.
      utils.project.getPrioritizedRanking.invalidate();
      toast.success("Projeto atualizado.");
    },
    onError: (error) => {
      toast.error("Erro ao salvar o projeto", { description: error.message });
    },
  });

  const paybackSchedule = useMemo(
    () =>
      [...wave1Schedule, ...wave2Schedule].map((item) => ({
        projectId: item.projectId,
        startDate: item.startDate,
        endDate: item.endDate,
        estimatedAnnualSavingBRL: savingByProjectId.get(item.projectId) ?? 0,
      })),
    [wave1Schedule, wave2Schedule, savingByProjectId]
  );

  const curve = useMemo(
    () => computePaybackCurve(paybackSchedule, dailyRate, structureCosts),
    [paybackSchedule, dailyRate, structureCosts]
  );

  const paybackDate = useMemo(() => findPaybackDate(curve), [curve]);

  // "Data de início do cronograma": a menor startDate entre os dois schedules
  // combinados — usada só para expressar o payback em "N meses a partir do
  // início", nunca como um número fixo.
  const scheduleStartDate = useMemo(() => {
    if (paybackSchedule.length === 0) return wave1StartDate;
    return new Date(Math.min(...paybackSchedule.map((item) => item.startDate.getTime())));
  }, [paybackSchedule, wave1StartDate]);

  const paybackMonths = useMemo(() => {
    if (!paybackDate) return null;
    const days = differenceInCalendarDays(paybackDate, scheduleStartDate);
    return Math.max(0, Math.round(days / 30.44));
  }, [paybackDate, scheduleStartDate]);

  // Composição do payback: uma linha por robô, com os números que alimentam
  // a curva acima (facilita conferir/auditar de onde vêm custo e economia).
  const composition = useMemo(() => {
    const withWave = [
      ...wave1Schedule.map((item) => ({ ...item, wave: 1 as const })),
      ...wave2Schedule.map((item) => ({ ...item, wave: 2 as const })),
    ];
    return withWave.map((item) => {
      const businessDays = differenceInBusinessDays(item.endDate, item.startDate) + 1;
      const annualSavingBRL = savingByProjectId.get(item.projectId) ?? 0;
      return {
        projectId: item.projectId,
        title: item.title,
        wave: item.wave,
        endDate: item.endDate,
        businessDays,
        developmentCostBRL: businessDays * dailyRate,
        monthlySavingBRL: annualSavingBRL / 12,
        annualSavingBRL,
        // Valor gravado no projeto, que é o que o input edita — pode diferir de
        // `businessDays` (derivado do cronograma) quando o esforço é null e o
        // Passo 5 aplicou o fallback de 20 dias úteis.
        effortDays: effortDaysByProjectId.get(item.projectId) ?? null,
      };
    });
  }, [wave1Schedule, wave2Schedule, savingByProjectId, effortDaysByProjectId, dailyRate]);

  const totals = useMemo(() => {
    const developmentCost = composition.reduce((sum, i) => sum + i.developmentCostBRL, 0);
    const annualSaving = composition.reduce((sum, i) => sum + i.annualSavingBRL, 0);
    const lastPoint = curve[curve.length - 1];
    const structureCost = lastPoint ? computeStructureCostAt(structureCosts, lastPoint.date) : 0;
    return { developmentCost, annualSaving, structureCost };
  }, [composition, curve, structureCosts]);

  // Total de custo de estrutura já acumulado até hoje (fora da janela
  // projetada) — mostrado como uma linha própria na tabela de composição,
  // separado do custo de dev por robô que já aparece linha a linha.
  const structureCostToDate = useMemo(
    () => computeStructureCostAt(structureCosts, new Date()),
    [structureCosts]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Premissas de custo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label>Taxa diária do desenvolvedor (R$)</Label>
            <EditableNumber
              value={companyDailyRateBRL}
              allowEmpty
              step="0.01"
              onCommit={(next) =>
                companyMutation.mutate({ id: companyId, developerDailyRateBRL: next })
              }
            />
            <p className="text-xs text-muted-foreground">
              {companyDailyRateBRL == null
                ? `Vazio = usa o padrão global de ${formatCurrency(globalDailyRateBRL ?? 0)} (Configurações).`
                : `Valor específico desta empresa. Apague o campo para voltar ao padrão global de ${formatCurrency(globalDailyRateBRL ?? 0)}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payback / ROI acumulado</CardTitle>
          <p className="text-sm font-medium">
            {paybackDate
              ? `Payback estimado em ${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
              : "Payback não atingido no período calculado"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTile
              label="Custo total projetado"
              value={formatCurrency(totals.developmentCost + totals.structureCost)}
              hint={`dev ${formatCurrency(totals.developmentCost)} + estrutura ${formatCurrency(totals.structureCost)}`}
            />
            <KpiTile
              label="Economia anual"
              value={formatCurrency(totals.annualSaving)}
              hint={`${composition.length} robô${composition.length === 1 ? "" : "s"} nas ondas 1 e 2`}
            />
            <KpiTile
              label="Payback"
              value={
                paybackDate
                  ? `${paybackMonths} ${paybackMonths === 1 ? "mês" : "meses"}`
                  : "não atingido"
              }
              hint={
                paybackDate
                  ? `em ${format(paybackDate, "dd/MM/yyyy")}`
                  : "dentro da janela projetada"
              }
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>
          ) : (
            <PaybackChart curve={curve} paybackDate={paybackDate} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composição do cálculo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Um robô por linha, com os números que alimentam a curva acima — custo de
            desenvolvimento = dias úteis × taxa diária do desenvolvedor. Dias úteis e economia são
            editáveis: a alteração é gravada no projeto e recalcula cronograma e curva.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Onda</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead className="w-28 text-right">Dias úteis</TableHead>
                <TableHead className="text-right">Custo de dev.</TableHead>
                <TableHead className="text-right">Economia/mês</TableHead>
                <TableHead className="w-40 text-right">Economia/ano</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {composition.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum robô nas ondas 1/2 ainda.
                  </TableCell>
                </TableRow>
              ) : (
                composition.map((item) => (
                  <TableRow key={item.projectId}>
                    <TableCell className="font-medium max-w-[260px] truncate">
                      {item.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">Onda {item.wave}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(item.endDate, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber
                        className="h-8 w-20 text-right"
                        value={item.effortDays}
                        integer
                        step="1"
                        // Vazio grava null = "ainda não estimado"; o Passo 5
                        // volta a aplicar o fallback de 20 dias úteis.
                        allowEmpty
                        onCommit={(next) =>
                          projectMutation.mutate({
                            id: item.projectId,
                            implementationEffortDays: next,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.developmentCostBRL)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.monthlySavingBRL)}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditableNumber
                        className="h-8 w-32 text-right"
                        step="0.01"
                        value={item.annualSavingBRL}
                        onCommit={(next) =>
                          projectMutation.mutate({
                            id: item.projectId,
                            estimatedAnnualSavingBRL: next,
                          })
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
              {structureCostToDate > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell className="font-medium" colSpan={4}>
                    Estrutura (pessoas/licenças) acumulada até hoje
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium" colSpan={3}>
                    {formatCurrency(structureCostToDate)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CompanyCostItemsCard
        companyId={companyId}
        description="Pessoas, licenças e infraestrutura — entram na curva de payback como custo acumulado, além do custo de desenvolvimento de cada robô."
      />
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso). O componente ainda não é usado por ninguém — isso é esperado nesta task.

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/payback-tab.tsx
git commit -m "feat: componente da aba de payback com custos editaveis"
```

---

### Task 7: Ligar a página de priorização ao `PaybackTab`

**Files:**
- Modify: `src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx`

- [ ] **Step 1: Ajustar os imports**

No import de `date-fns` (linhas 6-11), remova `differenceInBusinessDays` e `format` — passam a ser usados só dentro do `PaybackTab`. O import fica:

```tsx
import { addBusinessDays, differenceInCalendarDays } from "date-fns";
```

Remova por completo o import de `@/shared/lib/payback` (linhas 51-56) e o import de `PaybackChart` (linha 58). Adicione, junto dos outros imports de componentes:

```tsx
import { PaybackTab } from "@/src/shared/components/payback-tab";
```

Mantenha o import de `computeWaveSchedule` — os cronogramas continuam sendo calculados aqui.

- [ ] **Step 2: Expor o esforço em dias úteis por projeto**

Logo depois do `savingByProjectId` (linhas 281-284), adicione:

```tsx
  const effortDaysByProjectId = useMemo(
    () => new Map(displayRanking.map((row) => [row.id, row.implementationEffortDays])),
    [displayRanking]
  );
```

- [ ] **Step 3: Remover o cálculo de payback que migrou para o componente**

Apague os blocos abaixo, que hoje ocupam da linha 286 até a 365 — `paybackSchedule`, `developerDailyRateBRL`, a query `listCostItems`, `structureCosts`, `paybackCurve`, `paybackDate`, `paybackComposition`, `scheduleStartDate`, `paybackMonths` e `structureCostToDate`. Todos passaram para o `PaybackTab`.

Mantenha `savingByProjectId` (usado como prop) e o `effortDaysByProjectId` recém-criado.

- [ ] **Step 4: Substituir o conteúdo da aba**

Substitua todo o bloco `<TabsContent value="payback">` (linhas 709-806, os dois `<Card>` do gráfico e da composição) por:

```tsx
        <TabsContent value="payback" className="space-y-6 mt-4">
          <PaybackTab
            companyId={companyId}
            isLoading={isLoading}
            wave1Schedule={wave1Schedule}
            wave2Schedule={wave2Schedule}
            savingByProjectId={savingByProjectId}
            effortDaysByProjectId={effortDaysByProjectId}
            companyDailyRateBRL={company?.developerDailyRateBRL ?? null}
            globalDailyRateBRL={settings?.developerDailyRateBRL ?? null}
            wave1StartDate={wave1StartDate}
          />
        </TabsContent>
```

Nota sobre o aviso removido: a mensagem "Taxa diária ainda não configurada em Configurações" some junto com o card antigo. O texto de ajuda abaixo do campo de taxa no `PaybackTab` cobre o mesmo caso, mostrando o valor global vigente.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso). Erros de "declarado mas nunca usado" indicam import ou `useMemo` que sobrou do Step 3 — remova-os.

- [ ] **Step 6: Rodar o lint**

Run: `npm run lint`
Expected: sem erros. Avisos preexistentes em outros arquivos podem ser ignorados; qualquer erro nos arquivos tocados deve ser corrigido.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(private)/admin/empresas/[id]/priorizacao/page.tsx"
git commit -m "feat: aba de payback editavel na tela de priorizacao"
```

---

### Task 8: Verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Build completo**

Run: `npm run build`
Expected: `Compiled successfully` e a lista de rotas, sem erro de tipo.

- [ ] **Step 2: Subir o app**

Run: `npm run dev`
Expected: `Ready on http://localhost:3000`

- [ ] **Step 3: Conferência manual**

Abra `/admin/empresas/<id>/priorizacao`, aba **Payback**, e confirme, item a item:

1. O campo de taxa diária começa vazio e a legenda mostra o valor global.
2. Digitar `500` e sair do campo: toast de sucesso, custo de dev de cada linha e a curva sobem.
3. Apagar o campo e sair: volta a herdar o global, curva volta ao estado anterior.
4. Digitar `abc` ou `-5` e sair: toast de erro e o campo volta ao valor anterior, sem gravar.
5. Alterar os dias úteis de um robô: a data de entrega dele e a dos robôs seguintes mudam (o cronograma é sequencial), e a curva acompanha. Digitar `2,5` dias: toast de erro pedindo inteiro, sem gravar. Apagar o campo: grava "não estimado" e o cronograma volta ao fallback de 20 dias úteis.
6. Alterar a economia/ano de um robô: KPI de economia anual e a curva de economia sobem.
7. Criar, editar e excluir um item de custo de estrutura no card de baixo: o KPI de custo total e a curva reagem.
8. Abrir a aba **Cronograma**: as datas batem com as da tabela de composição.
9. Abrir `/admin/empresas/<id>/custos`: a mesma lista de itens aparece, com o CRUD funcionando.
10. Abrir a priorização de **outra** empresa: a taxa diária dela não foi afetada.
11. Exportar o .pptx em `/admin/empresas`: os slides "Payback / ROI acumulado" e "Composição do payback" usam a taxa da empresa, com os mesmos números da tela.

- [ ] **Step 4: Commit final (se algo precisou de ajuste)**

```bash
git add -A
git commit -m "fix: ajustes da aba de payback editavel apos verificacao manual"
```
