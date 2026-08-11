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

- **2026-08-11**: adicionadas quinze tags novas de catálogo (ativo,
  cargo/setor/substituto do responsável, ações de contingência + detalhes,
  origem/destino de dados de entrada e saída + detalhes, os três campos de
  dados sigilosos, e as duas listas `<sistemas>/<sistema>` e
  `<contas>/<conta>`) — mesmas tags já existentes no XML de projeto completo
  (`build-projeto-completo-xml.ts`), agora também no XML de solicitação. Os
  rótulos das listas restritas (`acoesContingencia`,
  `origemDadosEntrada`/`destinoDadosSaida`, `dadosSigilosos`,
  `categoriasDadosSigilosos`, `<conta><tipo>`) foram copiados literalmente de
  `src/shared/constants/project-taxonomy.ts` — a importação casa por LABEL,
  não por slug, então um caractere divergente aqui faz o XML gerado cair em
  "Outro" (ou ser descartado, nas listas sem essa opção) em silêncio. Regra
  explícita nova: nunca inventar hostname/ativo, conta, plano de contingência
  ou sistema que não esteja na transcrição — tag vazia é o resultado
  correto, não uma falha de extração.
- **2026-07-28**: adicionadas sete tags da ficha de sustentação da automação
  existente (`hospedagemAplicacaoExistente`,
  `hospedagemCustomAplicacaoExistente`, `autorAplicacaoExistente`,
  `responsavelAplicacaoExistente`, `localAcessosAplicacaoExistente`,
  `referenciaAcessosAplicacaoExistente`, `producaoDesdeAplicacaoExistente`).
  O que antes era texto corrido em `<detalhesAplicacaoExistente>` agora tem
  campos próprios, filtráveis e exibidos no inventário técnico. Regra de
  segurança explícita: `referenciaAcessosAplicacaoExistente` é ponteiro para
  onde o acesso está, nunca a credencial em si — credenciais literais na
  transcrição devem ser ignoradas.
- **2026-07-07 (7)**: simplificada a regra de `<aplicacaoExistenteHoje>` — um
  caso real (script Python inativo após troca de máquina) mostrou a tag
  marcada "Sim" mesmo com o processo 100% manual hoje. A regra era ambígua
  entre "já existiu algo" e "existe algo rodando agora"; deixado explícito
  que é sempre a segunda: estado ATUAL, não histórico. Adicionado exemplo
  ERRADO/CERTO específico de ferramenta inativa/abandonada.
- **2026-07-07 (6)**: análise de 6 XMLs reais mostrou a maioria dos vazios de
  `<duracaoPorExecucao>`/`<colaboradoresEnvolvidos>` como lacunas genuínas da
  reunião (perguntado e não respondido, ou processo 100% automatizado sem
  execução manual) — não falhas de extração. Um caso real (pista qualitativa
  "a tarefa é curta" não convertida) revelou inconsistência: pistas fracas no
  extremo "curto" não estavam sendo convertidas do mesmo jeito que pistas no
  extremo "longo" ("manhã toda"). Adicionado exemplo ERRADO/CERTO específico
  pra isso. Também adicionada uma trava contra "não quantificado" virar
  atalho preguiçoso: só é aceitável depois de checar ativamente por pistas
  diretas, qualitativas E se o dado foi perguntado e desviado — a observação
  precisa citar essa tentativa, não só declarar vazio. Do lado do sistema
  (não do prompt): o Slide Executivo agora mostra "Não quantificado nesta
  reunião" em vez de simplesmente esconder a linha, pra explicar
  educadamente ao cliente em vez de parecer dado faltando sem motivo.
- **2026-07-07 (5)**: reforçado explicitamente que `<duracaoPorExecucao>` exige
  MULTIPLICAR tempo-por-pessoa × colaboradoresEnvolvidos quando a transcrição
  der os dois separadamente (ex.: "cada um leva meia hora, somos três" → 1.5h,
  não 0.5h) — decidido deixar esse cálculo por conta da IA que gera o XML
  (mais capaz de interpretar a discussão numérica do contexto da reunião),
  em vez de mover a multiplicação para o código do sistema. Adicionado
  exemplo ERRADO/CERTO específico dessa multiplicação, tanto na regra do
  campo quanto na seção de método.
- **2026-07-07 (4)**: mesclada uma versão do prompt evoluída pelo usuário
  (com ajuda de outra sessão de IA) que adicionou uma seção de método de
  análise, um exemplo completo transcrição→XML, e um formato de saída em
  um arquivo `.xml` por oportunidade (alinhado à importação de `.zip` em
  lote já existente no sistema). Ao mesclar, foram preservados os exemplos
  ERRADO/CERTO dos campos restritos (`periodicidade`, `processoExistente`,
  `aplicacaoExistenteHoje`, `urgencia`) que a versão evoluída havia
  resumido em prosa e perdido — esses exemplos existem por causa de
  incidentes reais e são o ponto mais barato de reforço contra a IA externa
  ignorar a regra. Também corrigido um erro na fórmula de
  `<horasEconomizadasPorMes>`: como `<duracaoPorExecucao>` já é a duração
  TOTAL somando todos os envolvidos, multiplicar de novo por
  `colaboradoresEnvolvidos` contava a mesma hora duas vezes.
