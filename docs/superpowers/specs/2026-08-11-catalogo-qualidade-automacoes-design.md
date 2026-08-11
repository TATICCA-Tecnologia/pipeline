# Critérios de qualidade do catálogo de automações

Data: 2026-08-11

## Problema

Glauber formalizou os requisitos mínimos que cada registro de automação existente
deve atender. Quem abre a ficha tem que conseguir responder, sem buscar informação
em nenhum outro lugar:

1. O que a automação faz? Qual o objetivo funcional?
2. Onde está hospedada? Servidor, máquina, número de identificação do ativo.
3. Quem é o responsável? Nome, cargo e setor.
4. Quais tecnologias são usadas? Onde estão instaladas e como acessá-las?
5. De onde vêm os dados de entrada? Para onde vão os de saída?
6. O que fazer se ela parar ou se o responsável sair da empresa?

A ficha de sustentação de 2026-07-28
(`docs/superpowers/specs/2026-07-28-ficha-sustentacao-automacoes-existentes-design.md`)
cobriu parte disso com sete colunas `currentApplication*`. Cruzando com o estado
atual do schema:

| # | Estado hoje | Lacuna |
|---|---|---|
| 1 | `title`, `description`, `projectNarrative`, `currentApplicationDetails` | coberto |
| 2 | `currentApplicationHosting` + `HostingCustom` | diz o *tipo* de hospedagem, nunca *qual* máquina |
| 3 | `currentApplicationOwner` (texto) | sem cargo, sem setor |
| 4 | `mainTool` (1:1), `currentApplicationAccessLocation`/`AccessReference` | nada sobre os sistemas em que a automação atua |
| 5 | — | inexistente |
| 6 | — | inexistente |

Durante a definição de escopo o usuário acrescentou três requisitos fora da lista
do Glauber, na mesma superfície:

- **Sistemas e sites sobre os quais a automação atua.** Hoje existem dois eixos de
  taxonomia e ambos descrevem *como a solução é construída* — `ProjectKind`
  ("tipos de solução": Power Automate, RPA, IA) e `MainToolCategory` → `MainTool`,
  rotulados na UI como "Categoria de ferramenta" (ex.: "Motor de IA") e "Produto"
  (ex.: "Claude") em `architecture-tab.tsx:328-375`. O eixo *sobre o que ela atua*
  — SAP, Protheus, portal da Receita, site do banco, SharePoint — não existe.
- **A automação mexe em dados sigilosos?** Vale para todos os projetos, novos e
  de melhoria.
- **Contas e usernames que a automação utiliza.** Sem senha, só o identificador.

## Decisões de escopo confirmadas com o usuário

1. **Quem preenche:** o Pipeline já segrega a recepção entre automação nova e
   melhoria (`hasCurrentApplication`). Na melhoria, mesmo os campos de natureza
   técnica são preenchidos pelo **cliente** numa versão inicial; arquiteto e dev
   editam depois. Nenhum campo é obrigatório.
2. **Estrutura do critério 4:** lista estruturada, não texto livre — reaproveitando
   o padrão de catálogo de dois níveis que já existe.
3. **Estrutura do critério 6:** opções tópicas filtráveis + uma explicação em
   seguida, espelhando `benefits` + `benefitsDetails`.
4. **Sem indicador de completude.** Recusado explicitamente: os campos existem e o
   esforço é preencher todos. O retorno vem pelos slides, não por um semáforo.
5. **Deck é o alvo principal.** Os slides das soluções construídas devem entregar o
   máximo de informação para o cliente atual e para clientes futuros.
6. **Ambos os XMLs** recebem as tags novas — exceção explícita à regra padrão de não
   mexer no XML de solicitação.
7. **Visibilidade das contas:** quem preencheu (dono do projeto) e o time de
   arquitetura. Vão para os slides.

## Modelo de dados

### Critério 1 — o que a automação faz

Nenhuma mudança de schema. `currentApplicationDetails` já é o campo de texto livre
da automação existente; muda só o **label e o helper** no formulário para "O que a
automação faz hoje e qual o objetivo dela". O placeholder atual pede "qual
plataforma, quem desenvolveu, desde quando" — informação que passou a ter campo
próprio desde a ficha de julho, deixando o textarea livre para responder o
critério 1.

### Critérios 2, 3, 5 e 6 — colunas novas em `Project`

Dez colunas, todas opcionais, prefixo `currentApplication*` para ficarem adjacentes
às sete que já existem.

