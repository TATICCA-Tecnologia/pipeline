# Slides executivos de abertura do deck de diagnóstico (Design)

## Contexto

O deck de diagnóstico (`/api/empresas/[id]/deck`) abre hoje na capa e vai direto para
"Resultados agregados por área" — uma tabela. Os decks e PDFs de referência que a
consultoria usa como modelo abrem com um resumo executivo: uma ou duas páginas que
dizem o que foi feito e qual o resultado, antes de qualquer tabela. Sem isso, quem
recebe o arquivo por e-mail precisa ler metade do material para saber se vale a pena
continuar.

Layout validado com o usuário via mockup (opção B de três alternativas: 1 slide único,
2 slides, 3 slides).

## Requisitos confirmados com o usuário

1. **Dois slides**, inseridos entre a capa e "Resultados agregados por área":
   "O trabalho realizado" e "Os números do diagnóstico".
2. **Sem KPI de investimento** — o slide executivo fica com cinco números:
   oportunidades, áreas, horas de trabalho manual/ano, economia anual e payback.
   Custo tem uma seção inteira mais adiante no deck.
3. **Economia anual soma todas as oportunidades mapeadas**, inclusive as ainda sem
   onda atribuída — casa com a tabela "Resultados agregados por área" que vem em
   seguida. O payback continua sendo calculado só sobre as que têm onda, e o slide
   declara essa diferença numa nota quando ela existe.
4. Nenhuma query nova: todos os dados já são carregados pelo `Promise.all` de
   `buildDiagnosticDeck`.

## Refactor prévio: `src/server/deck/deck-theme.ts`

Os slides novos precisam de `TYPE`, das cores, de `MARGIN_X`/`CONTENT_W` e de
`addTitledSlide`, que hoje moram em `build-diagnostic-deck.ts` (1734 linhas). Um módulo
novo que importe de lá e seja importado por lá cria dependência circular.

Move-se para `deck-theme.ts`, **sem alterar nenhum valor** (recorte puro, os slides
existentes saem idênticos byte a byte):

- Cores: `COLOR_PRIMARY`, `COLOR_ACCENT`, `COLOR_MUTED`, `COLOR_HEADER_BG`,
  `COLOR_HEADER_TEXT`, `COLOR_TABLE_BORDER`, `COLOR_ZEBRA`, `COLOR_SURFACE`,
  `COLOR_SECONDARY`, `COLOR_MUTED_SURFACE`, `COLOR_ACCENT_ON_DARK`, `COLOR_ON_DARK_MUTED`
- Tipografia: `FONT_HEADING`, `FONT_BODY`, `TYPE`
- Layout: `MASTER_CONTENT`, `MASTER_FULL_BLEED`, `MASTER_COVER`, `COVER_BAND_H`,
  `MARGIN_X`, `CONTENT_W`, `CONTENT_TOP_Y`, `CONTENT_TOP_Y_WITH_SUBTITLE`,
  `CONTENT_TOP_Y_TALL_TITLE`
- Logo: `LOGO_ASPECT_RATIO`, `LOGO_DATA_URI`
- Tipos: `Slide`, `TableRow`
- Primitivas: `TABLE_HEADER_OPTS`, `defineDeckTheme`, `addCoverSlide`,
  `addSectionSlide`, `addTitledSlide`, `addSlideTable`

**Permanecem** em `build-diagnostic-deck.ts` os slides de conteúdo — `addProjectSlide`,
`addInterviewsSlide`, `addAreaSummarySlide`, os rankings, cronograma e payback — e os
tipos `Interviews`/`QuantitativeLine`.

`build-existing-automations-deck.ts` passa a importar as primitivas de `deck-theme.ts` e
mantém apenas `addInterviewsSlide`/`addProjectSlide`/`Interviews`/`QuantitativeLine`
vindo de `build-diagnostic-deck.ts` (reúso de slide de conteúdo, não de tema). Hoje ele
importa tudo do deck de diagnóstico, o que faz um deck depender do outro por acidente.

## Refactor prévio: `computeDeckPayback`

O cálculo de payback (curva → data → meses) mora hoje dentro de `addPaybackSlide`. O KPI
executivo precisa do mesmo número, e recalcular em dois lugares deixa os dois slides
livres para divergir por arredondamento.

