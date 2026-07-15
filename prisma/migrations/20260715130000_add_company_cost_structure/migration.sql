-- CreateTable
CREATE TABLE "company_cost_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_cost_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_cost_categories_slug_key" ON "company_cost_categories"("slug");

-- Seed: categorias padrão de custo
INSERT INTO "company_cost_categories" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-cost-category-pessoas', 'Pessoas', 'pessoas', 0, CURRENT_TIMESTAMP),
    ('seed-cost-category-licencas', 'Licenças', 'licencas', 1, CURRENT_TIMESTAMP),
    ('seed-cost-category-infraestrutura', 'Infraestrutura', 'infraestrutura', 2, CURRENT_TIMESTAMP),
    ('seed-cost-category-outro', 'Outro', 'outro', 3, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "company_cost_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountBRL" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_cost_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_cost_items" ADD CONSTRAINT "company_cost_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_cost_items" ADD CONSTRAINT "company_cost_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "company_cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