| Campo | Tipo | Critério | Conteúdo |
|---|---|---|---|
| `currentApplicationAssetId` | `String?` | 2 | hostname, IP ou nº de patrimônio (ex.: `SRV-RPA-01`) |
| `currentApplicationOwnerRole` | `String?` | 3 | cargo do responsável, texto livre |
| `currentApplicationOwnerAreaId` | FK `ProjectArea?` | 3 | setor do responsável |
| `currentApplicationDataInput` | `String?` | 5 | slug de `CURRENT_APPLICATION_DATA_ENDPOINT_OPTIONS` |
| `currentApplicationDataInputDetails` | `String?` | 5 | qual sistema, qual caminho, com que frequência |
| `currentApplicationDataOutput` | `String?` | 5 | mesma lista de opções |
| `currentApplicationDataOutputDetails` | `String?` | 5 | idem |
| `currentApplicationContingencyActions` | `Json?` | 6 | array de chaves selecionadas |
| `currentApplicationContingencyDetails` | `String?` | 6 | a explicação em seguida |
| `currentApplicationBackupOwner` | `String?` | 6 | quem assume se o responsável sair |

**Setor como FK, cargo como texto.** Setor escrito à mão vira "TI", "T.I." e
"Tecnologia da Informação" na mesma base, e o agrupamento morre. `ProjectArea` já é
taxonomia configurável por empresa, já tem cadastro inline no wizard
(`customProjectArea`), e a FK torna respondível "quais automações o setor X
sustenta". Cargo fica texto porque não há catálogo e não vale criar um.

`currentApplicationOwner` (nome) segue texto livre, sem vínculo com `Person`,
mantendo a decisão explícita da spec de julho: obrigar cadastro de `Person` cria
atrito num campo opcional no meio de um wizard.

Uma segunda relação `Project` → `ProjectArea` exige nomes de relação explícitos no
Prisma, já que `areaId` também aponta para `ProjectArea`. Concretamente:

- `Project.area` passa a `@relation("ProjectProcessArea", ...)` e `Project.ownerArea`
  entra como `@relation("ProjectOwnerArea", ...)`, ambas `onDelete: SetNull`.
- `ProjectArea.projects Project[]` (linha 528) recebe `@relation("ProjectProcessArea")`
  e ganha uma irmã, `sustainedProjects Project[] @relation("ProjectOwnerArea")`.

A migration não altera dados: nomear relação é mudança só do schema Prisma, a coluna
`areaId` continua a mesma.

### Critério 4 e sistemas-alvo — catálogo novo

Catálogo de dois níveis espelhando `MainToolCategory` → `MainTool`, com as mesmas
procedures (`list*`/`listAll*`/`create*`/`update*`/`delete*` em
`taxonomy.router.ts`), o mesmo `CreatableCombobox` com cadastro inline e uma seção
nova na admin `/admin/configuracoes/categorias`.

```prisma
model TargetSystemCategory {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  isActive  Boolean  @default(true)
  order     Int      @default(0)
  systems   TargetSystem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@map("target_system_categories")
}

model TargetSystem {
  id         String                @id @default(cuid())
  name       String
  slug       String                @unique
  isActive   Boolean               @default(true)
  order      Int                   @default(0)
  category   TargetSystemCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId String?
  projectLinks ProjectTargetSystem[]
  createdAt  DateTime              @default(now())
  updatedAt  DateTime              @updatedAt
  @@map("target_systems")
}

model ProjectTargetSystem {
  id             String        @id @default(cuid())
  project        Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId      String
  targetSystem   TargetSystem? @relation(fields: [targetSystemId], references: [id], onDelete: SetNull)
  targetSystemId String?
  customName     String?       // quando não está no catálogo
  accessPoint    String?       // URL, servidor ou instância — onde ele é acessado
  accessNotes    String?       // COMO acessar: ponteiro, nunca credencial (máx. 200)
  order          Int           @default(0)
  accounts       ProjectAutomationAccount[]
  @@map("project_target_systems")
}
```

Uma linha precisa de `targetSystemId` **ou** `customName`; as duas vazias tornam a
linha sem sentido e são rejeitadas pelo Zod. `accessNotes` herda a regra de
segurança da spec de julho: ponteiro para onde o acesso mora, nunca a credencial,
`maxLength` 200.

Categorias de seed: ERP · Sistema fiscal/contábil · Portal governamental · Banco ou
instituição financeira · E-mail e mensageria · Office e planilhas · Armazenamento de
arquivos · Banco de dados · CRM · RH e folha · Sistema interno próprio · Site externo
de terceiros · Outro.

