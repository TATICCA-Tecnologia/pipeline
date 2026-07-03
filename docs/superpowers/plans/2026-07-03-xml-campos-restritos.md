# Reforço de campos restritos no XML de solicitação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que um valor de XML que não bate exatamente com uma opção conhecida em campos categóricos (especialmente `periodicidade`, que alimenta o cálculo automático de horas anuais) gere um aviso visível em vez de falhar silenciosamente, e reforçar as instruções (template baixável, página de ajuda) para reduzir a chance de isso acontecer.

**Architecture:** Três mudanças de conteúdo/lógica isoladas, sem alteração de schema: (1) comentários inline no template XML baixável, (2) textos mais explícitos na página de ajuda `/cliente/solicitar/ajuda-xml`, (3) `warnings.push(...)` nos branches de `parseSolicitacaoXml` (`xml-import.ts`) que hoje caem em `"outro"` sem avisar. O prompt de geração externo já foi versionado em `docs/prompt-geracao-xml.md` (feito na sessão anterior, fora deste plano).

**Tech Stack:** Next.js 16 / TypeScript / React 19. **Sem test runner configurado neste repo** (nenhum vitest/jest, `package.json` não tem script de teste). `parseSolicitacaoXml` usa `DOMParser`, que só existe em ambiente de browser — não dá pra rodar via `tsx`/node puro sem adicionar jsdom, o que estaria fora do escopo deste plano (spec não pediu infraestrutura de teste nova). Verificação aqui é: `tsc --noEmit` + `eslint` como rede de segurança de tipos/lint, e um passo manual no browser (dev server) repetindo o caso real que motivou a mudança.

---

## Mapa de arquivos

- Modificar: `public/modelo-solicitacao-projeto.xml` — comentários inline por tag.
- Modificar: `src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx` — texto de 5 entradas no array `tags`.
- Modificar: `src/app/(private)/cliente/solicitar/utils/xml-import.ts` — `warnings.push(...)` em 8 branches de fallback.
- Já criado (sessão anterior, não faz parte deste plano): `docs/prompt-geracao-xml.md`, `docs/superpowers/specs/2026-07-03-xml-campos-restritos-design.md`.

---

### Task 1: Comentários inline no template XML baixável

**Files:**
- Modify: `public/modelo-solicitacao-projeto.xml`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

