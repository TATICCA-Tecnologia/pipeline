# Slide de ambiente das automações existentes

Data: 2026-08-14

## Problema

O slide executivo (`src/shared/components/project-executive-slide.tsx`) foi desenhado
para vender uma oportunidade: metade da área é radar qualitativo, tabela de horas e
benefícios esperados. Ele é reaproveitado sem nenhuma diferença para a população de
automações **já existentes**, acessível pelo card do projeto, pelo modal de detalhes e
pela página `admin/empresas/[id]/automacoes-existentes`.

Para essa população o leitor mudou. Quem recebe o slide de uma automação em produção é
o TI do cliente, com foco em segurança, e a pergunta dele não é "vale a pena fazer" —
é **o que exatamente está rodando no meu ambiente**: em que máquina, com qual conta, em
que sistemas toca, de onde vêm e para onde vão os dados, quem sustenta e o que acontece
se parar.

O modelo já guarda quase tudo isso. Os campos foram criados pelas specs de
`2026-07-28-ficha-sustentacao-automacoes-existentes-design.md` e
`2026-08-11-catalogo-qualidade-automacoes-design.md`, mas só chegaram ao deck `.pptx`
(`addFichaTecnicaSlide`). Na tela, o slide executivo mostra cinco linhas soltas de
sustentação dentro de "Situação atual" e ignora sistemas-alvo, contas, fluxo de dados,
sigilo, contingência, ativo, cargo/setor do responsável, substituto e pessoas de
interesse.

## Decisões de escopo confirmadas com o usuário

1. **As duas superfícies.** Reformular o slide React **e** espelhar no deck `.pptx`
   (`addFichaTecnicaSlide` em `build-existing-automations-deck.ts`).