Extrair uma função pura em `build-diagnostic-deck.ts`:

```typescript
type DeckPayback = {
  curve: PaybackPoint[];
  paybackDate: Date | null;
  /** Meses entre o início do cronograma e a data de payback; null se não atingido. */
  paybackMonths: number | null;
  /** Nº de oportunidades com onda atribuída — base do cálculo. */
  scheduledCount: number;
};

function computeDeckPayback(
  ranking: Ranking,
  settings: PaybackDeckSettings,
  structureCosts: StructureCostItem[]
): DeckPayback
```

Corpo idêntico ao trecho que hoje abre `addPaybackSlide` (linhas 1047–1062):
`computeWaveSchedules` → `toDeckPaybackItems` → `computePaybackCurve` →
`findPaybackDate` → `differenceInCalendarDays(...) / 30.44` arredondado, com piso em 0.
`scheduledCount` = tamanho de `[...wave1, ...wave2]`.

`buildDiagnosticDeck` chama uma vez e passa o resultado para `addExecutiveNumbersSlide` e
para `addPaybackSlide`, que deixa de calcular e passa a receber `DeckPayback` por
parâmetro.

## Dados dos slides

Todos derivados do que `buildDiagnosticDeck` já tem em mãos. Nenhuma alteração em
procedure tRPC.

| Número | Origem |
|---|---|
| Oportunidades | `rankingCombinado.length` |
| Áreas | `areaSummary.length` |
| Horas de trabalho manual/ano | soma de `currentAnnualHours` dos itens de `projects` cujo `id` está em `rankingCombinado` |
| Economia anual | soma de `estimatedAnnualSavingBRL` de `rankingCombinado` |
| Payback (meses) | `computeDeckPayback(...).paybackMonths` |
| Entrevistas realizadas | `interviews.filter(i => i.status === "realizado").length` |
| Pessoas ouvidas | nº de `personId` distintos em `interviews[].participants`, só das realizadas |
| Áreas ouvidas | nomes distintos de `interviews[].area?.name`, só das realizadas |

As horas vêm de `projects` (e não de `areaSummary`) de propósito: `getAreaSummary` só
conta projetos **com área definida**, então usá-lo subestimaria as horas sempre que a
empresa tivesse alguma oportunidade sem área. `rankingCombinado` e `projects` cobrem
todas; o cruzamento por id garante o mesmo recorte de população
(`hasCurrentApplication != "sim"`, status fora de `DONE`/`CANCELLED`) que o ranking já
aplica — `projects` sozinho traz também entregues e cancelados.

"Áreas" no KPI continua sendo `areaSummary.length` (áreas *cobertas por oportunidade*),
que é o mesmo denominador da tabela do slide seguinte.

## Slide 1 — "O trabalho realizado"

`addExecutiveScopeSlide(pres, { opportunityCount, areaCount, manualHoursPerYear, interviews })`,
em `src/server/deck/executive-summary-slides.ts`.

Usa `addTitledSlide` com narrativa fixa (não descreve números, descreve o método — mesma
regra dos outros slides do deck):

> O diagnóstico percorreu as áreas operacionais da empresa para identificar, quantificar
> e priorizar processos com potencial de automação. Cada oportunidade foi levantada
> junto a quem executa a atividade hoje e validada com o gestor da área.

Abaixo, quatro blocos de etapa lado a lado a partir de `CONTENT_TOP_Y_WITH_SUBTITLE`,
cada um com barra de acento à esquerda sobre fundo `COLOR_ZEBRA`, largura
`(CONTENT_W - 3 * 0.25) / 4`:

| Bloco | Rótulo | Valor |
|---|---|---|
| 01 | Entrevistas | `{n} entrevistas` + `{p} pessoas ouvidas` |
| 02 | Mapeamento | `{n} processos detalhados` |
| 03 | Quantificação | `{n} h de trabalho manual/ano` |
| 04 | Priorização | `{n} áreas cobertas` |

Sob os blocos, uma linha `Áreas ouvidas: Financeiro · Fiscal · RH · ...` com os nomes
distintos das entrevistas realizadas.

**Degradação sem dado** — o slide nunca é pulado nem lança erro:
- Sem entrevista com status `realizado`: bloco 01 mostra `—` no lugar dos números e a
  linha "Áreas ouvidas" é omitida.