**Catálogo próprio, e não um discriminador `kind` dentro de `MainTool`:** o usuário
pediu categorias próprias, e misturar "Motor de IA / Claude" com "ERP / SAP" na
mesma lista estraga os dois selects que já existem em `architecture-tab.tsx`.

**A proposta descartada de `ProjectTechnology` sobre `MainTool`.** Era o desenho
inicial do critério 4: uma lista de tecnologias reaproveitando o catálogo de
ferramentas. Foi retirada porque `ProjectKind` e `MainTool` já descrevem *como a
solução é construída*, e uma terceira lista no mesmo eixo seria redundante — quem
preenchesse não saberia onde colocar cada item. A lista de sistemas-alvo responde o
critério 4 melhor: o que o TI precisa saber é qual sistema o robô toca, onde ele é
acessado e como.

`Project.mainToolId` e `Project.solutionTypes` **não mudam** — continuam alimentando
deck, slide executivo, sugestões de merge e XML.

A lista de sistemas vale para **todos os projetos**, não só melhoria: uma automação
nova também atua sobre sistemas, e é essa informação que dimensiona o esforço.

### Dados sigilosos — três colunas em `Project`

Sem prefixo `currentApplication`: valem para todos os projetos.

| Campo | Tipo | Conteúdo |
|---|---|---|
| `handlesSensitiveData` | `String?` | slug de `SENSITIVE_DATA_ANSWER_OPTIONS` — `sim` / `nao` / `nao-sei` |
| `sensitiveDataCategories` | `Json?` | array de chaves selecionadas |
| `sensitiveDataDetails` | `String?` | explicação |

`SENSITIVE_DATA_CATEGORY_OPTIONS`: dados pessoais de clientes (LGPD) · dados pessoais
de colaboradores · folha de pagamento e remuneração · dados bancários e financeiros ·
dados de saúde · dados fiscais e contábeis · contratos e jurídico · propriedade
intelectual · credenciais e acessos.

Mesmo padrão tópicos-filtráveis + explicação escolhido para a contingência. Conversa
direto com `ratingCompliance`, que já existe.

### Contas e usuários

```prisma
model ProjectAutomationAccount {
  id                    String               @id @default(cuid())
  project               Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId             String
  username              String               // o login em si — é o conteúdo do registro
  projectTargetSystem   ProjectTargetSystem? @relation(fields: [projectTargetSystemId], references: [id], onDelete: SetNull)
  projectTargetSystemId String?
  accountType           String?              // slug de AUTOMATION_ACCOUNT_TYPE_OPTIONS
  ownerName             String?              // de quem é a conta / quem responde por ela
  notes                 String?
  order                 Int                  @default(0)
  @@map("project_automation_accounts")
}
```

`AUTOMATION_ACCOUNT_TYPE_OPTIONS`: usuário de serviço · usuário nominal · conta de
e-mail · chave de API · certificado digital · outro.

A lista fica no bloco condicional de melhoria (`hasCurrentApplication = "sim"`),
acompanhando a descrição do usuário — "contas que a automação existente utiliza".

## Regra de segurança

O modelo **não tem campo para senha, token ou chave em lugar nenhum**, e isso é
deliberado: a plataforma é inventário de onde procurar, não cofre.

- `username`, `accessPoint` e `accessNotes` carregam helper text explícito: "nunca
  escreva senhas ou tokens aqui".
- `accessNotes` mantém o `maxLength` 200 de `CURRENT_APPLICATION_ACCESS_REFERENCE_MAX_LENGTH`;
  `username` recebe `maxLength` 120, curto o bastante para desencorajar colar um
  bloco de credenciais.
- Os três passam por `maskFreeText` no modo demo.

### Visibilidade das contas

A lista de contas é visível a **dono do projeto ou time de arquitetura** —
`canSeeTechnical || isOwner`, ambas as primitivas já existentes lado a lado em
`project-detail-sections.tsx:51-54`. Username é metade de uma credencial; expor a
lista completa de contas de serviço a qualquer usuário cliente da empresa ampliaria
a superfície sem ganho.

Isso diverge da regra da ficha de julho, em que os campos de acesso são visíveis a
qualquer usuário cliente — lá o conteúdo era "onde o acesso mora", aqui é o login.

As contas **vão para o deck**, por decisão explícita do usuário: o .pptx é gerado por
admin para a empresa e é o artefato que responde o critério 6 na prática.

