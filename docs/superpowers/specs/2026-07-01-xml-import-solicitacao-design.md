# Importação de Solicitação de Projeto via XML (Design)

## Contexto

Hoje, cada projeto/oportunidade é criado preenchendo o formulário multi-etapas "Solicitar Projeto" (`/cliente/solicitar`) campo a campo. Quando já existe um diagnóstico pronto (ex.: um relatório de consultoria como o da Marilan, com dezenas de processos já levantados e avaliados), preencher isso manualmente na ferramenta, processo por processo, é repetitivo.

Este documento cobre: importar um arquivo XML já preenchido pra criar um projeto direto, sem passar pelo formulário; disponibilizar um modelo XML em branco pra download; e uma página de ajuda explicando cada tag.

## Requisitos confirmados com o usuário

1. **Um arquivo = um projeto.** Não é importação em lote de vários projetos num único arquivo.
2. **Quem importa**: qualquer pessoa que já acessa "Solicitar Projeto" hoje — cliente, ou Super Admin visualizando como cliente. Mesmo nível de permissão, mesma tela.
3. **Campos no XML**: exatamente os campos que o formulário "Solicitar Projeto" já coleta hoje (incluindo os operacionais adicionados recentemente: colaboradores envolvidos, duração por execução, periodicidade). **Não incluem** os campos técnicos/financeiros (Complexidade, Agendamento do robô, Saving Estimado) — esses continuam exclusivos da etapa de "Configuração técnica", preenchida depois por admin/arquiteto na ferramenta.
4. **Anexos de arquivo ficam de fora** do XML — podem ser adicionados depois, na tela do projeto já criado.
5. **Fluxo de upload**: cria o projeto diretamente ao subir o arquivo válido, sem tela de revisão/edição intermediária. Erros de validação impedem a criação e mostram uma mensagem específica de qual tag está errada.
6. **Sem nova dependência no backend**: o XML é lido no navegador (`DOMParser`, nativo), convertido pro mesmo formato que o formulário já envia hoje, e a criação usa a mutação `project.create` que já existe — sem endpoint novo, sem duplicar validação.
7. Ideia registrada para o futuro, **fora de escopo agora**: uma "taxa horária" configurável que permitiria calcular automaticamente o Saving Estimado a partir das horas anuais já informadas no XML — hoje esse cálculo ainda depende do arquiteto/admin saber o custo/hora, que não faz parte deste formulário.

## Mapeamento de tags

Elemento raiz `<solicitacaoDeProjeto>`. Tags marcadas com **★** são obrigatórias — se vierem vazias ou ausentes, a importação falha.

**Duas regras diferentes para campos de menu, dependendo do campo:**
- `<area>`, `<tema>` e `<publicoAlvo>` têm opção "Outro" no formulário (com um campo de texto customizado). Nesses três, se o valor não bater com nenhum rótulo conhecido, a importação **não falha** — trata automaticamente como "Outro", usando o texto informado como valor customizado, exatamente como aconteceria se a pessoa escolhesse "Outro" e digitasse esse texto no formulário.
- `<plataforma>`, `<processoExistente>`, `<periodicidade>` e `<urgencia>` **não têm** opção "Outro" no formulário — são um conjunto fixo de valores. Nesses quatro, um valor que não bata com nenhum rótulo conhecido **é erro** (a importação falha, listando os valores aceitos), já que não existe um jeito de gravar um valor customizado para esses campos hoje.

