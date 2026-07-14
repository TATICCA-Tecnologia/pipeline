# Deck "Automações Existentes" (.pptx) (Design)

## Contexto

Os sub-projetos 1 e 2 (já implementados e em produção) escoparam o funil de oportunidades (`getPrioritizedRanking`/`getAreaSummary`, tela de Priorização, deck de diagnóstico atual) para excluir automações já existentes/entregues, e criaram uma tela on-screen (`/admin/empresas/[id]/automacoes-existentes`) reportando essa população separadamente. Este sub-projeto (3 de 3) adiciona o export `.pptx` equivalente — um segundo deck, espelhando a estrutura do deck de diagnóstico atual, mas para a população de automações existentes.

## Requisitos confirmados com o usuário

1. **Slides incluídos**: capa → resumo por área (economia acumulada real) → ranking por economia acumulada → ranking qualitativo → entrevistas (se houver, mesmo slide/dado da empresa, sem relação com a população) → um slide por automação existente.
2. **Sem cronograma, sem payback, sem composição de payback, sem ranking combinado** — não se aplicam.
3. **Slide por automação**: reaproveita o slide de processo já existente (`addProjectSlide`/tabela quantitativa + radar), **acrescentando duas linhas novas** na tabela quantitativa: "Status operacional" e "Economia acumulada (real)".

## Arquitetura

`src/server/deck/build-diagnostic-deck.ts` (911 linhas) já foi desenhado para ser estendido (comentário existente no topo do arquivo: "Passo 8b vai ESTENDER este módulo... cada slide é uma unidade isolada fácil de acrescentar"). Em vez de crescer ainda mais esse arquivo com uma segunda árvore de orquestração completa (capa + resumo + rankings + slides por automação, só que para outra população), este design cria um **arquivo novo**, `src/server/deck/build-existing-automations-deck.ts`, que:

- **Reaproveita, via export**, as poucas funções/constantes genéricas de `build-diagnostic-deck.ts` que não têm nenhuma lógica específica de oportunidade: `addCoverSlide`, `addTitledSlide`, `addSlideTable`, `addInterviewsSlide`, `addSectionLabel`, as constantes de cor (`COLOR_PRIMARY`, `COLOR_MUTED`, `COLOR_HEADER_BG`, `COLOR_HEADER_TEXT`, `COLOR_TABLE_BORDER`), `TABLE_HEADER_OPTS`, e o tipo `Interviews`. Essas funções ganham a palavra-chave `export` (nenhuma mudança de lógica) em `build-diagnostic-deck.ts`.
- **Reaproveita, via export + parâmetro novo opcional**, o slide de processo: `addProjectSlide` ganha um terceiro parâmetro opcional, `extraQuantitativeLines?: QuantitativeLine[]`, concatenado ao final das linhas já calculadas por `buildQuantitativeLines` (que continua intocado — nenhuma automação existente perde os campos originais de diagnóstico, eles só ganham duas linhas a mais no fim da mesma tabela). `addProjectSlide` e o tipo `QuantitativeLine` também ganham `export`.
- **Escreve do zero** as três coisas que são genuinamente diferentes: o slide de resumo por área (campos diferentes: `totalAccumulatedSavingBRL` em vez de `totalEstimatedSavingBRL`/`totalCurrentAnnualHours`), os dois slides de ranking (usa `getExistingAutomationsRanking`, sem score combinado), e a orquestração principal (`buildExistingAutomationsDeck`).

Isso mantém `build-diagnostic-deck.ts` como o módulo do deck de oportunidades (sem crescer com uma segunda responsabilidade completa) e `build-existing-automations-deck.ts` como um módulo focado, que importa só o que precisa reaproveitar.

## Mudanças em `build-diagnostic-deck.ts`

