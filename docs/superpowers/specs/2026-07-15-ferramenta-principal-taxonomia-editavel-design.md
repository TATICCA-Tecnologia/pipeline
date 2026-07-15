# Ferramenta principal como taxonomia editável (Design)

## Contexto

`MAIN_TOOLS` (`src/app/(private)/admin/projetos/[id]/especificacao/_constants/architecture.ts:12-19`) é um array TypeScript hardcoded com 6 opções (Python, Rocketbot, Automation Anywhere, Power Automate, Power Apps, Outro). `Project.mainTool` é `String?` livre, sem tabela própria no banco. Adicionar/renomear uma ferramenta hoje exige editar código e fazer deploy.

O precedente já existe no projeto: Área/Tema (`ProjectArea`/`ProjectTheme`, ver [[2026-07-07-area-tema-taxonomia-estruturada-design]]) são taxonomias reais no banco, com CRUD de admin em `taxonomy.router.ts` e tela em `/admin/configuracoes/categorias`. "Ferramenta principal" vai virar o mesmo tipo de taxonomia, com uma diferença de UX: criação inline via combobox na própria tela de arquitetura, não só "Outro + texto livre".

## Requisitos confirmados com o usuário

1. **Editável em Configurações do admin**, com CRUD completo (criar, editar nome, reordenar, ativar/desativar, excluir) — mesmo padrão de Área/Tema.
2. **Nova aba "Ferramentas principais"** dentro de `/admin/configuracoes/categorias`, ao lado de Área/Tema/Sugestões (não uma rota nova separada).
3. **Criação inline na tela de arquitetura**: o campo vira um combobox (buscar/filtrar por texto); se o texto digitado não bate com nenhuma opção existente, aparece uma linha "Criar '{texto}'" que cria e seleciona a ferramenta na hora, sem sair do controle nem abrir modal.
4. **Campo vira relação de verdade (FK)**, não string+lista de validação — mesmo padrão de `areaId`/`themeId`. Dado existente é migrado (backfill), não fica paralelo/desconectado.
5. Tela de arquitetura já é admin-only (`/admin/projetos/[id]/especificacao`) — a criação inline **não precisa** do gate extra de role que existe no formulário de cliente para Área/Tema (lá existe porque o formulário é público/cliente; aqui todo mundo que acessa a tela já é admin).

## Modelo de dados

Nova tabela, espelhando `ProjectArea`:

```prisma
model MainTool {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  projects  Project[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("main_tools")
}
```

`Project.mainTool String?` é substituído por:
```prisma
mainTool   MainTool? @relation(fields: [mainToolId], references: [id], onDelete: SetNull)
mainToolId String?
```

**Migration única** faz três coisas, nessa ordem:
1. Cria a tabela `main_tools`.
2. Semeia as 6 linhas atuais de `MAIN_TOOLS`, preservando os slugs (`python`, `rocketbot`, `automation-anywhere`, `power-automate`, `power-apps`, `outro`) e `order` = índice no array atual.
3. Adiciona `projects.mainToolId`, faz `UPDATE` casando `projects.mainTool` (slug salvo) com o `id` correspondente em `main_tools`, depois **dropa** a coluna antiga `projects.mainTool`.

Projetos com `mainTool` vazio ou com um valor que não bate com nenhum slug semeado (não deveria acontecer, já que a lista atual é fechada) ficam com `mainToolId` nulo.

## Backend

Estende `src/server/trpc/routers/taxonomy.router.ts` com o mesmo formato de `createArea`/`updateArea`/`deleteArea`:
- `listMainTools` — `publicProcedure`, só ativos, ordenados por `order`. É a query usada pelo combobox da tela de arquitetura.
- `listAllMainTools` — `protectedProcedure`, todos incl. inativos. Usada só pela tela de admin (`/admin/configuracoes/categorias`), que precisa listar e reativar itens desativados.
- `createMainTool` — `adminProcedure`, input `{name, slug, order}`, checa slug único (`CONFLICT` se duplicado).
- `updateMainTool` — `adminProcedure`, `{id, name?, isActive?, order?}`.
- `deleteMainTool` — `adminProcedure`, `{id}`.

## Admin — `/admin/configuracoes/categorias`

Nova aba/seção "Ferramentas principais" no mesmo componente que já lista Área/Tema/Sugestões, reaproveitando o layout existente: lista em cards, `Dialog` de criar/editar (Nome + Slug auto-derivado do nome via `slugify()` local já existente + Ordem), `Switch` de ativo/inativo por item, exclusão via `AlertDialog` de confirmação. Sem agrupamento hierárquico (diferente de Tema, que é filho de Área) — é uma lista plana, mais parecida com "Sugestões".

## Tela de arquitetura

O `<Select>` de "Ferramenta principal" (`architecture-tab.tsx:212-227`) é substituído por um combobox novo, construído sobre as primitivas `Popover` + `Command` que já existem em `src/shared/components/ui/command.tsx` mas não são usadas em nenhum lugar do app ainda. Componente novo e reutilizável: `src/shared/components/ui/creatable-combobox.tsx` — recebe `options`, `value`, `onChange`, `onCreate(label)`, mostra lista filtrável por texto digitado e, quando o texto não bate com nenhuma opção, uma linha final `Criar "{texto}"`.

Fluxo: usuário digita, filtra a lista vinda de `taxonomy.listMainTools`; se não achar, clica em "Criar 'X'" → dispara `createMainTool.mutate({name: texto, slug: slugify(texto), order: 0})` → ao suceder, invalida `taxonomy.listMainTools` e seleciona o `id` retornado como `mainToolId` do projeto (mesmo fluxo de salvar que já existe hoje, via `updateProject.mutate`).

## Fora de escopo

- Filtro por ferramenta principal em listagens de projeto — pode vir depois, uma vez que o dado estruturado exista.
- Reaproveitar o combobox novo em Área/Tema (eles continuam com Select simples + fluxo "Outro") — fica como possível padronização futura, não faz parte deste trabalho.
- Migrar retroativamente projetos cujo `mainTool` salvo não bate com nenhum dos 6 slugs atuais (não deveria existir, mas se existir, fica com `mainToolId` nulo e precisa ser resolvido manualmente depois).
