# Central de Downloads + XML agregado por empresa

## Contexto

A tela `admin/empresas` tem hoje dois botões de ícone idênticos (`Download`) na
linha de cada empresa: "Exportar diagnóstico completo (.pptx)" e "Exportar
automações existentes (.pptx)". Ambos disparam um fetch com header `x-user-id`
para uma rota de API dedicada, convertem a resposta em blob e disparam o
download via link temporário (`handleExportDeck` / `handleExportExistingAutomationsDeck`
em `src/app/(private)/admin/empresas/page.tsx`).

Objetivo: substituir os dois ícones por um único botão "Central de Downloads",
que leva a uma página dedicada por empresa listando as opções de download
disponíveis — hoje as duas existentes, mais uma nova: um XML agregado com
todos os projetos da empresa, organizados por área. Essa página deve ser
pensada para crescer (mais opções de download no futuro).

## Escopo

1. Nova página `admin/empresas/[id]/downloads` que lista os downloads
   disponíveis a partir de uma lista de configuração (não hardcoded inline),
   substituindo os dois ícones da tabela de empresas por um único botão.
2. Novo export: XML agregado de todos os projetos da empresa (qualquer
   status), agrupado e ordenado por área.
3. Nova rota de API que gera esse XML, seguindo o mesmo padrão de auth das
   rotas de deck já existentes.

Fora de escopo: mudanças no schema/formato do XML individual de projeto
(`buildProjetoCompletoXml`) usado em `project-xml-import-export.tsx` — esse
continua existindo e funcionando exatamente como hoje. Fora de escopo também
qualquer mudança no XML de *entrada* de solicitação (`xml-generation-prompt.ts`,
`ajuda-xml`) — este spec trata apenas de um XML de *saída*/relatório.

## 1. UI — Central de Downloads

### `admin/empresas/page.tsx`

- Remove os dois `<Button size="icon">` de download (linhas ~296–313), as
  funções `handleExportDeck` e `handleExportExistingAutomationsDeck`, e os
  estados `exportingId` / `exportingExistingAutomationsId` — essa lógica
  migra inteira para a nova página.
- Adiciona um único botão de ícone (mesmo padrão dos já existentes
  Priorização/Automações/Entrevistas/Custos — `<Link><Button size="icon"
  variant="ghost" title="Central de Downloads">`) apontando para
  `/admin/empresas/${company.id}/downloads`, usando o ícone `Download` já
  importado.

### `admin/empresas/[id]/downloads/page.tsx` (nova)

Segue o mesmo padrão estrutural das páginas irmãs (`custos`,
`automacoes-existentes`): `"use client"`, `use(params)` para pegar `id`,
`trpc.company.listAll.useQuery()` + `find` para nome da empresa (mascarado
via `useDemoMode`), header com seta "voltar" para `/admin/empresas`.

Corpo da página: uma lista de "cards de download" renderizada a partir de um
array de configuração, por exemplo:

```ts
interface DownloadItem {
  id: string;
  title: string;
  description: string;
  fileExtension: string;
  onDownload: () => Promise<void>;
  isDownloading: boolean;
}
```

Isso mantém a página extensível — adicionar uma 4ª opção no futuro é só
adicionar uma entrada nesse array, sem reestruturar o layout.

Itens iniciais:

1. **Diagnóstico completo (.pptx)** — mesma lógica de
   `handleExportDeck` (fetch em `/api/empresas/${id}/deck` com header
   `x-user-id`, blob, download via link temporário com `slugifyFilename`).
2. **Automações existentes (.pptx)** — mesma lógica de
   `handleExportExistingAutomationsDeck` (fetch em
   `/api/empresas/${id}/deck-automacoes-existentes`).
3. **XML agregado de projetos (.xml)** (novo) — fetch em
   `/api/empresas/${id}/xml-agregado`, mesmo padrão de blob download,
   nome de arquivo `xml-agregado-${safeName}.xml`.

Cada card mostra título, descrição curta, e um botão "Baixar" com estado de
loading individual (desabilitado enquanto a própria exportação está em
andamento — não bloqueia os outros cards).

## 2. XML agregado — estrutura

Reaproveita exatamente a mesma lista de tags por projeto que
`buildProjetoCompletoXml` já produz hoje (mesmos nomes: `projetoId`,
`titulo`, `area`, `tema`, `plataforma`, `descricao`, ... até
`ondaDeImplementacao`/`ordemNaOnda`), aninhada por área:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<dadosAgregadosEmpresa>
  <empresaId>...</empresaId>
  <empresaNome>...</empresaNome>
  <totalProjetos>N</totalProjetos>
  <areas>
    <area>
      <areaNome>Financeiro</areaNome>
      <totalProjetosNaArea>N</totalProjetosNaArea>
      <projetos>
        <projeto>
          <projetoId>...</projetoId>
          <titulo>...</titulo>
          <!-- ... mesmos campos do XML individual ... -->
        </projeto>
        <projeto>...</projeto>
      </projetos>
    </area>
    <!-- área seguinte -->
  </areas>
