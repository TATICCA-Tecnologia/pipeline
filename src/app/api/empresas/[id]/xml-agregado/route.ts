import { db } from "@/server/db";
import {
  buildEmpresaAgregadoXml,
  type EmpresaAgregadoAreaGroup,
} from "@/shared/xml/build-empresa-agregado-xml";
import type { ProjetoCompletoXmlData } from "@/shared/xml/build-projeto-completo-xml";
import { slugifyFilename } from "@/shared/utils";

/**
 * GET /api/empresas/[id]/xml-agregado
 *
 * Gera e devolve um XML com todos os projetos da empresa (qualquer status),
 * agrupados e ordenados por área — pensado para processamento externo ao
 * sistema, não para reimportação.
 *
 * Autenticação: mesmo padrão manual de /api/empresas/[id]/deck (header
 * x-user-id, role ADMIN/SUPER_ADMIN) — esta rota não é tRPC, então não passa
 * pelos middlewares enforceAdmin.
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
    select: { id: true, name: true },
  });
  if (!company) {
    return new Response("Empresa não encontrada.", { status: 404 });
  }

  try {
    const [projects, urgencyLevelRows] = await Promise.all([
      db.project.findMany({
        where: { companyId },
        include: {
          area: { select: { id: true, name: true, slug: true, order: true } },
          theme: { select: { id: true, name: true, slug: true } },
          mainTool: { select: { id: true, name: true, slug: true } },
          mainToolCategory: { select: { id: true, name: true, slug: true } },
          solutionTypes: { select: { id: true, name: true, slug: true } },
          features: true,
          peopleOfInterest: { include: { person: true } },
          ownerArea: { select: { name: true } },
          targetSystems: {
            orderBy: { order: "asc" },
            include: { targetSystem: { select: { name: true, category: { select: { name: true } } } } },
          },
          automationAccounts: {
            orderBy: { order: "asc" },
            include: {
              projectTargetSystem: {
                select: { customName: true, targetSystem: { select: { name: true } } },
              },
            },
          },
        },
      }),
      db.urgencyLevel.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
      }),
    ]);

    const urgencyLevels = urgencyLevelRows.map((l) => ({ value: l.slug, label: l.name }));

    const mapped: ProjetoCompletoXmlData[] = projects.map((p) => ({
      id: p.id,
      companyName: company.name,
      title: p.title,
      area: p.area ?? undefined,
      theme: p.theme ?? undefined,
      platform: p.platform ?? undefined,
      description: p.description ?? "",
      targetAudience: p.targetAudience ?? undefined,
      expectedUsers: p.expectedUsers ?? undefined,
      hasExistingSystem: p.hasExistingSystem ?? undefined,
      existingSystemDetails: p.existingSystemDetails ?? undefined,
      hasCurrentApplication: p.hasCurrentApplication ?? undefined,
      currentApplicationDetails: p.currentApplicationDetails ?? undefined,
      currentApplicationHosting: p.currentApplicationHosting ?? undefined,
      currentApplicationHostingCustom: p.currentApplicationHostingCustom ?? undefined,
      currentApplicationAuthor: p.currentApplicationAuthor ?? undefined,
      currentApplicationOwner: p.currentApplicationOwner ?? undefined,
      currentApplicationAccessLocation: p.currentApplicationAccessLocation ?? undefined,
      currentApplicationAccessReference: p.currentApplicationAccessReference ?? undefined,
      currentApplicationLiveSince: p.currentApplicationLiveSince ?? undefined,
      currentApplicationAssetId: p.currentApplicationAssetId ?? undefined,
      currentApplicationOwnerRole: p.currentApplicationOwnerRole ?? undefined,
      currentApplicationOwnerAreaName: p.ownerArea?.name ?? undefined,
      currentApplicationDataInput: p.currentApplicationDataInput ?? undefined,
      currentApplicationDataInputDetails: p.currentApplicationDataInputDetails ?? undefined,
      currentApplicationDataOutput: p.currentApplicationDataOutput ?? undefined,
      currentApplicationDataOutputDetails: p.currentApplicationDataOutputDetails ?? undefined,
      currentApplicationContingencyActions:
        (p.currentApplicationContingencyActions as string[] | null) ?? undefined,
      currentApplicationContingencyDetails: p.currentApplicationContingencyDetails ?? undefined,
      currentApplicationBackupOwner: p.currentApplicationBackupOwner ?? undefined,
      handlesSensitiveData: p.handlesSensitiveData ?? undefined,
      sensitiveDataCategories: (p.sensitiveDataCategories as string[] | null) ?? undefined,
      sensitiveDataDetails: p.sensitiveDataDetails ?? undefined,
      // Descarta linhas sem nome resolvível (nem catálogo, nem customName) —
      // mesmo invariante de mapTargetSystemsForView em project.router.ts; não
      // deve acontecer por uso legítimo do formulário, só por dado inconsistente.
      targetSystems: p.targetSystems.flatMap((s) => {
        const name = s.targetSystem?.name || s.customName;
        if (!name) return [];
        return [
          {
            id: s.id,
            targetSystemId: s.targetSystemId,
            name,
            categoryName: s.targetSystem?.category?.name ?? null,
            accessPoint: s.accessPoint,
            accessNotes: s.accessNotes,
            order: s.order,
          },
        ];
      }),
      automationAccounts: p.automationAccounts.map((a) => ({
        id: a.id,
        username: a.username,
        projectTargetSystemId: a.projectTargetSystemId,
        systemName:
          a.projectTargetSystem?.targetSystem?.name ?? a.projectTargetSystem?.customName ?? null,
        accountType: a.accountType,
        ownerName: a.ownerName,
        notes: a.notes,
        order: a.order,
      })),
      peopleInvolved: p.peopleInvolved ?? undefined,
      taskDurationHours: p.taskDurationHours ?? undefined,
      processFrequency: p.processFrequency ?? undefined,
      projectNarrative: p.projectNarrative ?? undefined,
      features: p.features?.map((f) => f.name) ?? [],
      benefits: (p.benefits as string[] | null) ?? undefined,
      benefitsDetails: p.benefitsDetails ?? undefined,
      monthlyHoursSaved: p.monthlyHoursSaved ?? undefined,
      ratingErrorReduction: p.ratingErrorReduction ?? undefined,
      ratingProcessCriticality: p.ratingProcessCriticality ?? undefined,
      ratingInternalImpact: p.ratingInternalImpact ?? undefined,
      ratingExternalImpact: p.ratingExternalImpact ?? undefined,
      ratingCompliance: p.ratingCompliance ?? undefined,
      urgency: p.urgency ?? undefined,
      estimatedDeadline: p.deadline ?? undefined,
      additionalInfo: p.additionalInfo ?? undefined,
      mainToolCategory: p.mainToolCategory ?? undefined,
      mainTool: p.mainTool ?? undefined,
      peopleOfInterest: p.peopleOfInterest.map((link) => ({
        id: link.person.id,
        name: link.person.name,
        role: link.person.role ?? undefined,
        userId: link.person.userId ?? undefined,
      })),
      complexity: p.complexity ?? undefined,
      robotSchedule: p.robotSchedule ?? undefined,
      hourlyRateBRL: p.hourlyRateBRL ?? undefined,
      estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
      executionStrategy: p.executionStrategy ?? undefined,
      solutionTypes: p.solutionTypes,
      architectNotes: p.architectNotes ?? undefined,
      implementationEffortDays: p.implementationEffortDays ?? undefined,
      implementationWave: p.implementationWave ?? undefined,
      waveOrder: p.waveOrder ?? undefined,
    }));

    interface AreaAccumulator {
      name: string;
      order: number;
      projects: ProjetoCompletoXmlData[];
    }

    const areaAccumulators = new Map<string, AreaAccumulator>();
    projects.forEach((p, index) => {
      const key = p.area?.id ?? "__sem_area__";
      const existing = areaAccumulators.get(key);
      if (existing) {
        existing.projects.push(mapped[index]);
      } else {
        areaAccumulators.set(key, {
          name: p.area?.name ?? "Sem área",
          order: p.area?.order ?? Number.MAX_SAFE_INTEGER,
          projects: [mapped[index]],
        });
      }
    });

    const areaGroups: EmpresaAgregadoAreaGroup[] = Array.from(areaAccumulators.values())
      .sort((a, b) => a.order - b.order)
      .map((group) => ({ name: group.name, projects: group.projects }));

    const xml = buildEmpresaAgregadoXml(company, areaGroups, urgencyLevels);
    const safeName = slugifyFilename(company.name) || companyId;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="xml-agregado-${safeName}.xml"`,
      },
    });
  } catch (err) {
    console.error("Falha ao gerar XML agregado da empresa:", err);
    return new Response("Falha ao gerar o XML agregado.", { status: 500 });
  }
}
