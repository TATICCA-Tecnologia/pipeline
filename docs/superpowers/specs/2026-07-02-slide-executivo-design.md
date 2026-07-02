# Slide Executivo do Projeto (Design)

## Contexto

Hoje o diagnóstico qualitativo de um processo (5 notas de 1 a 5: redução de erros, criticidade, impacto interno, impacto externo, atendimento a políticas) só aparece como texto simples dentro de `ProjectDetailSections` ("Avaliações"). O usuário quer uma visualização executiva, inspirada num slide de PowerPoint que a TATICCA já usa hoje fora da ferramenta (com um gráfico de aranha/radar das 5 notas), disponível com um clique a partir de qualquer projeto.

A imagem de referência original não foi encontrada (não está no repositório, downloads, desktop ou documentos do usuário — provavelmente foi enviada em outra conversa). O layout deste documento foi desenhado do zero em conjunto com o usuário via mockups iterativos (ver "Processo de design" abaixo), não é uma cópia da imagem original.

## Requisitos confirmados com o usuário

1. **Só admin/desenvolvedor.** O recurso inteiro (botão de acesso e o slide em si) nunca aparece para o papel `client` — nem o ícone/botão de entrada, nem o conteúdo. Diferente do resto do app, aqui não há uma versão "capada" para cliente: simplesmente não existe para ele.
2. **Dois pontos de entrada:** um botão "Slide Executivo" no modal "Detalhes do projeto" (ao lado de "Especificação" e "Ver detalhes") e um ícone direto no card do Kanban — ambos condicionados a `user?.role === "admin" || user?.role === "developer" || user?.role === "super_admin"`.
3. **Sem valores em Reais (R$).** Nenhuma cifra monetária aparece no slide — só métricas de tempo/operação (horas, periodicidade, colaboradores).
4. **"Área entrevistada" reaproveita Área + Tema já existentes** (`project.projectType`, que já concatena área/tema/plataforma) — não é um campo novo no formulário/XML.
5. **Nota não preenchida (1 dos 5 campos) vira 3 no gráfico, só na exibição** — nunca é gravada no banco como se fosse uma avaliação real. O eixo correspondente fica visualmente marcado como "padrão, ainda não avaliado" (cor diferente + legenda), para o arquiteto saber que precisa ajustar.
6. **Botão de imprimir/exportar já nesta entrega**, usando `window.print()` do navegador (sem biblioteca nova) — o usuário escolhe "Salvar como PDF" no diálogo nativo do navegador.
7. **Componente isolado e reutilizável.** `ProjectExecutiveSlide` recebe só os dados de um projeto — não depende do modal que o hospeda. Isso é deliberado: o usuário já sinalizou que no futuro vai querer selecionar vários projetos, combiná-los numa análise/PDF único e possivelmente somar ganhos entre eles. Esse componente isolado é o que vai permitir reaproveitar a mesma peça visual nesse relatório futuro, sem redesenhar nada.
8. Seções vazias (ex.: projeto sem benefícios selecionados) somem do slide em vez de mostrar "Não informado" — o objetivo é a estética de slide de apresentação, não um formulário de dados completo (diferente de `ProjectDetailSections`, que propositalmente mostra tudo).

## Fora de escopo (direção futura, não construir agora)

- Selecionar múltiplos projetos e combiná-los num relatório/PDF único.
- Somar ganhos (horas ou financeiro) entre vários projetos.
- Geração de PDF no servidor ou biblioteca de exportação além do `window.print()` do navegador.
- Editar dados a partir do slide (é só visualização).

## Processo de design

O layout foi validado com o usuário através de 6 iterações de mockup estático (HTML/SVG) via o companheiro visual de brainstorming, nesta ordem:
1. v1: primeira proposta (cabeçalho, resumo à esquerda, números+gráfico à direita) — aprovado no geral, mas com valor em R$ (removido depois).
2. v2: removido R$, tipografia maior — usuário apontou vão vazio entre cabeçalho e conteúdo (colunas centralizadas verticalmente).
3. v3: números movidos para uma faixa full-width logo abaixo do cabeçalho — usuário pediu para manter os números na metade direita mesmo, só corrigir o alinhamento.
4. v4: números de volta à direita (grade 2×2 acima do gráfico), badges de prazo/prioridade removidos do rodapé, colunas alinhadas ao topo (sem centralizar) — aprovado como estrutura geral.
5. v5/v6: foco no gráfico de aranha — rótulos dos eixos estavam cortando nas bordas do SVG; corrigido aumentando a margem e encurtando os rótulos dos eixos especificamente ("Criticidade" em vez de "Criticidade do processo", "Políticas" em vez de "Atendimento a políticas" — só no gráfico; o texto completo continua em `ProjectDetailSections`). Adicionado selo com o número da nota em cada vértice.

