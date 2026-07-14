-- CreateEnum
CREATE TYPE "RobotOperationalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ISSUE');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "operationalStatus" "RobotOperationalStatus";
ALTER TABLE "projects" ADD COLUMN "accumulatedSavingBRL" DOUBLE PRECISION;
ALTER TABLE "projects" ADD COLUMN "operationalStatusUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "comments" ADD COLUMN "isIncident" BOOLEAN NOT NULL DEFAULT false;