Todos os demais campos desta spec seguem a visibilidade da ficha de julho: o cliente
preenche, o cliente vê.

## Superfícies

### 1. Wizard `/cliente/solicitar`

O passo "Envolvidos" já valida 17 campos; somar treze campos e duas listas
repetíveis o torna impraticável. Reorganização:

| Passo | Mudança |
|---|---|
| **Básico** | bloco novo "Dados sigilosos", depois de `description` — vale para todos os projetos e nunca é pulado |
| **Envolvidos** | a ficha de sustentação **sai daqui**; volta ao conjunto anterior a julho |
| **Sistemas & sustentação** *(novo)* | lista de sistemas-alvo (todos os projetos) + bloco condicional `hasCurrentApplication = "sim"` com a ficha inteira: hospedagem + ativo, responsável nome/cargo/setor, substituto, autor, acessos, em produção desde, entrada/saída de dados, contingência, contas |
| Funcionalidades / Benefícios / Prazo | inalterados |

Seis passos em vez de cinco. Nenhum campo novo entra em `fieldsToValidate` como
obrigatório; a mudança em `STEPS` (`solicitar/page.tsx:122`) move os
`fieldsToValidate` da ficha do passo "envolvidos" para o passo novo.

Os campos entram em `SolicitarProjetoFormData`
(`src/shared/schema/solicitar-projeto.ts`), nos `defaultValues` e no payload de
`build-project-payload.ts` — as duas listas como arrays, no mesmo formato de
`features`.

### 2. Ficha do projeto

`src/shared/components/project-detail-sections.tsx`:

- A `DetailSection` "Sustentação & acessos" (linha 137) se expande com ativo, cargo,
  setor, substituto e contingência.
- `DetailSection` nova "Sistemas e dados": lista de sistemas-alvo, sigilo e o par
  entrada/saída. Renderizada para todos os projetos que tenham ao menos um desses
  campos preenchido.
- Bloco de contas dentro de "Sustentação & acessos", atrás de
  `canSeeTechnical || isOwner`.

Cada seção só renderiza quando ao menos um dos seus campos tem valor, mantendo o
comportamento já adotado em julho.

Edição em `src/shared/components/project-request-edit-form.tsx` com as regras de
permissão que já existem ali (`canEdit`: arquiteto, ou dono enquanto o projeto não
está concluído/cancelado). O arquiteto também alcança tudo pela aba de arquitetura
(`especificacao/_components/architecture-tab.tsx`).

### 3. Deck `.pptx` — automações existentes

`src/server/deck/build-existing-automations-deck.ts`.

Um **segundo slide por solução construída**, "Ficha técnica — *título*", logo após o
slide de processo gerado por `addProjectSlide`. O slide de processo já é denso
(coluna de texto + tabela quantitativa com as sete `extraLines` de julho); somar mais
oito linhas estouraria o layout, cuja altura é calculada.

Cinco blocos:

```
┌ Hospedagem ────────────┬ Sistemas em que atua ──────────────┐
│ Servidor próprio       │ SAP        ERP        srv-sap.ext  │
│ SRV-RPA-01             │ Portal RFB Gov        gov.br/...   │
│ Em produção desde 03/24│ SharePoint Arquivos   /financeiro  │
├ Fluxo de dados ────────┴────────────────────────────────────┤
│ Entrada  Sistema   · extrato SAP FBL3N, diário 6h           │
│ Saída    Planilha  · \\fs01\financeiro\conciliacao.xlsx      │
├ Sustentação ────────────────────┬ Contas utilizadas ────────┤
│ Ana Souza · Analista · Financeiro│ rpa_sap   serviço  SAP   │
│ Substituto: Carlos Lima          │ nf@empresa e-mail  Outlook│
│ Se parar: reiniciar serviço,     │                          │
│ acionar TI · dados sigilosos: sim│                          │
└──────────────────────────────────┴──────────────────────────┘
```

O slide é omitido quando nenhum dos campos novos está preenchido, para não gerar
páginas vazias em decks de empresas que ainda não fizeram o levantamento. O
`db.project.findMany` do deck passa a selecionar os campos novos e a incluir as duas
listas. O slide de inventário técnico existente e as `extraLines` do slide de
processo não mudam.

### 4. Deck `.pptx` — diagnóstico (oportunidades novas)

