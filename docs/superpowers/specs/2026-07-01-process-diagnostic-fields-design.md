# Campos de Diagnóstico de Processo (Design)

## Contexto

A TATICCA usa um material de diagnóstico consultivo (ver `Diagnostico_-_Marilan_vf.pdf`) para levantar oportunidades de automação/RPA por cliente. Cada processo levantado é avaliado com: área, complexidade, avaliação qualitativa em 5 critérios, periodicidade, duração de execução, número de colaboradores envolvidos, horas economizadas por ano e economia financeira estimada.

O sistema Pipeline já cobre boa parte disso na tela "Solicitar Projeto" (cliente) e na aba "Configuração técnica" da Especificação (admin/arquiteto):

- Já existe: `title`, `description`, `projectArea`/`projectTheme` (taxonomia), `projectNarrative`, `hasExistingSystem`/`existingSystemDetails`, `monthlyHoursSaved`, e os 5 campos de avaliação qualitativa (`ratingErrorReduction`, `ratingProcessCriticality`, `ratingInternalImpact`, `ratingExternalImpact`, `ratingCompliance`) — que batem quase exatamente com os 5 critérios do diagnóstico da TATICCA.
- Já existe (admin/arquiteto): `solutionTypes`, `mainTool`, `executionStrategy`, `architectNotes` na aba "Configuração técnica" de `/admin/projetos/[id]/especificacao`.

Faltam os campos que permitem reconstruir a tabela de diagnóstico: complexidade, periodicidade do processo, agendamento do robô, colaboradores envolvidos, duração por execução, horas anuais (calculado) e economia financeira estimada.

**Este documento cobre apenas a captura desses dados (schema + formulários).** Gerar o relatório/PDF equivalente ao diagnóstico (rankings, priorização, cronograma, payback) é uma etapa futura, fora de escopo aqui.

## Requisitos confirmados com o usuário

1. Nenhum campo novo é obrigatório em lugar nenhum — se ficar em branco, tudo bem.
2. Campos **operacionais** (o que o cliente sabe sobre como o processo funciona hoje) ficam no formulário "Solicitar Projeto", editáveis pelo cliente, opcionais:
   - Colaboradores envolvidos
   - Duração por execução
   - Periodicidade do processo
3. Campos **técnicos/financeiros** (exigem avaliação de quem vai desenvolver) ficam na aba "Configuração técnica" da Especificação, editáveis só por admin/arquiteto, opcionais:
   - Complexidade
   - Agendamento do robô
   - Saving Estimado Anual (R$)
4. **Valores em reais nunca aparecem em nenhuma tela do cliente** — só em telas de admin/arquiteto.
5. "Horas anuais" é calculado automaticamente a partir de Duração × Periodicidade, e esse valor (por não ser dinheiro) pode aparecer também para o cliente, como feedback imediato no formulário.
6. Não há um campo separado para "Economia Ponderada [h]" — no material da TATICCA esse número é sempre igual a "Horas anuais", só reaproveitado numa coluna com nome diferente nas tabelas-resumo. Um único campo calculado cobre os dois.
7. "Detalhamento do Processo" e "Principais Ações da Programação" do diagnóstico já são cobertos pelos campos existentes `description`/`projectNarrative` (cliente) e `architectNotes` (arquiteto) — não precisam de campo novo.
8. "Área" do diagnóstico já é coberta pela taxonomia existente (`projectArea`/`projectTheme`, gerenciável em `/admin/configuracoes/categorias`) — não é mudança de schema, é dado de configuração.
9. Fora de escopo agora: gerar o relatório/export equivalente ao PDF (rankings, priorização Top 15, gráfico de payback, cronograma de implementação).

## Modelo de dados

### `prisma/schema.prisma` — `Project`

Adicionar ao bloco `// Detalhes da solicitacao` (campos operacionais, preenchidos pelo cliente):

```prisma
  peopleInvolved   Int?     // colaboradores envolvidos na execução manual hoje
  taskDurationHours Float?  // duração total de cada execução (somando todos os envolvidos), em horas
  processFrequency String?  // "diario" | "duas-vezes-semana" | "tres-vezes-semana" | "semanal" | "mensal" | "anual"
  currentAnnualHours Float? // calculado: taskDurationHours × multiplicador(processFrequency) — horas GASTAS HOJE no processo manual, não confundir com o "monthlyHoursSaved" já existente (que é a economia estimada que o cliente declara, um número diferente e independente)
```

Adicionar ao bloco `// Arquitetura tecnica (preenchido pelo arquiteto)` (campos técnicos, admin/arquiteto):

```prisma
  complexity            String? // "baixa" | "media" | "alta"
  robotSchedule         String? // texto livre curto, ex.: "Hora fixa, uma vez por dia"
  estimatedAnnualSavingBRL Float? // nunca exposto em telas/queries usadas pelo cliente
```

Nenhum desses campos é obrigatório (`?` em todos). Nenhuma migration de dados é necessária além de `ALTER TABLE ... ADD COLUMN` (todos nullable, sem backfill).

### Multiplicadores de periodicidade (`processFrequency` → ocorrências/ano)