- **2026-07-07 (3)**: reforçadas as regras de `<colaboradoresEnvolvidos>` e
  `<duracaoPorExecucao>` — casos reais mostraram o prompt deixando essas tags
  vazias (ou preenchendo errado, contando quem *desenvolveu* uma automação
  informal em vez de quem *executa* o processo manualmente) mesmo quando a
  transcrição dava pistas suficientes pra estimar. Adicionadas instruções
  explícitas pra buscar ativamente qualquer pista qualitativa de tempo/equipe
  e converter pra número, com exemplos de conversão — esses dois campos
  alimentam o cálculo de horas anuais/mensais exibido na Avaliação
  Quantitativa do Slide Executivo, então deixá-los vazios sem necessidade
  esconde essa informação do slide.
- **2026-07-07 (2)**: reforçada a regra de `<aplicacaoExistenteHoje>` para
  cobrir explicitamente ferramentas de automação já em uso de forma informal
  (n8n, Python, Power Automate, UiPath, Zapier etc.), não só planilhas —
  vários casos reais de transcrição citam essas ferramentas como algo já
  rodando hoje, e o exemplo anterior (só sobre planilha) deixava ambíguo se
  isso deveria virar "Sim" + `<detalhesAplicacaoExistente>` ou ser tratado
  como "não há oportunidade aqui". Deixado explícito que citar uma ferramenta
  existente não elimina a oportunidade — normalmente é o oposto (formalizar,
  substituir ou melhorar a automação informal).
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

````
Você atuará como Analista de Negócios especializado em RPA. Vou te enviar a transcrição oficial de uma reunião de levantamento de requisitos com um cliente/área de negócio. Sua tarefa é ler a transcrição INTEIRA com atenção e extrair todas as oportunidades de automação (processos) discutidas, gerando um XML de "Solicitação de Projeto" para CADA oportunidade distinta identificada.

IMPORTANTE: uma única reunião pode conter mais de um processo/oportunidade de automação. Trate cada processo mencionado como uma solicitação separada, com seu próprio XML. Se houver dúvida se dois trechos falam do mesmo processo ou de processos diferentes, prefira separá-los e explique a decisão no final.

## Como analisar a transcrição (método)

Antes de preencher qualquer XML, faça esta leitura analítica:

1. **Identifique cada oportunidade distinta.** Um processo é uma unidade de trabalho com começo, meio e fim próprios (ex.: "extrair relatórios do SAP", "consolidar o orçamento", "aprovar capitalização"). Dois trechos são o MESMO processo se descrevem o mesmo fluxo; são DIFERENTES se têm gatilho, periodicidade ou dono distintos. Na dúvida, separe e justifique nas observações.

2. **Automações que JÁ existem também viram XML.** Se o cliente já roda algo (script em Python, fluxo em Power Automate, app em Power Apps, planilha com macro etc.), isso NÃO deixa de ser uma solicitação — vira um XML normalmente, refletindo a intenção real (melhorar/substituir/integrar) em `<processoExistente>` e o fato em `<aplicacaoExistenteHoje>`. Registre que é um relato de algo existente (e não um desenvolvimento novo) no início de `<informacoesAdicionais>`, no formato: "STATUS: automação já existente — [em produção/em teste]" ou "STATUS: oportunidade a desenvolver".

3. **Persiga números de tempo e de pessoas — este é o ponto mais importante da análise.** `<duracaoPorExecucao>` e `<colaboradoresEnvolvidos>` alimentam o cálculo de horas gastas por ano/mês no Slide Executivo; deixá-los vazios sem necessidade esconde a informação mais valiosa do diagnóstico. Então:
   - Varra a transcrição atrás de QUALQUER pista de tempo, mesmo qualitativa, e converta para horas (ex.: "leva a manhã toda" ≈ 4h; "uns 10-15 minutos" ≈ 0.2h; "o dia inteiro" ≈ 8h; "umas duas horas" = 2h). Explique a conversão em `<informacoesAdicionais>`.
   - Varra atrás de quem executa ("sou eu que faço", "duas pessoas revezam", "o time todo passa por isso") e converta para um inteiro. Não conte quem DESENVOLVEU a automação — só quem EXECUTA o processo.
   - `<duracaoPorExecucao>` é o TOTAL da execução, somando todos os envolvidos — se a transcrição der o tempo de UMA pessoa e o número de pessoas separadamente (ex.: "cada um leva meia hora, somos três"), FAÇA a multiplicação você mesma(o) (0.5h × 3 = 1.5h) em vez de devolver só o tempo individual. Você consegue interpretar essa conta a partir da discussão — não deixe pra um cálculo posterior.
   - Só deixe esses campos vazios se a transcrição realmente não der pista nenhuma. Quando ficar vazio, registre a lacuna EXATA em `<informacoesAdicionais>` — e, se o entrevistador chegou a perguntar o tempo e não recebeu número, escreva isso ("tempo perguntado e não quantificado na reunião"), porque essa é a pergunta a repetir com o cliente.
   - **"Não quantificado" é o último recurso, não um atalho.** O sistema mostra esse rótulo no Slide Executivo exatamente como está escrito na sua observação, então ele precisa refletir uma tentativa real, não uma saída fácil para não fazer a conta. Antes de deixar vazio, confirme que você: (1) leu a transcrição inteira atrás de qualquer menção a tempo/pessoas, mesmo indireta; (2) tentou a conversão de pistas qualitativas (regra acima); (3) considerou se o dado foi perguntado e desviado. Só depois desses três passos é aceitável deixar vazio — e a observação deve citar o que foi encontrado (ex.: a pergunta feita e a resposta que fugiu do assunto), não só dizer "não informado".

