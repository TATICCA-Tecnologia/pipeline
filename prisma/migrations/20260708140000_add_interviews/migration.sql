-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'realizado',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "areaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "project_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
