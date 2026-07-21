# Importar/Exportar XML de um projeto existente (Design)

## Contexto

Hoje existe um formato XML (`<solicitacaoDeProjeto>`, documentado em `docs/prompt-geracao-xml.md`) usado só pra **criar** projetos novos: geração via IA (`/admin/oportunidades/gerar-ia`) e import manual do cliente (`/cliente/solicitar`). O parser (`src/app/(private)/cliente/solicitar/utils/xml-import.ts`) e o payload builder (`build-project-payload.ts`) só sabem montar um projeto novo (`addProject`) — não existe nenhuma lógica de **exportação** (Project → XML) em lugar nenhum do código, e nenhum caminho de import que **atualize** um projeto já existente.

O escopo desse XML também é só o que o cliente preenche na solicitação — nunca os campos técnicos do arquiteto (`complexity`, `mainTool`, `executionStrategy`, `solutionTypes`, `hourlyRateBRL`, `estimatedAnnualSavingBRL`, `implementationEffortDays/Wave/waveOrder`, `architectNotes`, `robotSchedule`), que hoje só são editáveis via `adminProcedure` (tanto em `project.router.ts#update` quanto em `specification.router.ts`) — `developer` tem apenas leitura desses campos hoje, em nenhum lugar do sistema.

## Requisitos confirmados com o usuário

1. Novo par de botões "Exportar XML" / "Importar XML" na página de detalhe do projeto (`project-detail-sections.tsx`, ao lado do botão "Editar" já existente) — visível nas duas superfícies que renderizam esse componente (`/projeto/[id]` e o modal `admin/projetos/_components/project-details.modal.tsx`).
2. O XML cobre **tudo**: campos da solicitação (como hoje) **+** campos técnicos do arquiteto — já que o objetivo é o developer poder editar o XML como preferir e reimportar.
3. Só **admin e developer** veem/usam esses botões (mesmo público que já vê a seção "Diagnóstico técnico" hoje).
4. Como `developer` não tem permissão de escrita em campos técnicos em NENHUM lugar hoje, essa importação **amplia a permissão especificamente para esse fluxo** (nova mutation dedicada), sem alterar a regra geral de `project.update`/`specification.router.ts`.
5. Novo formato de XML com tag raiz própria, `<projetoCompleto>`, separado do `<solicitacaoDeProjeto>` existente — que continua 100% intocado (nenhuma mudança no parser/schema/prompt do fluxo de intake do cliente).

## Formato XML: `<projetoCompleto>`

Tags informativas (não alteram nada no import — só contexto pro developer):
```xml
<projetoCompleto>
  <projetoId>...</projetoId>
  <empresa>...</empresa>
```

Campos da solicitação (mesma semântica e, onde aplicável, mesmo nome de tag do `<solicitacaoDeProjeto>` atual — ver `docs/prompt-geracao-xml.md`):
```xml
  <titulo>...</titulo>
  <area>...</area>
  <tema>...</tema>
  <plataforma>...</plataforma>
  <descricao>...</descricao>
  <publicoAlvo>...</publicoAlvo>
  <numeroUsuarios>...</numeroUsuarios>
  <processoExistente>...</processoExistente>
  <detalhesProcessoAtual>...</detalhesProcessoAtual>
  <aplicacaoExistenteHoje>...</aplicacaoExistenteHoje>
  <detalhesAplicacaoExistente>...</detalhesAplicacaoExistente>
  <colaboradoresEnvolvidos>...</colaboradoresEnvolvidos>
  <duracaoPorExecucao>...</duracaoPorExecucao>
  <periodicidade>...</periodicidade>
  <narrativaDoProcesso>...</narrativaDoProcesso>
  <funcionalidades><funcionalidade>...</funcionalidade></funcionalidades>
  <beneficios><beneficio>...</beneficio></beneficios>
  <detalhesBeneficios>...</detalhesBeneficios>
  <horasEconomizadasPorMes>...</horasEconomizadasPorMes>
  <avaliacaoReducaoErros>...</avaliacaoReducaoErros>
  <avaliacaoCriticidadeProcesso>...</avaliacaoCriticidadeProcesso>
  <avaliacaoImpactoInterno>...</avaliacaoImpactoInterno>
  <avaliacaoImpactoExterno>...</avaliacaoImpactoExterno>
  <avaliacaoAtendimentoPoliticas>...</avaliacaoAtendimentoPoliticas>
  <urgencia>...</urgencia>
  <prazoLimite>...</prazoLimite>
  <informacoesAdicionais>...</informacoesAdicionais>
```

Taxonomia relacional nova:
```xml
  <ferramentaPrincipal>...</ferramentaPrincipal>
  <tipoDeProjeto>...</tipoDeProjeto>
  <pessoasDeInteresse>
    <pessoa>...</pessoa>
  </pessoasDeInteresse>
```