- Entrevistas realizadas mas todas sem área: a linha "Áreas ouvidas" é omitida.
- Empresa sem nenhuma oportunidade: os blocos 02–04 mostram `0`; o slide continua
  existindo (é o slide de método, não de resultado).

## Slide 2 — "Os números do diagnóstico"

`addExecutiveNumbersSlide(pres, { opportunityCount, areaCount, manualHoursPerYear, totalAnnualSavingBRL, payback })`.

`addTitledSlide` com narrativa:

> Resultado consolidado das oportunidades mapeadas, considerando o cronograma de
> implementação proposto e os custos de desenvolvimento, sustentação e estrutura.

**Faixa de cinco KPIs** em `CONTENT_TOP_Y_WITH_SUBTITLE`, colunas de largura
`CONTENT_W / 5`, cada um com régua superior de 2pt em `COLOR_ACCENT`, valor em
`TYPE.metricValue` e rótulo em `TYPE.eyebrow`/`COLOR_MUTED`:

| KPI | Valor | Cor do valor |
|---|---|---|
| Oportunidades | `24` | `COLOR_PRIMARY` |
| Áreas | `6` | `COLOR_PRIMARY` |
| Trabalho manual/ano | `9.800 h` | `COLOR_PRIMARY` |
| Economia anual | `R$ 1.2M` | `COLOR_ACCENT` |
| Payback | `9 meses` | `COLOR_ACCENT` |

Valores em R$ usam `formatCompactBRL` (já existente em `src/shared/utils/index.ts`) —
`formatCurrency` por extenso não cabe num número de 28pt. Horas formatadas com
`Intl.NumberFormat("pt-BR")` + sufixo ` h`.

Payback não atingido no período calculado: valor `—` e rótulo `Payback não atingido`.

**Curva de payback resumida** ocupando a metade inferior (de ~3.4 até 6.55, deixando
espaço para a nota de rodapé): mesmo `addChart("line", ...)` do slide de payback, com as
mesmas duas séries e cores (`COLOR_MUTED` para custo, `COLOR_ACCENT` para economia),
`showLegend: true` na base, sem rótulos de eixo de categoria (`catAxisHidden: true`) —
aqui a curva é ilustrativa, o slide detalhado vem depois. Curva vazia (nenhum projeto
com onda): o gráfico é omitido e a metade inferior fica com o texto
`Cronograma ainda não definido — nenhuma oportunidade alocada em onda.` em
`COLOR_MUTED`.

**Nota de rodapé**, renderizada apenas quando `payback.scheduledCount < opportunityCount`:

> Economia anual considera as {N} oportunidades mapeadas; o payback é calculado sobre as
> {M} já alocadas nas ondas 1 e 2.

## Ordem final do deck

```
capa
→ O trabalho realizado          (novo)
→ Os números do diagnóstico     (novo)
→ Resultados agregados por área
→ Parte 1 · Priorização das oportunidades
   ...
```

A numeração de página do rodapé vem do master `CONTENT` e se ajusta sozinha.

## Testes

Não há suíte de testes automatizados para os decks — a verificação é a mesma dos passos
anteriores do blueprint: gerar o `.pptx` em `admin/empresas/[id]` e conferir os dois
slides novos. Cenários a cobrir manualmente:

1. Empresa com entrevistas, áreas e ondas definidas — caminho completo.
2. Empresa sem nenhuma entrevista cadastrada — bloco 01 com `—`, sem linha de áreas.
3. Empresa sem nenhuma oportunidade alocada em onda — KPI de payback `—` e a metade
   inferior do slide 2 com a mensagem de cronograma não definido.
4. Empresa com oportunidades sem área — horas do KPI maiores que a soma da tabela por
   área do slide seguinte, e a nota de rodapé presente.

## Fora de escopo

- Automações já existentes/entregues: os KPIs contam só a população de oportunidades em
  pipeline, mesma população do ranking e da tabela por área. O deck de automações
  existentes é outro arquivo.
- Terceiro slide de "por onde começar" com o top 5 — descartado na escolha do layout;
  essa informação já está no ranking combinado.
- Slides executivos no deck de automações existentes
  (`build-existing-automations-deck.ts`) — este design cobre só o de diagnóstico.
- Qualquer mudança nos procedures tRPC ou no schema.
