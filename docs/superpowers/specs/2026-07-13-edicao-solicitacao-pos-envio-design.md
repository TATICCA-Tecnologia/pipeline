# Edição dos campos de solicitação depois de enviado (Design)

## Contexto

Hoje, depois que um projeto é criado, os campos "de solicitação" (título, descrição, área/tema, público-alvo, narrativa do processo, benefícios, avaliações 1-5, urgência, prazo limite, etc.) ficam permanentemente só-leitura na UI: `ProjectDetailSections` (`src/shared/components/project-detail-sections.tsx`) só exibe texto, sem nenhum input. Nenhuma tela — nem do cliente, nem do admin — permite editar esses campos depois da criação.

Ao mesmo tempo, a mutation `project.update` (`src/server/trpc/routers/project.router.ts:363`) já é `protectedProcedure`, sem NENHUMA checagem de role, de dono (`clientId`) ou de status do projeto. Ou seja, hoje qualquer usuário autenticado já poderia, via chamada direta à API, alterar qualquer campo aceito pelo schema (incluindo `status`, `developerId`, `companyId` e, se estivessem no schema, os campos técnicos/financeiros do arquiteto) — só não existe um formulário que exponha isso na prática.

Objetivo: dar ao **cliente que criou o projeto** e ao **arquiteto** (role `admin`/`super_admin` — não existe role "arquiteto" separado no sistema; é o mesmo papel usado em `adminProcedure`) o direito de editar os campos de solicitação depois do envio, e ao mesmo tempo fechar a lacuna de autorização que já existe na mutation.

## Requisitos confirmados com o usuário

1. **Campos técnicos/financeiros continuam exclusivos do arquiteto.** Complexidade, ferramenta principal, estratégia de execução, notas do arquiteto, taxa horária, saving anual estimado, esforço em dias, onda/ordem de implementação — o cliente nunca edita nem precisa editar esses campos aqui. Continuam sendo editados como hoje, só pelo arquiteto, em `architecture-tab.tsx` (`/admin/projetos/[id]/especificacao`). Este design não mexe nessa tela.
2. **Trava por status, só para o cliente.** Arquiteto (`admin`/`super_admin`) sempre pode editar, em qualquer status. Cliente-criador só edita enquanto o projeto está ativo (`BACKLOG`/`TODO`/`IN_PROGRESS`/`IN_REVIEW`); uma vez `DONE` ou `CANCELLED`, a edição fica bloqueada para ele (só o arquiteto destrava, editando ele mesmo).
3. **Edição inline na página de detalhe** (`/projeto/[id]`), não uma tela/modal separada. Um botão "Editar" liga um modo de edição nas seções client-facing de `ProjectDetailSections`; um único par "Salvar alterações"/"Cancelar" no rodapé.
4. **Toda edição pós-envio gera uma entrada no `ActivityLog`** do projeto, com os campos alterados listados em `details`, para rastreabilidade (o Slide Executivo depende de vários desses números).

## Backend

### 1. Autorização em `project.update`

Hoje a mutation não busca o projeto nem a role do chamador antes de aplicar o update. Passa a:

```
const project = await ctx.db.project.findUnique({ where: { id }, select: { clientId: true, status: true } });
if (!project) throw NOT_FOUND;

const caller = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { role: true } });
const isArchitect = caller?.role === "ADMIN" || caller?.role === "SUPER_ADMIN";
const isOwner = project.clientId === ctx.userId;

if (!isArchitect) {
  if (!isOwner) throw FORBIDDEN; // não é o cliente dono nem arquiteto
  if (project.status === "DONE" || project.status === "CANCELLED") {
    throw FORBIDDEN; // "Projeto concluído/cancelado — peça ao time para reabrir a edição"
  }
  // rejeita chaves fora da allowlist de solicitação (ver abaixo)
}
```

Isso fecha, de quebra, o buraco que já existe hoje: sem essa checagem, qualquer usuário logado (incluindo `developer` ou um `client` de outro projeto) pode chamar `project.update` e mudar `status`, `developerId`, `companyId` ou (uma vez adicionados ao schema, ver abaixo) os campos técnicos de qualquer projeto.

### 2. Allowlist de campos por papel

Campos que só o arquiteto pode tocar (rejeitar com `FORBIDDEN` se um não-arquiteto tentar enviá-los): `status`, `priority`, `developerId`, `companyId`, `solutionTypes`, `mainTool`, `executionStrategy`, `architectNotes`, `complexity`, `robotSchedule`, `hourlyRateBRL`, `estimatedAnnualSavingBRL`, `implementationEffortDays`, `implementationWave`, `waveOrder`.

