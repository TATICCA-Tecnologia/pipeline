-- CreateTable
CREATE TABLE "project_locks" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_locks_pkey" PRIMARY KEY ("projectId")
);

-- AddForeignKey
ALTER TABLE "project_locks" ADD CONSTRAINT "project_locks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
