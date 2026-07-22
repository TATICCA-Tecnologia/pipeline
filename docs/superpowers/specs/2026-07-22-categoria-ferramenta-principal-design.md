# Categoria (pai) para Ferramenta Principal (Design)

## Contexto

"Ferramenta principal" (`MainTool`) é hoje uma lista plana e customizável (semeada com Python, Rocketbot, Automation Anywhere, Power Automate, Power Apps, Outro — mais o que o usuário foi adicionando manualmente, ex.: "Claude"). O problema: a lista mistura níveis de especificidade diferentes — "Python" é uma linguagem, "Claude" é um produto específico de um motor de IA, "Rocketbot" é uma plataforma de RPA. Ao escolher a ferramenta de um projeto, o usuário às vezes quer dizer algo genérico ("é uma automação com IA") mas acaba sendo forçado a apontar um produto específico ("Claude"), quando na prática poderia ser qualquer motor de IA.

O usuário confirmou: quer uma **categoria-mãe** (Motor de IA, RPA, Linguagem de Programação, Plataforma Low-Code...) com produtos específicos **opcionais** dentro dela — a categoria basta por si só, o produto é um refinamento.

## Requisitos confirmados com o usuário

1. Nova taxonomia "Categoria de Ferramenta" (`MainToolCategory`), customizável (mesmo padrão de sempre).
2. `MainTool` (o que já existe — Python, Claude, Rocketbot...) ganha uma categoria-pai **opcional**.
3. `Project` passa a ter **dois campos**: a categoria escolhida (agora o principal) e, opcionalmente, o produto específico dentro dela — mesmo padrão de Área/Tema (`areaId`/`themeId`), não um campo só forçando hierarquia dentro de si mesmo.
4. Migração não pode perder nada: as ferramentas já cadastradas continuam existindo; as que o sistema conseguir reconhecer com segurança viram filhas da categoria certa, o resto fica sem categoria pra ajuste manual depois.

## Modelo de dados

```prisma
model MainToolCategory {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  isActive  Boolean    @default(true)
  order     Int        @default(0)
  tools     MainTool[]
  projects  Project[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  @@map("main_tool_categories")
}

model MainTool {
  // ...campos existentes (id, name, slug, isActive, order, createdAt, updatedAt) inalterados
  category   MainToolCategory? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  categoryId String?
}

model Project {
  // ...
  mainTool           MainTool?          @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
  mainToolId         String?
  mainToolCategory   MainToolCategory?  @relation(fields: [mainToolCategoryId], references: [id], onDelete: SetNull)
  mainToolCategoryId String?
}
```

`mainToolId` continua existindo e nullable (era e continua opcional) — só muda o peso relativo: `mainToolCategoryId` passa a ser o campo "principal" preenchido, `mainToolId` é o refinamento opcional. Nenhum dos dois é obrigatório em banco (mesma flexibilidade de Área/Tema hoje).

### Migração (schema + backfill, sem perda de dados)

1. Cria `main_tool_categories` e semeia 4 categorias: **RPA**, **Motor de IA**, **Linguagem de Programação**, **Plataforma Low-Code**.
2. Adiciona `categoryId` em `main_tools` (nullable) e `mainToolCategoryId` em `projects` (nullable).
3. Recategoriza os 6 valores semeados originalmente, por slug:
   - `python` → Linguagem de Programação
   - `rocketbot`, `automation-anywhere`, `power-automate` → RPA
   - `power-apps` → Plataforma Low-Code
   - `outro` → fica sem categoria (não dá pra saber)
4. Tentativa best-effort por nome (`ILIKE`) pra ferramentas que o usuário possa ter adicionado manualmente depois, cobrindo o caso citado ("Claude"): qualquer `main_tools.name` contendo "claude", "gpt", "openai", "gemini" ou "llama" vira filha de Motor de IA. Qualquer ferramenta que não bater com nada continua sem categoria — nada é apagado, só fica pendente de organização manual em Configurações → Categorias.
5. Backfill de `projects.mainToolCategoryId`: para cada projeto que já tem `mainToolId` setado, copia a categoria da ferramenta dele (se ela tiver uma após o passo 3/4). Projetos cuja ferramenta ficou sem categoria simplesmente não recebem `mainToolCategoryId` — o admin ajusta manualmente quando quiser.

