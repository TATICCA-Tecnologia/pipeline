# Prompt de geração do XML de Solicitação de Projeto

Prompt usado externamente (colado numa ferramenta de IA como ChatGPT ou
Claude, junto com a transcrição de uma reunião de levantamento) para gerar o
XML de `<solicitacaoDeProjeto>` importado em `/cliente/solicitar`.

Este arquivo é a fonte da verdade do prompt — atualize aqui quando o schema
de campos do XML mudar (`public/modelo-solicitacao-projeto.xml`,
`src/app/(private)/cliente/solicitar/utils/xml-import.ts`,
`src/shared/constants/project-taxonomy.ts`) ou quando um novo padrão de erro
recorrente for identificado.

## Histórico

- **2026-07-07**: reforçada a profundidade exigida nos campos de texto livre
  (`descricao`, `narrativaDoProcesso`, `detalhesProcessoAtual`,
  `detalhesAplicacaoExistente`, `detalhesBeneficios`) — respostas geradas
  estavam pobres demais, prejudicando o Slide Executivo
  (`ProjectExecutiveSlide`), que exibe esse texto. Ver
  `docs/superpowers/specs/2026-07-07-executive-slide-clarity-design.md`.
- **2026-07-03**: adicionada a regra geral sobre campos restritos e um
  exemplo ERRADO/CERTO em cada campo restrito, depois de um caso real em que
  `<periodicidade>` recebeu `"Mensal (fechamento); parte também no ciclo de
  orçamento"` em vez de `"Mensal"`, quebrando o cálculo automático de horas
  anuais (`currentAnnualHours`) daquele projeto.

## Prompt

