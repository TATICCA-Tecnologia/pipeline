-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN "defaultHourlyRateBRL" DOUBLE PRECISION NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "hourlyRateBRL" DOUBLE PRECISION;

-- Recalcula o saving estimado anual de todos os projetos existentes a partir
-- das horas economizadas por mês já reportadas, usando a taxa padrão (R$90/h).
-- Projetos sem monthlyHoursSaved reportado ficam sem saving calculável (NULL).
UPDATE "projects"
SET "estimatedAnnualSavingBRL" = "monthlyHoursSaved" * 12 * 90
WHERE "monthlyHoursSaved" IS NOT NULL;

UPDATE "projects"
SET "estimatedAnnualSavingBRL" = NULL
WHERE "monthlyHoursSaved" IS NULL;
