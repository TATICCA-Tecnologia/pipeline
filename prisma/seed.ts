import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: "cliente@email.com" },
    update: {},
    create: {
      id: "mock-1",
      name: "João Silva",
      email: "cliente@email.com",
      role: "CLIENT",
    },
  });
  await prisma.user.upsert({
    where: { email: "dev@email.com" },
    update: {},
    create: {
      id: "mock-2",
      name: "Maria Santos",
      email: "dev@email.com",
      role: "DEVELOPER",
    },
  });
  await prisma.user.upsert({
    where: { email: "admin@email.com" },
    update: {},
    create: {
      id: "mock-3",
      name: "Carlos Admin",
      email: "admin@email.com",
      role: "ADMIN",
    },
  });

  const TARGET_SYSTEM_CATEGORIES = [
    "ERP",
    "Sistema fiscal/contábil",
    "Portal governamental",
    "Banco ou instituição financeira",
    "E-mail e mensageria",
    "Office e planilhas",
    "Armazenamento de arquivos",
    "Banco de dados",
    "CRM",
    "RH e folha",
    "Sistema interno próprio",
    "Site externo de terceiros",
    "Outro",
  ];

  for (const [index, name] of TARGET_SYSTEM_CATEGORIES.entries()) {
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    await prisma.targetSystemCategory.upsert({
      where: { slug },
      update: {},
      create: { name, slug, order: index },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
