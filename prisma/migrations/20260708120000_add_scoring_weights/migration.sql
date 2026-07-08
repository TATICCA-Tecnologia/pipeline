-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN "qualWeightErrorReduction" DOUBLE PRECISION NOT NULL DEFAULT 0.24;
ALTER TABLE "system_settings" ADD COLUMN "qualWeightProcessCriticality" DOUBLE PRECISION NOT NULL DEFAULT 0.28;
ALTER TABLE "system_settings" ADD COLUMN "qualWeightInternalImpact" DOUBLE PRECISION NOT NULL DEFAULT 0.10;
ALTER TABLE "system_settings" ADD COLUMN "qualWeightExternalImpact" DOUBLE PRECISION NOT NULL DEFAULT 0.23;
ALTER TABLE "system_settings" ADD COLUMN "qualWeightCompliance" DOUBLE PRECISION NOT NULL DEFAULT 0.15;
ALTER TABLE "system_settings" ADD COLUMN "scoreWeightEconomia" DOUBLE PRECISION NOT NULL DEFAULT 0.4;
ALTER TABLE "system_settings" ADD COLUMN "scoreWeightQualitativo" DOUBLE PRECISION NOT NULL DEFAULT 0.4;
ALTER TABLE "system_settings" ADD COLUMN "scoreWeightComplexidade" DOUBLE PRECISION NOT NULL DEFAULT 0.2;