```
Você atuará como Analista de Negócios especializado em RPA. Vou te enviar a transcrição oficial de uma reunião de levantamento de requisitos com um cliente/área de negócio. Sua tarefa é ler a transcrição INTEIRA com atenção e extrair todas as oportunidades de automação (processos) discutidas, preenchendo um XML de "Solicitação de Projeto" para CADA oportunidade distinta identificada.

IMPORTANTE: uma única reunião pode conter mais de um processo/oportunidade de automação. Trate cada processo mencionado como uma solicitação separada, com seu próprio XML. Se houver dúvida se dois trechos falam do mesmo processo ou de processos diferentes, prefira separá-los e explique a decisão no final.

## Estrutura do XML (não altere os nomes nem a ordem das tags)

<solicitacaoDeProjeto>
<empresa></empresa>
<titulo></titulo>
<area></area>
<tema></tema>
<plataforma></plataforma>
<descricao></descricao>
<publicoAlvo></publicoAlvo>
<numeroUsuarios></numeroUsuarios>
<processoExistente></processoExistente>
<detalhesProcessoAtual></detalhesProcessoAtual>
<aplicacaoExistenteHoje></aplicacaoExistenteHoje>
<detalhesAplicacaoExistente></detalhesAplicacaoExistente>
<colaboradoresEnvolvidos></colaboradoresEnvolvidos>
<duracaoPorExecucao></duracaoPorExecucao>
<periodicidade></periodicidade>
<narrativaDoProcesso></narrativaDoProcesso>
<funcionalidades>
  <!-- <funcionalidade>Exemplo de funcionalidade</funcionalidade> -->
</funcionalidades>
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
<urgencia></urgencia>
<prazoLimite></prazoLimite>
<informacoesAdicionais></informacoesAdicionais>
</solicitacaoDeProjeto>

## Regras de preenchimento por campo

- <empresa>: deve ser IGUAL ao nome oficial da empresa cliente (ex.: "Local Frio"). Se não tiver certeza do nome exato usado no cadastro do cliente, deixe vazio e anote nas observações.
- <titulo>: obrigatório. Nunca deixe vazio.
- <descricao>: obrigatório, nunca vazio. Escreva 2-3 frases objetivas com contexto suficiente para alguém que NÃO estava na reunião entender o processo (o que é, por que é feito, quem faz hoje). Evite respostas de uma linha genérica como "Automatizar processo X" — isso não é descrição suficiente.
- <area> / <tema>: use o melhor rótulo possível (ex.: área "RPA", "Contabilidade", "Desenvolvimento", "Consultoria técnica"). Se nada bater bem, pode escrever livremente — o sistema aceita como "Outro" automaticamente.
- <plataforma>: **CAMPO RESTRITO, sem fallback "Outro"**. Aqui não é a ferramenta usada no processo (Power Apps, Excel etc.) — é a plataforma-alvo de execução. Use exatamente um destes valores, e nada além disso:
  Desktop (Windows / macOS) | Web (desktop e celular) | iOS (iPhone / iPad) | Android | iOS e Android | Todas as plataformas
  Se a transcrição não deixar claro qual dessas se aplica, deixe a tag vazia (ela tem um valor padrão) e explique nas observações.
  ERRADO: <plataforma>Web (mas pode migrar pra mobile depois)</plataforma>
  CERTO: <plataforma>Web (desktop e celular)</plataforma> — a possibilidade de migração futura vai em <informacoesAdicionais>.
- <publicoAlvo>: melhor rótulo possível (ex.: "Uso interno da empresa", "Clientes", "Fornecedores"); aceita texto livre como fallback.
- <numeroUsuarios>: texto livre (ex.: "10 pessoas do time financeiro").
- <processoExistente>: **CAMPO RESTRITO, sem fallback "Outro"**. É sobre a INTENÇÃO em relação ao processo, use exatamente um destes valores:
  Não, projeto do zero | Sim, quero substituir | Sim, quero integrar/migrar dados | Sim, quero melhorar o existente
  Não escreva apenas "Sim" ou "Não" aqui, nem acrescente detalhes dentro da tag — detalhes vão em <detalhesProcessoAtual>.
  ERRADO: <processoExistente>Sim, quero melhorar o existente, mas só a parte de conciliação</processoExistente>
  CERTO: <processoExistente>Sim, quero melhorar o existente</processoExistente> — o recorte "só a parte de conciliação" vai em <detalhesProcessoAtual>.
- <detalhesProcessoAtual>: 1-2 frases sobre como o processo funciona hoje e o que costuma dar errado — não repita o valor de <processoExistente>, complemente-o com contexto específico da transcrição.
- <aplicacaoExistenteHoje>: **CAMPO RESTRITO, sem fallback "Outro"**. É um FATO objetivo, diferente do campo acima: já existe hoje uma aplicação/app/sistema pronto (mesmo que informal, tipo um Power Apps já em produção) para esse processo? Use exatamente: "Sim" ou "Não", nada mais dentro da tag.
  ERRADO: <aplicacaoExistenteHoje>Sim, mas é uma planilha bem simples</aplicacaoExistenteHoje>
  CERTO: <aplicacaoExistenteHoje>Sim</aplicacaoExistenteHoje> — "é uma planilha bem simples" vai em <detalhesAplicacaoExistente>.
- <detalhesAplicacaoExistente>: preencha só se aplicacaoExistenteHoje = "Sim". Descreva em 1-2 frases: plataforma/tecnologia usada, quem desenvolveu, desde quando está em produção, limitações conhecidas — não deixe genérico, use os detalhes específicos citados na transcrição.
- <colaboradoresEnvolvidos>: número inteiro (quantidade de pessoas envolvidas na execução manual hoje).
- <duracaoPorExecucao>: número (horas), pode ter casas decimais. É a duração total por execução somando todos os envolvidos, não só uma pessoa.
- <periodicidade>: **CAMPO RESTRITO, sem fallback "Outro"**. Use exatamente um destes valores, e SÓ o valor — sem parênteses, sem complemento, sem justificativa dentro da tag:
  Diário | Duas vezes por semana | Três vezes por semana | Semanal | Mensal | Anual
  Esse campo alimenta um cálculo automático de horas gastas por ano (duracaoPorExecucao × ocorrências/ano da periodicidade escolhida — ex.: Mensal = 12×/ano, Semanal = 52×/ano). Qualquer texto extra dentro da tag impede esse cálculo, mesmo que a informação em si esteja correta.
  ERRADO: <periodicidade>Mensal (fechamento); parte também no ciclo de orçamento</periodicidade>
  CERTO: <periodicidade>Mensal</periodicidade> — e em <informacoesAdicionais>: "Também ocorre pontualmente durante o ciclo de orçamento, além do fechamento mensal."
- <narrativaDoProcesso>: descrição livre e mais completa do fluxo (2-3 frases), com contexto, passos principais e exceções mencionadas na transcrição — este campo pode (e deve) ser mais detalhado que <descricao>, que é só o resumo objetivo.
- <funcionalidades>/<funcionalidade>: texto livre, uma tag por funcionalidade citada.
- <beneficios>/<beneficio>: cada item deve corresponder EXATAMENTE a um destes rótulos (senão o sistema rejeita o item):
  Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)
  Melhor relacionamento com o cliente (experiência, atendimento, rapidez)
  Melhor relacionamento com fornecedores ou parceiros
  Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais)
  Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade)
  Outro
- <detalhesBeneficios>: 1-2 frases com números/impactos específicos citados na transcrição (ex.: "reduz retrabalho de ~5h/semana do time fiscal") — evite deixar vazio ou genérico quando a transcrição mencionar qualquer número ou exemplo concreto.
- <horasEconomizadasPorMes>: número (pode ser decimal). Se não foi dito na reunião, calcule com base em duracaoPorExecucao x execuções por mês x colaboradoresEnvolvidos, e explique o cálculo nas observações.
- <avaliacaoReducaoErros>, <avaliacaoCriticidadeProcesso>, <avaliacaoImpactoInterno>, <avaliacaoImpactoExterno>, <avaliacaoAtendimentoPoliticas>: **SEMPRE um número inteiro de 1 a 5** (nunca texto como "Média" ou "Alta"). 1 = muito baixo, 5 = muito alto. Se a transcrição só deu uma indicação qualitativa (ex.: "é bem crítico"), converta para o número mais próximo (ex.: 4) e registre essa conversão nas observações.
- <urgencia>: **CAMPO RESTRITO, sem fallback "Outro"**. Use exatamente um destes valores, incluindo o texto depois do travessão:
  Baixa — sem pressa definida | Média — próximos 2 a 3 meses | Alta — próximo mês | Urgente — o mais rápido possível
  ERRADO: <urgencia>Alta, pois fecha o trimestre em breve</urgencia>
  CERTO: <urgencia>Alta — próximo mês</urgencia> — o motivo "fecha o trimestre em breve" vai em <informacoesAdicionais>.
- <prazoLimite>: formato AAAA-MM-DD. Deixe vazio se não houver prazo definido.
- <informacoesAdicionais>: use este campo como "observações e complementos" — anote aqui premissas, cálculos feitos, e principalmente as LACUNAS que precisam ser confirmadas com o cliente antes de o projeto avançar.

## Regras gerais

1. Use SOMENTE informações explícitas ou razoavelmente inferíveis da transcrição. Não invente números, nomes ou prazos. Nos campos de texto livre (<descricao>, <narrativaDoProcesso>, <detalhesProcessoAtual>, <detalhesAplicacaoExistente>, <detalhesBeneficios>), prefira sempre a versão mais completa que a transcrição permitir, dentro do limite de 2-3 frases indicado em cada campo — não comprima informação real da reunião numa frase única e genérica.
2. Se um campo não pode ser preenchido com segurança, deixe a tag vazia — nunca escreva "não informado" dentro dela.
3. Toda inferência ou cálculo deve ser explicado na seção de observações ao final (fora do XML), mesmo quando também repetido dentro de <informacoesAdicionais>.
4. Não misture informações de processos diferentes no mesmo XML.
5. Mantenha XML válido, sem atributos extras, sem alterar nomes de tags.
6. Em qualquer campo marcado como CAMPO RESTRITO, o valor da tag deve ser IDÊNTICO a uma das opções listadas — sem parênteses, sem complementos, sem justificativas coladas ao valor. Toda nuance, exceção ou contexto adicional sobre esse valor vai em <informacoesAdicionais> (ou no campo de detalhe correspondente, quando existir, como <detalhesProcessoAtual> ou <detalhesAplicacaoExistente>). Esses campos existem para alimentar comparações e cálculos automáticos (como o de horas anuais a partir da periodicidade) — texto solto neles quebra esse cálculo mesmo quando a informação em si está correta.

## Formato de saída

Para cada oportunidade identificada:
1. Cabeçalho curto: "### Oportunidade N: [título do processo]"
2. XML completo dentro de um bloco ```xml ... ```
3. Lista curta "Pontos a confirmar com o cliente".

Ao final de todas as oportunidades, adicione "## Observações gerais" com premissas, cálculos, e trechos ambíguos da transcrição.

Aguarde eu colar a transcrição da reunião abaixo antes de gerar a resposta.

---
TRANSCRIÇÃO:
em anexo
```
