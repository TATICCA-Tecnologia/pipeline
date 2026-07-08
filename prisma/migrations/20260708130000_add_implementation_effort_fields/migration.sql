-- AlterTable
ALTER TABLE "projects" ADD COLUMN "implementationEffortDays" INTEGER;
ALTER TABLE "projects" ADD COLUMN "implementationWave" INTEGER;
ALTER TABLE "projects" ADD COLUMN "waveOrder" INTEGER;

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN "developerDailyRateBRL" DOUBLE PRECISION;
ALTER TABLE "system_settings" ADD COLUMN "wave1StartDate" TIMESTAMP(3);