4. **Trate transcrição ruim e dado ausente com honestidade.** Áudio truncado, fala cortada ou resposta que fugiu da pergunta são comuns. Nunca invente um número, nome ou prazo para preencher um vazio (ver Regras gerais). O correto é deixar o campo vazio e anotar a lacuna nas observações — não "chutar para não deixar em branco".

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
<hospedagemAplicacaoExistente></hospedagemAplicacaoExistente>
<hospedagemCustomAplicacaoExistente></hospedagemCustomAplicacaoExistente>
<autorAplicacaoExistente></autorAplicacaoExistente>
<responsavelAplicacaoExistente></responsavelAplicacaoExistente>
<localAcessosAplicacaoExistente></localAcessosAplicacaoExistente>
<referenciaAcessosAplicacaoExistente></referenciaAcessosAplicacaoExistente>
<producaoDesdeAplicacaoExistente></producaoDesdeAplicacaoExistente>
<ativoAplicacaoExistente></ativoAplicacaoExistente>
<cargoResponsavelAplicacaoExistente></cargoResponsavelAplicacaoExistente>
<setorResponsavelAplicacaoExistente></setorResponsavelAplicacaoExistente>
<responsavelSubstitutoAplicacaoExistente></responsavelSubstitutoAplicacaoExistente>
<acoesContingencia>
  <!-- <acao>Acionar o TI interno</acao> -->
</acoesContingencia>
<detalhesContingencia></detalhesContingencia>
<origemDadosEntrada></origemDadosEntrada>
<detalhesDadosEntrada></detalhesDadosEntrada>
<destinoDadosSaida></destinoDadosSaida>
<detalhesDadosSaida></detalhesDadosSaida>
<dadosSigilosos></dadosSigilosos>
<categoriasDadosSigilosos>
  <!-- <categoria>Dados pessoais de clientes (LGPD)</categoria> -->
</categoriasDadosSigilosos>
<detalhesDadosSigilosos></detalhesDadosSigilosos>
<sistemas>
  <!--
  <sistema>
    <nome>SAP</nome>
    <pontoAcesso>srv-sap.empresa.local</pontoAcesso>
    <comoAcessar>Cofre do TI, pasta Automações</comoAcessar>
  </sistema>
  -->
</sistemas>
<contas>
  <!--
  <conta>
    <usuario>rpa_sap</usuario>
    <tipo>Usuário de serviço</tipo>
    <sistema>SAP</sistema>
    <responsavel>João do Financeiro</responsavel>
    <observacoes></observacoes>
  </conta>
  -->
</contas>
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
  Se a transcrição não deixar claro qual dessas se aplica, deixe a tag vazia (ela tem um valor padrão) e explique nas observações. A ferramenta usada hoje vai em <detalhesAplicacaoExistente>, nunca aqui.
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
- <aplicacaoExistenteHoje>: **CAMPO RESTRITO, sem fallback "Outro"**. Pergunta simples e literal: **existe algo RODANDO/FUNCIONANDO agora, executando esse processo, hoje?** Não é "alguém já programou algo alguma vez" — é o estado ATUAL. Se quebrou, ficou inativo, foi abandonado ou nunca chegou a rodar de verdade, a resposta é "Não" (o processo é manual hoje, mesmo que tenha uma história de automação por trás — essa história vai em <detalhesAplicacaoExistente>, não muda a resposta desta tag). Use exatamente: "Sim" ou "Não", nada mais dentro da tag.
  IMPORTANTE: mencionar uma ferramenta de automação já em uso NÃO significa que não há oportunidade ali — normalmente significa que a oportunidade é formalizar, substituir ou melhorar essa automação informal. Continue extraindo o processo como uma oportunidade normalmente, e reflita a intenção real do cliente em <processoExistente> (não assuma "projeto do zero" só porque já existe algo informal rodando). A ferramenta em si só entra aqui e em <detalhesAplicacaoExistente> — nunca em <plataforma>, que é sobre onde a solução final vai rodar (Desktop/Web/mobile), não sobre a ferramenta usada hoje.
  ERRADO: <aplicacaoExistenteHoje>Sim, mas é uma planilha bem simples</aplicacaoExistenteHoje>
  ERRADO: deixar a tag vazia quando a transcrição menciona "já rodamos isso num fluxo do n8n" ou "temos um script em Python que faz isso hoje"
  ERRADO: transcrição diz "tínhamos um script que fazia isso, mas parou de funcionar depois da troca de máquina, hoje fazemos na mão" e a tag sai como <aplicacaoExistenteHoje>Sim</aplicacaoExistenteHoje> (o script existiu, mas NÃO está rodando hoje — o processo é manual agora; o correto é "Não", com a história do script antigo em <detalhesAplicacaoExistente>)
  CERTO: transcrição diz "já rodamos isso num fluxo do n8n" ou "temos um script em Python que faz isso hoje" (ativo, funcionando), <aplicacaoExistenteHoje>Sim</aplicacaoExistenteHoje> — e em <detalhesAplicacaoExistente>: "Automação feita hoje em n8n" (ou "script em Python", "fluxo no Power Automate", "planilha com macro" — a ferramenta específica citada).
  CERTO: transcrição diz "tínhamos um script, mas parou de funcionar, hoje é manual", <aplicacaoExistenteHoje>Não</aplicacaoExistenteHoje> — e em <detalhesAplicacaoExistente> (ou <detalhesProcessoAtual>): "Existiu um script em Python que fazia isso, hoje inativo após troca de máquina; processo voltou a ser manual."
