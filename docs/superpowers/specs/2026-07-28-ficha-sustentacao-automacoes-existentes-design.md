# Ficha de sustentação das automações existentes

Data: 2026-07-28

## Problema

Feedback do Pipeline: para as automações que **já existem** (já rodam algo hoje), a
plataforma registra o resultado — status operacional, economia acumulada — mas não
registra nada sobre a operação em si: onde a automação está hospedada, onde ficam os
acessos que ela usa, quem a desenvolveu, quem cuida dela hoje. O TI do cliente não
consegue se informar sobre o parque que já está rodando.

Hoje esse conteúdo só existe como texto livre: quando o solicitante responde
`hasCurrentApplication = "sim"`, o formulário abre um único textarea
(`currentApplicationDetails`) cujo placeholder já pede exatamente essas informações —
"Qual plataforma, quem desenvolveu, desde quando está em uso...". Sendo texto livre,
não é filtrável, não aparece em tabela, não vai para o deck e frequentemente vem
incompleto.

O objetivo é transformar esse texto livre em ficha estruturada, preenchida na própria
fase de levantamento e consolidada nas visões que o TI já usa.

## Escopo

O levantamento acontece na fase inicial de input, quando a solicitação já é segregada
entre backlog de novas automações e automação existente. Quem preenche é o usuário
solicitante; dev e arquiteto podem editar depois.

Profundidade escolhida: **núcleo mínimo**. Todos os campos opcionais, preenchimento
incremental.

## Modelo de dados

Seis colunas novas em `Project` (`prisma/schema.prisma`), todas opcionais, com prefixo
`currentApplication*` para ficarem adjacentes às duas que já existem
(`hasCurrentApplication`, `currentApplicationDetails`):

| Campo | Tipo | Conteúdo |
|---|---|---|
| `currentApplicationHosting` | `String?` | select — `servidor-proprio`, `vm-cliente`, `nuvem`, `maquina-usuario`, `saas`, `nao-sei`, `outro` |
| `currentApplicationHostingCustom` | `String?` | texto livre quando o valor acima é `outro` |
| `currentApplicationAuthor` | `String?` | quem desenvolveu |
| `currentApplicationOwner` | `String?` | responsável pela automação hoje |
| `currentApplicationAccessLocation` | `String?` | select — `cofre-senhas`, `planilha`, `com-pessoa`, `nao-se-sabe`, `outro` |
| `currentApplicationAccessReference` | `String?` | ponteiro para onde o acesso mora (nome do cofre, caminho, com quem está) |
| `currentApplicationLiveSince` | `DateTime?` | em produção desde |

`currentApplicationDetails` permanece inalterado, como campo de observações livres.
Nenhum dado é migrado nem apagado; a migration só adiciona colunas nulas.

### Listas de opções

`CURRENT_APPLICATION_HOSTING_OPTIONS` e `CURRENT_APPLICATION_ACCESS_LOCATION_OPTIONS`
vão como constantes em `src/shared/constants/project-taxonomy.ts`, ao lado de
`HAS_CURRENT_APPLICATION_OPTIONS` e `HAS_EXISTING_SYSTEM_OPTIONS`.

Não viram tabela configurável: `ProjectArea`, `MainTool`, `ProjectKind` e `UrgencyLevel`
viraram tabela porque variam por cliente. Estas duas listas são curtas e estáveis, e
o padrão `outro` + campo custom já cobre o caso não previsto.

### Decisões de modelagem e alternativas descartadas

**"Responsável hoje" é texto, não FK para `Person`.** O solicitante pode citar alguém
que não está cadastrado como `Person`, e obrigar cadastro cria atrito num campo
opcional preenchido no meio de um wizard. `ProjectPersonOfInterest` continua sendo o
lugar dos vínculos formais entre projeto e pessoas.

