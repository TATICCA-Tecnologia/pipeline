-- AlterTable
ALTER TABLE "projects" ADD COLUMN "peopleInvolved" INTEGER,
ADD COLUMN "taskDurationHours" DOUBLE PRECISION,
ADD COLUMN "processFrequency" TEXT,
ADD COLUMN "currentAnnualHours" DOUBLE PRECISION,
ADD COLUMN "complexity" TEXT,
ADD COLUMN "robotSchedule" TEXT,
ADD COLUMN "estimatedAnnualSavingBRL" DOUBLE PRECISION;