Campos "de solicitação", editáveis por cliente-dono (dentro da trava de status) e por arquiteto (sempre): `title`, `description`, `areaId`, `themeId`, `estimatedDeadline`, `targetAudience`, `expectedUsers`, `urgency`, `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `hasCurrentApplication`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, `ratingErrorReduction`, `ratingProcessCriticality`, `ratingInternalImpact`, `ratingExternalImpact`, `ratingCompliance`, `peopleInvolved`, `peopleInvolvedDetails`, `taskDurationHours`, `processFrequency`.

Fora de escopo: `platform` (a string decorativa composta de "Tipo / Plataforma") não entra na allowlist nem no formulário — ver nota na seção Frontend. A lista de "Funcionalidades" (`ProjectFeature`) continua gerenciada pelas mutations dedicadas já existentes (`feature.create`/`feature.toggleComplete`), não entra neste bulk-update.

### 3. Extensão do schema zod de `update`

O input de `update` hoje não tem: `areaId`, `themeId`, `targetAudience`, `expectedUsers`, `urgency`, `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved`, os 5 `rating*`, `peopleInvolvedDetails` — todos existem no `create` e no schema Prisma, só faltam aqui. Adicionar seguindo o mesmo padrão de tipos/validação já usado em `create` (`src/server/trpc/routers/project.router.ts:222-261`). A query `project.byId` também precisa passar a devolver `areaId`/`themeId` (hoje ausentes do objeto de retorno, apesar de existirem no modelo) para que o formulário tenha o valor atual pra pré-selecionar.

### 4. Activity log mais específico

Ao salvar, calcular as chaves do `data` final que realmente mudaram em relação ao valor atual do projeto, e gravar:

```
action: "Solicitação editada"
details: "<lista de rótulos dos campos alterados, ex.: 'Urgência, Prazo limite, Narrativa do processo'>"
```

Sem diff de valor antigo/novo por campo (evita lidar com serialização de tipos diferentes — `Json`, array, número, data); só o "o quê mudou, quem mudou, quando" já cobre a necessidade de rastreabilidade. Mantém o log genérico `"Projeto atualizado"` para os casos em que só campos de arquiteto foram alterados (chamada vinda de `architecture-tab.tsx`), sem alterar esse fluxo existente.

## Frontend

### `project-detail-sections.tsx` ganha modo de edição

Recebe (via props ou hooks já disponíveis na página) `currentUserId` e `currentUserRole`, além do `project` que já recebe hoje. Calcula:

```
const isArchitect = viewerRole === "admin" || viewerRole === "super_admin";
const isOwner = project.clientId === currentUserId;
const canEdit = isArchitect || (isOwner && !["completed", "cancelled"].includes(project.status));
```

Quando `canEdit`, um botão "Editar" aparece no topo da página (`src/app/(private)/projeto/[id]/page.tsx`), ligando um `isEditing` local. Em modo de edição, as seções client-facing passam a renderizar inputs em vez de `FieldValueDisplay`:

- **Básico**: `title` (texto) e `description` (textarea) ficam editáveis. `projectType`/"Tipo / Plataforma" **continua só-leitura**: esse valor é uma string decorativa composta na criação (`"{área} - {tema}" · Plataforma: "{plataforma}"`, ver `build-project-payload.ts:36-39`), não um campo limpo — editá-la como um select simples jogaria fora a informação hoje concatenada nela. Em vez disso, ganha uma nova linha "Área / Tema" editável (dois selects encadeados, mesmo padrão do wizard) que grava em `areaId`/`themeId` — colunas estruturadas que já existem no banco (`prisma/schema.prisma:197-200`) e já são aceitas pelo `create`, mas hoje nem são devolvidas pela query `project.byId` (faltam duas linhas no objeto de retorno, `project.router.ts:158-219`) nem exibidas em lugar nenhum da UI. ID, status, prioridade, empresa, cliente, dev, datas de criação/atualização continuam só-leitura (mudam por outros fluxos, não por este form).
- **Envolvidos & contexto atual**: `targetAudience`, `expectedUsers` (texto), `hasExistingSystem` (select restrito, reaproveita `HAS_EXISTING_SYSTEM_OPTIONS`), `existingSystemDetails` (textarea), `hasCurrentApplication` (select restrito, `HAS_CURRENT_APPLICATION_OPTIONS`), `currentApplicationDetails` (textarea).
- **Diagnóstico operacional**: `peopleInvolved` (número), `peopleInvolvedDetails` (textarea), `taskDurationHours` (número), `processFrequency` (select restrito, `PROCESS_FREQUENCIES`). `currentAnnualHours` continua só-leitura (calculado no backend).
- **Funcionalidades & benefícios**: lista de funcionalidades continua só-leitura/gerenciada como hoje; `benefits` vira checkboxes (`BENEFIT_OPTIONS`), `benefitsDetails` textarea, `monthlyHoursSaved` número.
- **Avaliações**: os 5 campos `rating*` reaproveitam o componente `RatingRow` já usado no wizard de criação (`src/app/(private)/cliente/solicitar/page.tsx:1611-1624`), em vez de criar um novo widget.
- **Narrativa & prazo**: `projectNarrative` (textarea), `urgency` (select restrito, `URGENCY_LEVELS`), `estimatedDeadline` (date picker), `additionalInfo` (textarea).
- **Diagnóstico técnico**: nunca editável aqui, sem mudança.

Área/tema (`areaId`/`themeId`) reaproveita o hook `useTaxonomy()` (`src/app/(private)/cliente/solicitar/utils/use-taxonomy.ts`) já usado no wizard de criação, resolvendo slug↔id da mesma forma (evita a pegadinha já documentada em `2026-07-07-area-tema-taxonomia-estruturada-design.md`: o `Record` de temas por área é indexado por slug, não pelo `areaId` numérico gravado no projeto).

Um único par de botões "Salvar alterações" / "Cancelar" no rodapé do bloco editável: "Salvar" monta o diff contra o `project` original e chama `updateProjectMutation.mutateAsync({ id, ...diff })` (hook já existente em `src/app/(private)/projeto/[id]/hooks/project.action.ts`, sem mudança de assinatura); "Cancelar" descarta o estado local e sai do modo de edição.

## Fora de escopo

- Qualquer mudança em `architecture-tab.tsx` ou nos campos técnicos/financeiros — continuam só do arquiteto, no fluxo já existente.
- Edição granular por seção (um "Salvar" por card) — fica um único save para toda a página, mais simples de implementar e revisar.
- Gerenciamento de itens da lista de "Funcionalidades" (adicionar/renomear/remover) — continua nas mutations dedicadas já existentes.
- Diff campo-a-campo com valor antigo/novo no `ActivityLog` — só registra quais campos mudaram, não os valores.
- Migrar ou tocar no modelo `ProjectRequest` (formulário público simplificado da landing page) — é um fluxo separado, sem relação com este.
