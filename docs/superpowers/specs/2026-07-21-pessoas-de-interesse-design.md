# Pessoas de Interesse (entrevistas + oportunidades) — Design

## Contexto

Hoje "Entrevistas de Levantamento" (`Interview`, `prisma/schema.prisma:594-607`) guarda o participante como texto livre num único campo (`participantName: String`, uma entrevista = um participante). "Oportunidades" não é uma entidade própria — é o nome de tela para registros de `Project`, que tem um campo solto `peopleInvolvedDetails: String?` pra anotar quem está envolvido, sem nenhuma estrutura.

Não existe nenhum modelo de "Pessoa"/"Contato" no schema. Participantes de entrevista e pessoas citadas em oportunidades são strings desconectadas — nem entre si, nem do model `User`. Isso impede reaproveitar a mesma pessoa entre entrevistas e oportunidades, e impede saber se a mesma pessoa aparece em vários lugares.

## Requisitos confirmados com o usuário

1. `Interview.participantName` (string) é **migrado** para uma relação com um novo cadastro de `Person` — elimina duplicidade por nome digitado diferente e unifica a base de pessoas entre entrevistas e oportunidades.
2. `Person` é **escopada por empresa** (`companyId`), não global — pessoas de interesse são tipicamente stakeholders de um cliente específico.
3. Uma entrevista pode ter **várias pessoas participantes** (mudança de cardinalidade 1→N em relação ao campo atual).
4. No seletor de "Pessoas de Interesse" da oportunidade, a lista é **combinada**: Pessoas cadastradas + Usuários do sistema da mesma empresa aparecem juntos (com indicação visual de quem é usuário).
5. Cadastro de `Person` guarda **nome (obrigatório) + cargo/função (opcional)** — sem e-mail/telefone.
6. O card "Pessoas de Interesse" fica na **página de detalhe da oportunidade**, sempre interativo (não depende de entrar em modo de edição do formulário grande).
7. Permissão para editar pessoas de interesse na oportunidade é a **mesma de quem já pode editar a oportunidade** hoje (admin, ou cliente dono enquanto o projeto não está concluído/cancelado). CRUD de entrevista continua **admin-only**, como já é hoje.
8. Não haverá tela dedicada de gestão de pessoas — a própria tela de Entrevistas de Levantamento, já escopada por empresa, cobre essa necessidade.

## Modelo de dados

### `Person` (novo)

```prisma
model Person {
  id        String   @id @default(cuid())
  name      String
  role      String?  // cargo/função
  companyId String
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  userId    String?  // vincula a um User do sistema, quando a pessoa também é usuário
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  interviewLinks InterviewParticipant[]
  projectLinks   ProjectPersonOfInterest[]

  @@unique([companyId, userId])
  @@map("people")
}
```

`@@unique([companyId, userId])` garante que nunca existam duas `Person` representando o mesmo `User` na mesma empresa — permite `upsert` idempotente quando alguém seleciona um usuário do sistema pela primeira vez (ver seção "Resolução de usuário → Person"). `userId` nulo não conflita entre si (múltiplas pessoas soltas por empresa são permitidas).

### Tabelas de junção (novo)

```prisma
model InterviewParticipant {
  interviewId String
  personId    String
  interview   Interview @relation(fields: [interviewId], references: [id], onDelete: Cascade)
  person      Person    @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([interviewId, personId])
  @@map("interview_participants")
}

model ProjectPersonOfInterest {
  projectId String
  personId  String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  person    Person  @relation(fields: [personId], references: [id], onDelete: Cascade)

  @@id([projectId, personId])
  @@map("project_people_of_interest")
}
```

### `Interview` (alterado)

Remove `participantName: String`. Adiciona `participants InterviewParticipant[]`.

### `Company` / `Project` / `User` (relações reversas)

- `Company` ganha `people Person[]`.
- `Project` ganha `peopleOfInterest ProjectPersonOfInterest[]`.
- `User` ganha `personLinks Person[]` (reverso de `Person.userId`).

## Migração de dados existentes

Migration em duas partes:

1. **Schema**: cria `Person`, `InterviewParticipant`, `ProjectPersonOfInterest`; mantém `Interview.participantName` temporariamente (nullable) nesta etapa.
2. **Backfill (SQL/script na própria migration)**: para cada `Interview` com `participantName` não vazio — busca em `Person` da mesma `companyId` um registro com `name` igual (comparação case-insensitive/trim); se não existir, cria; em seguida cria o vínculo `InterviewParticipant`.
3. **Segunda migration**: remove a coluna `participantName` de `Interview`.

Sem manter cópia "legado" do campo — não há necessidade de rollback tardio para um dado tão simples de recriar a partir da tabela de junção.

## Backend (tRPC)

### `person.router.ts` (novo)

