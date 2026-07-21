-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_participants" (
    "interviewId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "interview_participants_pkey" PRIMARY KEY ("interviewId","personId")
);

-- CreateTable
CREATE TABLE "project_people_of_interest" (
    "projectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "project_people_of_interest_pkey" PRIMARY KEY ("projectId","personId")
);

-- CreateIndex
CREATE UNIQUE INDEX "people_companyId_userId_key" ON "people"("companyId", "userId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_people_of_interest" ADD CONSTRAINT "project_people_of_interest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_people_of_interest" ADD CONSTRAINT "project_people_of_interest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: backfill Person + interview_participants a partir de
-- interviews.participantName (texto livre), preservando os dados existentes
-- antes dessa coluna ser removida numa migration seguinte. O id da Person é
-- derivado deterministicamente de (companyId, nome normalizado) via md5,
-- assim a segunda instrução consegue apontar pro mesmo id sem precisar de
-- join nem de gerar uuid — sem depender de nenhuma extensão do Postgres.
INSERT INTO "people" ("id", "name", "companyId", "createdAt", "updatedAt")
SELECT DISTINCT
  md5(i."companyId" || '|' || LOWER(TRIM(i."participantName"))),
  TRIM(i."participantName"),
  i."companyId",
  NOW(),
  NOW()
FROM "interviews" i
WHERE TRIM(i."participantName") <> '';

INSERT INTO "interview_participants" ("interviewId", "personId")
SELECT i."id", md5(i."companyId" || '|' || LOWER(TRIM(i."participantName")))
FROM "interviews" i
WHERE TRIM(i."participantName") <> '';
