# Clareza do Slide Executivo + resiliência de layout + prompt mais rico (Design)

## Contexto

O usuário testou o Slide Executivo em produção (`src/shared/components/project-executive-slide.tsx`) e viu a seção "Situação atual" renderizar como `"Não, projeto do zero · Não · FP&A (consolida) e áreas que alimentam as planilhas"` — três respostas de campos diferentes (`hasExistingSystem`, `hasCurrentApplication`, `targetAudience`) concatenadas por `" · "` sem nenhum rótulo, tornando o segundo `"Não"` incompreensível sem saber a qual pergunta ele responde. A seção "Construção" (`solutionTypes` + `executionStrategy`) tem a mesma estrutura e sofre do mesmo risco quando preenchida.

Ao investigar a causa raiz (texto pobre vindo da geração por IA externa via `docs/prompt-geracao-xml.md`), o usuário levantou duas questões adicionais:
1. O prompt de geração de XML não instrui a IA a escrever respostas com profundidade suficiente nos campos de texto livre — por padrão ela tende a ser sucinta demais.
2. Se o prompt passar a pedir textos mais completos, o Slide Executivo (proporção fixa 16:9, pensado para impressão/PDF) corre risco de estourar o layout — e esse risco existe independente da origem do texto (XML gerado por IA ou formulário preenchido manualmente).

Este documento cobre as três frentes juntas, já que são causa/efeito da mesma investigação.

## Requisitos confirmados com o usuário

1. **Relabeling de "Situação atual" e "Construção".** Cada campo vira sua própria linha `Rótulo: valor` (não mais uma frase única separada por `" · "`). Cada linha some individualmente se aquele campo específico estiver vazio — mesma regra de "seção some se vazia" já usada no resto do componente, só que agora por linha em vez de por bloco inteiro.
   - `hasExistingSystem` → rótulo **"Abordagem"**
   - `hasCurrentApplication` → rótulo **"Aplicação existente hoje"**
   - `targetAudience` → rótulo **"Público-alvo"**
   - `solutionTypes` → rótulo **"Solução"**
   - `executionStrategy` → rótulo **"Execução"**
   - O bloco "Situação atual" como um todo some se as 3 linhas estiverem vazias; o bloco "Construção" some se as 2 linhas estiverem vazias — mesma lógica de hoje, aplicada por bloco.
2. **Resiliência de layout via `line-clamp`, não via ajuste de paginação de impressão.** Em vez de mexer em `position: fixed`/`@media print` (frágil e difícil de validar sem um navegador real), cada bloco de texto livre do slide recebe um `line-clamp` (trunca com "…" além de N linhas). Isso garante que o slide nunca estoura o layout fixo 16:9, não importa o tamanho do texto de entrada, seja ele vindo do XML ou digitado manualmente no formulário. Truncar é uma escolha deliberada e consistente com a filosofia já documentada do componente ("resumo executivo enxuto", diferente de `ProjectDetailSections`, que mostra tudo sem cortar).
   - "O processo hoje" (`description`): `line-clamp-3`
   - Cada linha de "Situação atual" (`Abordagem`, `Aplicação existente hoje`, `Público-alvo`): `line-clamp-2`
   - Cada linha de "Construção" (`Solução`, `Execução`): `line-clamp-2`
   - "Benefícios esperados" (lista `·`, já são rótulos curtos e conhecidos — não é texto livre gerado por IA): `line-clamp-2`
   - Tailwind v4 já inclui as utilities `line-clamp-*` no core (desde v3.3) — sem plugin novo, sem dependência nova.
3. **Prompt mais rico em `docs/prompt-geracao-xml.md`**, com meta objetiva de tamanho por campo de texto livre, calibrada para caber no orçamento de linhas acima (evitando que o truncamento do item 2 dispare com frequência no caso comum gerado por IA):
   - `<descricao>` e `<narrativaDoProcesso>`: pedir 2-3 frases objetivas com contexto suficiente para alguém que não estava na reunião entender o processo — e explicitamente desencorajar respostas de uma linha genérica (ex.: "Automatizar processo X").
   - `<detalhesProcessoAtual>`, `<detalhesAplicacaoExistente>`, `<detalhesBeneficios>`: pedir 1-2 frases com o contexto específico (não apenas repetir o valor do campo restrito correspondente).
   - Não se aplica a campos de valor fixo (`plataforma`, `processoExistente`, `periodicidade`, `urgencia`, `beneficios`) nem a `publicoAlvo`/`area`/`tema` — a regra de "campo restrito, use exatamente um destes valores" desses campos continua igual, sem relação com este ajuste de profundidade.

## Fora de escopo

- Ajustar `@media print`/paginação para múltiplas páginas por slide — resolvido via truncamento (`line-clamp`), não via CSS de impressão.
- Mudar a proporção 16:9 do slide ou o tamanho de fonte dinamicamente.
- Adicionar validação de tamanho mínimo/máximo no formulário "Solicitar Projeto" ou no parser de XML (`xml-import.ts`) — o prompt só orienta a IA externa; não há enforcement técnico de tamanho de texto.
- Indicador visual de "texto truncado, veja mais em..." — por ora o corte é silencioso (`line-clamp` com `text-overflow: ellipsis`), consistente com o padrão do componente de não mostrar afordances extras.

## Arquivos afetados

- `src/shared/components/project-executive-slide.tsx`: relabeling de `situacaoAtualParts`/`construcaoParts` (viram arrays de `{ label, value }` renderizados como linhas, em vez de arrays de string joined por `" · "`), mais classes `line-clamp-*` nos blocos de texto.
- `docs/prompt-geracao-xml.md`: reforço de instrução de profundidade nos campos de texto livre listados acima.
- `docs/superpowers/specs/2026-07-02-slide-executivo-design.md`: **não editado** — este novo documento é um refinamento incremental sobre aquele design já aprovado, não uma substituição.
