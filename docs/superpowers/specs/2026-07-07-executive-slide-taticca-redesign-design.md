# Slide Executivo — redesign aproximando do template TATICCA (Design)

## Contexto

Após o ajuste de rótulos/resiliência (`2026-07-07-executive-slide-clarity-design.md`), o usuário comparou o Slide Executivo (`src/shared/components/project-executive-slide.tsx`) com o material de referência real que a TATICCA usa em PowerPoint (um diagnóstico de robotização feito pra Honda Motos) e achou o resultado atual pobre demais perto do original. A referência nunca tinha sido encontrada antes (ver `2026-07-02-slide-executivo-design.md`, que documenta que o design atual foi feito do zero, sem cópia do original) — desta vez o usuário anexou a imagem real.

O layout final foi validado com o usuário através de 4 iterações de mockup estático (HTML/SVG) via o companheiro visual de brainstorming:
1. v1: primeira proposta com faixa de marca fina, tabela quantitativa, score qualitativo — aprovado no geral ("tá num caminho legal"), mas a proporção parecia larga demais pra impressão e o logo estava só como placeholder de texto.
2. v2 (comparação 4:3 vs A4 paisagem): usuário pediu pra pensar em proporção de monitor/projetor comum em vez de formatos de papel — replanejado pra 16:9.
3. v2/v3: usuário reportou espaço em branco excessivo à esquerda, texto "pobre" e logo minúsculo. Causa raiz real (v3→v4): o mockup usava `width:100%` sem limite máximo, então num monitor grande a caixa ficava muito maior que as fontes fixas pequenas foram calibradas — desproporção, não falta de conteúdo.
4. v4: largura travada em ~1100px (perto do `max-w-5xl` que o componente real já usa), fontes na escala do design system existente (`text-3xl`/`text-sm`/`text-xs`), remoção do esticamento artificial (`flex:1`) que deixava caixas vazias — **aprovado** ("ficou excelente, melhorou muito").

## Requisitos confirmados com o usuário

1. **Logo real da TATICCA**, aplicado no canto superior direito do cabeçalho. Arquivo fornecido pelo usuário, copiado para `public/taticca-logo-horizontal.png` (2500×981px, PNG).
2. **Faixa de marca angular em dois tons** na lateral esquerda (azul-marinho `#1a2b4a` + verde-água `#14b8a6`, formato de chevron/paralelogramo), substituindo a lateral em branco atual.
3. **Largura do slide aumentada** de `max-w-5xl` (1024px) para `max-w-[1100px]` — mantém proporção `aspect-[16/9]`, mas evita que o conteúdo fique desproporcionalmente pequeno.
4. **Cabeçalhos de seção com sublinhado colorido** (borda inferior de 2px verde-água, `inline-block`), substituindo o rótulo cinza uppercase discreto atual — aplica-se a todas as seções de texto (O processo hoje, Situação atual, Construção, Benefícios esperados) e às duas novas seções da coluna direita (Avaliação Quantitativa, Avaliação Qualitativa).
5. **Nova seção "Principais Ações da Automação"**, mapeada para o campo já existente `project.architectNotes` (hoje rotulado "Notas do arquiteto" na aba Especificação — **decisão confirmada: reaproveitar o campo existente, sem migração de banco**). Visualmente destacada: fundo cinza claro (`bg-slate-50`), borda esquerda verde-água de 4px, cantos arredondados à direita. Some inteiramente se `architectNotes` estiver vazio — mesma regra de "seção some se vazia" do resto do componente.
6. **"Avaliação Quantitativa" vira uma tabela** de linhas rotuladas (rótulo com fundo verde-água claro + valor), substituindo a grade 2×2 de números grandes soltos (`StatCell`) usada hoje. Linhas, cada uma some individualmente se o campo correspondente estiver vazio:
   - "Periodicidade do processo" — `processFrequency` (rótulo resolvido, como hoje)
   - "Rodagem do bot" — `project.robotSchedule` **(campo já existe no banco, preenchido pelo arquiteto, nunca exibido em lugar nenhum até agora)**
   - "Colaboradores" — `project.peopleInvolved`
   - "Duração por execução" — `project.taskDurationHours` **(campo já existe no banco, nunca exibido até agora)**, formatado como `"Xh"`
   - "Horas anuais" — `project.currentAnnualHours`, formatado como `"Xh"` (já existia como `StatCell`)
   - "Economia estimada" — `project.monthlyHoursSaved`, formatado como `"Xh/mês"`, valor em verde-esmeralda (`text-emerald-600`) pra manter o destaque visual de "ganho" que já existia no `StatCell` atual — **não pode ser removida da tela**, é a mesma métrica que já existia, só muda de grade pra tabela.
