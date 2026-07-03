# Reforço de campos restritos no fluxo de importação de XML

## Problema

O fluxo de solicitação de projeto por XML (usado por consultores que colam a
transcrição de uma reunião num prompt de IA e importam o XML gerado) tem
campos que **alimentam cálculos automáticos** — hoje só `periodicidade`, que
alimenta `currentAnnualHours = taskDurationHours × ocorrências/ano`
(`PROCESS_FREQUENCY_MULTIPLIERS`, `src/shared/constants/project-taxonomy.ts`).

Um caso real quebrou esse cálculo: a IA preencheu
`<periodicidade>Mensal (fechamento); parte também no ciclo de orçamento</periodicidade>`
em vez de `<periodicidade>Mensal</periodicidade>`. Como o valor não bate
exatamente com nenhum rótulo conhecido (`matchByLabel` em
`src/app/(private)/cliente/solicitar/utils/xml-import.ts` faz match exato,
case-insensitive), o campo cai no fallback "Outro" e
`build-project-payload.ts:51-54` substitui o valor salvo no banco pelo texto
livre inteiro. `computeCurrentAnnualHours` então procura esse texto em
`PROCESS_FREQUENCY_MULTIPLIERS`, não encontra, e grava `currentAnnualHours =
null` — todos os stats do slide executivo que dependem dele ficam em branco.

Esse mesmo padrão de match exato existe em outros campos categóricos
(`area`, `tema`, `plataforma`, `publicoAlvo`, `processoExistente`,
`aplicacaoExistenteHoje`, `urgencia`) e nenhum deles gera aviso quando o
valor não bate — a pessoa que revisa a importação não fica sabendo que um
campo "vazou" para fora do padrão.

## Decisões (confirmadas com o usuário)

- **Sem matching tolerante/fuzzy.** O parser continua fazendo match exato.
  "Outro" continua existindo como válvula de escape — quando usado, aceita-se
  que não há cálculo automático para aquele projeto.
- **Sem mudança de schema.** Nenhuma coluna nova no Prisma, nenhum campo de
  detalhe novo por tag.
- **Reforçar as instruções em todos os pontos onde alguém (humano ou IA) lê a
  regra antes de preencher o XML**, e **avisar no momento da importação**
  quando um campo categórico não bateu — abordagem sistêmica, cobrindo todos
  os campos com esse padrão de match, não só `periodicidade`.
- O prompt de geração do XML (usado externamente, colado numa ferramenta de
  IA) nunca esteve versionado no repositório. Passa a viver em
  `docs/prompt-geracao-xml.md`, git-versionado, para evoluir junto com o
  schema e as regras do sistema.

## Solução: 4 mudanças, todas de conteúdo/instrução + um aviso pontual no parser

### 1. `public/modelo-solicitacao-projeto.xml` — comentários inline