Campos técnicos (arquiteto):
```xml
  <complexidade>...</complexidade>
  <agendaDoRobo>...</agendaDoRobo>
  <taxaHorariaBRL>...</taxaHorariaBRL>
  <economiaAnualEstimadaBRL>...</economiaAnualEstimadaBRL>
  <estrategiaDeExecucao>...</estrategiaDeExecucao>
  <tiposDeSolucao><tipo>...</tipo></tiposDeSolucao>
  <notasDoArquiteto>...</notasDoArquiteto>
  <esforcoDeImplementacaoDias>...</esforcoDeImplementacaoDias>
  <ondaDeImplementacao>...</ondaDeImplementacao>
  <ordemNaOnda>...</ordemNaOnda>
</projetoCompleto>
```

Deliberadamente **fora do formato**: `status`/`priority`/`developerId` (isso é o card do Kanban — mudar via XML seria confuso e surpreendente) e `operationalStatus`/`accumulatedSavingBRL`/`operationalStatusUpdatedAt` (métricas de operação pós-entrega, atualizadas em outro fluxo). `companyId` também fica de fora — trocar a empresa de um projeto via reimport de XML é um campo estrutural demais pra esse fluxo; `<empresa>` no XML é só informativo.

## Exportar

100% client-side, sem chamada nova ao servidor: a página de detalhe já tem o `project` completo carregado (via `project.byId`). Uma função nova, `buildProjetoCompletoXml(project: Project): string`, serializa esse objeto pro formato acima (escapando `&`, `<`, `>` como o formato atual já faz) e o botão dispara o download via Blob + link temporário. Todo tag é sempre emitido, mesmo vazio — assim o developer vê a "forma" completa do arquivo mesmo em campos ainda não preenchidos.

## Importar

1. Botão abre um seletor de arquivo (`<input type="file" accept=".xml">`), lê o texto no navegador.
2. Uma função nova, `parseProjetoCompletoXml(xmlText): ParsedProjetoCompleto | { error: string }`, faz só a extração de tags → objeto tipado (sem nenhuma consulta ao banco) — mais simples que o parser do `<solicitacaoDeProjeto>` porque toda resolução de nome→id fica pro servidor (ver abaixo). Validação leniente: tag com valor não reconhecido vira um aviso (`warnings: string[]`) em vez de bloquear o import inteiro.
3. Se `<projetoId>` do arquivo for diferente do projeto aberto na tela, mostra uma confirmação ("Este XML foi exportado de outro projeto — aplicar mesmo assim?") antes de prosseguir.
4. O objeto parseado é enviado pra uma mutation nova, `project.importXml({ projectId, ...campos })`, que faz TUDO server-side numa transação:
   - `area`/`tema`: casa por nome (case-insensitive) contra `ProjectArea`/`ProjectTheme` existentes da empresa; sem match, cria um novo registro (mesmo comportamento que a resolução de "outro" já tem hoje no fluxo de intake).
   - `ferramentaPrincipal`/`tipoDeProjeto`: mesmo find-or-create por nome contra `MainTool`/`ProjectKind`.
   - `pessoasDeInteresse`: cada nome vira uma `Person` da empresa do projeto (find-or-create, reaproveitando o padrão do cadastro de Pessoa criado recentemente).
   - Campos técnicos/solicitação restantes: gravados como recebidos (colunas `String?`/`Float?`/`Int?` simples — sem validação de enum rígida; valor não reconhecido é só armazenado como texto livre, já que não há enum de banco por trás desses campos).
   - Retorna a lista de avisos consolidada (áreas/temas/ferramentas criados, tags não reconhecidas) pro client mostrar num toast.

## Permissões

- Botões "Exportar XML"/"Importar XML" visíveis só quando `viewerRole` for `admin`, `super_admin` ou `developer` (mesma condição que já existe pra mostrar a seção "Diagnóstico técnico").
- `project.importXml` é uma **mutation nova e isolada** em `project.router.ts` (não uma alteração no `update` existente nem no `ARCHITECT_ONLY_FIELDS`) — permite `ADMIN`, `SUPER_ADMIN` e `DEVELOPER`, bloqueia `CLIENT`. Essa é a única via pela qual `developer` pode gravar campos técnicos — o form de edição normal e a tela de Especificação continuam exigindo admin, sem nenhuma mudança.

## Fora de escopo

- Import em lote (zip de vários XMLs) — esse fluxo é sempre um projeto por vez, a partir da página de detalhe já aberta.
- Qualquer mudança no formato/parser/prompt do `<solicitacaoDeProjeto>` existente.
- Dialogs interativos de resolução de ambiguidade (como o import em lote tem hoje) — toda taxonomia sem match é criada automaticamente, sem perguntar, já que é uma ação explícita de admin/developer reimportando um arquivo que eles mesmos editaram.
- Alterar `status`/`priority`/`developerId`/`companyId`/campos de operação pós-entrega via XML.