O arquivo é servido estaticamente (baixado direto pelo botão "Baixar modelo em branco" em `ajuda-xml/page.tsx`), então isso é uma edição de conteúdo, não de código. Substitua o arquivo inteiro por:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <empresa></empresa>
  <titulo></titulo>
  <!-- Valores sugeridos: Contabilidade, RPA, Desenvolvimento, Consultoria técnica. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <area></area>
  <!-- Tema dentro da área escolhida. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <tema></tema>
  <!-- CAMPO RESTRITO: use exatamente um destes valores, sem texto adicional. Valores: Desktop (Windows / macOS) | Web (desktop e celular) | iOS (iPhone / iPad) | Android | iOS e Android | Todas as plataformas -->
  <plataforma></plataforma>
  <descricao></descricao>
  <!-- Valores sugeridos: Uso interno da empresa, Clientes, Fornecedores, etc. Fora da lista, é tratado como "Outro" (texto livre aceito). -->
  <publicoAlvo></publicoAlvo>
  <numeroUsuarios></numeroUsuarios>
  <!-- CAMPO RESTRITO: use exatamente um destes valores, sem texto adicional. Valores: Não, projeto do zero | Sim, quero substituir | Sim, quero integrar/migrar dados | Sim, quero melhorar o existente -->
  <processoExistente></processoExistente>
  <detalhesProcessoAtual></detalhesProcessoAtual>
  <!-- CAMPO RESTRITO: use exatamente Sim ou Não, sem texto adicional. Detalhes vão em detalhesAplicacaoExistente. -->
  <aplicacaoExistenteHoje></aplicacaoExistenteHoje>
  <detalhesAplicacaoExistente></detalhesAplicacaoExistente>
  <colaboradoresEnvolvidos></colaboradoresEnvolvidos>
  <detalhesColaboradores></detalhesColaboradores>
  <duracaoPorExecucao></duracaoPorExecucao>
  <!-- CAMPO RESTRITO — alimenta o cálculo automático de horas gastas por ano. Use exatamente um destes valores, SEM parênteses nem texto adicional (contexto extra vai em informacoesAdicionais). Valores: Diário | Duas vezes por semana | Três vezes por semana | Semanal | Mensal | Anual -->
  <periodicidade></periodicidade>
  <narrativaDoProcesso></narrativaDoProcesso>
  <funcionalidades>
    <!-- <funcionalidade>Exemplo de funcionalidade</funcionalidade> -->
  </funcionalidades>
  <!-- Cada <beneficio> deve corresponder exatamente a um destes rótulos (item que não bater vira "Outro" automaticamente, sem bloquear a importação): Redução de trabalho operacional (tarefas manuais, planilhas, retrabalho) | Melhor relacionamento com o cliente (experiência, atendimento, rapidez) | Melhor relacionamento com fornecedores ou parceiros | Redução de multas, riscos ou infrações (fiscais, regulatórias, contratuais) | Melhoria da qualidade do trabalho (padronização, menos erros, mais visibilidade) -->
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
  <!-- CAMPO RESTRITO: use exatamente um destes valores (incluindo o texto depois do travessão), sem texto adicional. Valores: Baixa — sem pressa definida | Média — próximos 2 a 3 meses | Alta — próximo mês | Urgente — o mais rápido possível -->
  <urgencia></urgencia>
  <prazoLimite></prazoLimite>
  <informacoesAdicionais></informacoesAdicionais>
</solicitacaoDeProjeto>
```

- [ ] **Step 2: Confirmar que o XML continua válido**

Valide a sintaxe com Python (disponível por padrão, sem dependência nova) — garante que os comentários adicionados não quebraram nenhuma tag:

Run: `python -c "import xml.etree.ElementTree as ET; ET.parse('public/modelo-solicitacao-projeto.xml'); print('OK')"`

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/modelo-solicitacao-projeto.xml
git commit -m "docs: add inline guidance comments to blank XML template"
```

---

### Task 2: Reforçar textos na página de ajuda

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx:109-187`

- [ ] **Step 1: Atualizar a descrição de `periodicidade`**

Old (linhas 115-121):

```tsx
    {
      tag: "periodicidade",
      required: false,
      description:
        'Frequência com que o processo acontece. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: PROCESS_FREQUENCIES.map((p) => p.label),
    },
```

New:

```tsx
    {
      tag: "periodicidade",
      required: false,
      description:
        'Frequência com que o processo acontece. Use exatamente um dos valores aceitos, sem texto adicional (ex.: não escreva "Mensal (fechamento)"). Esse campo alimenta o cálculo automático de horas gastas por ano — contexto extra vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro" e o cálculo automático não é feito.',
      acceptedValues: PROCESS_FREQUENCIES.map((p) => p.label),
    },
```

- [ ] **Step 2: Atualizar a descrição de `processoExistente`**

Old (linhas 72-78):

```tsx
    {
      tag: "processoExistente",
      required: false,
      description:
        'Se já existe um processo ou sistema atual. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label),
    },
```

New:

```tsx
    {
      tag: "processoExistente",
      required: false,
      description:
        'Se já existe um processo ou sistema atual. Use exatamente um dos valores aceitos, sem texto adicional — detalhes vão em "Detalhes do processo atual". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_EXISTING_SYSTEM_OPTIONS.map((o) => o.label),
    },
```

- [ ] **Step 3: Atualizar a descrição de `aplicacaoExistenteHoje`**

Old (linhas 84-90):

```tsx
    {
      tag: "aplicacaoExistenteHoje",
      required: false,
      description:
        'Se já existe uma aplicação (app/sistema) para esse processo hoje. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_CURRENT_APPLICATION_OPTIONS.map((o) => o.label),
    },