`src/server/deck/build-diagnostic-deck.ts`: o slide de processo ganha "Sistemas
envolvidos" e "Dados sigilosos" — os dois campos novos que valem para projeto ainda
não construído. É o que dá ao leitor do deck o máximo de informação sobre uma
solução futura.

### 5. Tela Automações existentes

`/admin/empresas/[id]/automacoes-existentes` não muda nesta spec. As duas colunas de
julho ("Onde roda", "Responsável") continuam como estão.

### 6. XMLs

Tags novas nos dois XMLs, em português, seguindo o padrão de julho
(`detalhesAplicacaoExistente`, `hospedagemAplicacaoExistente`):

Campos escalares:

- `ativoAplicacaoExistente`
- `cargoResponsavelAplicacaoExistente`
- `setorResponsavelAplicacaoExistente`
- `origemDadosEntrada` / `detalhesDadosEntrada`
- `destinoDadosSaida` / `detalhesDadosSaida`
- `acoesContingencia` / `detalhesContingencia`
- `responsavelSubstitutoAplicacaoExistente`
- `dadosSigilosos` / `categoriasDadosSigilosos` / `detalhesDadosSigilosos`

Listas aninhadas, no padrão já usado por `features`:

```xml
<sistemas>
  <sistema>
    <nome>SAP</nome>
    <categoria>ERP</categoria>
    <pontoAcesso>srv-sap.empresa.local</pontoAcesso>
    <comoAcessar>Cofre de senhas do TI</comoAcessar>
  </sistema>
</sistemas>
<contas>
  <conta>
    <usuario>rpa_sap</usuario>
    <tipo>Usuário de serviço</tipo>
    <sistema>SAP</sistema>
    <responsavel>Ana Souza</responsavel>
  </conta>
</contas>
```

Arquivos afetados:

- `src/shared/xml/build-projeto-completo-xml.ts` — serialização
- `src/shared/xml/parse-projeto-completo-xml.ts` — leitura no round-trip
- `src/app/api/empresas/[id]/xml-agregado/route.ts` — XML agregado da empresa
- `src/app/(private)/cliente/solicitar/utils/xml-import.ts` — XML de solicitação
- `src/server/trpc/routers/project-import-xml-helpers.ts`
- `public/modelo-solicitacao-projeto.xml` — modelo público de referência
- `docs/prompt-geracao-xml.md` — prompt do LLM externo
- `src/server/ai/xml-generation-prompt.ts` — cópia do mesmo prompt usada pela geração
  de oportunidades por IA dentro do app

Os dois últimos precisam ficar em sincronia: o cabeçalho de
`xml-generation-prompt.ts` já avisa que esquecer isso faz o caminho in-app gerar XML
sem os campos, em silêncio. O mesmo vale para os **labels** das listas de opções
novas em `project-taxonomy.ts`, porque a importação casa por label
(`matchByLabel`/`resolveEnum`) e um label divergente cai no fallback "Outro" sem
erro e sem aviso.

A tag `<sistema>` dentro de `<conta>` carrega o **nome** do sistema, não um id — ids
não sobrevivem entre bases. Na importação, a conta é ligada à linha de
`ProjectTargetSystem` do mesmo projeto cujo nome resolvido bate; sem correspondência,
a conta é criada com `projectTargetSystemId` nulo, não descartada. Isso exige que as
contas sejam processadas **depois** dos sistemas no import.

Todas as tags são opcionais na leitura: XML antigo importa sem erro, e valor
desconhecido num select cai no comportamento atual de `resolveLabel`, que devolve o
valor cru.

## Camadas intermediárias afetadas

- `src/server/trpc/routers/project.router.ts` — input Zod de `create` e `update`,
  mapeamento nas queries de leitura, e `SOLICITATION_FIELD_LABELS` (linha 88) para o
  `ActivityLog` descrever a mudança em pt-BR. Nenhum campo entra em
  `ARCHITECT_ONLY_FIELDS`: são campos de solicitação, editáveis pelo cliente-dono.
- `src/server/trpc/routers/taxonomy.router.ts` — CRUD de `TargetSystemCategory` e
  `TargetSystem`, espelhando as procedures de `MainTool` (linhas 403-480 e 590-650).
- `src/app/(private)/admin/configuracoes/categorias/page.tsx` — seção nova para o
  catálogo de sistemas.
- `src/shared/types/index.ts` — tipo `Project` e os tipos das duas listas.
- `src/shared/context/projects-context.tsx` — tipo e mapeamento do contexto.
- `src/shared/constants/project-taxonomy.ts` — quatro listas de opções novas.

