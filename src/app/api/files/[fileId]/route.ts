import { db } from "@/server/db";
import { getObjectFromMinio, parseMinioUrl } from "@/shared/lib/minio";

/**
 * GET /api/files/[fileId]
 *
 * Proxy same-origin pro objeto no MinIO — o app nunca mais depende de o MinIO
 * estar publicamente acessível nem de uma env var de domínio público correta
 * (ver docs/superpowers/specs/2026-07-20-fix-download-arquivos-localhost-design.md).
 *
 * Autenticação: esta rota NÃO é tRPC, então não passa pelos middlewares
 * `enforceAuth`. Replicamos a mesma checagem manualmente — o app inteiro
 * autentica via header `x-user-id` (não sessão de cookie), mesmo padrão de
 * src/app/api/empresas/[id]/deck/route.ts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
): Promise<Response> {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return new Response("Não autenticado (header x-user-id ausente).", { status: 401 });
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return new Response("Não autenticado (usuário não encontrado).", { status: 401 });
  }

  const { fileId } = await params;

  const file = await db.projectFile.findUnique({ where: { id: fileId } });
  if (!file) {
    return new Response("Arquivo não encontrado.", { status: 404 });
  }

  const parsed = parseMinioUrl(file.url);
  if (!parsed) {
    return new Response("URL de arquivo inválida.", { status: 500 });
  }

  try {
    const stream = await getObjectFromMinio(parsed.bucket, parsed.objectName);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
    });
  } catch (err) {
    console.error("Falha ao buscar arquivo do MinIO:", err);
    return new Response("Falha ao buscar o arquivo.", { status: 500 });
  }
}