```

New:

```tsx
    {
      tag: "aplicacaoExistenteHoje",
      required: false,
      description:
        'Se já existe uma aplicação (app/sistema) para esse processo hoje. Use exatamente "Sim" ou "Não", sem texto adicional — detalhes vão em "Detalhes da aplicação existente". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: HAS_CURRENT_APPLICATION_OPTIONS.map((o) => o.label),
    },
```

- [ ] **Step 4: Atualizar a descrição de `plataforma`**

Old (linhas 53-59):

```tsx
    {
      tag: "plataforma",
      required: false,
      description:
        'Onde o processo vai funcionar (não confundir com sistemas que ele integra, como ERPs). Se não corresponder a nenhuma opção conhecida, é tratado como "Outro". Se vazio, usa o padrão (Desktop).',
      acceptedValues: PLATFORMS.map((p) => p.label),
    },
```

New:

```tsx
    {
      tag: "plataforma",
      required: false,
      description:
        'Onde o processo vai funcionar (não confundir com sistemas que ele integra, como ERPs). Use exatamente um dos valores aceitos, sem texto adicional. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro". Se vazio, usa o padrão (Desktop).',
      acceptedValues: PLATFORMS.map((p) => p.label),
    },
```

- [ ] **Step 5: Atualizar a descrição de `urgencia`**

Old (linhas 181-187):

```tsx
    {
      tag: "urgencia",
      required: false,
      description:
        'Nível de urgência. Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
    },
```

New:

```tsx
    {
      tag: "urgencia",
      required: false,
      description:
        'Nível de urgência. Use exatamente um dos valores aceitos (incluindo o texto depois do travessão), sem texto adicional — o motivo da urgência vai em "Informações adicionais". Se não corresponder a nenhuma opção conhecida, é tratado como "Outro".',
      acceptedValues: URGENCY_LEVELS.map((u) => u.label),
    },
```

- [ ] **Step 6: Rodar o lint e o typecheck**

Run: `pnpm lint`
Expected: sem erros novos relacionados a `ajuda-xml/page.tsx`.

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Ver a página no browser**

Run: `pnpm dev` (se ainda não estiver rodando), abra `http://localhost:3000/cliente/solicitar/ajuda-xml` logado como cliente, e confirme visualmente que as 5 descrições atualizadas aparecem corretas (sem overflow de texto estranho no card).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/ajuda-xml/page.tsx"
git commit -m "docs: clarify restricted-field rules on XML help page"
```

---

### Task 3: Avisar quando um campo categórico do XML cai em "Outro"

**Files:**
- Modify: `src/app/(private)/cliente/solicitar/utils/xml-import.ts:114-224` (área, tema, plataforma, publicoAlvo, processoExistente, aplicacaoExistenteHoje, periodicidade) e `:287-295` (urgência)

- [ ] **Step 1: `area` e `tema`**

Old (linhas 114-130):

```ts
  // <area> / <tema> — com fallback "Outro"
  const areaTag = getDirectChildText(root, "area");
  if (!areaTag) {
    return { ok: false, error: "A tag <area> é obrigatória e não pode ficar vazia." };
  }
  const areaMatch = matchByLabel(areaTag, context.areas);
  const projectArea = areaMatch ? areaMatch.value : "outro";
  const customProjectArea = areaMatch ? "" : areaTag;

  const temaTag = getDirectChildText(root, "tema");
  if (!temaTag) {
    return { ok: false, error: "A tag <tema> é obrigatória e não pode ficar vazia." };
  }
  const themesForArea = context.themesByArea[projectArea] ?? [];
  const temaMatch = matchByLabel(temaTag, themesForArea);
  const projectTheme = temaMatch ? temaMatch.value : "outro";
  const customProjectTheme = temaMatch ? "" : temaTag;