## Backend

- `taxonomy.router.ts`: novo bloco `listMainToolCategories`/`listAllMainToolCategories`/`createMainToolCategory`/`updateMainToolCategory`/`deleteMainToolCategory`, cópia exata do padrão de `MainTool`. `createMainTool`/`updateMainTool` ganham `categoryId: z.string().nullable().optional()` no input.
- `project-import-xml-helpers.ts`: novo `findOrCreateMainToolCategory`, cópia de `findOrCreateMainTool`.
- `project.router.ts`:
  - `ARCHITECT_ONLY_FIELDS` ganha `"mainToolCategoryId"`.
  - `update`: input ganha `mainToolCategoryId`; `data.mainToolCategoryId` setado quando presente.
  - `list`/`byId`: `include` ganha `mainToolCategory: { select: {id,name,slug} }`; mapeamento devolve `mainToolCategory`/`mainToolCategoryId`.
  - `importXml`: input ganha `mainToolCategoryName: z.string().optional()`; resolvido via `findOrCreateMainToolCategory`, seta `data.mainToolCategoryId`.
  - **`getToolSummary`/`getExistingAutomationsToolSummary`** (usados pela aba "Resumo Executivo" da Priorização, adicionados nesta mesma sessão): trocam `by: ["mainToolId"]` para `by: ["mainToolCategoryId"]`, resolvendo contra `MainToolCategory` em vez de `MainTool`. Motivo: depois desta mudança, é esperado que muitos projetos só tenham a categoria preenchida (sem produto específico) — se o resumo continuasse agrupando por `mainToolId`, esses projetos sumiriam do gráfico "Resumo por ferramenta" do One Pager. Os nomes dos campos de retorno (`toolId`/`toolName`) não mudam, só o que alimenta eles.
  - **`getAreaSummaryGaps`**: `pipelineWithoutTool`/`deliveredWithoutTool` trocam a condição de `mainToolId: null` para `mainToolCategoryId: null`, pelo mesmo motivo — a categoria é o sinal "principal" agora, não o produto.

## Frontend

- **Configurações → Categorias**: nova seção "Categorias de Ferramenta" (CRUD completo, mesmo padrão visual de "Ferramentas principais"). A seção existente "Ferramentas principais" ganha um Select de categoria (opcional) no dialog de criar/editar, e cada ferramenta listada mostra sua categoria como badge secundária (ou "sem categoria" quando `categoryId` é null) — assim o admin consegue ver e corrigir de uma vez as ferramentas que a migração não conseguiu classificar.
- **Aba Arquitetura** (`architecture-tab.tsx`): "Ferramenta principal" vira dois campos em sequência — **Categoria** (obrigatório se for preencher algo, `CreatableCombobox` sobre `MainToolCategory`) e, logo abaixo, **Produto** opcional (`CreatableCombobox` sobre `MainTool`, filtrado pelos produtos daquela categoria; trocar a categoria limpa o produto selecionado se ele não pertencer mais a ela — mesmo comportamento de Área→Tema no formulário de solicitação do cliente).
- **Exibição somente leitura** (`project-detail-sections.tsx`, `project-request-edit-form.tsx`, `project-executive-slide.tsx`): mostra a categoria e, quando houver produto, os dois juntos (ex.: "Motor de IA — Claude"; sem produto, só "Motor de IA").
- **XML "projeto completo"**: nova tag `<categoriaDaFerramenta>` antes de `<ferramentaPrincipal>` (que continua existindo, agora sempre opcional). Import resolve os dois via `findOrCreateMainTool`/`findOrCreateMainToolCategory`.

## Fora de escopo

- Ligar "Tipo de Solução" a "Ferramenta"/"Categoria de Ferramenta" — descartado a pedido do usuário nesta conversa (múltipla seleção de um lado, seleção única do outro, complexidade não justificada agora).
- Forçar recategorização manual imediata de tudo que a migração não conseguiu classificar — fica disponível pra ajuste na tela de Categorias, sem bloquear nada.
- Permitir mais de uma ferramenta/categoria por projeto (múltiplas ferramentas usadas na mesma solução) — o usuário mencionou o caso ("RPA que usa IA também") mas marcou como preocupação secundária, não pedida agora.
