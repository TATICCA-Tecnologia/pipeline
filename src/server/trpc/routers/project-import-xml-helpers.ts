import type { PrismaClient } from "@prisma/client";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function findOrCreateProjectArea(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectArea.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectArea.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(`Área "${trimmed}" não encontrada e o slug gerado já está em uso — área não alterada.`);
    return undefined;
  }
  const created = await db.projectArea.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Área "${trimmed}" não existia e foi criada.`);
  return created;
}

export async function findOrCreateProjectTheme(
  db: PrismaClient,
  areaId: string,
  name: string,
  warnings: string[]
) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectTheme.findFirst({
    where: { areaId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectTheme.findUnique({ where: { slug_areaId: { slug, areaId } } });
  if (slugTaken) {
    warnings.push(
      `Tema "${trimmed}" não encontrado e o slug gerado já está em uso nesta área — tema não alterado.`
    );
    return undefined;
  }
  const created = await db.projectTheme.create({ data: { areaId, name: trimmed, slug, order: 0 } });
  warnings.push(`Tema "${trimmed}" não existia (nesta área) e foi criado.`);
  return created;
}

export async function findOrCreateMainTool(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.mainTool.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.mainTool.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Ferramenta "${trimmed}" não encontrada e o slug gerado já está em uso — ferramenta não alterada.`
    );
    return undefined;
  }
  const created = await db.mainTool.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Ferramenta "${trimmed}" não existia e foi criada.`);
  return created;
}

export async function findOrCreateProjectKind(db: PrismaClient, name: string, warnings: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const existing = await db.projectKind.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  const slug = slugify(trimmed);
  const slugTaken = await db.projectKind.findUnique({ where: { slug } });
  if (slugTaken) {
    warnings.push(
      `Tipo de projeto "${trimmed}" não encontrado e o slug gerado já está em uso — tipo não alterado.`
    );
    return undefined;
  }
  const created = await db.projectKind.create({ data: { name: trimmed, slug, order: 0 } });
  warnings.push(`Tipo de projeto "${trimmed}" não existia e foi criado.`);
  return created;
}
