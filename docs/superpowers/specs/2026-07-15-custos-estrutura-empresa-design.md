# Custos e Estrutura por Empresa (Design)

## Contexto

Hoje o único conceito de "custo" no sistema é o custo de desenvolvimento dos robôs — `SystemSettings.developerDailyRateBRL` × dias úteis de implementação de cada projeto, calculado em `src/shared/lib/payback.ts` (`computePaybackCurve`/`computePointAt`) e exibido na aba "Payback" de `/admin/empresas/[id]/priorizacao`. Não existe nenhum conceito de custo recorrente ou estrutural (pessoas alocadas na operação, licenças de ferramentas de RPA, infraestrutura) em lugar nenhum — `Company` (`prisma/schema.prisma:97-118`) é puramente identidade/contato.

Isso é uma lacuna real: o payback calculado hoje ignora o custo de manter a estrutura de RPA rodando (analistas, licenças), então superestima o retorno — ele só considera "quanto custou construir", não "quanto custa manter". O pedido é adicionar isso como uma tela nova por empresa, alimentando o cálculo de payback existente.

## Requisitos confirmados com o usuário

1. Itens de custo podem ser **recorrentes** (valor mensal, com data de início e opcionalmente fim) ou **pontuais** (valor único numa data).
2. Categorias de custo são uma **lista fixa expansível**: Pessoas, Licenças, Infraestrutura, Outro como padrão, com possibilidade de admin cadastrar novas categorias ao longo do tempo — mesmo padrão de taxonomia editável já usado pra Ferramenta Principal (`MainTool`, CRUD em `/admin/configuracoes/categorias`), não texto livre.
3. Os custos de estrutura **entram no cálculo de payback**: somam mês a mês no custo acumulado, a partir da data de início de cada item até sua data de fim (ou até hoje, se em andamento).
4. No gráfico, o custo de estrutura fica **somado na mesma linha** de "Custo acumulado" (não uma linha separada) — mas a tabela de composição abaixo do gráfico mostra o total de estrutura como uma linha própria, pra quem quiser o detalhe.

## Modelo de dados

Duas tabelas novas, sem alterar nenhuma existente (só adiciona uma relação em `Company`):

```prisma
model CompanyCostCategory {
  id        String            @id @default(cuid())
  name      String
  slug      String            @unique
  isActive  Boolean           @default(true)
  order     Int               @default(0)
  costItems CompanyCostItem[]
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  @@map("company_cost_categories")
}

model CompanyCostItem {
  id         String              @id @default(cuid())
  company    Company             @relation(fields: [companyId], references: [id], onDelete: Cascade)
  companyId  String
  category   CompanyCostCategory @relation(fields: [categoryId], references: [id])
  categoryId String
  name       String              // ex: "Analista RPA - João", "Licença UiPath Attended"
  type       String              // "recorrente" | "pontual"
  amountBRL  Float               // valor mensal se recorrente, valor único se pontual
  startDate  DateTime
  endDate    DateTime?           // só relevante pra recorrente; null = em andamento
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt

  @@map("company_cost_items")
}
```

`Company` ganha `costItems CompanyCostItem[]` na seção de relacionamentos.

Migration cria as duas tabelas e semeia 4 categorias padrão (`Pessoas`, `Licenças`, `Infraestrutura`, `Outro`), mesmo padrão usado pra semear `MainTool`.

## Backend

**`taxonomy.router.ts`** ganha o mesmo quinteto já usado pra `MainTool`/`ProjectArea`, agora pra `CompanyCostCategory`: `listCostCategories` (ativas), `listAllCostCategories` (admin, incl. inativas), `createCostCategory`, `updateCostCategory`, `deleteCostCategory`.

