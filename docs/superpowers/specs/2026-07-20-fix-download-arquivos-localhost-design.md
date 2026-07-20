# Fix: link de download de arquivos apontando pra localhost (Design)

## Contexto

Em `src/shared/lib/minio.ts:26-29`, a URL pública salva em `ProjectFile.url` no upload (`uploadToMinio`) usa `PUBLIC_MINIO_URL`, que cai em `http://localhost:${MINIO_PORT}` quando nem `MINIO_PUBLIC_URL` nem `MINIO_URL` estão definidas no ambiente. O pipeline de deploy (`.github/workflows/docker-build-push.yml`) só builda a imagem e dispara um webhook do Portainer — nenhuma dessas variáveis é definida em lugar nenhum do repositório, então a configuração de produção depende inteiramente de env vars setadas fora do repo (Portainer), e claramente não está setada: os links salvos ficam com `localhost`.

`file.url` é usado direto como `href`/`window.open` em `project-files.tsx` (`handleDownload`/`handlePreview`), com o comentário explícito "URL pública gerada pelo MinIO" — confirmando que o design original sempre foi expor a URL do MinIO diretamente pro browser.

Já existem duas funções em `minio.ts` (`parseMinioUrl`, `getObjectFromMinio`) que não são usadas em **nenhum** lugar do código — tudo indica que uma rota proxy já tinha sido planejada e nunca foi conectada.

**Decisão confirmada com o usuário:** em vez de só corrigir a variável de ambiente (que resolve o sintoma mas continua frágil a qualquer deploy futuro mal configurado), servir os arquivos através de uma rota própria do app (`/api/files/[fileId]`), terminando o que essas duas funções já estavam preparadas pra fazer. O app deixa de depender de o MinIO estar publicamente acessível.

## Por que não precisa de backfill

`parseMinioUrl` só usa `new URL(url).pathname` pra extrair `bucket`/`objectName` — o host da URL salva (`localhost`, ou qualquer outro) é irrelevante pra esse parsing. Os registros de `ProjectFile.url` já salvos com `localhost` continuam funcionando perfeitamente com a rota proxy, sem precisar de nenhuma migração de dados.

## Mudança

### Nova rota: `src/app/api/files/[fileId]/route.ts`

Segue o mesmo padrão de `src/app/api/empresas/[id]/deck/route.ts` (rota não-tRPC, autenticação manual via header `x-user-id` — o app inteiro autentica assim, não por cookie de sessão):

1. Lê `x-user-id` do header; 401 se ausente ou usuário não existir (mesmo nível de exigência de `protectedProcedure`, sem checagem extra de role/dono do projeto — `comment.byProject`/`file.byProject` hoje também não fazem essa checagem, então não é regressão).
2. Busca o `ProjectFile` pelo `fileId` da URL; 404 se não existir.
3. `parseMinioUrl(file.url)` pra extrair bucket/objectName; 500 se a URL salva não for parseável.
4. `getObjectFromMinio(bucket, objectName)` retorna o stream; devolve como `Response` com `Content-Type: file.type` (guardado no banco desde o upload — evita uma chamada extra ao MinIO só pra pegar metadata).
5. Sem `Content-Disposition: attachment` — mantém o mesmo comportamento de hoje onde a mesma URL serve tanto "Visualizar" (`window.open`, precisa abrir inline) quanto "Download" (o atributo `download` do `<a>` no client já força o save, como já funciona hoje).

### `src/server/trpc/routers/file.router.ts`

Nos três procedures que retornam um arquivo (`byProject`, `upload`, `create`), troca o `url: f.url` (valor bruto do banco) por `url: \`/api/files/${f.id}\`` — uma URL relativa, same-origin, que não depende de nenhuma env var de domínio público. O valor bruto continua salvo em `ProjectFile.url` no banco (usado internamente pela rota proxy via `parseMinioUrl`), só deixa de ser exposto direto pro client.

Nenhuma mudança necessária em `project-files.tsx` nem em `files-context.tsx` — ambos já só consomem `file.url` como veio da API, e uma URL relativa funciona exatamente igual num `<a href>`/`window.open`.

## Fora de escopo

- Checagem de que o usuário tem acesso ao projeto dono do arquivo (ex.: cliente de outra empresa) — não existe hoje em nenhuma query de arquivo/comentário deste projeto; adicionar isso agora seria uma mudança de escopo maior, não relacionada ao bug do localhost.
- Alterar o que fica salvo em `ProjectFile.url` no banco — continua sendo a URL "pública" gerada pelo `uploadToMinio` (ainda que nunca mais seja exposta direto), porque `parseMinioUrl` já lida bem com isso e mudar o formato salvo exigiria migração de dados sem necessidade.
- Consertar a variável de ambiente em produção — vira desnecessário com URLs relativas.