**`currentApplicationHostingCustom` em coluna separada** em vez de guardar o texto de
"outro" na mesma coluna do select. Espelha o padrão já existente no formulário
(`customHasCurrentApplication`, `customHasExistingSystem`) e mantém a coluna do select
filtrável por valor conhecido.

**Colunas em `Project`, não entidade separada.** `Project` já é uma tabela larga e
plana por design, e a ficha é 1-para-1 com o projeto. Uma tabela `AutomationAsset`
separada só se justificaria se uma automação pudesse existir sem projeto — o que não
acontece no modelo atual.

## Regra de segurança

`currentApplicationAccessReference` é **ponteiro para onde o acesso mora, nunca a
credencial em si**. A plataforma vira inventário de onde procurar, não cofre de senhas.

Salvaguardas:

- Label e helper text explícitos no formulário: "Onde encontrar — nunca escreva senhas
  ou tokens aqui".
- `maxLength` de 200 caracteres no schema Zod, para desencorajar colar blocos de
  credenciais.
- O campo passa por `maskFreeText` no modo demo, como os demais textos livres.

Os campos são visíveis a qualquer usuário cliente da empresa — decisão explícita do
usuário, coerente com o fato de que nenhum conteúdo privado é armazenado ali.

## Superfícies

### 1. Formulário de solicitação

`src/app/(private)/cliente/solicitar/page.tsx`, passo "Envolvidos".

Um bloco novo dentro da condicional `{hasCurrentApplication === "sim" && ...}` que já
existe, ao lado do textarea atual. Sem passo novo no wizard e sem campo obrigatório —
nenhum campo entra em `fieldsToValidate` como required.

Os campos são adicionados a `SolicitarProjetoFormData`
(`src/shared/schema/solicitar-projeto.ts`), aos `defaultValues` e ao payload em
`src/app/(private)/cliente/solicitar/utils/build-project-payload.ts`.

### 2. Ficha do projeto

`src/shared/components/project-detail-sections.tsx`: nova `DetailSection` intitulada
"Sustentação & acessos", posicionada logo após "Envolvidos & contexto atual", e
renderizada **fora** do bloco `canSeeTechnical` — o cliente preenche, o cliente vê.

A seção só é renderizada quando ao menos um dos seis campos tem valor, para não
poluir a ficha de projetos que não são automações existentes.

Edição em `src/shared/components/project-request-edit-form.tsx`, seguindo as regras de
permissão já existentes ali (`canEdit`: arquiteto, ou dono enquanto o projeto não está
concluído/cancelado).

### 3. Tela Automações existentes

`src/app/(private)/admin/empresas/[id]/automacoes-existentes/page.tsx`: duas colunas
novas na tabela — "Onde roda" (label resolvido do select, ou o custom quando `outro`)
e "Responsável". `getExistingAutomationsRanking`
(`src/server/trpc/routers/project.router.ts`) passa a selecionar e devolver esses
campos. O gráfico e a ordenação não mudam.

### 4. Deck .pptx

`src/server/deck/build-existing-automations-deck.ts`:

- Um slide de inventário técnico antes dos slides por projeto, com tabela:
  automação · onde roda · quem fez · responsável · onde ficam os acessos · desde.
- Linhas correspondentes no `addProjectSlide` de cada automação, via o mesmo mecanismo
  de `extraLines` já usado para status operacional e economia acumulada.

O `db.project.findMany` do deck precisa selecionar os campos novos.

### 5. XMLs

Ambos os XMLs recebem as tags novas — confirmado explicitamente pelo usuário, uma
exceção à regra padrão de não mexer no XML de solicitação.

Nomes de tag, em português, seguindo o padrão existente (`detalhesAplicacaoExistente`):

- `hospedagemAplicacaoExistente`
- `hospedagemCustomAplicacaoExistente`
- `autorAplicacaoExistente`
- `responsavelAplicacaoExistente`
- `localAcessosAplicacaoExistente`
- `referenciaAcessosAplicacaoExistente`
- `producaoDesdeAplicacaoExistente`