Adicionar comentário acima de cada tag com regra restrita ou lista de valores
aceitos, para que a instrução esteja visível mesmo se só o template (sem a
página de ajuda) for usado como contexto de um prompt de IA. Conteúdo final
do arquivo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <empresa></empresa>
  <titulo></titulo>
  <!-- Valores sugeridos: Contabilidade, RPA, Desenvolvimento, Consultoria técnica. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <area></area>
  <!-- Tema dentro da área escolhida. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <tema></tema>
  <!-- CAMPO RESTRITO: use exatamente um destes valores, sem texto adicional. Valores: Desktop (Windows / macOS) | Web (desktop e celular) | iOS (iPhone / iPad) | Android | iOS e Android | Todas as plataformas -->
  <plataforma></plataforma>
  <descricao></descricao>
  <!-- Valores sugeridos: Uso interno da empresa, Clientes, Fornecedores, etc. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <publicoAlvo></publicoAlvo>
  <numeroUsuarios></numeroUsuarios>
  <!-- CAMPO RESTRITO: use exatamente um destes valores, sem texto adicional. Valores: Não, projeto do zero | Sim, quero substituir | Sim, quero integrar/migrar dados | Sim, quero melhorar o existente -->
  <processoExistente></processoExistente>
  <detalhesProcessoAtual></detalhesProcessoAtual>
  <!-- CAMPO RESTRITO: use exatamente Sim ou Não, sem texto adicional. Detalhes vão em detalhesAplicacaoExistente. -->
  <aplicacaoExistenteHoje></aplicacaoExistenteHoje>
  <detalhesAplicacaoExistente></detalhesAplicacaoExistente>
  <colaboradoresEnvolvidos></colaboradoresEnvolvidos>
  <detalhesColaboradores></detalhesColaboradores>
  <duracaoPorExecucao></duracaoPorExecucao>
  <!-- CAMPO RESTRITO — alimenta o cálculo automático de horas gastas por ano. Use exatamente um destes valores, SEM parênteses nem texto adicional (contexto extra vai em informacoesAdicionais). Valores: Diário | Duas vezes por semana | Três vezes por semana | Semanal | Mensal | Anual -->
  <periodicidade></periodicidade>
  <narrativaDoProcesso></narrativaDoProcesso>
  <funcionalidades>
    <!-- <funcionalidade>Exemplo de funcionalidade</funcionalidade> -->
  </funcionalidades>
  <!-- Cada <beneficio> deve corresponder exatamente a um destes rótulos (item que não bater vira "Outro" automaticamente, sem bloquear a importação): Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho) | Melhor relacionamento com o cliente (experiência, atendimento, rapidez) | Melhor relacionamento com fornecedores ou parceiros | Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais) | Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade) -->
  <beneficios>
    <!-- <beneficio>Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)</beneficio> -->
  </beneficios>
  <detalhesBeneficios></detalhesBeneficios>
  <horasEconomizadasPorMes></horasEconomizadasPorMes>
  <avaliacaoReducaoErros></avaliacaoReducaoErros>
  <avaliacaoCriticidadeProcesso></avaliacaoCriticidadeProcesso>
  <avaliacaoImpactoInterno></avaliacaoImpactoInterno>
  <avaliacaoImpactoExterno></avaliacaoImpactoExterno>
  <avaliacaoAtendimentoPoliticas></avaliacaoAtendimentoPoliticas>
  <!-- CAMPO RESTRITO: use exatamente um destes valores (incluindo o texto depois do travessão), sem texto adicional. Valores: Baixa — sem pressa definida | Média — próximos 2 a 3 meses | Alta — próximo mês | Urgente — o mais rápido possível -->
  <urgencia></urgencia>
  <prazoLimite></prazoLimite>
  <informacoesAdicionais></informacoesAdicionais>
</solicitacaoDeProjeto>
```

### 2. `ajuda-xml/page.tsx` — reforço textual nas descrições

Atualizar a `description` das entradas em `tags` (mantendo `acceptedValues`
como já é hoje):

- `periodicidade`: `'Frequência com que o processo acontece. Use exatamente um dos valores aceitos, sem texto adicional (ex.: não escreva "Mensal (fechamento)"). Esse campo alimenta o cálculo automático de horas gastas por ano — contexto extra vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro" e o cálculo automático não é feito.'`
- `processoExistente`: `'Se já existe um processo ou sistema atual. Use exatamente um dos valores aceitos, sem texto adicional — detalhes vão em "Detalhes do processo atual". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".'`
- `aplicacaoExistenteHoje`: `'Se já existe uma aplicação (app/sistema) para esse processo hoje. Use exatamente "Sim" ou "Não", sem texto adicional — detalhes vão em "Detalhes da aplicação existente". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".'`
- `plataforma`: `'Onde o processo vai funcionar (não confundir com sistemas que ele integra, como ERPs). Use exatamente um dos valores aceitos, sem texto adicional. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro". Se vazio, usa o padrão (Desktop).'`
- `urgencia`: `'Nível de urgência. Use exatamente um dos valores aceitos (incluindo o texto depois do travessão), sem texto adicional — o motivo da urgência vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".'`

### 3. `xml-import.ts` — avisos quando um campo categórico cai em "Outro"

Hoje `area`, `tema`, `plataforma`, `publicoAlvo`, `processoExistente`,
`aplicacaoExistenteHoje`, `periodicidade` e `urgencia` fazem fallback
silencioso para `"outro"` via `matchByLabel` sem nunca chamar
`warnings.push(...)` (diferente de `colaboradoresEnvolvidos`,
`horasEconomizadasPorMes` e das avaliações 1-5, que já avisam). Adicionar um
`warnings.push(...)` em cada um desses branches quando `match` é
`undefined` e o valor de origem não é vazio:

- Mensagem genérica (area, tema, plataforma, publicoAlvo, processoExistente,
  aplicacaoExistenteHoje, urgencia):
  `` `<${tag}> com valor '${valor}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.` ``
