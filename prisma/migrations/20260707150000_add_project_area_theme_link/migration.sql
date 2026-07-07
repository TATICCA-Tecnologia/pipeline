-- AlterTable
ALTER TABLE "projects" ADD COLUMN "areaId" TEXT,
ADD COLUMN "themeId" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "project_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "project_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