- <detalhesAplicacaoExistente>: preencha só se aplicacaoExistenteHoje = "Sim". Descreva em 1-2 frases: plataforma/tecnologia usada (nome da ferramenta, ex.: n8n, Python, Power Automate, Power Apps, UiPath), quem desenvolveu, desde quando está em produção, limitações conhecidas — não deixe genérico, use os detalhes específicos citados na transcrição.
- <hospedagemAplicacaoExistente>: **CAMPO RESTRITO**. Preencha só se aplicacaoExistenteHoje = "Sim". Onde a automação roda hoje. Use EXATAMENTE uma destas opções: "Servidor próprio (on-premise)", "Máquina virtual da empresa", "Nuvem (Azure, AWS, GCP)", "Máquina de um usuário", "Plataforma SaaS do fornecedor", "Não sei", "Outro". Se a transcrição não disser onde roda, deixe VAZIO — não chute "Não sei" (vazio significa "não perguntado"; "Não sei" significa "perguntado e ninguém sabia", que é uma informação diferente e útil para o TI).
  CERTO: "roda num servidor nosso lá na sala do TI" → "Servidor próprio (on-premise)"
  CERTO: "fica na máquina da Fernanda, ela liga de manhã" → "Máquina de um usuário"
  ERRADO: <hospedagemAplicacaoExistente>Servidor próprio do cliente, na sala do TI</hospedagemAplicacaoExistente> (valor com complemento colado — o detalhe vai em <detalhesAplicacaoExistente>)
- <hospedagemCustomAplicacaoExistente>: só quando hospedagem = "Outro". Descreva em poucas palavras onde roda.
- <autorAplicacaoExistente>: quem desenvolveu a automação existente — nome da pessoa, da equipe interna ou do fornecedor, como citado na transcrição. Não confunda com <colaboradoresEnvolvidos> (quem executa o processo). Se a transcrição só disser "foi um estagiário que saiu" ou "veio de uma consultoria", escreva isso mesmo — é exatamente o tipo de informação que o TI precisa.
- <responsavelAplicacaoExistente>: quem cuida da automação HOJE — quem é chamado quando ela para. Pode ser diferente de quem desenvolveu. Se a transcrição indicar que ninguém cuida, escreva "Ninguém definido".
- <localAcessosAplicacaoExistente>: **CAMPO RESTRITO**. Onde ficam guardadas as credenciais/acessos que a automação usa. Use EXATAMENTE uma destas opções: "Cofre de senhas corporativo", "Planilha ou documento compartilhado", "Com uma pessoa específica", "Não se sabe", "Outro". Deixe vazio se o assunto não apareceu na reunião.
- <referenciaAcessosAplicacaoExistente>: ponteiro curto (máx. 200 caracteres) de ONDE encontrar o acesso — nome do cofre, caminho da pasta, com quem está. **NUNCA transcreva senhas, tokens, chaves ou usuários+senha, mesmo que apareçam na transcrição.** Se a transcrição contiver uma credencial literal, ignore-a completamente e descreva só a localização.
  CERTO: "Cofre do TI, pasta Automações Financeiro"
  CERTO: "Com o João do Financeiro"
  ERRADO: "usuário robo_fin senha Abc12345" (credencial literal — nunca)
- <producaoDesdeAplicacaoExistente>: data em que a automação entrou em produção, no formato AAAA-MM-DD. Se a transcrição só der o mês ou o ano ("desde o começo de 2024", "faz uns dois anos"), use o primeiro dia do período mais provável (2024-01-01) e registre a imprecisão em <informacoesAdicionais>. Se não houver pista nenhuma, deixe vazio.
- <ativoAplicacaoExistente>: identificador técnico do ativo onde a automação roda hoje — hostname, IP ou número de patrimônio (ex.: "SRV-RPA-01"). **Nunca invente um hostname, IP ou número de patrimônio plausível** — preencha só se a transcrição citar um identificador literal; "roda no servidor do financeiro" sem nome/IP específico não é suficiente (isso já é coberto por <hospedagemAplicacaoExistente>).
  ERRADO: <ativoAplicacaoExistente>SRV-RPA-01</ativoAplicacaoExistente> quando a transcrição só diz "fica num servidor lá do TI" (nenhum identificador foi citado)
  CERTO: transcrição diz "a máquina se chama SRV-FIN-03", <ativoAplicacaoExistente>SRV-FIN-03</ativoAplicacaoExistente>