- `list({ companyId })` — `protectedProcedure`. Retorna a lista combinada para o seletor: `Person` da empresa (`{ id, name, role, userId }`) **+** `User`s vinculados à mesma `Company` que ainda não têm `Person` correspondente (via relação já existente `User.companies`), estes últimos marcados com uma flag (`isUnlinkedUser: true`) e chave sintética (`user:<userId>`) pro client distinguir antes de resolver.
- `create({ companyId, name, role? })` — `protectedProcedure`. Cria uma `Person` solta (sem `userId`).
- `resolvePersonForUser(db, companyId, userId)` — função auxiliar (não é procedure tRPC, só uma função TypeScript reaproveitada pelas mutations de `interview.router.ts` e `project.router.ts` descritas abaixo): `upsert` por `@@unique([companyId, userId])`, copiando `name` do `User`. Idempotente — chamar de novo com o mesmo par retorna a `Person` já existente.

Sem checagem adicional de "usuário pertence à empresa" além de confiar no `companyId` recebido — mesmo padrão já usado em `interview.router.ts` (`list` de entrevistas confia no `companyId` do client).

### `interview.router.ts` (alterado)

- `create`/`update`: trocam `participantName: z.string().trim().min(1)` por `personIds: z.array(z.string()).min(1)`. Continuam `adminProcedure`. Ao salvar, substitui o conjunto de `InterviewParticipant` pelos ids recebidos (delete + createMany dentro de uma transação, ou `deleteMany` + `createMany`).
- Qualquer id no formato sintético `user:<userId>` recebido é resolvido via `resolveUser` antes de gravar o vínculo.
- `list`: `include` passa a trazer `participants: { include: { person: true } }` em vez do campo de texto.

### `project.router.ts` (alterado)

- Nova mutation `updatePeopleOfInterest({ projectId, personIds: string[] })`. Reaproveita a mesma checagem de permissão inline já usada em `update` (`isArchitect || (isOwner && status não é done/cancelled)`), sem herdar a lista `ARCHITECT_ONLY_FIELDS` (esse campo não é admin-only). Substitui o conjunto inteiro de `ProjectPersonOfInterest` do projeto (mesma estratégia replace-all do `interview.router.ts`).
- Ids sintéticos `user:<userId>` também são resolvidos via `resolveUser` antes de gravar.
- `byId`/`list` do projeto passam a incluir `peopleOfInterest: { include: { person: true } }`.

## Frontend

### Novo componente `MultiCreatableCombobox` (`src/shared/components/ui/multi-creatable-combobox.tsx`)

Generalização do `CreatableCombobox` (single-select) já existente em `ui/creatable-combobox.tsx`, reaproveitando os mesmos primitivos `Command`/`Popover`. Props: `options: { value, label, meta? }[]`, `value: string[]`, `onChange(value: string[])`, `onCreate(label): Promise<string>` (retorna o novo id/chave a adicionar), `placeholder?`, `emptyText?`. Itens selecionados renderizam como `Badge` removíveis abaixo/dentro do trigger. `meta` carrega a flag `isUnlinkedUser` pra desenhar a tag "Usuário" nas opções e nos chips.

### Tela de Entrevistas (`.../empresas/[id]/entrevistas/page.tsx`)

- Campo "Participante" do diálogo de criar/editar troca o `Input` de texto pelo `MultiCreatableCombobox`, alimentado por `person.list({ companyId })` (o mesmo `companyId` da rota). `onCreate` chama `person.create`.
- Coluna "Participante" da tabela passa a renderizar os nomes das pessoas vinculadas como chips (join simples de `interview.participants.map(p => p.person.name)`).
- Sem mudança de permissão — continua tudo atrás de `adminProcedure`, então só admin abre/usa esse diálogo, como hoje.

### Card "Pessoas de Interesse" (`project-detail-sections.tsx`)

- Novo `DetailSection title="Pessoas de interesse"` — card independente do fluxo de edição da solicitação (`isEditing`/`ProjectRequestEditForm`), montado sempre que a página do projeto renderiza, do mesmo jeito que comentários já funcionam à parte do form grande.
- Editável (chips removíveis + combobox pra adicionar) quando `canEdit` for verdadeiro (mesma variável já calculada no componente: `isArchitect || (isOwner && status não finalizado)`); somente leitura (só os chips, sem combobox) caso contrário.
- Fonte de dados do combobox: `person.list({ companyId: project.companyId })`. Ao alterar a seleção, chama `project.updatePeopleOfInterest`.
- Aparece nas duas superfícies que já usam `ProjectDetailSections` (`/projeto/[id]/page.tsx` e o modal `admin/projetos/_components/project-details.modal.tsx`) sem trabalho extra, por estar dentro do componente compartilhado.

## Fora de escopo

- Tela dedicada de gestão/merge de pessoas duplicadas (a tela de Entrevistas cobre a necessidade atual).
- Campos de contato (e-mail, telefone) no cadastro de `Person`.
- Qualquer mudança de permissão no CRUD de `Interview` (continua admin-only).
- Deduplicação automática de `Person` com nomes parecidos além da migração inicial (ex.: "Joao" vs "João") — a criação inline confia na busca visual do combobox pra evitar duplicata manual.
