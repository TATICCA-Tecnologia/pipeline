# Merge de Área e Tema na tela de categorias (Design)

## Contexto

`/admin/configuracoes/categorias` já tem CRUD completo de Área, Tema, Sugestão e Ferramenta principal (`editar`/`ativar-desativar`/`excluir`), mas `excluir` é sempre destrutivo: `deleteArea` cascade-deleta os temas da área (`onDelete: Cascade` em `ProjectTheme.area`) e desvincula silenciosamente projetos/entrevistas (`onDelete: SetNull` em `Project.area`/`Interview.area`); `deleteTheme` desvincula projetos da mesma forma. Não existe hoje um caminho pra "essa área/tema era besteira, quero que tudo que está nela vire parte de uma área/tema que já existe" — o único jeito é editar manualmente cada projeto afetado depois do fato.

O caso real que motivou isso: usuários (clientes, principalmente) cadastram áreas/temas novos com pouca curadoria (via o fluxo "Outro" + "cadastrar como nova área/tema permanente" no formulário de solicitação, `[[pipeline_area_tema_taxonomia_estruturada]]`), gerando duplicatas ou categorias sem sentido. Hoje corrigir isso exige apagar (perdendo o vínculo dos projetos) ou editar projeto por projeto.

## Requisitos confirmados com o usuário

1. **Escopo**: merge de Área inteira (com tudo embaixo) E merge de Tema individual (dentro da mesma área ou entre áreas diferentes) — não só um dos dois.
2. **Entrada na UI**: botão "Mesclar" próprio, separado do botão "Excluir" existente — em cada linha de Área e em cada chip de Tema. "Excluir" continua exatamente como hoje (destrutivo, sem migração).
3. **Colisão de slug entre temas ao mesclar Área**: se a área de origem e a de destino têm um tema com o mesmo slug, o merge é **bloqueado** com um erro listando os temas colidentes — resolução é manual (o admin mescla ou renomeia esses temas primeiro, depois tenta de novo). Sem auto-merge implícito de temas.
4. **Preview obrigatório**: antes de confirmar, o diálogo mostra quantos temas/projetos/entrevistas/sugestões serão movidos (para Área) ou quantos projetos (para Tema), buscado do backend assim que o destino é escolhido.

## Modelo de dados

Nenhuma migration nova — o merge só reatribui foreign keys que já existem (`ProjectTheme.areaId`, `Project.areaId`/`themeId`, `Interview.areaId`, `FeatureSuggestion.areaSlug`).

## Backend — `taxonomy.router.ts`

Quatro novos procedures, todos `adminProcedure` (mutations) / `protectedProcedure` (previews):

**`previewAreaMerge`** — input `{ sourceId, targetId }`. Busca os temas de `sourceId` e `targetId`, calcula a interseção de slugs (colisões). Retorna:
```ts
{
  themeCount: number;
  projectCount: number;
  interviewCount: number;
  suggestionCount: number;
  collisions: { slug: string; sourceThemeName: string; targetThemeName: string }[];
}
```

**`mergeArea`** — input `{ sourceId, targetId }`. Valida `sourceId !== targetId` e que ambos existem (`NOT_FOUND` caso contrário). Recalcula as colisões de slug server-side (nunca confia só na checagem que a UI já fez) — se houver, `CONFLICT` com a lista de temas colidentes na mensagem. Sem colisão, roda em `ctx.db.$transaction([...])`:
1. `projectTheme.updateMany({ where: { areaId: sourceId }, data: { areaId: targetId } })` — reparenta todos os temas.
2. `project.updateMany({ where: { areaId: sourceId }, data: { areaId: targetId } })`
3. `interview.updateMany({ where: { areaId: sourceId }, data: { areaId: targetId } })`
4. `featureSuggestion.updateMany({ where: { areaSlug: source.slug }, data: { areaSlug: target.slug } })`
5. `projectArea.delete({ where: { id: sourceId } })` — já sem temas filhos nesse ponto, delete limpo.

**`previewThemeMerge`** — input `{ sourceId, targetId }`. Retorna `{ projectCount: number }` (contagem de `project.count({ where: { themeId: sourceId } })`). Sem checagem de colisão — merge de tema é sempre permitido (não tem sub-entidades próprias).

**`mergeTheme`** — input `{ sourceId, targetId }`. Valida `sourceId !== targetId` e que ambos existem. Busca `targetTheme.areaId`. Roda em transação:
1. `project.updateMany({ where: { themeId: sourceId }, data: { themeId: targetId, areaId: targetTheme.areaId } })` — reatribui tema **e** área do projeto, pra manter consistência (tema sempre pertence à área do projeto depois do merge, mesmo se o merge cruzou áreas diferentes).
2. `projectTheme.delete({ where: { id: sourceId } })`

## UI — `/admin/configuracoes/categorias`

**Botão "Mesclar"** (ícone, ex. `Merge`/`GitMerge` do lucide-react) ao lado do `Pencil`/`Trash2` existente, tanto na linha de cada Área quanto no chip de cada Tema.

**Diálogo de merge de Área**: título "Mesclar '<nome da área>'". Um `Select` com todas as outras áreas ativas como destino. Ao escolher, dispara `previewAreaMerge` e mostra:
- Se `collisions.length > 0`: mensagem de erro listando os temas colidentes (nome de cada lado), botão "Confirmar" desabilitado.
- Senão: texto tipo "Isso vai mover **3 temas**, **12 projetos**, **2 entrevistas** e **5 sugestões** de '<origem>' para '<destino>'. Essa ação não pode ser desfeita." — botão "Confirmar mesclagem" habilitado, chama `mergeArea`.

**Diálogo de merge de Tema**: título "Mesclar '<nome do tema>'". Um `Select` com todos os temas de todas as áreas como destino (rotulado "Área > Tema", excluindo o próprio tema), já que merge entre áreas diferentes é permitido. Ao escolher, dispara `previewThemeMerge` e mostra "Isso vai mover **12 projetos** de '<origem>' para '<destino>'. Essa ação não pode ser desfeita." — botão "Confirmar mesclagem" chama `mergeTheme`.

Em ambos os diálogos, sucesso invalida `taxonomy.listAllAreas` (cobre áreas e temas, já que temas vêm aninhados) e `taxonomy.listAllSuggestions`, fecha o diálogo, mostra toast de sucesso.

## Fora de escopo

- Dedupe de `FeatureSuggestion`s com o mesmo texto após o merge de área — pode sobrar duplicata (mesmo `label` sob a área de destino), resolvível manualmente depois via o CRUD de sugestões que já existe.
- Merge em lote (várias origens de uma vez pra um destino) — só um par origem/destino por operação.
- Merge de `MainTool` ou de `Company` — este design cobre só Área e Tema, os dois pedidos explicitamente.
- Desfazer merge (undo) — a ação já avisa que não pode ser desfeita; não há histórico/rollback automático.