As duas listas seguem o padrão de `features`/`solutionTypes`: array no payload de
`create`/`update`, substituição integral no save (apaga as linhas do projeto e
recria a partir do payload), dentro de uma transação.

**Ordem obrigatória dentro da transação:** apagar contas, apagar sistemas, recriar
sistemas, recriar contas. Como a substituição integral destrói os ids de
`ProjectTargetSystem`, o payload das contas referencia o sistema pelo **índice na
lista de sistemas do mesmo payload**, não por id — o servidor traduz índice para o id
recém-criado. Recriar as contas antes dos sistemas, ou referenciar por id, deixaria
todo `projectTargetSystemId` nulo a cada save, silenciosamente.

## Fluxo de dados

```
cliente preenche (wizard: Básico + Sistemas & sustentação)
        ou LLM externo gera XML de solicitação
                    ↓
        build-project-payload / xml-import
                    ↓
        project.create (tRPC) → colunas em Project
                              + ProjectTargetSystem[]
                              + ProjectAutomationAccount[]
                    ↓
    ┌───────────────┼───────────────┬──────────────────┐
    ↓               ↓               ↓                  ↓
ficha do        deck de         deck de          XML de projeto
projeto        automações     diagnóstico         completo /
(cliente,      existentes    (sistemas +          agregado
admin, dev)   (ficha técnica   sigilo)
               por solução)
                    ↑
    project.update (arquiteto/dev/dono) — edição posterior
```

## Tratamento de erros

Nenhum caminho novo de erro. Todos os campos escalares são opcionais e nuláveis em
todas as camadas; as duas listas aceitam array vazio.

- Linha de sistema sem `targetSystemId` e sem `customName`: rejeitada pelo Zod com
  mensagem no formulário; no import de XML, a linha é descartada com aviso em vez de
  falhar a importação inteira.
- Conta sem `username`: mesmo tratamento.
- `accessNotes` acima de 200 caracteres ou `username` acima de 120: rejeitados pelo
  Zod no formulário; truncados com aviso no import de XML.
- Select com valor desconhecido: `resolveLabel` devolve o valor cru, comportamento
  atual de `hasExistingSystem` e da ficha de julho.
- `TargetSystem` desativado no catálogo: continua resolvendo o nome nas fichas que já
  o referenciam, pelo mesmo mecanismo que `mainToolOptions` usa em
  `architecture-tab.tsx:98-111` para reinjetar a opção salva.

## Testes

- Round-trip do XML de projeto completo: exportar um projeto com os dez campos
  escalares e as duas listas preenchidos, reimportar, verificar igualdade.
- Import de XML de solicitação sem nenhuma das tags novas: importa sem erro, campos
  nulos e listas vazias.
- Formulário: submeter com `hasCurrentApplication = "sim"` e o passo novo inteiro
  vazio salva o projeto normalmente.
- `project-detail-sections`: a seção "Sistemas e dados" não renderiza quando todos os
  seus campos estão vazios; o bloco de contas não renderiza para usuário cliente que
  não é dono do projeto.
- Deck de automações existentes: projeto sem nenhum campo novo não gera o slide de
  ficha técnica; projeto com todos gera um slide com os cinco blocos.
- `project.update` substituindo as listas: salvar com uma lista menor apaga as linhas
  removidas e não deixa órfãos.
- `project.update` sem alterar nada nas listas: o vínculo conta → sistema sobrevive ao
  ciclo apaga-e-recria (é a regressão que a ordem da transação existe para evitar).
- Import de XML com `<conta><sistema>` cujo nome não bate com nenhum `<sistema>`: a
  conta é criada com vínculo nulo, não descartada.

## Fora de escopo

- Indicador de completude ou semáforo de conformidade da ficha (recusado
  explicitamente).
- Bloqueio de conclusão do projeto por ficha incompleta.
- Colunas novas na tela `/admin/empresas/[id]/automacoes-existentes`.
- Tela de inventário cross-empresa de sistemas ou contas.
- Análise de impacto reversa ("quais robôs param se o sistema X cair") — o dado passa
  a existir com esta spec, a tela que o consulta é trabalho separado.
- Qualquer armazenamento de senha, token, chave ou certificado.
- Vínculo do responsável ou do dono da conta com a entidade `Person`.
- Mudanças em `Project.mainToolId`, `Project.solutionTypes` ou nos catálogos
  `MainTool`/`MainToolCategory`/`ProjectKind`.