| Valor | Rótulo exibido | Multiplicador |
|---|---|---|
| `diario` | Diário | 260 |
| `duas-vezes-semana` | Duas vezes por semana | 104 |
| `tres-vezes-semana` | Três vezes por semana | 156 |
| `semanal` | Semanal | 52 |
| `mensal` | Mensal | 12 |
| `anual` | Anual | 1 |

`currentAnnualHours = taskDurationHours × multiplicador(processFrequency)`, recalculado sempre que duração ou periodicidade mudam. Se qualquer um dos dois estiver vazio, `currentAnnualHours` fica `null` (não calcula com dado parcial). Esse valor representa **quanto tempo o processo manual já consome hoje por ano** — é o dado bruto que alimentaria um cálculo de economia futuro (etapa de relatório, fora de escopo), não é em si uma "economia".

## Backend (tRPC)

### `src/server/trpc/routers/project.router.ts`

- `create`: aceitar `peopleInvolved`, `taskDurationHours`, `processFrequency` como inputs opcionais (todos vindos do formulário do cliente); calcular `currentAnnualHours` no backend a partir desses dois (mesma lógica de multiplicador acima) e gravar junto — não confiar em um valor calculado no frontend.
- `update`: aceitar os mesmos três campos operacionais (recalculando `currentAnnualHours` se duração ou periodicidade mudarem), mais `complexity`, `robotSchedule`, `estimatedAnnualSavingBRL` (campos técnicos, só usados pela tela de admin).
- `list` e `byId`: incluir todos os sete campos novos no retorno — **exceto** que o mapeamento usado pelo `byId`/`list` deve continuar retornando `estimatedAnnualSavingBRL` normalmente (a restrição "cliente não vê" é aplicada no frontend, não removendo o campo da resposta da API — mesmo padrão de rigor já usado no resto do app, que não faz strip de campos por papel no backend). Isso deve ficar explícito no plano de implementação para não ser esquecido na revisão.

Nenhuma procedure nova é necessária — só estender `create`/`update`/`list`/`byId` já existentes.

## Frontend

### `src/app/(private)/cliente/solicitar/page.tsx`

Na etapa "Envolvidos" (mesmo step que já tem "Já existe um processo/sistema atual?"), adicionar um novo bloco opcional, sem asterisco de obrigatório:

- Campo numérico "Colaboradores envolvidos" (`peopleInvolved`)
- Campo numérico "Duração total por execução (horas)" (`taskDurationHours`), com texto de ajuda: "Some o tempo de todos os envolvidos, não só de uma pessoa."
- Seletor "Periodicidade do processo" (`processFrequency`, as 6 opções da tabela acima), mesmo componente `Select` já usado nos outros seletores da tela
- Texto informativo abaixo dos três campos: "Tempo gasto hoje: **X h/ano**" — calculado no cliente em tempo real só para feedback visual (o valor gravado de fato vem do cálculo do backend na hora do `create`, para não depender de o frontend calcular certo)

Esses três campos vão para o `useState`/schema local da mesma forma que `hasExistingSystem`/`existingSystemDetails` já vão hoje (não fazem parte da validação obrigatória do formulário).

### `src/app/(private)/admin/projetos/[id]/especificacao/_components/architecture-tab.tsx`

No card "Configuração técnica" já existente, adicionar três campos abaixo de "Estratégia de execução":

- Seletor "Complexidade" (Baixa / Média / Alta) — mesmo componente `Select` das outras opções do card
- Campo de texto curto "Agendamento do robô" (texto livre, ex.: "Hora fixa, uma vez por dia")
- Campo numérico "Saving Estimado Anual (R$)" — formatado como moeda na exibição, gravado como número puro

Esses três campos entram no mesmo `handleSaveArchitecture`/`updateProject.mutate` que já salva `solutionTypes`/`mainTool`/`executionStrategy`/`architectNotes` hoje — não é um botão de salvar separado.

Essa aba (Especificação) já é uma tela exclusiva de admin (o menu "Especificação" só aparece pra quem tem esse papel) — então o requisito "cliente nunca vê o valor em reais" já é satisfeito automaticamente por essa tela nunca ser acessada pelo cliente. Não é necessário nenhum controle de visibilidade adicional além disso.

### Onde os campos operacionais aparecem depois de salvos

O card "Equipe"/detalhe do projeto (`/projeto/[id]`) e a listagem admin não precisam mostrar esses campos novos nesta etapa — eles ficam disponíveis via `byId`/`list` para quando a etapa de relatório for construída, mas não é pedido nenhum novo ponto de exibição agora além dos dois formulários de entrada (Solicitar Projeto e Configuração técnica). Isso evita construir UI de visualização que será refeita quando a geração de relatório for desenhada.

## Fora de escopo (confirmado)

- Geração do relatório/export equivalente ao diagnóstico da TATICCA (rankings, priorização, gráfico de payback, cronograma de implementação de robôs).
- Qualquer controle de acesso a nível de API que impeça um cliente de obter `estimatedAnnualSavingBRL` via chamada direta ao tRPC — a proteção nesta etapa é só a tela de Especificação ser exclusiva de admin, mesmo padrão de rigor do resto do sistema.
- Alterar a taxonomia de áreas/temas existente ou adicionar novas áreas do diagnóstico (ex.: "Dados Mestres") — isso é dado de configuração em `/admin/configuracoes/categorias`, não requer mudança de código.
