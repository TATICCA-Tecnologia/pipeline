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

  // Diferente de `MainToolCategory` (que só nasce do combobox do usuário),
  // `TargetSystemCategory` é pré-populada: sistema-alvo é um domínio
  // previsível e universal (SAP, Protheus, Receita), então semear evita que
  // os primeiros usuários criem cinco variações de "ERP" antes de existir uma
  // categoria canônica.
  //
  // "Portal governamental" e "Site externo de terceiros" se sobrepõem — um
  // portal do governo é, tecnicamente, um site externo de terceiros. O
  // recorte é proposital (é um caso muito comum em RPA no Brasil): quando os
  // dois se aplicam, "Portal governamental" tem precedência.
  const TARGET_SYSTEM_CATEGORIES = [
    "ERP",
    "Sistema fiscal/contábil",
    "Portal governamental",
    "Banco ou instituição financeira",
    "E-mail e mensageria",
    "Office e planilhas",
    "Armazenamento de arquivos (SharePoint, rede, Drive)",
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