7. **"Avaliação Qualitativa" ganha um score agregado** no cabeçalho da seção: percentual + média bruta das 5 notas (ex.: "50% (2,5)"), calculado como `média = soma das 5 notas (já usando o valor padrão 3 quando não avaliada) / 5`, `percentual = round(média / 5 × 100)`. Média formatada com vírgula decimal (padrão brasileiro, ex.: "2,5").
8. **O gráfico de radar em si não muda** — mantém exatamente o comportamento já existente (5 eixos, badge com o valor numérico em cada vértice, cor uniforme desde a remoção da distinção "valor padrão" feita nesta mesma sessão). Só o que está ao redor dele muda.
9. **Seções que já existiam continuam existindo**, só com o novo estilo de cabeçalho: "Construção" (Solução/Execução) e "Benefícios esperados" não são removidas nem substituídas pela nova seção "Principais Ações da Automação" — são conceitos diferentes (Construção = tipo de solução técnica escolhida; Principais Ações = narrativa livre do que o robô faz).
10. **Selo "DRAFT"** da referência original — **não será replicado**, é específico de rascunho interno da TATICCA e não tem equivalente no nosso fluxo.

## Estilos e valores exatos (aprovados no mockup v4)

- Container raiz: `mx-auto aspect-[16/9] max-w-[1100px] bg-white shadow-md` (era `max-w-5xl shadow-sm`), padding interno ajustado para acomodar a faixa lateral mais larga (esquerda ~100px em vez de 40px; topo/direita/baixo mantêm ~32-40px).
- Faixa lateral: dois `div` absolutos sobrepostos, `clip-path: polygon(0 0, 100% 0, 40% 100%, 0 100%)` — um azul-marinho `#1a2b4a` de ~64px de largura, um verde-água `#14b8a6` de ~46px de largura deslocado ~18px à direita do primeiro.
- Logo: `<img>` alinhado à direita do cabeçalho, `h-16` (64px) de altura, `object-contain` — ajustado de 44px para 64px após feedback do usuário via mockup v5 ("pode aumentar um pouco").
- Subtítulo do processo (reaproveita "Área entrevistada"): cor verde-água (`text-teal-600` ou equivalente a `#0d9488`), `font-semibold`, tamanho um pouco maior que o atual texto cinza pequeno.
- Rótulo de seção (helper compartilhado, usado 6×): `text-xs font-bold uppercase tracking-wide border-b-2 border-teal-500 inline-block pb-0.5` — aplicado às 4 seções de texto da esquerda + "Avaliação Quantitativa" + "Avaliação Qualitativa" (esta última junto com o score, numa linha `flex justify-between`).
- Tabela quantitativa: `<table className="w-full border-collapse text-sm">`, célula de rótulo `bg-teal-50 text-teal-700 font-medium px-3 py-2`, célula de valor `px-3 py-2`, linha inferior sutil entre linhas.
- Caixa "Principais Ações da Automação": `bg-slate-50 border-l-4 border-teal-500 rounded-r-md px-4 py-3`, rótulo em negrito sem sublinhado (já destacado pelo fundo/borda), texto com `line-clamp-3` (mesma resiliência das outras seções).

## Fora de escopo

- Selo "DRAFT" ou equivalente de status "rascunho".
- Campo novo dedicado para "Principais Ações da Automação" — reaproveita `architectNotes` (ver item 5).
- Mudança no gráfico de radar em si (eixos, cores, badges) — só o que está ao redor muda.
- Adicionar `estimatedAnnualSavingBRL`/`complexity`/valores em R$ — continuam fora do slide, regra já estabelecida no design original (`2026-07-02-slide-executivo-design.md`, requisito 3).
