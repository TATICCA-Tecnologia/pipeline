# Meus Robôs — tela operacional do cliente (Design)

## Contexto

Hoje o Pipeline modela só o ciclo de *entrega* de um projeto de automação (`BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE/CANCELLED`). Uma vez que um projeto chega em `DONE`, não existe mais nenhuma tela ou campo que acompanhe o que acontece depois — nada sobre o robô estar rodando, pausado ou com problema, e nenhuma visão de quanto ele já economizou desde a entrega. O cliente, que é quem efetivamente "usa" a automação no dia a dia, não tem hoje nenhum lugar para ver isso nem para avisar que algo parou de funcionar.

Este design cobre a primeira versão dessa camada operacional, deliberadamente **sem telemetria automática**: nenhuma integração com orquestrador de RPA, nenhum robô reportando execuções sozinho. Tudo é atualizado por uma pessoa (TATICCA), o que é a decisão de escopo já confirmada com o usuário (orquestração é fase futura — ver `[[pipeline_produto_comercial_gestao_rpa]]` na memória do projeto).

## Requisitos confirmados com o usuário

1. **Escopo de projetos**: todo projeto do cliente com `status = DONE` (`"completed"` no frontend) entra na lista, independente de `category`/`type` — sem filtro adicional por "é RPA mesmo".
2. **Quem edita**: só `admin`/`super_admin` atualiza status operacional e economia acumulada. O cliente só visualiza.
3. **Reportar problema**: reaproveita o `Comment` já existente (canal `GLOBAL`, o mesmo usado no chat do projeto), com um campo booleano novo `isIncident` para destacar esses comentários no feed do admin — não é um novo modelo de "incidente" com estado próprio (aberto/resolvido).
4. **Layout**: tabela/lista (não grade de cards) — validado visualmente com o usuário via mockup.

## Modelo de dados (`prisma/schema.prisma`)

Três campos novos no `Project` (`prisma/schema.prisma:124`), na mesma área dos outros blocos comentados do model:

```prisma
// Estado operacional pos-entrega (preenchido manualmente pelo admin, visivel ao cliente)
operationalStatus           RobotOperationalStatus?
accumulatedSavingBRL         Float?
operationalStatusUpdatedAt  DateTime?
```

Novo enum, ao lado dos demais (`prisma/schema.prisma:270` região de enums):

```prisma
enum RobotOperationalStatus {
  ACTIVE
  PAUSED
  ISSUE
}
```

Um campo novo no `Comment` (`prisma/schema.prisma:361`):

```prisma
isIncident Boolean @default(false)
```

Diferença importante em relação aos campos "técnico/financeiro" existentes (`complexity`, `hourlyRateBRL`, `estimatedAnnualSavingBRL`, comentados como "nunca exposto ao cliente"): os 3 campos novos são **admin-only para escrita, mas client-visible para leitura** — é o oposto do padrão atual, então precisam ser adicionados explicitamente aos objetos de retorno de `list`/`byId` (que hoje montam o retorno campo a campo, não fazem spread do registro do Prisma).

Requer `prisma migrate dev` local antes de subir; o deploy em produção já aplica `migrate deploy` automaticamente no boot do container (push em `main`), sem passo manual — ver `[[pipeline_deploy_via_actions]]`.

## Backend

### `project.router.ts`

- **`update`** (`src/server/trpc/routers/project.router.ts:439`): adicionar ao input zod `operationalStatus: z.enum(["ACTIVE","PAUSED","ISSUE"]).nullable().optional()` e `accumulatedSavingBRL: z.number().min(0).nullable().optional()`. Adicionar as duas chaves ao `ARCHITECT_ONLY_FIELDS` (linha 47) para que a checagem de autorização já existente (linha 515-525) rejeite qualquer tentativa de um cliente escrever esses campos via `update` — reaproveita a trava de papel que já existe, sem lógica nova.
- No corpo da mutation (após a lógica de `taskDurationHours`/`processFrequency`, ~linha 586): se `operationalStatus !== undefined` ou `accumulatedSavingBRL !== undefined`, gravar ambos em `data` e setar `data.operationalStatusUpdatedAt = new Date()` no servidor (nunca aceito do client, evita spoof de data).
- Adicionar `operationalStatus` e `accumulatedSavingBRL` a `SOLICITATION_FIELD_LABELS` (linha 67) com rótulos `"Status operacional"` e `"Economia acumulada"` (**não** incluir `operationalStatusUpdatedAt` nesse mapa — é setado só no servidor, nunca chega em `rest`, então nunca apareceria no diff mesmo se incluído). O `ActivityLog` já é gravado automaticamente por toda chamada de `update` (linha 597-604) via `describeChangedFields`, então isso já fica coberto sem nenhum código novo de log.
- **`list`** (linha 129) e **`byId`** (linha 216): adicionar as 3 chaves aos objetos de retorno (linhas ~199 e ~273), seguindo o padrão `p.operationalStatus ?? undefined` já usado para os outros campos opcionais.

### `comment.router.ts`

