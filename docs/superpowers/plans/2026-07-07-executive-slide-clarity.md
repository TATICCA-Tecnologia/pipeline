# Clareza do Slide Executivo + resiliência + prompt mais rico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a seção "Situação atual"/"Construção" do Slide Executivo (que hoje concatena respostas sem rótulo, ex.: `"Não, projeto do zero · Não · FP&A..."`), tornar o componente resiliente a texto longo (`line-clamp`, independente da origem do dado), e reforçar o prompt externo de geração de XML para produzir texto livre mais completo.

**Architecture:** Duas mudanças isoladas: (1) `project-executive-slide.tsx` — transforma os arrays de string concatenada em arrays de `{ label, value }` renderizados como linhas rotuladas, e adiciona `line-clamp-*` em todo bloco de texto livre do slide; (2) `docs/prompt-geracao-xml.md` — acrescenta orientação de profundidade nos campos de texto livre. Sem mudança de schema, sem dependência nova (Tailwind v4 já inclui `line-clamp-*` no core).

**Tech Stack:** Next.js 16 / TypeScript / React 19 / Tailwind v4. **Sem test runner configurado neste repo.** Verificação: `npx tsc --noEmit` + leitura cuidadosa do componente (sem navegador disponível neste ambiente de execução — deixar verificação visual final para quando o usuário revisar).

---

## Mapa de arquivos

- Modificar: `src/shared/components/project-executive-slide.tsx` — transformação de dados + JSX + `line-clamp-*`.
- Modificar: `docs/prompt-geracao-xml.md` — orientação de profundidade nos campos de texto livre.

---

### Task 1: Relabeling de "Situação atual" e "Construção" com line-clamp

**Files:**
- Modify: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Substituir a construção dos dados (`situacaoAtualParts`/`construcaoParts`)**

Old (dentro de `ProjectExecutiveSlide`, logo após `const areaEntrevistada = ...`):

```tsx
  const situacaoAtualParts = [
    resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS),
    resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
    project.targetAudience,
  ].filter((v): v is string => Boolean(v));

  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (v) => SOLUTION_TYPES.find((s) => s.value === v)?.label ?? v
  );
  const construcaoParts = [
    ...solutionTypeLabels,
    resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES),
  ].filter((v): v is string => Boolean(v));
```

New:

```tsx
  const situacaoAtualLines = buildLabeledLines([
    { label: "Abordagem", value: resolveLabel(project.hasExistingSystem, HAS_EXISTING_SYSTEM_OPTIONS) },
    {
      label: "Aplicação existente hoje",
      value: resolveLabel(project.hasCurrentApplication, HAS_CURRENT_APPLICATION_OPTIONS),
    },
    { label: "Público-alvo", value: project.targetAudience },
  ]);

  const solutionTypeLabels = (project.solutionTypes ?? []).map(
    (v) => SOLUTION_TYPES.find((s) => s.value === v)?.label ?? v
  );
  const construcaoLines = buildLabeledLines([
    { label: "Solução", value: solutionTypeLabels.length > 0 ? solutionTypeLabels.join(", ") : undefined },
    { label: "Execução", value: resolveLabel(project.executionStrategy, EXECUTION_STRATEGIES) },
  ]);
```

- [ ] **Step 2: Adicionar o helper `buildLabeledLines` usado acima**

Adicione esta função no nível do módulo, antes de `export function ProjectExecutiveSlide` (pode ficar logo acima dela, depois de `StatCell`):

```tsx
function buildLabeledLines(
  entries: { label: string; value: string | undefined }[]
): { label: string; value: string }[] {
  return entries.filter((e): e is { label: string; value: string } => Boolean(e.value));
}
```

- [ ] **Step 3: Atualizar a renderização de "Situação atual" e "Construção"**

Old:

```tsx
          {situacaoAtualParts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Situação atual
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {situacaoAtualParts.join(" · ")}
              </p>
            </div>
          )}
          {construcaoParts.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Construção
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {construcaoParts.join(" · ")}
              </p>
            </div>
          )}
```

New:

