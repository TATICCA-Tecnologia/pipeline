# Área/Tema como taxonomia estruturada de verdade (Design)

## Contexto

Hoje `área` e `tema` de um projeto nunca viram um dado estruturado/filtrável no banco. `ProjectArea`/`ProjectTheme` existem como tabelas próprias (com CRUD de admin em `taxonomy.router.ts`), mas o modelo `Project` **não tem nenhuma coluna que referencie essas tabelas** — a área/tema escolhidos só terminam decorados dentro do campo de texto livre `platform` (mostrado como "Tipo do projeto"). Os campos `type`/`category` (enums Prisma que teoricamente serviriam pra isso) são gravados como `"OUTRO"` para todo projeto vindo do cliente, sempre, e nunca são usados em nenhum filtro. Bater ou cair em "Outro" hoje não faz diferença nenhuma pro banco — os dois casos produzem a mesma string decorativa.

O caso real que expôs isso: um XML da Local Frio trouxe área "Financeiro" e tema "Fechamento e consolidação", nenhum dos dois cadastrado na taxonomia — o sistema tratou como "Outro" silenciosamente, sem chance de vincular a uma categoria real ou cadastrar uma nova.

## Requisitos confirmados com o usuário

1. **Nova relação estruturada real**: `Project` ganha `areaId`/`themeId` (colunas nullable, FK pra `ProjectArea`/`ProjectTheme`, `onDelete: SetNull`). Isso é adicionado **ao lado** do sistema decorativo atual (`platform`/`type`/`category` continuam existindo sem mudança) — não é uma migração de dado, é um novo caminho estrutural pra projetos novos.
2. **Escopo**: o fluxo de resolução (mapear pra existente ou cadastrar novo) vale tanto para **importação de XML** quanto para o **formulário manual** de "Solicitar Projeto".
3. **Projetos já existentes não são migrados agora** — ficam com `areaId`/`themeId` nulos. Só projetos criados a partir de agora passam a ter o vínculo estruturado.
4. **Permissão pra cadastrar categoria nova**: qualquer usuário pode **mapear** uma área/tema não reconhecida para uma **já existente**. Só quem tem permissão real de admin (`adminProcedure`, já existente em `taxonomy.createArea`/`createTheme`) pode **cadastrar uma categoria nova** — a checagem é a mesma já usada em todo o app (role real do usuário autenticado, não o "ver como" de super_admin). Um cliente comum só vê a opção de mapear pra existente; se nada servir, cai em "Outro" (texto livre, como hoje) até um admin formalizar depois.

## Fluxo — Importação de XML

`parseSolicitacaoXml` para de decidir sozinho "não bateu, vira Outro" para `area`/`tema`: quando não bate, o resultado sinaliza `areaUnresolved: true` (com o texto bruto), análogo ao já existente `companyUnresolved`. Tema só é resolvido depois que a área estiver decidida (temas são filhos de uma área).

Isso alimenta o mesmo padrão de Promise/`useRef` já construído para resolver empresa ambígua em lote (`resolveCompanyAmbiguity`/`companyResolverRef`, ver `2026-07-07-xml-batch-zip-import-design.md`) — um novo par `resolveAreaAmbiguity`/`resolveThemeAmbiguity` (ou um diálogo combinado, já que os dois costumam ficar sem bater juntos) pausa o loop sequencial de importação (single ou lote) esperando a decisão do usuário, com o mesmo contexto "Arquivo N de M" quando aplicável.

Diálogo "Área/tema não cadastrados":
- Mostra o valor bruto da tag que não bateu.
- Select para mapear a uma área (e, depois de escolhida, um tema daquela área) já cadastrados.
- **Só para admin/super_admin**: botão adicional "Cadastrar '<valor>' como nova área/tema" — chama `taxonomy.createArea`/`createTheme` (mutations já existentes, sem mudança) e usa o ID resultante.
- Se o usuário cancelar sem escolher nada: mantém o comportamento de hoje (fica como "Outro", texto livre, `areaId`/`themeId` nulos) — não bloqueia o restante do lote.

## Fluxo — Formulário manual ("Solicitar Projeto")

O `<Select>` de área/tema já lista todas as opções cadastradas — não precisa de um passo extra de "mapear pra existente" aqui, porque escolher direto do dropdown já é isso. A única mudança: quando o usuário escolhe "Outro" e digita um valor customizado, **e é admin/super_admin**, aparece uma opção "Cadastrar '<valor>' como nova área/tema permanente" (checkbox ou botão) — ao marcar/confirmar, o submit chama `taxonomy.createArea`/`createTheme` antes de criar o projeto e usa o ID resultante. Cliente comum não vê essa opção — comportamento de "Outro" continua idêntico ao de hoje pra ele.

## Fora de escopo

- Filtro por área/tema na listagem de projetos (`/admin/projetos`) — o objetivo agora é só ter o dado estruturado existindo; filtrar por ele é um passo natural futuro, uma vez que exista dado real acumulado.
- Migrar/religar projetos já criados a uma área/tema real.
- Mexer nos campos `type`/`category` (enums sempre "OUTRO") ou no campo decorativo `platform` — continuam existindo exatamente como hoje, em paralelo ao novo vínculo estruturado.
- Mesma tratativa para `publicoAlvo` — não tem tabela própria no banco (é uma lista fixa no código), criar isso seria um sistema novo à parte.
