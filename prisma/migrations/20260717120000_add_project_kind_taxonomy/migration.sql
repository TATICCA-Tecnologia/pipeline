-- CreateTable
CREATE TABLE "project_kinds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_kinds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_kinds_slug_key" ON "project_kinds"("slug");

-- Seed: the 4 initial project kinds
INSERT INTO "project_kinds" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-project-kind-automacao', 'Automação', 'automacao', 0, CURRENT_TIMESTAMP),
    ('seed-project-kind-agente-ia', 'Agente IA', 'agente-ia', 1, CURRENT_TIMESTAMP),
    ('seed-project-kind-dados-bi', 'Dados e BI', 'dados-bi', 2, CURRENT_TIMESTAMP),
    ('seed-project-kind-integracao-sistemas', 'Integração entre Sistemas', 'integracao-sistemas', 3, CURRENT_TIMESTAMP);

-- AlterTable: add the new FK column (nullable, no backfill — field is new, no prior data)
ALTER TABLE "projects" ADD COLUMN "projectKindId" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_projectKindId_fkey" FOREIGN KEY ("projectKindId") REFERENCES "project_kinds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