- Mensagem de `periodicidade` (mais forte, porque afeta cálculo):
  `` `<periodicidade> com valor '${periodicidadeTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro". O cálculo automático de horas gastas por ano NÃO será feito para este projeto — se a periodicidade real for uma das opções da lista, ajuste o valor antes de importar.` ``

Esses avisos já são exibidos na tela de revisão pós-importação (mesmo
mecanismo que existe hoje para os outros campos, via `additionalInfo`).
`area`/`tema` são obrigatórios (sempre têm valor), então sempre que caem em
"Outro" o aviso dispara; os demais são opcionais e só avisam quando a tag
veio preenchida.

### 4. `docs/prompt-geracao-xml.md` — novo arquivo, prompt de geração versionado

Novo arquivo com o prompt completo usado externamente (colado numa
ferramenta de IA) para gerar o XML a partir de transcrições de reunião.
Baseado no prompt atual do usuário, com estas mudanças:

- Nova regra geral (adicionada à lista "Regras gerais"): valor de campo
  restrito deve ser idêntico a uma das opções, sem parênteses/complementos —
  nuance vai para `<informacoesAdicionais>` ou o campo de detalhe
  correspondente (`<detalhesProcessoAtual>`, `<detalhesAplicacaoExistente>`).
- Em cada campo `CAMPO RESTRITO` (`plataforma`, `processoExistente`,
  `aplicacaoExistenteHoje`, `periodicidade`, `urgencia`), um par de exemplo
  ERRADO/CERTO mostrando exatamente esse tipo de erro corrigido.
- Em `periodicidade` especificamente, a explicação de que o campo alimenta o
  cálculo `duracaoPorExecucao × ocorrências/ano` — usando o caso real
  (`"Mensal (fechamento); também no ciclo de orçamento"` → correção:
  `"Mensal"` movendo a observação para `informacoesAdicionais`) como o
  próprio exemplo ERRADO/CERTO.
- Mantém a afirmação "CAMPO RESTRITO, sem fallback Outro" como está — é
  reforço retórico deliberado para a IA tentar mais forte achar um valor
  exato; o sistema real sempre tem "Outro" como rede de segurança, mas isso
  não muda.

Arquivo já escrito em `docs/prompt-geracao-xml.md` (conteúdo completo,
pronto pra revisão junto com esta spec) — inclui um cabeçalho de contexto
("por que esse arquivo existe", onde é usado) e uma seção de histórico
registrando esta primeira revisão.

## Fora de escopo

- Matching tolerante/fuzzy em `matchByLabel`.
- Novas colunas no Prisma ou novos campos de detalhe por tag categórica.
- Alterar o comportamento de "Outro" em `build-project-payload.ts` (a
  substituição do valor pelo texto livre continua — é usada pelos campos
  descritivos e é aceitável para `periodicidade` também, dado que "Outro"
  = sem cálculo é o trade-off aceito).
- Botão "Copiar prompt" na página de ajuda (não pedido; o prompt fica só no
  arquivo em `docs/`).

## Verificação

- Reimportar o XML original do caso real (com o texto poluído em
  `periodicidade`) e confirmar que agora aparece um aviso claro na revisão
  pós-importação.
- Importar um XML com `<periodicidade>Mensal</periodicidade>` limpo e
  confirmar que `currentAnnualHours` é calculado e os stats do slide
  executivo aparecem preenchidos.
- Revisão visual do template baixável e da página de ajuda.