v6 é o layout final aprovado.

## Layout do slide (v6, aprovado)

Proporção 16:9 (pensado para eventualmente ocupar a tela cheia / virar uma página de PDF em paisagem).

**Cabeçalho** (topo, largura cheia):
- Nome da empresa, pequeno, discreto, uppercase (`project.companyName`)
- Título do processo, grande, negrito (`project.title`)
- "Área entrevistada — `<Área/Tema>`", onde `<Área/Tema>` = `project.projectType` com o sufixo `" · Plataforma: ..."` removido (`project.projectType.split(" · Plataforma")[0]`)

**Coluna esquerda** (alinhada ao topo, sem centralizar verticalmente):
- "O processo hoje" — `project.description`
- "Situação atual" — resumo de uma linha combinando `hasExistingSystem` (rótulo resolvido) + `hasCurrentApplication` (rótulo resolvido) + `targetAudience`, separados por " · "; a linha inteira some se nenhum desses três campos tiver valor
- "Construção" — `solutionTypes` (rótulos resolvidos, `SOLUTION_TYPES`) + `executionStrategy` (rótulo resolvido, `EXECUTION_STRATEGIES`), separados por " · "; some se ambos vazios
- "Benefícios esperados" — `benefits` (rótulos resolvidos, `BENEFIT_OPTIONS`), separados por " · "; some se vazio

**Coluna direita** (alinhada ao topo):
- Grade 2×2 de números grandes, todos opcionais individualmente (cada célula some se o dado não existir):
  - Horas gastas por ano hoje (`currentAnnualHours`)
  - Periodicidade (rótulo resolvido de `processFrequency`, via `PROCESS_FREQUENCIES`)
  - Colaboradores envolvidos (`peopleInvolved`)
  - Economia estimada em horas/mês (`monthlyHoursSaved`, formatado como "Xh/mês", cor verde para diferenciar como ganho)
- Gráfico de aranha (recharts `RadarChart`) com as 5 notas, eixos com rótulos curtos ("Redução de erros", "Criticidade", "Impacto interno", "Impacto externo", "Políticas") e o valor numérico em um selo (badge) em cada vértice. Nota ausente = 3 no gráfico, badge em cinza (`--muted`) em vez de roxo/indigo (`--primary`), com uma legenda pequena abaixo do gráfico: "Notas em cinza: valor padrão (3), ainda não avaliado."

**Rodapé** (só quando impresso/exportado, escondido em tela): nenhum por enquanto — não há requisito para isso ainda.

## Botão de imprimir/exportar

Um botão "Imprimir / Exportar PDF" no cabeçalho do modal que hospeda o slide, chamando `window.print()`. Um bloco `@media print` dedicado:
- Esconde toda a UI do modal (cabeçalho "Detalhes do projeto", botões, bordas do modal) — só o conteúdo do `ProjectExecutiveSlide` é impresso
- Define `@page { size: landscape; }`
- Aplica `page-break-after: always` no container do slide — isso é o que permite, no futuro, renderizar múltiplos slides em sequência e imprimir todos de uma vez sem trocar de mecanismo

## Onde o slide "mora" tecnicamente

Um novo componente puramente apresentacional, `src/shared/components/project-executive-slide.tsx`, exportando `ProjectExecutiveSlide({ project }: { project: Project })`. Não busca dados sozinho, não depende de contexto de modal — só renderiza a partir do `Project` recebido.

Por enquanto, ele é hospedado dentro de um modal "full" (mesmo sistema de modal já usado por `ProjectDetailsModal`), com o mesmo padrão de buscar dados completos via `trpc.project.byId` (para garantir que os dados estejam atualizados, mesmo que o card do Kanban só tenha a versão resumida). O usuário confirmou que, no futuro, isso vai evoluir para fazer parte de um PDF combinando vários processos — a escolha de manter `ProjectExecutiveSlide` como componente isolado (sem soar dados, sem UI de modal) é o que viabiliza esse reaproveitamento sem redesenho.

## Resolução de valores

Reaproveita o padrão já estabelecido em `ProjectDetailSections`/`project-taxonomy.ts`:
- `resolveLabel(value, options)` para campos de chave conhecida (`hasExistingSystem`, `hasCurrentApplication`, `processFrequency`, `solutionTypes` item a item, `executionStrategy`)
- `BENEFIT_OPTIONS` resolvido por `.key`

## Dados ausentes (fora das notas)

Diferente de `ProjectDetailSections` (que mostra "Não informado" para tudo), no slide cada bloco/linha/número **some inteiramente** se não tiver dado — o objetivo é a estética limpa de um slide de apresentação, não um formulário completo de auditoria.