```

New:

```ts
  // <area> / <tema> — com fallback "Outro"
  const areaTag = getDirectChildText(root, "area");
  if (!areaTag) {
    return { ok: false, error: "A tag <area> é obrigatória e não pode ficar vazia." };
  }
  const areaMatch = matchByLabel(areaTag, context.areas);
  const projectArea = areaMatch ? areaMatch.value : "outro";
  const customProjectArea = areaMatch ? "" : areaTag;
  if (!areaMatch) {
    warnings.push(
      `<area> com valor '${areaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
    );
  }

  const temaTag = getDirectChildText(root, "tema");
  if (!temaTag) {
    return { ok: false, error: "A tag <tema> é obrigatória e não pode ficar vazia." };
  }
  const themesForArea = context.themesByArea[projectArea] ?? [];
  const temaMatch = matchByLabel(temaTag, themesForArea);
  const projectTheme = temaMatch ? temaMatch.value : "outro";
  const customProjectTheme = temaMatch ? "" : temaTag;
  if (!temaMatch) {
    warnings.push(
      `<tema> com valor '${temaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
    );
  }
```

- [ ] **Step 2: `plataforma`**

Old (linhas 132-140):

```ts
  // <plataforma> — com fallback "Outro"
  const plataformaTag = getDirectChildText(root, "plataforma");
  let platform = DEFAULT_PLATFORM_VALUE as string;
  let customPlatform = "";
  if (plataformaTag) {
    const platformMatch = matchByLabel(plataformaTag, PLATFORMS);
    platform = platformMatch ? platformMatch.value : "outro";
    customPlatform = platformMatch ? "" : plataformaTag;
  }