- **`create`** (`src/server/trpc/routers/comment.router.ts:43`): adicionar `isIncident: z.boolean().optional().default(false)` ao input e a `data` (linha 57).
- **`byProject`** e o retorno de **`create`**/**`update`**: incluir `isIncident: c.isIncident` no mapeamento de retorno.

## Frontend

### Tipos compartilhados (`src/shared/types/index.ts`)

- `Project` (linha 31): novo bloco `// Operação pós-entrega (admin escreve, cliente vê)` com `operationalStatus?: "ACTIVE" | "PAUSED" | "ISSUE"`, `accumulatedSavingBRL?: number`, `operationalStatusUpdatedAt?: Date`.
- `Comment` (linha 122): `isIncident?: boolean`.

### Mapeadores

- `mapProject` em `src/shared/context/projects-context.tsx:40`: repassar os 3 campos novos (mesmo padrão `p.campo ?? undefined`).
- `mapComment` em `src/shared/context/comments-context.tsx:87`: repassar `isIncident`.
- `comments-context.tsx:50` (`addComment`): aceitar e repassar `isIncident` na chamada de `createComment.mutate`.

### Nova rota: `src/app/(private)/cliente/robos/page.tsx`

- Usa `useProjects()` já existente; filtra `clientProjects.filter(p => p.status === "completed")`.
- Reaproveita `CompanyFilter` (já usado em `cliente/page.tsx:9-13`) para o mesmo filtro por empresa.
- Tabela (layout validado — opção B do mockup), colunas: **Robô** (título) · **Empresa** (só exibida se o cliente tiver mais de uma empresa) · **Status** (badge: verde "Ativo" / cinza "Pausado" / vermelho "Com problema"; `operationalStatus` nulo — caso de projeto `DONE` antigo que o admin ainda não classificou — mostra badge neutro "Sem status") · **Economia acumulada** (formatada em R$, `—` se nulo) · **Atualizado em** (data pt-BR, `—` se nulo) · coluna de ação com botão "Reportar problema".
- Estado vazio: se não houver nenhum projeto `DONE`, mensagem "Nenhum robô em operação ainda — assim que um projeto for concluído, ele aparece aqui."

### `ReportIncidentModal` (novo, `src/app/(private)/cliente/robos/_components/report-incident.modal.tsx`)

- Modal simples aberto via `useModal()` (mesmo padrão de `ProjectDetailsModal`/`ProjectExecutiveSlideModal`): um `Textarea` ("Descreva o problema") + botão "Enviar". Ao confirmar, chama `addComment` (de `useComments(projectId)`) com `{ projectId, visibility: "GLOBAL", isIncident: true, content }`, fecha o modal e mostra toast de sucesso (o hook já trata erro via toast, ver `comments-context.tsx:26-29`).

### Sidebar (`src/shared/components/app-sidebar.tsx`)

- `clientSections` (linha 43): novo item na seção "Projetos", logo abaixo de "Meus Projetos" — `{ href: "/cliente/robos", label: "Meus Robôs", icon: Bot }` (ícone `Bot` de `lucide-react`, já uma dependência do projeto).

### Bloco de edição no admin (`src/app/(private)/admin/projetos/_components/project-details.modal.tsx`)

Segue exatamente o padrão já existente do bloco "Corrigir Aplicação existente hoje" (linhas 113-151: `Select` + botão "Salvar", gated por role, usando `project.update` direto): novo bloco, gated por `(user?.role === "admin" || user?.role === "super_admin") && project.status === "completed"`, com:
- `Select` de status operacional (Ativo/Pausado/Com problema, valores `ACTIVE`/`PAUSED`/`ISSUE`).
- `Input` numérico para economia acumulada (R$).
- Botão "Salvar" chamando `project.update` com `{ id, operationalStatus, accumulatedSavingBRL }` (mesma mutation já instanciada no componente, linha 77-87, ou uma segunda instância dedicada para não conflitar de estado com o bloco existente).

### `ProjectChat` (`src/shared/components/project-chat.tsx`)

- Pequena adição: se `comment.isIncident`, renderizar um badge "⚠️ Incidente" (vermelho) ao lado do badge de papel (perto da linha 157-162), para destacar no feed que admin/dev já usam — sem novo canal, sem novo componente de exibição.

## Fora de escopo

- Qualquer telemetria automática/orquestração de robôs (endpoint de ingestão, model de execução, API key por robô) — fase futura, fora deste design.
- Fechar o vazamento de campos financeiros em `list`/`byId` (`publicProcedure` retornando `estimatedAnnualSavingBRL`/`complexity`) — dívida já conhecida e documentada em specs anteriores, não faz parte desta feature.
- Estado de ciclo de vida do incidente (aberto → resolvido) — o "problema reportado" é só um comentário marcado; não há tela de gestão de incidentes nem transição de estado.
- Notificação push/e-mail dedicada quando um incidente é reportado — usa o mesmo `ActivityLog`/canal de comentário já existente; nenhum novo gatilho em `Notification`.
- Editar `operationalStatus`/`accumulatedSavingBRL` fora do admin (ex.: no wizard de criação, na especificação técnica) — só no bloco novo do `ProjectDetailsModal`.
