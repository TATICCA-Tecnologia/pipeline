-- Critérios mínimos de qualidade do catálogo de automações.
-- Só adiciona: nenhuma coluna existente é alterada, nenhum dado é migrado.
-- Nomear as relações Project<->ProjectArea é mudança apenas do schema Prisma,
-- a coluna "areaId" continua a mesma — por isso não aparece aqui.

ALTER TABLE "projects" ADD COLUMN "currentApplicationAssetId" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwnerRole" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwnerAreaId" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataInput" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataInputDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataOutput" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationDataOutputDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationContingencyActions" JSONB;
ALTER TABLE "projects" ADD COLUMN "currentApplicationContingencyDetails" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationBackupOwner" TEXT;
ALTER TABLE "projects" ADD COLUMN "handlesSensitiveData" TEXT;
ALTER TABLE "projects" ADD COLUMN "sensitiveDataCategories" JSONB;
ALTER TABLE "projects" ADD COLUMN "sensitiveDataDetails" TEXT;

ALTER TABLE "projects" ADD CONSTRAINT "projects_currentApplicationOwnerAreaId_fkey"
  FOREIGN KEY ("currentApplicationOwnerAreaId") REFERENCES "project_areas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "target_system_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "target_system_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "target_system_categories_slug_key" ON "target_system_categories"("slug");

CREATE TABLE "target_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "target_systems_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "target_systems_slug_key" ON "target_systems"("slug");
ALTER TABLE "target_systems" ADD CONSTRAINT "target_systems_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "target_system_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_target_systems" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetSystemId" TEXT,
    "customName" TEXT,
    "accessPoint" TEXT,
    "accessNotes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_target_systems_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_target_systems_projectId_idx" ON "project_target_systems"("projectId");
ALTER TABLE "project_target_systems" ADD CONSTRAINT "project_target_systems_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_target_systems" ADD CONSTRAINT "project_target_systems_targetSystemId_fkey"
  FOREIGN KEY ("targetSystemId") REFERENCES "target_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_automation_accounts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "projectTargetSystemId" TEXT,
    "accountType" TEXT,
    "ownerName" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "project_automation_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_automation_accounts_projectId_idx" ON "project_automation_accounts"("projectId");
ALTER TABLE "project_automation_accounts" ADD CONSTRAINT "project_automation_accounts_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_automation_accounts" ADD CONSTRAINT "project_automation_accounts_projectTargetSystemId_fkey"
  FOREIGN KEY ("projectTargetSystemId") REFERENCES "project_target_systems"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