- <cargoResponsavelAplicacaoExistente>: cargo (não o nome) de quem cuida da automação hoje, como citado na transcrição (ex.: "Analista de Processos"). Deixe vazio se não mencionado — não confunda com <responsavelAplicacaoExistente> (o nome da pessoa).
- <setorResponsavelAplicacaoExistente>: nome do setor/área do responsável (ex.: "Financeiro", "TI"). Precisa ser o nome de uma área já cadastrada no sistema para ser reconhecido automaticamente na importação — se não bater com nenhuma área cadastrada, a tag é simplesmente ignorada, sem erro. Use o nome mais provável citado na transcrição; o pior caso é só não preencher esse campo. **Nunca invente um setor que não foi citado.**
- <responsavelSubstitutoAplicacaoExistente>: nome (ou cargo, se o nome não foi dito) de quem assume se o responsável atual sair da empresa. Vazio se a transcrição não abordou isso.
- <acoesContingencia>/<acao>: cada item deve corresponder EXATAMENTE a um destes rótulos (item que não bater é descartado da lista, sem bloquear a importação):
  Reexecutar ou reiniciar a automação | Verificar log ou relatório de erro | Verificar credenciais e acessos expirados | Acionar o TI interno | Acionar o fornecedor ou desenvolvedor externo | Executar o processo manualmente enquanto isso | Acionar o responsável da área de negócio | Não existe caminho definido hoje
  **Nunca invente um plano de contingência que não foi mencionado na transcrição.** Se a transcrição disser explicitamente que ninguém sabe o que fazer ou que não há plano, use o item "Não existe caminho definido hoje" — essa opção existe para registrar essa ausência como um dado, não como uma lacuna. Se o assunto simplesmente não foi discutido, deixe a lista vazia (isso NÃO é a mesma coisa que "não existe caminho definido").
- <detalhesContingencia>: passo a passo em texto livre, se a transcrição detalhar como agir. Não repita os rótulos de <acoesContingencia>, complemente-os.
- <origemDadosEntrada> / <destinoDadosSaida>: **CAMPO RESTRITO**, use exatamente um destes valores, e nada além disso:
  Sistema (ERP, CRM, portal) | Planilha | E-mail | API | Banco de dados | Pasta de rede ou SharePoint | Site ou portal web | Entrada manual de uma pessoa | Outro
  Se a transcrição não deixar claro qual se aplica, deixe vazio — não force "Outro" nem chute. O nome do sistema/planilha específico, caminho ou frequência vai no campo de detalhes correspondente, nunca dentro desta tag.
  ERRADO: <origemDadosEntrada>Planilha compartilhada no SharePoint do financeiro</origemDadosEntrada>
  CERTO: <origemDadosEntrada>Planilha</origemDadosEntrada> — o complemento "compartilhada no SharePoint do financeiro" vai em <detalhesDadosEntrada>.
- <detalhesDadosEntrada> / <detalhesDadosSaida>: nome do sistema/planilha específico, caminho ou frequência, como citado na transcrição.
- <dadosSigilosos>: **CAMPO RESTRITO, sem fallback "Outro"**. Use exatamente um destes valores: Sim | Não | Não sei
  Pergunte-se: a automação lida com dados pessoais, financeiros, de saúde, credenciais etc.? Se o assunto não foi discutido na reunião, deixe vazio — não assuma "Não" por padrão só porque ninguém mencionou.
- <categoriasDadosSigilosos>/<categoria>: preencha só se <dadosSigilosos> = "Sim". Cada item deve corresponder EXATAMENTE a um destes rótulos (item que não bater é descartado da lista):
  Dados pessoais de clientes (LGPD) | Dados pessoais de colaboradores | Folha de pagamento e remuneração | Dados bancários e financeiros | Dados de saúde | Dados fiscais e contábeis | Contratos e jurídico | Propriedade intelectual | Credenciais e acessos
- <detalhesDadosSigilosos>: que dado, de quem, com que finalidade — texto livre, com base no que a transcrição disser.
- <sistemas>/<sistema>: um item por sistema sobre o qual a automação atua (SAP, portal da Receita, CRM interno etc.) — vale mesmo para uma automação nova, ainda a desenvolver, porque ela também vai atuar sobre sistemas. Cada <sistema> tem três subtags:
  <nome>: obrigatório para a linha ser aproveitada (linha sem nome é descartada na importação). Nome do sistema, como citado na transcrição.
  <pontoAcesso>: URL, servidor ou instância — ex.: "srv-sap.empresa.local" ou o link do portal.
  <comoAcessar>: ponteiro curto de ONDE encontrar o acesso (cofre, pasta, pessoa) — **NUNCA a credencial em si.** Mesma regra de <referenciaAcessosAplicacaoExistente>: se a transcrição citar usuário+senha literal, ignore a credencial e descreva só a localização.
  **Nunca invente um sistema que não foi citado na transcrição** — uma linha vazia ou genérica ("Sistema interno") é pior do que não ter a linha.