Puramente aditivo — adiciona `export` a 5 funções + 1 tipo + as constantes de cor/estilo já listadas acima. Nenhuma lógica muda. `ProjectDeckRow` (o tipo de linha usado por `addProjectSlide`) **não muda** — continua exatamente com os campos que já tem hoje; o arquivo novo usa seu próprio tipo de linha (superset com os 2 campos novos) e só precisa que os campos de `ProjectDeckRow` estejam presentes nele (compatibilidade estrutural, sem import de tipo extra).

## Novo arquivo: `src/server/deck/build-existing-automations-deck.ts`

Estrutura mínima e paralela a `buildDiagnosticDeck`:

```ts
export async function buildExistingAutomationsDeck(companyId: string, actingUserId: string): Promise<Buffer> {
  // busca company, monta caller (idêntico ao existente)
  // Promise.all: areaSummary (getExistingAutomationsAreaSummary), rankingEconomia e
  // rankingQualitativo (getExistingAutomationsRanking), interviews (interview.list),
  // e a query de projetos (mesmo select de ProjectDeckRow + accumulatedSavingBRL +
  // operationalStatus), filtrada por OR: [{ hasCurrentApplication: "sim" }, { status: "DONE" }]
  // — mesmo filtro das duas queries de sub-projeto 2.

  addCoverSlide(pres, company.name); // reaproveitado
  addExistingAutomationsAreaSummarySlide(pres, areaSummary); // novo
  addExistingAutomationsRankingSlide(pres, "Ranking por economia acumulada", rankingEconomia, "economia"); // novo
  addExistingAutomationsRankingSlide(pres, "Ranking por qualitativo", rankingQualitativo, "qualitativo"); // novo
  if (interviews.length > 0) addInterviewsSlide(pres, interviews); // reaproveitado

  for (const project of projects) {
    const extraLines: QuantitativeLine[] = [
      {
        label: "Status operacional",
        value: project.operationalStatus
          ? ROBOT_OPERATIONAL_STATUS_LABEL[project.operationalStatus]
          : "Sem status",
      },
      {
        label: "Economia acumulada (real)",
        value: project.accumulatedSavingBRL != null ? formatCurrency(project.accumulatedSavingBRL) : "Não informado",
        isSaving: true,
      },
    ];
    addProjectSlide(pres, project, extraLines); // reaproveitado, com as linhas extras
  }

  return buffer;
}
```

`ROBOT_OPERATIONAL_STATUS_LABEL` aqui é só um mapa local `{ ACTIVE: "Ativo", PAUSED: "Pausado", ISSUE: "Com problema" }` (não importa `ROBOT_OPERATIONAL_STATUS_CONFIG` do frontend porque este é código server-side puro, sem depender de classes Tailwind — só precisa do rótulo em texto pro slide).

## Endpoint

`src/app/api/empresas/[id]/deck-automacoes-existentes/route.ts` — cópia estrutural exata de `src/app/api/empresas/[id]/deck/route.ts` (mesma checagem manual de `x-user-id`/role admin, já que esta rota não é tRPC e não passa pelos middlewares), chamando `buildExistingAutomationsDeck` em vez de `buildDiagnosticDeck`, com nome de arquivo `automacoes-existentes-${safeName}.pptx`.

## Frontend

Novo botão de ícone (`Download`, mesmo ícone do export atual) em `src/app/(private)/admin/empresas/page.tsx`, ao lado do ícone "Automações Existentes" (sub-projeto 2) já adicionado — título "Exportar automações existentes (.pptx)" — reaproveitando o mesmo padrão de `handleExportDeck` (fetch com blob, nome de arquivo sanitizado), só apontando para a rota nova.

## Fora de escopo

- Qualquer mudança na aparência/estrutura do deck de diagnóstico de oportunidades já existente.
- Paginação/limite de projetos por deck — mesma nota de performance já documentada em `build-diagnostic-deck.ts` (preocupação conhecida, não resolvida aqui, não é regressão nova).
- Um botão consolidado "exportar tudo" — os dois exports continuam sendo dois botões/arquivos separados.
