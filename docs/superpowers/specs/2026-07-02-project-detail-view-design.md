# Reforma das telas de detalhes do projeto (Design)

## Contexto

O formulário "Solicitar Projeto" e a importação de XML coletam ~30 campos por processo (diagnóstico operacional, benefícios esperados, avaliações qualitativas, contexto atual etc.), mas as duas telas que mostram um projeto já criado — o modal rápido "Detalhes do projeto" (aberto ao clicar num card do board) e a página completa `/projeto/[id]` (aberta pelo botão "Ver detalhes") — só exibem um subconjunto pequeno desses campos (status, prioridade, tipo, datas, público-alvo, urgência). Como XML e formulário manual alimentam os mesmos campos, ambas as telas devem mostrar o mesmo conteúdo completo, não importa qual dos dois métodos criou o projeto.

## Causa raiz (não é só falta de UI)

Os dados existem no banco, mas se perdem em três pontos antes de chegar na tela:

1. **`project.router.ts` → procedure `byId`** (usada por `/projeto/[id]`): não seleciona/retorna `additionalInfo`, `hasExistingSystem`, `existingSystemDetails`, `hasCurrentApplication`, `currentApplicationDetails`, `projectNarrative`, `benefits`, `benefitsDetails`, `monthlyHoursSaved` nem as 5 avaliações — só a procedure `list` retorna isso hoje.
2. **`projects-context.tsx` → `mapProject`**: a função que monta o array `projects` (usado pelo board e passado direto pro modal, sem busca adicional) descarta os mesmos campos, mesmo o `list` já trazendo-os da API.
3. **`/projeto/[id]/page.tsx`**: usa `projects.find((p) => p.id === id) ?? projectDetails`, ou seja, prioriza o objeto incompleto do board sobre a busca completa (`projectDetails`, via `byId`) sempre que o projeto já está na lista do board — o que é quase sempre.

Essas três correções são pré-requisito: sem elas, os campos continuariam vazios mesmo depois da reforma visual.

## Requisitos confirmados com o usuário

1. Modal **e** página devem mostrar todos os campos (não só a página).
2. Campos técnicos/financeiros (complexidade, ferramenta principal, estratégia de execução, notas do arquiteto, tipos de solução, economia anual estimada) continuam **exclusivos de admin/desenvolvedor** — nunca aparecem para o cliente, em nenhuma das duas telas.
3. O modal fica maior (tamanho `xl`/`full`, com rolagem interna) e organizado em seções com título — não uma lista compacta de pares rótulo/valor como hoje.
4. Campo sem valor preenchido **aparece mesmo assim**, com "Não informado" — não é escondido.
5. Valores que são uma chave conhecida (ex.: `sim-substituir`, `diario`) são resolvidos pro rótulo bonito via as constantes de `project-taxonomy.ts`; valores que já são texto livre (porque o usuário escolheu "Outro" no formulário/XML) são mostrados como estão, sem prefixo.
6. Avaliações (1-5) são exibidas como texto "X/5", sem estrelas ou gráfico.
7. Chat, arquivos, equipe e atividade recente continuam exclusivos da página `/projeto/[id]` — não fazem parte do escopo desta reforma (não vêm do XML/formulário) e não entram no modal.

## Arquitetura: um componente compartilhado, duas cascas

Em vez de escrever os ~30 campos duas vezes (modal e página) — forma como esse gap se formou, as duas foram divergindo à medida que campos novos eram adicionados só num lugar — um componente único `ProjectDetailSections` (`src/shared/components/project-detail-sections.tsx`) recebe `project: Project` e `viewerRole: UserRole` e renderiza todas as seções, já aplicando a regra de visibilidade por papel. Modal e página só mudam a casca:

- **Modal** (`project-details.modal.tsx`): `size: "xl"`, conteúdo rolável, `ProjectDetailSections` dentro.
- **Página** (`/projeto/[id]/page.tsx`): mantém cabeçalho, chat, arquivos, equipe e atividade recente como estão; o card "Informações" passa a renderizar `ProjectDetailSections` no lugar dos campos hardcoded atuais.

Isso corrige a causa raiz do problema original: um campo novo passa a existir num lugar só, então as duas telas não podem mais divergir.

## Seções e campos

Cada seção só aparece se tiver ao menos um campo visível pro papel do usuário atual.

1. **Básico** — título, descrição, tipo/plataforma (`projectType`, já formatado), status, prioridade, empresa, ID do cliente, criado em, atualizado em.
2. **Envolvidos & contexto atual** — público-alvo (`targetAudience`), usuários esperados (`expectedUsers`), processo/sistema existente (`hasExistingSystem` + `existingSystemDetails`), aplicação existente hoje (`hasCurrentApplication` + `currentApplicationDetails`).
3. **Diagnóstico operacional** — colaboradores envolvidos (`peopleInvolved` + `peopleInvolvedDetails`), duração por execução (`taskDurationHours`), periodicidade (`processFrequency`), horas anuais calculadas (`currentAnnualHours`, só se `taskDurationHours` e `processFrequency` estiverem preenchidos).
4. **Funcionalidades & benefícios** — lista de funcionalidades (`features`), benefícios esperados (`benefits`, chaves resolvidas via `BENEFIT_OPTIONS`), detalhes de benefícios (`benefitsDetails`), horas economizadas por mês (`monthlyHoursSaved`).
5. **Avaliações** — as 5 notas (`ratingErrorReduction`, `ratingProcessCriticality`, `ratingInternalImpact`, `ratingExternalImpact`, `ratingCompliance`), formato "X/5".
6. **Narrativa & prazo** — narrativa do processo (`projectNarrative`), urgência (`urgency`), prazo limite (`estimatedDeadline`), informações adicionais (`additionalInfo`).
7. **Diagnóstico técnico** *(admin/desenvolvedor apenas)* — complexidade (`complexity`), ferramenta principal (`mainTool`), estratégia de execução (`executionStrategy`), notas do arquiteto (`architectNotes`), tipos de solução (`solutionTypes`), economia anual estimada (`estimatedAnnualSavingBRL`).

## Resolução de valores

Função utilitária `resolveLabel(value, options)`, em `src/shared/constants/project-taxonomy.ts` (mesmo arquivo que já define as listas de opções): procura `value` como `value` de uma lista `{value, label}[]` (`HAS_EXISTING_SYSTEM_OPTIONS`, `HAS_CURRENT_APPLICATION_OPTIONS`, `PROCESS_FREQUENCIES`, `URGENCY_LEVELS`) e retorna o `label` se achar; senão retorna o próprio `value` (caso "Outro" com texto livre). `benefits` (array de chaves) é resolvido item a item via `BENEFIT_OPTIONS` do mesmo jeito.

## Não-escopo

- Edição inline dos campos nessas telas (continuam somente leitura; edição de campos técnicos continua na página de especificação/técnica já existente).
- Mudança em como o formulário "Solicitar Projeto" ou a importação de XML coletam os dados.
- Chat, arquivos, atribuição de equipe, atividade recente — permanecem como estão, exclusivos da página.
