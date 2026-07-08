import { db } from "@/server/db";
import { buildDiagnosticDeck } from "@/server/deck/build-diagnostic-deck";
import { slugifyFilename } from "@/shared/utils";

/**
 * GET /api/empresas/[id]/deck
 *
 * Gera e devolve o deck consolidado de diagnóstico em PPTX (Passo 8a).
 *
 * Autenticação: esta rota NÃO é tRPC, então não passa pelos middlewares
 * `enforceAdmin`. Replicamos a mesma checagem manualmente — o app inteiro
 * autentica via header `x-user-id` (não sessão de cookie), então lemos esse
 * header, buscamos o usuário e exigimos role ADMIN/SUPER_ADMIN.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return new Response("Não autenticado (header x-user-id ausente).", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) {
    return new Response("Não autenticado (usuário não encontrado).", { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return new Response("Acesso restrito a administradores.", { status: 403 });
  }

  const { id: companyId } = await params;

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  if (!company) {
    return new Response("Empresa não encontrada.", { status: 404 });
  }

  try {
    const buffer = await buildDiagnosticDeck(companyId, userId);

    const safeName = slugifyFilename(company.name) || companyId;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        // Fallback inofensivo: o download real (via blob URL, ver admin/empresas/page.tsx)
        // ignora este header e usa `link.download` sanitizado no client — mantido aqui
        // para qualquer consumidor futuro não-blob que respeite Content-Disposition.
        "Content-Disposition": `attachment; filename="diagnostico-${safeName}.pptx"`,
      },
    });
  } catch (err) {
    console.error("Falha ao gerar deck de diagnóstico:", err);
    return new Response("Falha ao gerar o diagnóstico.", { status: 500 });
  }
}
