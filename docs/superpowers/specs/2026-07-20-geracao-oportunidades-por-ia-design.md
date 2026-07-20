# Geração de oportunidades por IA a partir de transcrição (Design)

## Contexto

Hoje o consultor cola a transcrição de uma reunião de levantamento, junto com
um prompt grande e cuidadosamente calibrado (`docs/prompt-geracao-xml.md`,
~200 linhas, com regras de "CAMPO RESTRITO" e exemplos ERRADO/CERTO
adicionados a partir de incidentes reais), numa ferramenta de IA externa
(ChatGPT/Claude). A IA devolve um `.xml` de `<solicitacaoDeProjeto>` por
oportunidade identificada na transcrição, que o consultor então importa
manualmente em `/cliente/solicitar` (arquivo único ou `.zip` em lote, ver
`2026-07-07-xml-batch-zip-import-design.md`).

Este documento adiciona uma tela de admin que roda essa mesma rotina **dentro
da ferramenta**: o admin cola a transcrição, o sistema chama uma API de IA
configurável (cadastrada pelo próprio admin — sem vendor fixo) usando o mesmo
prompt, e apresenta as oportunidades extraídas para revisão antes de criar.

**Não muda** o schema do XML, o parser (`parseSolicitacaoXml`) nem o conteúdo
das regras do prompt — esta feature é uma nova via de _entrada_ que produz o
mesmo XML que já é validado e importado hoje.

## Requisitos confirmados com o usuário

1. **Configuração de IA com presets + custom**: dropdown com provedores
   comuns pré-configurados (OpenAI, Anthropic, Google Gemini — só pedindo API
   key + modelo) e uma opção "Custom" (URL base + API key + modelo) para
   qualquer endpoint compatível com Chat Completions da OpenAI (self-hosted,
   OpenRouter, etc.).
2. **Tela de revisão antes de criar** — nunca cria oportunidades direto a
   partir da resposta da IA. Lista cada oportunidade extraída (título,
   área/tema, horas/saving, avisos) com checkbox, igual ao resumo do import
   em lote já existente.
3. **Página nova standalone**: `/admin/oportunidades/gerar-ia`, com seletor de
   empresa no topo (mesmo padrão do `/cliente/solicitar` quando há mais de uma
   empresa disponível).
4. **Entrada da transcrição**: textarea grande para colar texto, mais upload
   opcional de arquivo `.txt` que joga o conteúdo no mesmo textarea (não é
   upload "silencioso" direto pra API — o admin sempre vê o texto antes de
   gerar).
5. **Prompt fixo, mantido no código** — não editável pela tela de
   configuração. Continua com fonte única da verdade em
   `docs/prompt-geracao-xml.md`, espelhado num módulo TS server-side (ver
   "Arquivos afetados"). Evita risco de alguém editar pela UI e quebrar uma
   regra calibrada por incidente real (ex.: a trava de CAMPO RESTRITO em
   `<periodicidade>`).

## Decisões de design (não perguntadas explicitamente, mas necessárias)

- **API key nunca trafega em texto puro de volta pro client.** `getAiConfig`
  retorna mascarada (ex.: `sk-...ab12`); `updateAiConfig` só sobrescreve o
  valor salvo se um novo valor não-vazio for enviado no input — campo vazio
  significa "manter a chave atual". Chamada de IA acontece inteiramente no
  servidor (`adminProcedure`), a chave nunca é enviada ao browser.
- **Empresa já vem resolvida.** Como o admin escolhe a empresa no topo da
  tela antes de gerar, o valor da tag `<empresa>` devolvido pela IA é
  **ignorado** na hora de montar o preview — usa-se sempre a empresa
  selecionada. Isso elimina o diálogo de "empresa ambígua" (que existe hoje
  pro import manual) desta tela; ele continua existindo, sem mudança, no
  import de `.xml`/`.zip` em `/cliente/solicitar`.
- **Diálogo de área/tema continua existindo.** Diferente de empresa, a IA
  ainda pode citar uma área/tema que não bate com o cadastro — mesmo diálogo
  de resolução ("Manter como Outro" / cadastrar / escolher) já usado hoje no
  import de XML, sem mudança de comportamento.
