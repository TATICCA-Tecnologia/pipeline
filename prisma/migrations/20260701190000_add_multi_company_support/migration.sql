-- CreateTable (implicit many-to-many join table for User <-> Company)
CREATE TABLE "_UserCompanies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_UserCompanies_AB_unique" ON "_UserCompanies"("A", "B");

-- CreateIndex
CREATE INDEX "_UserCompanies_B_index" ON "_UserCompanies"("B");

-- AddForeignKey
ALTER TABLE "_UserCompanies" ADD CONSTRAINT "_UserCompanies_A_fkey" FOREIGN KEY ("A") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserCompanies" ADD CONSTRAINT "_UserCompanies_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: preserve every existing single company assignment as a row in the new join table
INSERT INTO "_UserCompanies" ("A", "B")
SELECT "companyId", "id" FROM "users" WHERE "companyId" IS NOT NULL;

-- DropForeignKey (old single-company relation)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_companyId_fkey";

-- AlterTable (drop the old single-company column, now migrated)
ALTER TABLE "users" DROP COLUMN "companyId";