| Tag XML | Campo interno | Tipo / formato | Observação |
|---|---|---|---|
| `<empresa>` | `companyId` (resolvido) | texto | Nome de uma das empresas vinculadas ao usuário. Se ele só tiver uma empresa, essa tag pode ficar vazia/ausente (usa a única automaticamente). Se tiver 2+ e não bater com nenhuma, erro. |
| `<titulo>` ★ | `title` | texto | Nome do processo. |
| `<area>` ★ | `projectArea`/`customProjectArea` | texto | Comparado (sem diferenciar maiúsculas/minúsculas) com o rótulo visível no menu "Área". Se não bater com nenhuma opção conhecida, vira automaticamente "Outro" usando o texto informado como `customProjectArea`. |
| `<tema>` ★ | `projectTheme`/`customProjectTheme` | texto | Mesma lógica de `<area>`, mas comparado só com os temas daquela área específica. |
| `<plataforma>` | `platform` | texto | Comparado com o rótulo do menu "Plataforma" (ex.: "Web (desktop e celular)"). Se vazio, usa o valor padrão do formulário (Desktop). |
| `<descricao>` ★ | `description` | texto | Objetivo/problema que o processo resolve. |
| `<publicoAlvo>` | `targetAudience`/`customTargetAudience` | texto | Mesma lógica de "Outro" de `<area>`. |
| `<numeroUsuarios>` | `expectedUsers` | texto livre | Ex.: "10 funcionários". |
| `<processoExistente>` | `hasExistingSystem` | texto | Comparado com os rótulos: "Não, projeto do zero" / "Sim, quero substituir" / "Sim, quero integrar/migrar dados" / "Sim, quero melhorar o existente". |
| `<detalhesProcessoAtual>` | `existingSystemDetails` | texto livre | |
| `<colaboradoresEnvolvidos>` | `peopleInvolved` | número inteiro | |
| `<duracaoPorExecucao>` | `taskDurationHours` | número (horas) | Soma de todos os envolvidos, mesma regra já usada no formulário. |
| `<periodicidade>` | `processFrequency` | texto | Comparado com: "Diário", "Duas vezes por semana", "Três vezes por semana", "Semanal", "Mensal", "Anual". |
| `<narrativaDoProcesso>` | `projectNarrative` | texto livre | |
| `<funcionalidades><funcionalidade>...</funcionalidade></funcionalidades>` | `features` | lista de texto | Uma tag `<funcionalidade>` por item. |
| `<beneficios><beneficio>...</beneficio></beneficios>` | `benefits` | lista de texto | Cada `<beneficio>` comparado com os rótulos das opções de benefício (ex.: "Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho)"). Item que não bater com nenhum rótulo conhecido gera erro nomeando o item inválido. |
| `<detalhesBeneficios>` | `benefitsDetails` | texto livre | |
| `<horasEconomizadasPorMes>` | `monthlyHoursSaved` | número | |
| `<avaliacaoReducaoErros>` | `ratingErrorReduction` | número 1-5 | |
| `<avaliacaoCriticidadeProcesso>` | `ratingProcessCriticality` | número 1-5 | |
| `<avaliacaoImpactoInterno>` | `ratingInternalImpact` | número 1-5 | |
| `<avaliacaoImpactoExterno>` | `ratingExternalImpact` | número 1-5 | |
| `<avaliacaoAtendimentoPoliticas>` | `ratingCompliance` | número 1-5 | |
| `<urgencia>` | `urgency` | texto | Comparado com os rótulos do menu de urgência (ex.: "Alta — próximo mês"). |
| `<prazoLimite>` | `deadline` | data `AAAA-MM-DD` | |
| `<informacoesAdicionais>` | `additionalInfo` | texto livre | |

## Fluxo de importação

1. Na tela "Solicitar Projeto", um botão "Importar XML" abre um seletor de arquivo.
2. O navegador lê o arquivo como texto e faz o parse com `DOMParser` (nativo, sem biblioteca nova).
3. Cada tag é lida e convertida pro mesmo formato de objeto que a função `addProject` (já existente) espera — a mesma função usada pelo botão "Enviar solicitação" do formulário normal.
4. Antes de chamar `addProject`, a tela resolve `<empresa>` comparando com a lista de empresas do usuário (já carregada via `listMyCompanies`, a mesma usada pelo formulário) e resolve os campos de menu (`<area>`, `<tema>`, `<plataforma>`, etc.) comparando com os rótulos conhecidos.
5. Se alguma resolução falhar (empresa ambígua, tag obrigatória vazia, valor de menu não reconhecido sem opção "Outro"), a importação para ali — nenhuma chamada ao servidor é feita — e uma mensagem de erro específica aparece (ex.: "A tag `<periodicidade>` tem o valor 'toda hora', que não é reconhecido. Valores aceitos: Diário, Duas vezes por semana, Três vezes por semana, Semanal, Mensal, Anual.").
6. Se tudo resolver, chama `addProject` normalmente — os mesmos erros que o formulário já trata hoje (ex.: falha de rede) se aplicam do mesmo jeito.
7. Em caso de sucesso: mesmo comportamento do envio manual (mensagem de sucesso, redireciona pra `/cliente`).

## Modelo em branco e ajuda

- **Modelo em branco**: um arquivo XML estático (`solicitacaoDeProjeto`, todas as tags presentes e vazias, incluindo os agrupadores `<funcionalidades>`/`<beneficios>` com um item de exemplo comentado), disponível como link de download na mesma tela.
- **Página de ajuda**: nova página (ex.: `/cliente/solicitar/ajuda-xml`), acessível por um link na tela de "Solicitar Projeto", listando cada tag da tabela acima — nome, se é obrigatória, o que significa, e os valores aceitos. As listas de valores aceitos (áreas, temas, plataformas, etc.) são buscadas das mesmas constantes que os menus suspensos do formulário já usam, então a página nunca fica desatualizada em relação ao formulário.

## Fora de escopo (confirmado)

- Importação de vários projetos num único arquivo (lote).
- Campos técnicos/financeiros (Complexidade, Agendamento do robô, Saving Estimado) no XML — continuam exclusivos da etapa do arquiteto.
- Anexar arquivos via XML.
- Tela de revisão/edição entre o upload e a criação do projeto.
- Taxa horária configurável para calcular o Saving automaticamente a partir das horas informadas.
- Exportar um projeto já existente de volta para XML (esta spec cobre só importação).
