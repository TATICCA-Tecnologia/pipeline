# Customizar o campo "Urgência" (Design)

## Contexto

"Nível de urgência" hoje é uma lista fixa hardcoded (`URGENCY_LEVELS` em `src/shared/constants/project-taxonomy.ts`: baixa/média/alta/urgente/outro), usada em ~9 arquivos: formulário do cliente (`cliente/solicitar`), edição pelo admin (`project-request-edit-form.tsx`), exibição (`project-detail-sections.tsx`), export/import do XML "projeto completo", e a página de ajuda do XML de solicitação.

O campo `Project.urgency` já é um `String?` livre, sem FK — o formulário do cliente hoje tem uma opção "Outro" que revela um campo de texto livre (`customUrgency`), e o valor digitado vira o próprio `project.urgency` (nunca fica reutilizável nem visível em um lugar central).

O usuário confirmou: quer virar uma taxonomia de verdade, gerenciável (mesmo padrão de Área/Tema/Ferramenta/Tipo de Solução), mas **só o admin cadastra novos valores** — o cliente escolhe entre as opções já cadastradas, sem opção "Outro"/texto livre no formulário de solicitação.

## Requisitos confirmados com o usuário

1. Nova taxonomia customizável "Nível de Urgência", gerenciável em Configurações → Categorias (CRUD completo: criar, renomear, ativar/desativar, remover — mesmo padrão de `MainTool`).
2. Cliente (`cliente/solicitar`): Select simples com as opções cadastradas — **sem** "Outro"/campo de texto livre.
3. Admin (edição de projeto): pode escolher entre as opções cadastradas **e** cadastrar uma nova ali mesmo (mesmo padrão de Ferramenta/Tipo de Solução na aba Arquitetura).
4. **Sem migração de dados em `Project`**: `Project.urgency` continua sendo texto livre, sem FK — só a fonte das opções muda (de array fixo pra banco). Valores já salvos (incluindo textos digitados no "Outro" antigo) continuam aparecendo exatamente como estão.

## Modelo de dados

Novo model, espelhando exatamente `MainTool`:

```prisma
model UrgencyLevel {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  isActive  Boolean   @default(true)
  order     Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("urgency_levels")
}
```

Sem relação com `Project` (nenhuma FK) — é só uma tabela de opções, igual `MainTool`/`CostCategory` conceitualmente seriam se não tivessem relação. `Project.urgency` não muda.

Migration cria a tabela e semeia os 4 níveis reais de hoje (Baixa, Média, Alta, Urgente — "Outro" não é semeado, é só um rótulo de UI que vira "criar novo", igual `PROJECT_AREAS` não semeia um Area "outro").

## Backend

`taxonomy.router.ts` ganha `listUrgencyLevels` (public, `isActive: true`), `listAllUrgencyLevels` (protected, pra tela de Categorias), `createUrgencyLevel`, `updateUrgencyLevel`, `deleteUrgencyLevel` — cópia exata do bloco de `MainTool` (linhas ~370-420 hoje), trocando o model.

## Frontend

- **Configurações → Categorias**: nova seção "Níveis de Urgência", cópia da seção "Ferramentas principais" (lista com badge de slug, switch de ativo, editar, remover, dialog de criar/editar).
- **`useTaxonomy()`** (`cliente/solicitar/utils/use-taxonomy.ts`): ganha `urgencyLevels` (busca `taxonomy.listUrgencyLevels`, fallback pros 4 valores hardcoded enquanto carrega/vazio — mesmo padrão de `areas`).
- **`cliente/solicitar/page.tsx`**: o bloco de "Nível de urgência" perde a ramificação "outro"/`customUrgency` (Input condicional removido) — vira um Select simples populado por `useTaxonomy().urgencyLevels`. `customUrgency` sai do form data, do `fieldsToValidate` e de `build-project-payload.ts` (`urgencyValue` passa a ser sempre `data.urgency` direto).
- **`project-request-edit-form.tsx`**: o Select de `URGENCY_LEVELS` vira um `CreatableCombobox` (mesmo componente já usado em Ferramenta/Tipo de Solução), com `taxonomy.createUrgencyLevel` para criar inline.
- **`project-detail-sections.tsx`**: label resolvido contra `taxonomy.listUrgencyLevels` (query) em vez de `URGENCY_LEVELS`, com fallback pro valor cru se não achar (mesmo padrão de fallback já usado nos outros campos).
- **XML "projeto completo"** (`build-projeto-completo-xml.ts`/`parse-projeto-completo-xml.ts`): resolvido contra a lista do banco (consultada uma vez em `project.router.ts` e passada pras funções de build/parse) em vez de `URGENCY_LEVELS` estático.
- **`cliente/solicitar/ajuda-xml/page.tsx`**: `acceptedValues` da tag `<urgencia>` passa a vir de `useTaxonomy().urgencyLevels` (já usa o hook pra área/tema, só estende).
- **`xml-import.ts`** (parser do XML de solicitação — schema do XML não muda, só o que conta como valor reconhecido): `XmlImportContext` ganha `urgencyLevels`; a ramificação "não bateu → vira Outro com texto livre" é removida (não existe mais campo pra guardar isso) — se a tag `<urgencia>` não bater com nenhuma opção cadastrada, o campo fica vazio e um aviso é adicionado (mesmo padrão de aviso já usado pros outros campos não reconhecidos). Isso é roteado por `use-xml-opportunity-importer.ts` (que já recebe `areas`/`themesByArea`/`companies` de fora) e pelo call site direto em `admin/oportunidades/gerar-ia/page.tsx`.

## Fora de escopo

- Qualquer outra lista fixa deste arquivo (`PLATFORMS`, `PROCESS_FREQUENCIES`, `COMPLEXITY_LEVELS`, `TARGET_AUDIENCES` etc.) — só "urgência" foi pedido.
- Mudar o schema/formato do XML de solicitação (tags, estrutura) — só o conjunto de valores aceitos pra `<urgencia>` passa a ser dinâmico.
- Migrar/normalizar valores de urgência já salvos em projetos existentes — ficam como estão, exibidos com fallback pro texto cru quando não baterem com nenhuma opção cadastrada.