- **Refactor necessário**: a lógica de resolução empresa/área/tema + criação
  do projeto a partir de um XML parseado hoje só existe dentro do componente
  `/cliente/solicitar/page.tsx` (`importXmlEntry` e o estado ao redor). Será
  extraída para um hook compartilhado (`useXmlOpportunityImporter` ou nome
  equivalente, action final a definir no plano de implementação), consumido
  tanto pelo import `.zip` já existente quanto por esta tela nova — evita
  duplicar ~150 linhas de lógica de diálogo sequencial. `parseSolicitacaoXml`
  em si **não muda**.

## Fluxo técnico

### 1. Configuração (`/admin/configuracoes`, nova aba "Integração de IA")

- Campos: **Provedor** (select: OpenAI / Anthropic / Google Gemini / Custom),
  **Modelo** (texto livre, ex.: `gpt-4o`, `claude-sonnet-4-5`,
  `gemini-2.0-flash`), **API Key** (password input, mostra mascarada se já
  configurada), **URL base** (só visível/obrigatória quando Provedor =
  Custom).
- Botão "Testar conexão": dispara uma chamada mínima (prompt curto, sem
  transcrição) pra validar chave/modelo/URL antes de salvar; mostra
  sucesso/erro inline.
- Armazenamento: novos campos em `SystemSettings` (mesmo padrão de `pixKey`
  hoje — linha única `id: "default"`), OU tabela dedicada
  `AiIntegrationSettings` se a Prisma migration ficar mais limpa assim
  (decisão de implementação, não muda o comportamento acima).
- Novos procedures em `settings.router.ts` (ou um router dedicado):
  `getAiConfig` (retorna com key mascarada) e `updateAiConfig` (aceita
  provider/model/baseUrl/apiKey opcionais, só sobrescreve apiKey se não-vazio).

### 2. Tela de geração (`/admin/oportunidades/gerar-ia`)

- Seletor de empresa no topo (reaproveita a mesma lista/lógica de
  `companyOptions` de `/cliente/solicitar`).
- Textarea grande para a transcrição + botão de upload `.txt` (lê o arquivo
  com `file.text()` e preenche o textarea — admin pode editar antes de
  gerar).
- Botão "Gerar oportunidades" (desabilitado sem empresa selecionada ou
  textarea vazio) → chama a mutation de geração, mostra loading (a chamada de
  IA pode levar dezenas de segundos para uma transcrição longa com várias
  oportunidades).

### 3. Backend: geração (nova mutation `adminProcedure`)

- Recebe `{ companyId, transcript }`.
- Carrega a config de IA salva; se não houver (nunca configurada), retorna
  erro claro apontando para a tela de configuração.
- Monta a chamada ao provedor configurado com um adapter por provedor
  (interface comum: `systemPrompt` + `userMessage` → texto de resposta):
  - **OpenAI**: `POST /v1/chat/completions`, `messages: [{role: "system", ...}, {role: "user", ...}]`.
  - **Anthropic**: `POST /v1/messages`, header `x-api-key` + `anthropic-version`, `system` + `messages: [{role: "user", ...}]`.
  - **Gemini**: `POST /v1beta/models/{model}:generateContent`, `systemInstruction` + `contents`.
  - **Custom**: mesmo formato do OpenAI (Chat Completions), contra a URL base configurada.
- `systemPrompt` vem de um módulo TS server-side que espelha o conteúdo de
  `docs/prompt-geracao-xml.md` (ver "Arquivos afetados"); `userMessage` é a
  transcrição colada, sem modificação.