</dadosAgregadosEmpresa>
```

Regras de conteúdo:

- Inclui **todos** os projetos da empresa, independente de status (backlog,
  em andamento, concluído, cancelado etc.) — confirmado com o usuário.
- Áreas ordenadas por `ProjectArea.order` (mesmo campo usado hoje em outras
  telas para ordenar áreas). Projetos sem área (`areaId` nulo) vão para um
  grupo `Sem área` ao final.
- Dentro de cada área, projetos mantêm a ordem retornada pela query (sem
  requisito de sub-ordenação adicional).
- Ciente de que isso gera XML verboso com muitas empresas grandes (ex.: 150
  projetos = 150 blocos `<projeto>` completos) — aceito pelo usuário, já que
  o objetivo é ter um dump completo para processamento externo livre.

### Refatoração necessária em `build-projeto-completo-xml.ts`

Para reaproveitar os mesmos campos sem duplicar a lista de tags nem forçar a
nova rota a fabricar campos irrelevantes (`status`, `priority`, `clientId`,
`createdAt`, `updatedAt` do tipo `Project`, que não aparecem no XML):

- Extrair as linhas de tag hoje montadas dentro de `buildProjetoCompletoXml`
  para uma função `buildProjetoCompletoXmlFields(project, urgencyLevels):
  string[]` (sem a declaração XML nem o wrapper `<projetoCompleto>`).
- Tipar o parâmetro dessa função (e o de `buildProjetoCompletoXml`) como
  `Pick<Project, ...>` contendo só os campos efetivamente lidos, em vez do
  tipo `Project` completo. Como `Project` é estruturalmente um superconjunto
  desses campos, `project-xml-import-export.tsx` (que passa um `Project`
  inteiro) continua funcionando sem nenhuma mudança.
- Exportar `escapeXml` (hoje privada) para reuso no novo arquivo.
- `buildProjetoCompletoXml` passa a ser só:
  `declaração + <projetoCompleto> + buildProjetoCompletoXmlFields(...).join("\n") + </projetoCompleto>`.
  Comportamento e output do export individual não mudam.

Novo arquivo `src/shared/xml/build-empresa-agregado-xml.ts`:

```ts
export interface EmpresaAgregadoAreaGroup {
  name: string;
  projects: ProjetoCompletoXmlFields[]; // o Pick<Project, ...> acima
}

export function buildEmpresaAgregadoXml(
  company: { id: string; name: string },
  areaGroups: EmpresaAgregadoAreaGroup[],
  urgencyLevels: { value: string; label: string }[]
): string
```

Monta a declaração XML, `<dadosAgregadosEmpresa>`, metadados de empresa, e
itera `areaGroups` chamando `buildProjetoCompletoXmlFields` por projeto,
envolvendo cada um em `<projeto>...</projeto>` dentro de `<area>`.

## 3. Backend — nova rota de API

`src/app/api/empresas/[id]/xml-agregado/route.ts`, seguindo linha a linha o
mesmo padrão de auth manual das rotas `/deck` e
`/deck-automacoes-existentes` (header `x-user-id` obrigatório, usuário deve
existir, role `ADMIN`/`SUPER_ADMIN`).

Fluxo:

1. Busca a empresa (`id`, `name`) — 404 se não existir.
2. Em paralelo: busca todos os projetos com `companyId = id` (include:
   `area` com `order`, `theme`, `mainTool`, `mainToolCategory`,
   `solutionTypes`, `features`, `peopleOfInterest.person`), e busca
   `urgencyLevel` ativas ordenadas (mesma fonte usada em
   `taxonomy.listUrgencyLevels`).
3. Mapeia cada projeto do Prisma para o shape `Pick<Project, ...>` exigido
   por `buildProjetoCompletoXmlFields` (mesmo mapeamento já usado em
   `project.router.ts#byId`, restrito aos campos necessários).
4. Agrupa os projetos mapeados por `area.id` (chave `"__sem_area__"` para
   `areaId` nulo), preservando o `order` de cada área vindo do Prisma para
   ordenar os grupos; grupo sem área recebe ordem `+Infinity` (sempre por
   último).
5. Chama `buildEmpresaAgregadoXml(company, areaGroupsOrdenados,
   urgencyLevels)`.
6. Retorna `Response` com `Content-Type: application/xml` e
   `Content-Disposition: attachment; filename="xml-agregado-{safeName}.xml"`
   (mesmo `slugifyFilename` usado nas rotas de deck).

## Testes / verificação

- Empresa sem projetos → XML válido com `<areas>` vazio e
  `totalProjetos = 0` (sem erro).
- Empresa com projetos sem área → aparecem sob `<area><areaNome>Sem
  área</areaNome>`.
- Botão "Central de Downloads" navega corretamente e a página renderiza os
  3 cards; os dois downloads existentes continuam produzindo arquivos
  idênticos aos de hoje (mesma lógica, só realocada).
- Export individual de projeto (`ProjectXmlImportExport`) continua
  funcionando sem alterações — validado rodando o export de um projeto antes
  e depois da refatoração e comparando o XML byte a byte.
