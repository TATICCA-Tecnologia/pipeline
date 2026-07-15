-- CreateTable
CREATE TABLE "main_tools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_tools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_tools_slug_key" ON "main_tools"("slug");

-- Seed: preserve the 6 options previously hardcoded in MAIN_TOOLS (architecture.ts)
INSERT INTO "main_tools" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-main-tool-python', 'Python', 'python', 0, CURRENT_TIMESTAMP),
    ('seed-main-tool-rocketbot', 'Rocketbot', 'rocketbot', 1, CURRENT_TIMESTAMP),
    ('seed-main-tool-automation-anywhere', 'Automation Anywhere', 'automation-anywhere', 2, CURRENT_TIMESTAMP),
    ('seed-main-tool-power-automate', 'Power Automate', 'power-automate', 3, CURRENT_TIMESTAMP),
    ('seed-main-tool-power-apps', 'Power Apps', 'power-apps', 4, CURRENT_TIMESTAMP),
    ('seed-main-tool-outro', 'Outro', 'outro', 5, CURRENT_TIMESTAMP);

-- AlterTable: add the new FK column
ALTER TABLE "projects" ADD COLUMN "mainToolId" TEXT;

-- Backfill: match each project's existing free-text mainTool slug to the new main_tools row
UPDATE "projects" p
SET "mainToolId" = mt."id"
FROM "main_tools" mt
WHERE p."mainTool" = mt."slug";

-- AlterTable: drop the old free-text column, now migrated
ALTER TABLE "projects" DROP COLUMN "mainTool";

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_mainToolId_fkey" FOREIGN KEY ("mainToolId") REFERENCES "main_tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
