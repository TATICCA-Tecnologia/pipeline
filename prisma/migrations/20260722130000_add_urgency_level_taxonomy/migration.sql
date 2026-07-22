-- CreateTable
CREATE TABLE "urgency_levels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "urgency_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "urgency_levels_slug_key" ON "urgency_levels"("slug");

-- Seed: the 4 real levels in use today (matches the values already stored in
-- Project.urgency for these slugs — "outro" is intentionally not seeded, it's
-- a UI-only sentinel, same as PROJECT_AREAS never seeds an "outro" Area).
INSERT INTO "urgency_levels" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-urgency-level-baixa', 'Baixa — sem pressa definida', 'baixa', 0, CURRENT_TIMESTAMP),
    ('seed-urgency-level-media', 'Média — próximos 2 a 3 meses', 'media', 1, CURRENT_TIMESTAMP),
    ('seed-urgency-level-alta', 'Alta — próximo mês', 'alta', 2, CURRENT_TIMESTAMP),
    ('seed-urgency-level-urgente', 'Urgente — o mais rápido possível', 'urgente', 3, CURRENT_TIMESTAMP);