- <contas>/<conta>: um item por conta/usuário que a automação usa para acessar os sistemas de <sistemas> acima. Cada <conta> tem cinco subtags:
  <usuario>: obrigatório para a linha ser aproveitada (linha sem usuário é descartada na importação). Só o login/identificador — **NUNCA a senha, token ou chave**, mesmo que apareçam na transcrição.
  <tipo>: **CAMPO RESTRITO**, use exatamente um destes valores: Usuário de serviço | Usuário nominal | Conta de e-mail | Chave de API | Certificado digital | Outro
  <sistema>: deve repetir, caractere por caractere, o valor de algum <nome> já usado em <sistemas> acima — é assim que a importação liga a conta ao sistema certo. Se não bater com nenhum <nome>, a conta ainda é importada, só que sem sistema vinculado.
  <responsavel>: de quem é a conta / quem responde por ela.
  <observacoes>: texto livre, opcional.
  **Nunca invente uma conta, usuário ou sistema vinculado que não foi citado na transcrição.**
- <colaboradoresEnvolvidos>: **campo importante, não deixe vazio por padrão** — número inteiro de pessoas envolvidas na execução MANUAL do processo hoje. Busque ativamente na transcrição qualquer pista sobre quem faz a tarefa (nomes citados, "eu que faço isso", "duas pessoas revezam", "o time todo passa por isso") e converta para um número — só deixe vazio se a transcrição genuinamente não der nenhuma pista, o que deve ser raro numa reunião de levantamento.
  NÃO confunda com quem desenvolveu uma automação/script/fluxo informal já existente (isso vai em <detalhesAplicacaoExistente>, não aqui) — "colaboradoresEnvolvidos" é sobre quem executa o processo, não quem programou uma ferramenta para ele.
  ERRADO: deixar vazio porque a transcrição só menciona "foi o Leandro que desenvolveu o fluxo em Power Automate" (isso é sobre desenvolvimento da automação, não sobre quem faz o processo manualmente)
  ERRADO: <colaboradoresEnvolvidos>Leandro</colaboradoresEnvolvidos> (não é um número; e é o desenvolvedor, não necessariamente quem executa)
  CERTO: transcrição diz "hoje sou eu que recebo o e-mail e jogo na planilha todo dia", <colaboradoresEnvolvidos>1</colaboradoresEnvolvidos>
- <duracaoPorExecucao>: **mesma prioridade — campo importante, não deixe vazio por padrão**. Número em horas (decimais permitidos, use PONTO como separador decimal), duração TOTAL por execução somando todos os envolvidos, não só uma pessoa. Procure ativamente qualquer estimativa de tempo, mesmo aproximada ou qualitativa, e converta para o número mais próximo, explicando a conversão em <informacoesAdicionais> — só deixe vazio se a transcrição realmente não der nenhuma pista de tempo.
  Exemplos de conversão: "leva a manhã toda" ≈ 4h | "uns 10-15 minutos" ≈ 0.2h | "o dia inteiro" ≈ 8h | "mais ou menos uma hora por dia" ≈ 1h.
  **Quando a transcrição der o tempo POR PESSOA e o número de pessoas separadamente (em vez de já somado), FAÇA a conta você mesma(o): tempo por pessoa × colaboradoresEnvolvidos = duracaoPorExecucao. Não deixe essa multiplicação implícita nem devolva só o tempo de uma pessoa — você é capaz de interpretar essa conta a partir da discussão, então faça-a e mostre o raciocínio em <informacoesAdicionais>.**
  ERRADO: deixar vazio só porque não foi dito um número exato e redondo
  ERRADO: transcrição diz "cada um de nós leva 1h nisso, somos 3 pessoas" e a tag sai como <duracaoPorExecucao>1</duracaoPorExecucao> (isso é o tempo de UMA pessoa; faltou multiplicar pelas 3 envolvidas — o correto é 3)
  ERRADO: transcrição diz "é uma tarefa curta"/"é rapidinho"/"não toma muito tempo" e a tag fica vazia por falta de número exato — isso ainda é uma pista qualitativa como "manhã toda" ou "10 minutos", só que no outro extremo (curto); converta para uma estimativa baixa e conservadora (ex.: "curta"/"rapidinho" ≈ 0.1-0.25h) e registre em <informacoesAdicionais> que é uma estimativa de baixa confiança a partir de uma descrição vaga.
  CERTO: transcrição diz "isso toma uns 10 minutos toda vez que roda" (uma pessoa só), <duracaoPorExecucao>0.17</duracaoPorExecucao> — e em <informacoesAdicionais>: "duracaoPorExecucao estimado a partir de '10 minutos' citado na transcrição."
  CERTO: transcrição diz "cada um de nós leva 1h nisso, somos 3 pessoas", <duracaoPorExecucao>3</duracaoPorExecucao> — e em <informacoesAdicionais>: "duracaoPorExecucao = 1h por pessoa × 3 colaboradoresEnvolvidos = 3h totais."
  CERTO: transcrição diz "é uma tarefa rápida, não demora nada", <duracaoPorExecucao>0.17</duracaoPorExecucao> — e em <informacoesAdicionais>: "duracaoPorExecucao estimado em 0.17h (10 min) a partir de 'tarefa rápida, não demora nada' — estimativa de baixa confiança, sem número exato citado; confirmar com o cliente."
  Esses dois campos alimentam o cálculo automático de horas anuais e horas totais por mês gastas no processo, exibido no Slide Executivo — deixá-los vazios sem necessidade real esconde essa informação do slide, mesmo quando a reunião discutiu o suficiente para estimar.
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
- <horasEconomizadasPorMes>: número (pode ser decimal, use PONTO). Se não foi dito na reunião, calcule com base em duracaoPorExecucao × execuções por mês (não multiplique de novo por colaboradoresEnvolvidos — duracaoPorExecucao já é o total somando todos os envolvidos, multiplicar de novo contaria a mesma hora duas vezes), e explique o cálculo nas observações.
- <avaliacaoReducaoErros>, <avaliacaoCriticidadeProcesso>, <avaliacaoImpactoInterno>, <avaliacaoImpactoExterno>, <avaliacaoAtendimentoPoliticas>: **SEMPRE um número inteiro de 1 a 5** (nunca texto como "Média" ou "Alta"). 1 = muito baixo, 5 = muito alto. Se a transcrição só deu uma indicação qualitativa (ex.: "é bem crítico"), converta para o número mais próximo (ex.: 4) e registre essa conversão nas observações. Se o tema não foi avaliado na reunião, pode deixar vazio e anotar.
- <urgencia>: **CAMPO RESTRITO, sem fallback "Outro"**. Use exatamente um destes valores, incluindo o texto depois do travessão:
  Baixa — sem pressa definida | Média — próximos 2 a 3 meses | Alta — próximo mês | Urgente — o mais rápido possível
  ERRADO: <urgencia>Alta, pois fecha o trimestre em breve</urgencia>
  CERTO: <urgencia>Alta — próximo mês</urgencia> — o motivo "fecha o trimestre em breve" vai em <informacoesAdicionais>.
