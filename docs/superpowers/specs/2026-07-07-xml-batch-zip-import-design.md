# Importação em lote de XMLs via .zip (Design)

## Contexto

Hoje `/cliente/solicitar` permite importar **um** arquivo `.xml` por vez (`src/app/(private)/cliente/solicitar/utils/xml-import.ts`, `parseSolicitacaoXml`), criando exatamente um projeto por importação — decisão confirmada no design original (`2026-07-01-xml-import-solicitacao-design.md`, requisito 1: "Um arquivo = um projeto"). O usuário frequentemente gera vários XMLs de uma mesma reunião (uma transcrição pode conter várias oportunidades, cada uma virando um arquivo `.xml` separado) e hoje precisa importar um de cada vez, manualmente.

Este documento adiciona suporte a **upload de um `.zip` contendo vários arquivos `.xml`**, processados em lote. **Não muda** a regra "um arquivo XML = um projeto" — cada `.xml` dentro do zip continua descrevendo exatamente um projeto; o zip é só um envelope de conveniência para agrupar vários arquivos já existentes numa única ação de upload.

## Requisitos confirmados com o usuário

1. **Nova dependência de frontend: `jszip`**. Não há suporte nativo de navegador para descompactar `.zip` (diferente do XML, que usa `DOMParser` nativo). `jszip` é uma lib madura, 100% JS, sem binário nativo, amplamente usada — risco avaliado e aceito pelo usuário. Sem mudança de backend/banco.
2. **Botão "Importar XML" passa a aceitar `.xml` e `.zip`** (`accept=".xml,.zip,text/xml,application/zip"`). Detecção de tipo por extensão do arquivo selecionado.
3. **Processamento sequencial, um arquivo por vez** — não em paralelo. Necessário porque a resolução de empresa ambígua (item 5) precisa pausar o lote e esperar o usuário escolher antes de seguir pro próximo arquivo.
4. **Arquivos não-`.xml` dentro do zip são ignorados silenciosamente** (pastas, `__MACOSX/`, etc. — comum em zips exportados de macOS). Não gera erro nem aparece no resumo.
5. **Empresa ambígua dentro do lote**: continua pausando e perguntando ao usuário (mesmo diálogo de escolha de empresa que já existe hoje para o caso de arquivo único), mas agora indicando contexto de qual arquivo do lote está sendo resolvido (ex.: "Arquivo 3 de 7: processo-financeiro.xml"). Se o usuário cancelar o diálogo, aquele arquivo específico é registrado como falha ("empresa não resolvida") e o lote continua com o próximo arquivo — não aborta o lote inteiro.
6. **Resumo final do lote** substitui o diálogo de sucesso único usado hoje para importação de arquivo único (esse diálogo de arquivo único continua existindo sem mudança, para quando o usuário sobe um `.xml` sozinho). O resumo mostra:
   - Lista de sucessos: título de cada processo criado.
   - Lista de falhas: nome do arquivo + motivo (erro de validação do XML, ou "empresa não resolvida" se o usuário cancelou a escolha).
   - Um botão "Ver meus processos" (mesmo destino do fluxo de arquivo único: `/cliente`).
7. **Fora de escopo, sem mudança**: um único arquivo `.xml` continua descrevendo exatamente um projeto — não é possível (nem faz sentido) um `.xml` dentro do zip descrever múltiplos processos. Essa regra já existente (`2026-07-01-xml-import-solicitacao-design.md`) não muda; o zip só agrupa arquivos `.xml` que já seguem essa regra individualmente.

## Fluxo técnico

1. Usuário clica "Importar XML" → seletor de arquivo aceita `.xml` ou `.zip`.
2. Se `.xml`: comportamento **idêntico ao atual**, sem nenhuma mudança de código no caminho de arquivo único.
3. Se `.zip`:
   a. Lê o arquivo com `JSZip.loadAsync(file)`.
   b. Filtra entradas cujo nome termine em `.xml` (case-insensitive), ordenadas por nome de arquivo (ordem determinística).
   c. Se zero arquivos `.xml` encontrados: mostra erro "Nenhum arquivo .xml encontrado dentro do zip." e encerra.
   d. Processa cada entrada, em sequência (`for...of` com `await`, não `Promise.all`):
      - Extrai o texto (`entry.async("text")`), roda `parseSolicitacaoXml` (sem mudança nessa função).
      - Erro de parse → acumula `{ fileName, ok: false, error }` no array de resultados, segue pro próximo.
      - Empresa ambígua → abre o diálogo de escolha de empresa (reaproveitado, com label "Arquivo N de M: `<fileName>`"), aguarda a escolha do usuário via uma Promise armazenada em estado (resolvida quando o usuário confirma ou cancela); cancelar → acumula falha, confirma → cria o projeto e acumula sucesso.
      - Sucesso direto (empresa resolvida automaticamente) → cria o projeto via `addProject` (mesma função já usada), acumula `{ fileName, ok: true, title }`.
   e. Ao final de todas as entradas: mostra o diálogo de resumo do lote com os resultados acumulados.

## Arquivos afetados

- `package.json` / `pnpm-lock.yaml`: adicionar dependência `jszip`.
- `src/app/(private)/cliente/solicitar/utils/zip-import.ts` (**novo arquivo**): função `extractXmlEntriesFromZip(file: File): Promise<{ fileName: string; xmlText: string }[]>` — isola a lógica de descompactação, mantendo `xml-import.ts` sem mudança (ele continua só sabendo parsear um texto XML).
- `src/app/(private)/cliente/solicitar/page.tsx`: `handleImportXmlFile` passa a detectar `.zip` vs `.xml` e ramificar; novo estado para o resumo do lote e para a Promise de resolução de empresa por arquivo; novo diálogo de resumo do lote (reaproveita o `AlertDialog` já importado no arquivo).

## Fora de escopo

- Processar `.zip` aninhado (zip dentro de zip).
- Barra de progresso detalhada durante o processamento (uma lista simples de resultados ao final é suficiente).
- Desfazer/reverter parcialmente um lote já importado (se precisar corrigir, usa a função de excluir projeto já existente, um por um).
- Upload de anexos de arquivo (PDF/imagens) dentro do zip — o zip é só para os `.xml`, anexos continuam sendo adicionados depois, na tela do projeto já criado (regra já existente, inalterada).