```tsx
          {situacaoAtualLines.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Situação atual
              </div>
              <div className="space-y-0.5">
                {situacaoAtualLines.map((line) => (
                  <p
                    key={line.label}
                    className="line-clamp-2 text-sm leading-relaxed text-foreground/90"
                  >
                    <span className="font-medium">{line.label}:</span> {line.value}
                  </p>
                ))}
              </div>
            </div>
          )}
          {construcaoLines.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Construção
              </div>
              <div className="space-y-0.5">
                {construcaoLines.map((line) => (
                  <p
                    key={line.label}
                    className="line-clamp-2 text-sm leading-relaxed text-foreground/90"
                  >
                    <span className="font-medium">{line.label}:</span> {line.value}
                  </p>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 4: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `project-executive-slide.tsx` (baseline pré-existente: erros em `clientes/page.tsx`, `chart.tsx`, `input-otp.tsx`, `sidebar.tsx`, `toaster.tsx` — não relacionados, ignore).

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/project-executive-slide.tsx
git commit -m "fix: label situacao-atual/construcao lines individually in executive slide"
```

---

### Task 2: Line-clamp em "O processo hoje" e "Benefícios esperados"

**Files:**
- Modify: `src/shared/components/project-executive-slide.tsx`

- [ ] **Step 1: Adicionar `line-clamp-3` ao bloco "O processo hoje"**

Old:

```tsx
          {project.description && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O processo hoje
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{project.description}</p>
            </div>
          )}
```

New:

```tsx
          {project.description && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                O processo hoje
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
                {project.description}
              </p>
            </div>
          )}
```

- [ ] **Step 2: Adicionar `line-clamp-2` ao bloco "Benefícios esperados"**

Old:

```tsx
          {benefitLabels.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Benefícios esperados
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">
                {benefitLabels.join(" · ")}
              </p>
            </div>
          )}
```

New:

```tsx
          {benefitLabels.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Benefícios esperados
              </div>
              <p className="line-clamp-2 text-sm leading-relaxed text-foreground/90">
                {benefitLabels.join(" · ")}
              </p>
            </div>
          )}
```

- [ ] **Step 3: Checar tipos**

Run: `cd "c:/Users/danie/Pipeline" && npx tsc --noEmit`
Expected: sem novos erros relacionados a `project-executive-slide.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/project-executive-slide.tsx
git commit -m "fix: clamp long text blocks in executive slide to prevent layout overflow"
```

---

### Task 3: Reforçar profundidade dos campos de texto livre no prompt externo

**Files:**
- Modify: `docs/prompt-geracao-xml.md`

- [ ] **Step 1: Atualizar a regra de `<descricao>` na seção "Regras de preenchimento por campo"**

Old:

```
- <titulo>, <descricao>: obrigatórios. Nunca deixe vazios.
```

New:

```
- <titulo>: obrigatório. Nunca deixe vazio.
- <descricao>: obrigatório, nunca vazio. Escreva 2-3 frases objetivas com contexto suficiente para alguém que NÃO estava na reunião entender o processo (o que é, por que é feito, quem faz hoje). Evite respostas de uma linha genérica como "Automatizar processo X" — isso não é descrição suficiente.
```

- [ ] **Step 2: Atualizar a regra de `<detalhesProcessoAtual>`**

Old:

```
- <detalhesProcessoAtual>: como o processo funciona hoje, o que costuma dar errado.
```

New:

```
- <detalhesProcessoAtual>: 1-2 frases sobre como o processo funciona hoje e o que costuma dar errado — não repita o valor de <processoExistente>, complemente-o com contexto específico da transcrição.
```

- [ ] **Step 3: Atualizar a regra de `<detalhesAplicacaoExistente>`**

Old:

```
- <detalhesAplicacaoExistente>: preencha só se aplicacaoExistenteHoje = "Sim". Descreva a aplicação existente: plataforma/tecnologia usada, quem desenvolveu, desde quando está em produção, limitações conhecidas.
```

New:

```
- <detalhesAplicacaoExistente>: preencha só se aplicacaoExistenteHoje = "Sim". Descreva em 1-2 frases: plataforma/tecnologia usada, quem desenvolveu, desde quando está em produção, limitações conhecidas — não deixe genérico, use os detalhes específicos citados na transcrição.
```

- [ ] **Step 4: Atualizar a regra de `<narrativaDoProcesso>`**

Old:

```
- <narrativaDoProcesso>: descrição livre e mais completa do fluxo, com contexto e exceções mencionadas.
```

New:

```
- <narrativaDoProcesso>: descrição livre e mais completa do fluxo (2-3 frases), com contexto, passos principais e exceções mencionadas na transcrição — este campo pode (e deve) ser mais detalhado que <descricao>, que é só o resumo objetivo.
```

- [ ] **Step 5: Atualizar a regra de `<detalhesBeneficios>`**

Old:

```
- <detalhesBeneficios>: texto livre com números/impactos citados.
```

New:

```
- <detalhesBeneficios>: 1-2 frases com números/impactos específicos citados na transcrição (ex.: "reduz retrabalho de ~5h/semana do time fiscal") — evite deixar vazio ou genérico quando a transcrição mencionar qualquer número ou exemplo concreto.
```

- [ ] **Step 6: Adicionar uma nota geral sobre profundidade na seção "Regras gerais"**

Old (item 1 da lista):

```
1. Use SOMENTE informações explícitas ou razoavelmente inferíveis da transcrição. Não invente números, nomes ou prazos.
```

New (adiciona uma frase ao final do mesmo item, sem quebrar a numeração):

```
1. Use SOMENTE informações explícitas ou razoavelmente inferíveis da transcrição. Não invente números, nomes ou prazos. Nos campos de texto livre (<descricao>, <narrativaDoProcesso>, <detalhesProcessoAtual>, <detalhesAplicacaoExistente>, <detalhesBeneficios>), prefira sempre a versão mais completa que a transcrição permitir, dentro do limite de 2-3 frases indicado em cada campo — não comprima informação real da reunião numa frase única e genérica.
```

- [ ] **Step 7: Adicionar entrada no "Histórico" no topo do arquivo**

Old:

```
## Histórico

- **2026-07-03**: adicionada a regra geral sobre campos restritos e um
  exemplo ERRADO/CERTO em cada campo restrito, depois de um caso real em que
  `<periodicidade>` recebeu `"Mensal (fechamento); parte também no ciclo de
  orçamento"` em vez de `"Mensal"`, quebrando o cálculo automático de horas
  anuais (`currentAnnualHours`) daquele projeto.
```

New:

```
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
```

- [ ] **Step 8: Commit**

```bash
git add docs/prompt-geracao-xml.md
git commit -m "docs: request deeper free-text answers in XML generation prompt"
```

---

### Task 4: Verificação (sem navegador disponível nesta sessão)

**Files:** nenhum

Este ambiente de execução não tem uma ferramenta de navegador disponível. A verificação funcional real (abrir um projeto com texto longo em "O processo hoje"/"Situação atual" e confirmar visualmente que o `line-clamp` corta sem quebrar o layout, e que as linhas rotuladas aparecem corretas) fica marcada como pendente para quando o usuário revisar manualmente.

- [ ] **Step 1: Revisão estática do código (sem navegador)**

Reler o arquivo final `src/shared/components/project-executive-slide.tsx` inteiro e confirmar:
- Nenhuma classe Tailwind com erro de digitação (`line-clamp-2`, `line-clamp-3` — exatamente essas, sem plugin extra necessário no Tailwind v4).
- `situacaoAtualLines`/`construcaoLines` usam exatamente os rótulos definidos na spec (Abordagem, Aplicação existente hoje, Público-alvo, Solução, Execução).
- Nenhuma outra parte do componente (radar chart, stat cells, cabeçalho) foi alterada.

- [ ] **Step 2: Registrar como pendente para o usuário**

Ao reportar a conclusão do plano, deixar explícito que a verificação visual (abrir `/admin/projetos`, clicar em "Slide Executivo" de um projeto com dados nesses campos, e testar com um projeto com texto propositalmente longo) ainda não foi feita por falta de navegador nesta sessão.

---

## Self-review

- **Cobertura da spec:** relabeling com line-clamp (Task 1), line-clamp nos blocos restantes (Task 2), prompt mais rico (Task 3) — os 3 requisitos confirmados estão cobertos.
- **Sem placeholders:** todo bloco de código é o conteúdo final.
- **Consistência:** rótulos e valores de line-clamp usados em Task 1/2 são exatamente os definidos na spec `2026-07-07-executive-slide-clarity-design.md`.
- **Risco conhecido:** Task 4 não pode ser executada de verdade neste ambiente (sem navegador) — fica como follow-up manual do usuário.