- <prazoLimite>: formato AAAA-MM-DD. Deixe vazio se não houver prazo definido.
- <informacoesAdicionais>: use este campo como "observações e complementos". Comece com o STATUS ("automação já existente" ou "oportunidade a desenvolver", ver seção de método). Anote premissas, cálculos/conversões feitos, e principalmente as LACUNAS que precisam ser confirmadas com o cliente antes de o projeto avançar.

## Regras gerais

1. Use SOMENTE informações explícitas ou razoavelmente inferíveis da transcrição. Não invente números, nomes ou prazos — e o mesmo vale para hostname/ativo, conta/usuário, plano de contingência ou sistema: se não foi citado na transcrição, a tag correspondente fica vazia; uma ficha de catálogo com dado inventado é pior que uma ficha vazia. Nos campos de texto livre (<descricao>, <narrativaDoProcesso>, <detalhesProcessoAtual>, <detalhesAplicacaoExistente>, <detalhesBeneficios>), prefira sempre a versão mais completa que a transcrição permitir, dentro do limite de 2-3 frases indicado em cada campo — não comprima informação real da reunião numa frase única e genérica.
2. Se um campo não pode ser preenchido com segurança, deixe a tag vazia — nunca escreva "não informado" dentro dela.
3. Toda inferência, cálculo ou conversão deve ser explicado na seção de observações ao final (fora do XML), mesmo quando também repetido dentro de <informacoesAdicionais>.
4. Não misture informações de processos diferentes no mesmo XML.
5. Mantenha XML válido, sem atributos extras, sem alterar nomes de tags. Escape "&" como "&amp;".
6. Em qualquer campo marcado como CAMPO RESTRITO, o valor da tag deve ser IDÊNTICO a uma das opções listadas — sem parênteses, sem complementos, sem justificativas coladas ao valor. Toda nuance, exceção ou contexto adicional sobre esse valor vai em <informacoesAdicionais> (ou no campo de detalhe correspondente, quando existir, como <detalhesProcessoAtual> ou <detalhesAplicacaoExistente>). Esses campos existem para alimentar comparações e cálculos automáticos (como o de horas anuais a partir da periodicidade) — texto solto neles quebra esse cálculo mesmo quando a informação em si está correta.

## Exemplo completo (trecho de transcrição → XML)

TRECHO: "Todo mês, no fechamento, eu e mais uma colega baixamos os extratos bancários e batemos com o razão. Isso toma a manhã inteira das duas. Hoje é tudo no braço, no Excel. Já pensamos em automatizar, seria ótimo porque erro de conciliação aqui é crítico."