Arquivos:

- `src/shared/xml/build-projeto-completo-xml.ts` — serialização.
- `src/shared/xml/parse-projeto-completo-xml.ts` — leitura no round-trip.
- `src/app/api/empresas/[id]/xml-agregado/route.ts` — XML agregado da empresa.
- `src/app/(private)/cliente/solicitar/utils/xml-import.ts` — XML de solicitação.
- `public/modelo-solicitacao-projeto.xml` — modelo público de referência.
- `docs/prompt-geracao-xml.md` — prompt do LLM externo, para gerar a ficha.
- `src/server/ai/xml-generation-prompt.ts` — cópia do mesmo prompt usada pela
  geração de oportunidades por IA dentro do app. O cabeçalho desse arquivo
  obriga a mantê-lo em sincronia com o `.md` sempre que o schema do XML muda;
  esquecê-lo faz o caminho in-app gerar XMLs sem a ficha, em silêncio.

Todas as tags são opcionais na leitura: XMLs antigos continuam importando sem erro, e
`producaoDesdeAplicacaoExistente` inválido é tratado como ausente, não como erro de
importação.

## Fluxo de dados

```
solicitante preenche (wizard, passo Envolvidos)
        ou LLM externo gera XML de solicitação
                    ↓
        build-project-payload / xml-import
                    ↓
        project.create (tRPC) → colunas em Project
                    ↓
    ┌───────────────┼────────────────┬─────────────────┐
    ↓               ↓                ↓                 ↓
ficha do        tabela de      deck .pptx       XML de projeto
projeto        Automações     (inventário +      completo /
(cliente,      Existentes      por projeto)      agregado
admin, dev)     (admin)
                    ↑
        project.update (admin/dev/dono) — edição posterior
```

## Camadas intermediárias afetadas

Cada campo novo atravessa o caminho já batido de qualquer campo de `Project`:

- `src/server/trpc/routers/project.router.ts` — input Zod de `create` e `update`,
  mapeamento nas queries de leitura, e entrada em `FIELD_LABELS` (para o `ActivityLog`
  descrever a mudança em pt-BR). Os seis campos **não** entram em
  `ARCHITECT_ONLY_FIELDS`: são campos de solicitação, editáveis pelo cliente-dono.
- `src/shared/types/index.ts` — tipo `Project`.
- `src/shared/context/projects-context.tsx` — tipo e mapeamento do contexto.

## Tratamento de erros

Nenhum caminho novo de erro é introduzido: todos os campos são opcionais e nuláveis em
todas as camadas.

- Select com valor desconhecido (vindo de XML antigo ou editado à mão): `resolveLabel`
  já devolve o valor cru quando não encontra a opção — mesmo comportamento de
  `hasExistingSystem` hoje.
- `currentApplicationLiveSince` inválido no XML: tratado como ausente.
- `currentApplicationAccessReference` acima de 200 caracteres: rejeitado pelo Zod com
  mensagem no formulário; no import de XML, truncado com aviso em vez de falhar a
  importação inteira.

## Testes

- Round-trip do XML de projeto completo: exportar um projeto com os seis campos
  preenchidos, reimportar, verificar igualdade.
- Import de XML de solicitação sem nenhuma das tags novas: importa sem erro, campos
  nulos.
- `getExistingAutomationsRanking` devolve os campos novos e mantém a ordenação atual.
- Formulário de solicitação: submeter com `hasCurrentApplication = "sim"` e a ficha
  vazia salva o projeto normalmente.
- `project-detail-sections`: seção não renderiza quando os seis campos estão vazios.

## Fora de escopo

- Indicador calculado de risco de continuidade (recusado na definição do escopo).
- Tela de inventário cross-empresa.
- Exibição em `/cliente/robos`.
- Qualquer armazenamento de credencial, token ou senha.
- Vínculo do responsável com a entidade `Person`.