- Extrai da resposta bruta cada ocorrência de
  `<solicitacaoDeProjeto>...</solicitacaoDeProjeto>` (regex não-guloso,
  mesmo espírito da extração já usada no import de `.zip`, adaptada de "um
  arquivo por entrada do zip" para "um bloco por match no texto").
- Se zero blocos forem encontrados: erro incluindo a resposta bruta da IA
  (pra debug — a IA pode ter recusado, truncado, ou respondido fora do
  formato esperado).
- Retorna ao client a lista de XMLs brutos extraídos (sem persistir nada
  ainda).

### 4. Revisão e criação (client)

- Para cada XML retornado, roda `parseSolicitacaoXml` (sem mudança) e força
  `companyId` para a empresa já selecionada no topo (ignora
  `companyUnresolved`/`rawCompanyName` do resultado).
- Se área/tema não baterem com o cadastro, dispara o diálogo de resolução já
  existente (mesmo comportamento do import de XML hoje).
- Mostra lista de preview: título, área/tema, horas/saving, avisos — cada
  item com checkbox (marcado por padrão). Item com erro de parse aparece
  desmarcável/desabilitado com o motivo do erro, sem travar os demais.
- Botão "Criar N selecionadas": cria os projetos marcados, um por vez
  (reaproveitando `addProject`, mesma função já usada hoje), mostrando o
  resultado por item ao final (sucesso/erro), igual ao resumo do import em
  lote.

## Arquivos afetados

- `prisma/schema.prisma`: novos campos de config de IA em `SystemSettings`
  (ou nova tabela — decisão de implementação) + migration.
- `src/server/trpc/routers/settings.router.ts`: `getAiConfig`,
  `updateAiConfig` (ou novo router `ai-settings.router.ts` se ficar mais
  organizado separado dos pesos de scoring).
- `src/server/ai/xml-generation-prompt.ts` (**novo**): constante
  `XML_GENERATION_SYSTEM_PROMPT`, espelhando `docs/prompt-geracao-xml.md` —
  mesma obrigação de manter sincronizado já documentada nesse arquivo e na
  memória do projeto.
- `src/server/ai/providers.ts` (**novo**): adapters OpenAI/Anthropic/Gemini/Custom,
  função comum `callAiProvider(config, { systemPrompt, userMessage }): Promise<string>`.
- `src/server/trpc/routers/ai-opportunity.router.ts` (**novo**): mutation de
  geração (`generateFromTranscript` ou nome equivalente).
- `src/server/trpc/root.ts`: registra o novo router.
- `src/app/(private)/cliente/solicitar/utils/xml-import.ts`: **sem mudança**
  (schema/parser intocados).
- `src/app/(private)/cliente/solicitar/` (**refactor**): extração da lógica
  de resolução empresa/área/tema + criação de projeto a partir de XML
  parseado para um hook compartilhado, reaproveitado pela tela nova.
- `src/app/(private)/admin/oportunidades/gerar-ia/page.tsx` (**novo**): tela
  de geração + revisão descrita acima.
- `src/app/(private)/admin/configuracoes/`: nova aba/seção "Integração de
  IA".
- `src/shared/components/app-sidebar.tsx`: novo item "Gerar Oportunidades
  (IA)" na seção "Gestão" do admin.

## Fora de escopo

- Editar o prompt pela UI (decisão confirmada — fica fixo no código).
- Transcrição por áudio/vídeo (upload de `.mp3`/`.mp4` com transcrição
  automática) — a entrada é sempre texto já transcrito.
- Suporte a outros formatos de arquivo de transcrição além de `.txt` (ex.:
  `.docx`, `.pdf`) — pode ser adicionado depois seguindo o mesmo padrão do
  `.txt`.
- Streaming da resposta da IA token-a-token na UI — a tela mostra um loading
  simples até a resposta completa chegar.
- Paginação/chunking de transcrições muito longas que estourem o limite de
  tokens de saída do provedor — limitação conhecida, não tratada nesta
  primeira versão.
- Editar o XML gerado pela IA antes de criar o projeto (a tela de revisão só
  permite selecionar/desselecionar oportunidades inteiras, não editar campos
  individuais) — se um XML sair errado, a alternativa é editar o projeto
  depois de criado, ou ajustar a transcrição e gerar de novo.
- Suporte a múltiplas configurações de IA simultâneas (ex.: um provedor por
  empresa) — uma única configuração global, como os demais campos de
  `SystemSettings` hoje.