2. **Duas páginas.** Página 1 executiva (enxuta), página 2 técnica ("Ficha de
   ambiente"). Não vira uma página só comprimida nem três páginas.
3. **Nenhum campo novo.** Puramente apresentação: sem migration, sem mexer em
   formulário, sem mexer no XML. Só passa a exibir o que já existe.
4. **Os ponteiros de acesso entram.** `currentApplicationAccessReference` (onde a
   credencial mora) e `accessNotes` de cada sistema-alvo, hoje deliberadamente fora do
   deck, passam a aparecer na página técnica. O público é o TI de segurança e ele
   precisa disso para auditar. Continua não existindo campo de senha em lugar nenhum do
   modelo — o que entra é o ponteiro, nunca a credencial.
5. **Campo vazio é omitido.** Sem "Não informado", sem traço, sem bloco de lacunas, sem
   semáforo de completude. Recusado explicitamente. A página mostra o que existe.
6. **Tudo tem que caber no slide.** Nada de "+N adicionais": listas longas se resolvem
   por reflow de colunas e escalonamento de densidade, não por descarte de itens.

## Critério de "automação existente"

O predicado já existe: `isExistingAutomation` em
`src/shared/lib/opportunity-classification.ts`, hoje usado pelo badge do card do Kanban e
pelo filtro da tela de Projetos. A página técnica reusa essa função — não cria uma segunda.

Atenção ao valor de status, que é a armadilha aqui: o predicado compara com
`"completed"`, e **não** com `"DONE"`. `DONE` é o valor cru do enum do Prisma; tudo que sai
do router passa por `toFrontendStatus` (`src/server/trpc/mappers.ts:51`) e chega ao
componente já como `"completed"`. Um predicado que comparasse com `"DONE"` compilaria sem
erro — as duas são `string` — e classificaria errado toda automação entregue que não tenha
`hasCurrentApplication = "sim"`, em silêncio.

No deck `.pptx` o critério continua sendo a cláusula `where` declarativa do `findMany`
(`OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }]`), que roda contra o enum do
Prisma e por isso usa `"DONE"` corretamente. As duas expressões precisam mudar juntas; um
comentário no `where` amarra uma à outra.

Projeto que não satisfaz o predicado renderiza exatamente o slide de hoje, sem nenhuma
alteração de comportamento.

## Página 1 — executiva

Mantém a estrutura atual (cabeçalho com empresa/título/área/chips, "O processo hoje",
"Principais ações da automação", "Benefícios esperados", "Avaliação Quantitativa" e o
radar qualitativo), com três mudanças:

- **Migram para a página 2** as cinco linhas técnicas hoje dentro de "Situação atual":
  *Onde roda*, *Quem desenvolveu*, *Responsável hoje*, *Onde ficam os acessos*, *Em
  produção desde*. Sobram em "Situação atual" apenas *Abordagem*, *Aplicação existente
  hoje* e *Público-alvo*.
- **Entram na tabela quantitativa** dois dados que hoje só existem no `.pptx` e fazem
  falta na tela: **Status operacional** (`operationalStatus` → Ativo / Pausado / Com
  problema) e **Economia acumulada (real)** (`accumulatedSavingBRL`). Seguem a regra de
  omissão: sem valor, a linha não aparece.
- Nada mais muda. Para projeto de oportunidade a página 1 é literalmente o slide atual.

## Página 2 — Ficha de ambiente

Cabeçalho compacto: mesma identificação de empresa e título da página 1, com a tarja
"Ficha de ambiente — o que existe hoje" no lugar do bloco de chips, para quem folheia
saber de imediato que são duas páginas da mesma automação (mesmo papel que a `tag`
"Ficha técnica" cumpre no deck).

### Faixa de fluxo (topo, largura inteira)

Três caixas ligadas por seta, respondendo "o que está acontecendo" antes de qualquer
tabela:

| Caixa | Campos |
|---|---|
| **Entrada** | `currentApplicationDataInput` (label da taxonomia) + `currentApplicationDataInputDetails` |
| **Onde roda** | hospedagem (`currentApplicationHosting` + `HostingCustom`), `currentApplicationAssetId`, `robotSchedule`, `currentApplicationLiveSince` |
| **Saída** | `currentApplicationDataOutput` + `currentApplicationDataOutputDetails` |

Caixa sem nenhum campo preenchido não é desenhada, e a seta correspondente some com
ela. Faixa inteira vazia → a faixa não existe e os blocos abaixo sobem.

### Coluna esquerda

**Pessoas**
- Quem desenvolveu — `currentApplicationAuthor`
- Responsável hoje — `currentApplicationOwner`, com `currentApplicationOwnerRole` e
  `ownerArea.name` na mesma linha quando existirem
- Substituto — `currentApplicationBackupOwner`
- Pessoas de interesse — `peopleOfInterest[]`, nome + cargo

**Acessos e contingência**
- Onde ficam os acessos — `currentApplicationAccessLocation` (label da taxonomia)
- Referência — `currentApplicationAccessReference`
- Se parar — `currentApplicationContingencyActions` (labels) +
  `currentApplicationContingencyDetails`

### Coluna direita

**Sistemas em que atua** — tabela a partir de `targetSystems[]`: nome (catálogo ou
`customName`), categoria, `accessPoint`, `accessNotes`.

**Contas utilizadas** — tabela a partir de `automationAccounts[]`: `username`,
`accountType` (label), sistema vinculado, `ownerName`. `notes` entra como sub-linha
quando existir.

**Dados sigilosos** — `handlesSensitiveData` (label) + `sensitiveDataCategories`
(labels) + `sensitiveDataDetails`.

### Regra de omissão

Vale para as duas superfícies e é a regra estruturante do layout:

1. Campo sem valor não renderiza — nem rótulo, nem placeholder.
2. Bloco cujos campos sumiram todos desaparece; os blocos seguintes da mesma coluna
   sobem para ocupar o espaço.
3. Página 2 sem nenhum dado não é criada. Automação existente cuja ficha nunca foi
   preenchida continua com uma página só.

No `.pptx` isso substitui o comportamento atual de escrever "Não informado" em toda
célula vazia, e obriga a geometria fixa (`FICHA_ROW1_Y`/`ROW2_Y`/`ROW3_Y`) a virar um
cursor Y por coluna, que avança apenas pelos blocos efetivamente desenhados.

## Como tudo cabe

Nenhum item é descartado. A adaptação é de layout, em três níveis, aplicados nesta
ordem.

**1. Reflow de colunas.** Lista com até 6 itens ocupa uma coluna; a partir de 7 quebra
em duas sub-colunas dentro do próprio bloco, dobrando a capacidade sem tocar na fonte.

**2. Escalonamento de densidade.** Um tier calculado do volume total da página
(`targetSystems.length + automationAccounts.length + peopleOfInterest.length`) baixa
fonte e altura de linha juntos:

| Tier | Volume | Corpo (tela) | Corpo (.pptx) |
|---|---|---|---|
| Confortável | ≤ 12 | 13px | 9pt |
| Denso | 13–24 | 11px | 8pt |
| Compacto | ≥ 25 | 9,5px | 7pt |

**3. Auto-shrink (só na tela).** `useFitToSlide` continua como última rede. O piso muda
de `MIN_SLIDE_SCALE = 0.5` para `0.35` **na página técnica**: com o piso atual, conteúdo
que precisasse de menos de 50% seria cortado em silêncio pelo `overflow:hidden` da
página, quebrando a garantia que o comentário do próprio hook descreve. A página 1
mantém 0.5 — o conteúdo dela tem teto conhecido.

No `.pptx` não existe equivalente ao shrink global: o PowerPoint recalcula a altura de
cada linha de tabela ao abrir o arquivo, ignorando o valor reservado pelo módulo. Lá os
níveis 1 e 2 são a solução completa, e o `fichaTruncate` por célula continua existindo —
ele garante uma linha por célula, que é o que impede um `accessPoint` longo de empurrar
o bloco de baixo. O que sai é o descarte de linhas inteiras com aviso "+N adicionais".

### O que a implementação acrescentou

Quatro ajustes que só apareceram ao **medir** o arquivo gerado — descompactando o `.pptx` e
lendo as coordenadas do XML, em vez de confiar nas alturas estimadas. Todos no lado `.pptx`:

1. **Terceira sub-coluna no tier compacto.** Duas colunas não bastavam: com 20 sistemas e
   12 contas o cursor da coluna direita chegava a 6,60" e o bloco de sigilo recebia altura
   **negativa**, que o pptxgenjs grava como `<a:ext cy="-64008"/>` — inválido pelo
   `ST_PositiveCoordinate` do ECMA-376, ou seja, um arquivo que o PowerPoint pode recusar
   abrir. `splitIntoColumns` ganhou o parâmetro `maxColumns`; o deck passa 3 no tier
   compacto e o React fica em 2 (lá o auto-shrink ainda pega o resto, e a área é estreita).
2. **O bloco de sigilo não tem coluna fixa** — vai para a que tiver o cursor mais raso.
   Prendê-lo à direita era o que produzia a altura negativa.
3. **Piso na altura do bloco de texto**, para que altura negativa seja estruturalmente
   impossível independentemente do que o cursor faça.
4. **Orçamento de truncamento por tier.** `FICHA_TABLE_CHARS_PER_INCH` era constante única
   calibrada para 9-10pt e não acompanhava a queda para 7pt do tier compacto: 11 dos 20
   sistemas saíam como `"Sistema 1…"`, indistinguíveis — informando tão pouco quanto o
   "+N adicionais" que esta feature removeu. A divisão de largura da célula também passou
   de 45/55 para 55/45: a segunda célula é URL, que trunca em qualquer largura; a primeira
   é a identidade da linha, e num inventário duas linhas indistinguíveis são pior que uma
   URL cortada.

**Limite conhecido.** `addListBlock` não tem teto inferior. Até **30 sistemas + 18 contas**
o layout fecha em 6,850", dentro da régua de rodapé (6,92"); o vazamento começa entre
30+18 e 40+24 (medido: 40+24 → 7,02"; 60+36 → 8,10").
O arquivo continua estruturalmente válido — o piso do item 3 garante isso — mas vaza
visualmente. Uma automação com 60 sistemas não é forma real, então não gastamos uma quinta
alavanca nisso. Se vier a ser preciso, o caminho é derivar um teto de linhas em
`addListBlock` a partir de `FICHA_BOTTOM_Y - y`, forçando uma quarta coluna em vez de vazar.