XML resultante:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
<empresa></empresa>
<titulo>Automação da conciliação bancária mensal</titulo>
<area>Financeiro</area>
<tema>Conciliação</tema>
<plataforma></plataforma>
<descricao>No fechamento mensal, duas pessoas baixam os extratos bancários e conciliam com o razão manualmente no Excel. O objetivo é automatizar a conciliação, reduzindo esforço manual e erros, que são considerados críticos.</descricao>
<publicoAlvo>Uso interno da empresa (time financeiro)</publicoAlvo>
<numeroUsuarios></numeroUsuarios>
<processoExistente>Não, projeto do zero</processoExistente>
<detalhesProcessoAtual>Duas pessoas baixam os extratos e batem com o razão manualmente no Excel, no fechamento. Processo "no braço", propenso a erro de conciliação.</detalhesProcessoAtual>
<aplicacaoExistenteHoje>Não</aplicacaoExistenteHoje>
<detalhesAplicacaoExistente></detalhesAplicacaoExistente>
<hospedagemAplicacaoExistente></hospedagemAplicacaoExistente>
<hospedagemCustomAplicacaoExistente></hospedagemCustomAplicacaoExistente>
<autorAplicacaoExistente></autorAplicacaoExistente>
<responsavelAplicacaoExistente></responsavelAplicacaoExistente>
<localAcessosAplicacaoExistente></localAcessosAplicacaoExistente>
<referenciaAcessosAplicacaoExistente></referenciaAcessosAplicacaoExistente>
<producaoDesdeAplicacaoExistente></producaoDesdeAplicacaoExistente>
<ativoAplicacaoExistente></ativoAplicacaoExistente>
<cargoResponsavelAplicacaoExistente></cargoResponsavelAplicacaoExistente>
<setorResponsavelAplicacaoExistente></setorResponsavelAplicacaoExistente>
<responsavelSubstitutoAplicacaoExistente></responsavelSubstitutoAplicacaoExistente>
<acoesContingencia>
</acoesContingencia>
<detalhesContingencia></detalhesContingencia>
<origemDadosEntrada></origemDadosEntrada>
<detalhesDadosEntrada></detalhesDadosEntrada>
<destinoDadosSaida></destinoDadosSaida>
<detalhesDadosSaida></detalhesDadosSaida>
<dadosSigilosos></dadosSigilosos>
<categoriasDadosSigilosos>
</categoriasDadosSigilosos>
<detalhesDadosSigilosos></detalhesDadosSigilosos>
<sistemas>
</sistemas>
<contas>
</contas>
<colaboradoresEnvolvidos>2</colaboradoresEnvolvidos>
<duracaoPorExecucao>8</duracaoPorExecucao>
<periodicidade>Mensal</periodicidade>
<narrativaDoProcesso>A cada fechamento mensal, duas colaboradoras baixam os extratos bancários e conciliam contra o razão no Excel, inteiramente à mão. Consome a manhã inteira das duas. Não há automação hoje; a área já cogitou automatizar, motivada pela criticidade dos erros de conciliação.</narrativaDoProcesso>
<funcionalidades>
  <funcionalidade>Download automático dos extratos bancários</funcionalidade>
  <funcionalidade>Conciliação automática extrato x razão</funcionalidade>
  <funcionalidade>Sinalização de divergências</funcionalidade>
</funcionalidades>
<beneficios>
  <beneficio>Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)</beneficio>
  <beneficio>Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade)</beneficio>
</beneficios>
<detalhesBeneficios>Libera a manhã de duas pessoas por mês (≈8 h-pessoa/mês) e reduz erros de conciliação, apontados como críticos.</detalhesBeneficios>
<horasEconomizadasPorMes>8</horasEconomizadasPorMes>
<avaliacaoReducaoErros>4</avaliacaoReducaoErros>
<avaliacaoCriticidadeProcesso>4</avaliacaoCriticidadeProcesso>
<avaliacaoImpactoInterno>3</avaliacaoImpactoInterno>
<avaliacaoImpactoExterno>1</avaliacaoImpactoExterno>
<avaliacaoAtendimentoPoliticas></avaliacaoAtendimentoPoliticas>
<urgencia></urgencia>
<prazoLimite></prazoLimite>
<informacoesAdicionais>STATUS: oportunidade a desenvolver (processo manual, sem automação hoje). CONVERSÃO: duracaoPorExecucao = 8h a partir de "a manhã inteira das duas" (2 pessoas × ~4h da manhã = 8 h-pessoa por execução, já somando as duas — não multiplicar de novo por colaboradoresEnvolvidos); periodicidade Mensal; horasEconomizadasPorMes = 8 (8h × 1 execução/mês). avaliacaoReducaoErros=4 e Criticidade=4 convertidos de "erro de conciliação é crítico". URGÊNCIA vazia: não discutida. avaliacaoAtendimentoPoliticas vazia: não abordado. A CONFIRMAR: numeroUsuarios; existência de sistema bancário/ERP de origem; prazo.</informacoesAdicionais>
</solicitacaoDeProjeto>
```

Repare no exemplo: toda pista de tempo/pessoas virou número com a conversão explicada; o que não foi dito ficou vazio e virou lacuna a confirmar; o status abriu as observações; e `duracaoPorExecucao` (8h, já somando as duas pessoas) não foi multiplicado de novo por `colaboradoresEnvolvidos` no cálculo de `horasEconomizadasPorMes`.

## Formato de saída

Gere **um arquivo .xml separado para cada oportunidade** (um arquivo = um projeto, pronto para importar), com nome descritivo (ex.: `conciliacao-bancaria-mensal.xml`). Cada arquivo deve começar com `<?xml version="1.0" encoding="UTF-8"?>` e conter exatamente a estrutura de tags acima, válida.

Para cada oportunidade, apresente também:
1. Um cabeçalho curto: "### Oportunidade N: [título do processo]".
2. Uma lista curta "Pontos a confirmar com o cliente".

Ao final de todas as oportunidades, adicione "## Observações gerais" com premissas, cálculos/conversões feitos, e trechos ambíguos ou de áudio ruim da transcrição.

(Se o ambiente não permitir gerar arquivos, entregue cada XML em seu próprio bloco de código, mantendo o mesmo conteúdo.)

Aguarde eu colar (ou anexar) a transcrição da reunião antes de gerar a resposta.
````