```

New:

```ts
  // <plataforma> — com fallback "Outro"
  const plataformaTag = getDirectChildText(root, "plataforma");
  let platform = DEFAULT_PLATFORM_VALUE as string;
  let customPlatform = "";
  if (plataformaTag) {
    const platformMatch = matchByLabel(plataformaTag, PLATFORMS);
    platform = platformMatch ? platformMatch.value : "outro";
    customPlatform = platformMatch ? "" : plataformaTag;
    if (!platformMatch) {
      warnings.push(
        `<plataforma> com valor '${plataformaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

- [ ] **Step 3: `publicoAlvo`**

Old (linhas 142-154):

```ts
  const publicoTag = getDirectChildText(root, "publicoAlvo");
  let targetAudience = "";
  let customTargetAudience = "";
  if (publicoTag) {
    const audienceMatch = matchByLabel(publicoTag, TARGET_AUDIENCES);
    if (audienceMatch) {
      targetAudience = audienceMatch.value;
    } else {
      targetAudience = "outro";
      customTargetAudience = publicoTag;
    }
  }
```

New:

```ts
  const publicoTag = getDirectChildText(root, "publicoAlvo");
  let targetAudience = "";
  let customTargetAudience = "";
  if (publicoTag) {
    const audienceMatch = matchByLabel(publicoTag, TARGET_AUDIENCES);
    if (audienceMatch) {
      targetAudience = audienceMatch.value;
    } else {
      targetAudience = "outro";
      customTargetAudience = publicoTag;
      warnings.push(
        `<publicoAlvo> com valor '${publicoTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

- [ ] **Step 4: `processoExistente`**

Old (linhas 158-166):

```ts
  const processoExistenteTag = getDirectChildText(root, "processoExistente");
  let hasExistingSystem = "";
  let customHasExistingSystem = "";
  if (processoExistenteTag) {
    const match = matchByLabel(processoExistenteTag, HAS_EXISTING_SYSTEM_OPTIONS);
    hasExistingSystem = match ? match.value : "outro";
    customHasExistingSystem = match ? "" : processoExistenteTag;
  }
```

New:

```ts
  const processoExistenteTag = getDirectChildText(root, "processoExistente");
  let hasExistingSystem = "";
  let customHasExistingSystem = "";
  if (processoExistenteTag) {
    const match = matchByLabel(processoExistenteTag, HAS_EXISTING_SYSTEM_OPTIONS);
    hasExistingSystem = match ? match.value : "outro";
    customHasExistingSystem = match ? "" : processoExistenteTag;
    if (!match) {
      warnings.push(
        `<processoExistente> com valor '${processoExistenteTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

- [ ] **Step 5: `aplicacaoExistenteHoje`**

Old (linhas 170-178):

```ts
  const aplicacaoExistenteTag = getDirectChildText(root, "aplicacaoExistenteHoje");
  let hasCurrentApplication = "";
  let customHasCurrentApplication = "";
  if (aplicacaoExistenteTag) {
    const match = matchByLabel(aplicacaoExistenteTag, HAS_CURRENT_APPLICATION_OPTIONS);
    hasCurrentApplication = match ? match.value : "outro";
    customHasCurrentApplication = match ? "" : aplicacaoExistenteTag;
  }
```

New:

```ts
  const aplicacaoExistenteTag = getDirectChildText(root, "aplicacaoExistenteHoje");
  let hasCurrentApplication = "";
  let customHasCurrentApplication = "";
  if (aplicacaoExistenteTag) {
    const match = matchByLabel(aplicacaoExistenteTag, HAS_CURRENT_APPLICATION_OPTIONS);
    hasCurrentApplication = match ? match.value : "outro";
    customHasCurrentApplication = match ? "" : aplicacaoExistenteTag;
    if (!match) {
      warnings.push(
        `<aplicacaoExistenteHoje> com valor '${aplicacaoExistenteTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

- [ ] **Step 6: `periodicidade` (aviso reforçado, menciona o cálculo)**

Old (linhas 216-224):

```ts
  // <periodicidade> — com fallback "Outro"
  const periodicidadeTag = getDirectChildText(root, "periodicidade");
  let processFrequency = "";
  let customProcessFrequency = "";
  if (periodicidadeTag) {
    const match = matchByLabel(periodicidadeTag, PROCESS_FREQUENCIES);
    processFrequency = match ? match.value : "outro";
    customProcessFrequency = match ? "" : periodicidadeTag;
  }
```

New:

```ts
  // <periodicidade> — com fallback "Outro"
  const periodicidadeTag = getDirectChildText(root, "periodicidade");
  let processFrequency = "";
  let customProcessFrequency = "";
  if (periodicidadeTag) {
    const match = matchByLabel(periodicidadeTag, PROCESS_FREQUENCIES);
    processFrequency = match ? match.value : "outro";
    customProcessFrequency = match ? "" : periodicidadeTag;
    if (!match) {
      warnings.push(
        `<periodicidade> com valor '${periodicidadeTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro". O cálculo automático de horas gastas por ano NÃO será feito para este projeto — se a periodicidade real for uma das opções da lista, ajuste o valor antes de importar.`
      );
    }
  }
```

- [ ] **Step 7: `urgencia`**

Old (linhas 287-295):

```ts
  // <urgencia> — com fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  let customUrgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    urgency = match ? match.value : "outro";
    customUrgency = match ? "" : urgenciaTag;
  }
```

New:

```ts
  // <urgencia> — com fallback "Outro"
  const urgenciaTag = getDirectChildText(root, "urgencia");
  let urgency = "";
  let customUrgency = "";
  if (urgenciaTag) {
    const match = matchByLabel(urgenciaTag, URGENCY_LEVELS);
    urgency = match ? match.value : "outro";
    customUrgency = match ? "" : urgenciaTag;
    if (!match) {
      warnings.push(
        `<urgencia> com valor '${urgenciaTag}' não corresponde a nenhuma opção conhecida; foi tratado como "Outro" e o texto original foi preservado.`
      );
    }
  }
```

- [ ] **Step 8: Rodar o lint e o typecheck**

Run: `pnpm lint`
Expected: sem erros.

Run: `npx tsc --noEmit`
Expected: sem erros. (`warnings` já está no escopo da função desde a declaração original — nenhuma variável nova precisa ser importada.)

- [ ] **Step 9: Commit**

```bash
git add "src/app/(private)/cliente/solicitar/utils/xml-import.ts"
git commit -m "fix: warn when a restricted XML field falls back to Outro"
```

---

### Task 4: Verificação manual end-to-end (reproduz o caso real)

Sem test runner no projeto, esta é a verificação funcional real da mudança — reproduz exatamente o bug relatado e confirma a correção.

**Files:** nenhum (só uso da UI)

- [ ] **Step 1: Preparar dois arquivos XML de teste**

Crie `C:\Users\danie\AppData\Local\Temp\claude\c--Users-danie-Pipeline\7cb2d9af-aa71-4524-99cd-b8dae1587bdc\scratchpad\teste-periodicidade-ruim.xml` com o mesmo conteúdo do caso real (periodicidade poluída):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <titulo>Teste periodicidade ruim</titulo>
  <area>Contabilidade</area>
  <tema>Obrigações acessórias</tema>
  <descricao>XML de teste pra verificar o aviso de periodicidade fora do padrão.</descricao>
  <duracaoPorExecucao>4</duracaoPorExecucao>
  <periodicidade>Mensal (fechamento); parte também no ciclo de orçamento</periodicidade>
</solicitacaoDeProjeto>
```

E `...\scratchpad\teste-periodicidade-boa.xml` com o valor limpo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<solicitacaoDeProjeto>
  <titulo>Teste periodicidade boa</titulo>
  <area>Contabilidade</area>
  <tema>Obrigações acessórias</tema>
  <descricao>XML de teste pra verificar que Mensal exato calcula horas/ano.</descricao>
  <duracaoPorExecucao>4</duracaoPorExecucao>
  <periodicidade>Mensal</periodicidade>
</solicitacaoDeProjeto>
```

- [ ] **Step 2: Rodar o dev server e logar como cliente**

Run: `pnpm dev`

Abra `http://localhost:3000/cliente/solicitar`, logado com um usuário que tenha papel de cliente e pelo menos uma empresa associada.

- [ ] **Step 3: Importar o XML ruim e confirmar o aviso**

Use o botão de importar XML (input de arquivo) e selecione `teste-periodicidade-ruim.xml`. Confirme que a mensagem de sucesso menciona que "alguns valores do XML não foram reconhecidos". Abra o projeto recém-criado (lista de projetos do cliente ou, se tiver acesso admin, `admin/projetos`) e confira o campo "Informações adicionais": deve conter a linha
`<periodicidade> com valor 'Mensal (fechamento); parte também no ciclo de orçamento' não corresponde a nenhuma opção conhecida; foi tratado como "Outro". O cálculo automático de horas gastas por ano NÃO será feito para este projeto...`

Confirme também que o slide executivo desse projeto (botão "Slide Executivo") mostra o card de "gastas por ano hoje" em branco — comportamento aceito, documentado na spec.

- [ ] **Step 4: Importar o XML bom e confirmar o cálculo**

Repita com `teste-periodicidade-boa.xml`. Confirme que a mensagem de sucesso NÃO menciona valores não reconhecidos, e que o projeto criado tem `currentAnnualHours = 48` (4h × 12 ocorrências/ano de "Mensal") — visível em "Horas anuais no processo atual" na view de detalhe do projeto, e no card "gastas por ano hoje" (48h) no slide executivo.

- [ ] **Step 5: Apagar os dois projetos de teste**

Use a ação de exclusão de projeto no admin (ou a rota que já existir) pra não deixar lixo de teste no ambiente de dev.

---

## Self-review

- **Cobertura da spec:** template (Task 1), página de ajuda (Task 2), avisos no parser (Task 3) — todos os 3 componentes de código da spec estão cobertos. O 4º componente (prompt em `docs/prompt-geracao-xml.md`) já foi entregue antes deste plano.
- **Sem placeholders:** todo bloco de código é o conteúdo final, não uma descrição do que fazer.
- **Consistência:** as mensagens de aviso usam sempre o nome literal da tag entre `<>` e a mesma estrutura de frase; a de `periodicidade` é a única com a frase extra sobre o cálculo, como decidido na spec.