## Origem dos dados na tela

Nenhuma mudança de servidor é necessária do lado React: `project.byId` — a query que o
`ProjectExecutiveSlideModal` já dispara ao abrir — retorna `peopleOfInterest` (com
`person`), `targetSystems` (incluindo `accessNotes`) e `automationAccounts` (incluindo
`ownerName` e `notes`), além de todos os campos `currentApplication*`. A página 2 só
consome o que já chega.

O `select` do deck `.pptx` é o único que precisa crescer, porque ele monta o próprio
`findMany` em vez de reusar o router (ver "Mudanças no deck .pptx").

## Estrutura de arquivos

`project-executive-slide.tsx` tem 514 linhas e já mistura primitiva de página, gráfico e
conteúdo; acrescentar uma segunda página inteira nele piora um arquivo que já está no
limite. A reformulação separa por responsabilidade:

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/lib/existing-automation.ts` | `isExistingAutomation(project)` + builders dos blocos (listas já filtradas pela regra de omissão) e cálculo do tier. Sem JSX — é a camada testável. |
| `src/shared/components/slide/slide-page.tsx` | Primitiva da página 16:9: tarjas azul/teal, `useFitToSlide` com piso parametrizável. |
| `src/shared/components/slide/rating-radar-chart.tsx` | O radar, hoje inline. |
| `src/shared/components/slide/environment-sheet-page.tsx` | A Ficha de ambiente. |
| `src/shared/components/project-executive-slide.tsx` | Orquestra: página 1 sempre, página 2 quando o predicado bate e há dado. |

Cada unidade responde às três perguntas de fronteira: `existing-automation.ts` decide
*o que* aparece e não sabe desenhar; `slide-page.tsx` decide *como a página se comporta*
e não sabe o que tem dentro; `environment-sheet-page.tsx` consome os dois.

## Impressão

O CSS de print em `src/app/globals.css` assume uma página só
(`.executive-slide-print-root`, `visibility: visible`, comentário explícito de "o
conteúdo sempre cabe numa página só"). As duas páginas recebem a mesma classe e entra
uma regra de quebra entre elas:

```css
.executive-slide-print-root + .executive-slide-print-root {
  break-before: page;
}
```

Sem isso a impressão sai com a página 2 cortada. O comentário do bloco é atualizado.

## Modo demonstração

Todo campo novo passa por `maskFreeText` do `useDemoMode`. Isso pesa mais aqui do que no
slide atual, porque quatro dos campos que entram são exatamente os que não podem
aparecer numa demonstração para outro cliente:

- `currentApplicationAssetId` — hostname, IP ou patrimônio
- `username` das contas — login real
- `accessPoint` dos sistemas — URL ou instância
- `currentApplicationAccessReference` e `accessNotes` — onde a credencial mora

Também mascarados: nomes de pessoas (`currentApplicationAuthor`,
`currentApplicationOwner`, `currentApplicationBackupOwner`, `ownerName` das contas,
`peopleOfInterest[].name`), `currentApplicationHostingCustom`, `notes` das contas e
todos os campos `*Details`.

## Mudanças no deck .pptx

**`addFichaTecnicaSlide`** é reescrito com a mesma estrutura da tela: faixa de fluxo no
topo, Pessoas / Acessos e contingência à esquerda, Sistemas / Contas / Sigilo à direita,
com cursor Y por coluna.

**O `select` do `findMany`** cresce para trazer o que hoje não busca — e os tipos
`FichaTargetSystemRow` / `FichaAutomationAccountRow` acompanham:

- `accessNotes` de cada `targetSystem`
- `ownerName` e `notes` de cada `automationAccount`
- `currentApplicationAccessReference`
- `robotSchedule`
- `peopleOfInterest` (nome + cargo)

**`hasFichaTecnicaData`** ganha os campos novos como critério de entrada (hoje o
comentário justifica excluir `accessReference` porque ele nunca sai no deck — a
justificativa deixa de valer).

**`addProjectSlide`** perde as `extraLines` que migram para a ficha (*Onde roda*, *Quem
desenvolveu*, *Responsável hoje*, *Onde ficam os acessos*, *Em produção desde*),
mantendo *Status operacional* e *Economia acumulada (real)* — espelhando a repartição da
tela.

**`addInventorySlide`** não muda: é a visão de uma linha por automação, que continua
útil como índice antes das fichas individuais.

## Fora de escopo

- Qualquer campo novo no `Project` — migration, formulário e XML ficam intocados.
- O slide executivo de projetos de oportunidade.
- Os slides agregados do deck (resumo por área, rankings, entrevistas, inventário).
- O deck de diagnóstico (`build-diagnostic-deck.ts`), exceto pelas `extraLines` que
  `build-existing-automations-deck.ts` passa para `addProjectSlide`.

## Verificação

- `pnpm build` (ou `npx tsc --noEmit`) limpo.
- `scripts/preview-ficha-tecnica-slide.ts` regenerado e aberto, cobrindo os três tiers
  de densidade e um caso com metade dos campos vazios, confirmando que blocos omitidos
  não deixam buraco nem sobreposição.
- Slide React aberto no modal para: automação existente completa, automação existente
  com ficha vazia (deve ter uma página só), e projeto de oportunidade (deve estar
  idêntico ao de hoje).
- Impressão em PDF das duas páginas, confirmando a quebra.
- Modo demonstração ativo, confirmando que hostname, username, `accessPoint` e
  referência de acesso saem mascarados.