**`company.router.ts`** ganha CRUD dos itens de custo, todos `adminProcedure` (mesmo racional de sensibilidade financeira já usado em `getAreaSummary`/`getPrioritizedRanking`):
- `listCostItems({ companyId })` — todos os itens da empresa, incluindo categoria (`include: { category: true }`), ordenados por `startDate desc`.
- `createCostItem` — `{ companyId, categoryId, name, type, amountBRL, startDate, endDate? }`.
- `updateCostItem` — `{ id, name?, categoryId?, type?, amountBRL?, startDate?, endDate? }`.
- `deleteCostItem` — `{ id }`.
- `getCostSummary({ companyId })` — retorna `{ totalMonthlyRecurring, totalOneTime }` (soma dos itens ativos hoje: recorrentes sem `endDate` ou com `endDate >= hoje`; pontuais somam sempre) — usado tanto na tela de custos quanto potencialmente na composição do payback.

## Cálculo de payback (`src/shared/lib/payback.ts`)

`computePaybackCurve` e `computePointAt` ganham um parâmetro novo, `structureCosts: StructureCostItem[] = []` (default vazio, não quebra chamadores existentes que não passarem nada):

```typescript
export type StructureCostItem = {
  type: "recorrente" | "pontual";
  amountBRL: number;
  startDate: Date;
  endDate: Date | null;
};
```

Dentro de `computePointAt`, além do custo de dev já existente, soma:
- Pra cada item **recorrente**: se `asOf >= startDate`, soma `(amountBRL * 12 / 365) * diasDecorridos`, onde `diasDecorridos` é o número de dias entre `startDate` e `min(asOf, endDate ?? asOf)` (mesmo padrão de "anualiza e divide por 365" já usado no lado da economia, `estimatedAnnualSavingBRL / 365`).
- Pra cada item **pontual**: se `asOf >= startDate`, soma `amountBRL` inteiro (reconhecido de uma vez, na data de início).

O parâmetro é opcional justamente pra não forçar todo chamador a mudar — mas os dois consumidores atuais (`priorizacao/page.tsx` e `build-diagnostic-deck.ts`) são atualizados nesta feature pra efetivamente passar os itens de custo da empresa, senão a tela e o PPTX exportado ficariam mostrando paybacks diferentes (um com estrutura, outro sem) — isso seria pior que não ter a feature.

## Frontend

**Botão novo em `/admin/empresas`**: ícone (ex. `Wallet`) ao lado de Priorização/Automações Existentes/Entrevistas, linkando pra `/admin/empresas/[id]/custos`.

**Tela nova `/admin/empresas/[id]/custos/page.tsx`**: lista de itens de custo da empresa (tabela: nome, categoria, tipo, valor, período), botão "Novo item de custo" abrindo diálogo (nome, categoria via Select, tipo via Select recorrente/pontual, valor, data início, data fim — campo de data fim só aparece/faz sentido se tipo = recorrente), editar e excluir por item. Cards de resumo no topo mostrando `totalMonthlyRecurring` e `totalOneTime` (via `getCostSummary`).

**Config: nova seção "Categorias de custo"** em `/admin/configuracoes/categorias`, CRUD idêntico ao de "Ferramentas principais" (Nome + Slug + Ordem + ativo/inativo + excluir).

**Aba Payback (`priorizacao/page.tsx`)**: busca `company.listCostItems({ companyId })`, mapeia pra `StructureCostItem[]` e passa pra `computePaybackCurve`. A tabela "Composição do cálculo" abaixo do gráfico ganha uma linha final "Estrutura (pessoas/licenças)" mostrando o total de custo de estrutura já acumulado até a data de referência da curva, separado do custo de dev por robô que já é mostrado linha a linha.

**Deck PPTX (`build-diagnostic-deck.ts`)**: mesma mudança — busca os itens de custo da empresa e passa pra `computePaybackCurve`, mantendo o gráfico exportado consistente com o gráfico em tela.

## Fora de escopo

- Edição em lote / importação de itens de custo (ex: CSV) — só CRUD manual item a item por enquanto.
- Categorias de custo com hierarquia (sub-categorias) — lista plana, mesmo padrão de Ferramenta Principal.
- Notificação/alerta quando um item de custo recorrente "vence" (chega no `endDate`) — puramente informativo por enquanto.
- Vincular um item de custo a um projeto específico (ex: "essa licença é só do robô X") — os custos de estrutura são da empresa como um todo, não por projeto/robô individual.
