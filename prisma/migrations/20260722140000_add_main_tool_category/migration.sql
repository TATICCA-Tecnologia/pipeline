-- CreateTable
CREATE TABLE "main_tool_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_tool_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_tool_categories_slug_key" ON "main_tool_categories"("slug");

-- Seed: 4 categorias iniciais
INSERT INTO "main_tool_categories" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-main-tool-category-rpa', 'RPA', 'rpa', 0, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-motor-ia', 'Motor de IA', 'motor-de-ia', 1, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-linguagem', 'Linguagem de Programação', 'linguagem-de-programacao', 2, CURRENT_TIMESTAMP),
    ('seed-main-tool-category-lowcode', 'Plataforma Low-Code', 'plataforma-low-code', 3, CURRENT_TIMESTAMP);

-- AlterTable: categoria opcional em main_tools
ALTER TABLE "main_tools" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "main_tools" ADD CONSTRAINT "main_tools_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "main_tool_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Recategoriza as 6 ferramentas semeadas originalmente em
-- 20260715120000_add_main_tool_taxonomy — "outro" fica sem categoria de propósito.
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-linguagem' WHERE "slug" = 'python';
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-rpa' WHERE "slug" IN ('rocketbot', 'automation-anywhere', 'power-automate');
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-lowcode' WHERE "slug" = 'power-apps';

-- Best-effort: ferramentas adicionadas manualmente depois que pareçam motores de
-- IA (ex.: "Claude", citado pelo usuário) — qualquer coisa que não bater fica
-- sem categoria, ajustável depois em Configurações → Categorias.
UPDATE "main_tools" SET "categoryId" = 'seed-main-tool-category-motor-ia'
WHERE "categoryId" IS NULL
  AND (
    "name" ILIKE '%claude%' OR "name" ILIKE '%gpt%' OR "name" ILIKE '%openai%'
    OR "name" ILIKE '%gemini%' OR "name" ILIKE '%llama%'
  );

-- AlterTable: categoria escolhida no projeto (novo campo "principal")
ALTER TABLE "projects" ADD COLUMN "mainToolCategoryId" TEXT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_mainToolCategoryId_fkey" FOREIGN KEY ("mainToolCategoryId") REFERENCES "main_tool_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: projeto que já tem uma ferramenta específica herda a categoria dela,
-- se ela tiver uma após os passos acima.
UPDATE "projects" p
SET "mainToolCategoryId" = mt."categoryId"
FROM "main_tools" mt
WHERE p."mainToolId" = mt."id" AND mt."categoryId" IS NOT NULL;
