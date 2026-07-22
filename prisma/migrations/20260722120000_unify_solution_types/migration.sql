-- Seed: solution-type categories referenced by the legacy Project.solutionTypes
-- values (see mapping below) and by the suggested classification list —
-- inserted before the backfill so every join by slug finds a row. Existing
-- "Tipo de Projeto" rows (Automação, Agente IA, Dados e BI, Integração entre
-- Sistemas, seeded in 20260717120000_add_project_kind_taxonomy, plus whatever
-- the admin has added since) are untouched and simply become additional
-- selectable options once the relation below is populated.
INSERT INTO "project_kinds" ("id", "name", "slug", "order", "updatedAt") VALUES
    ('seed-solution-type-rpa', 'RPA', 'rpa', 4, CURRENT_TIMESTAMP),
    ('seed-solution-type-api', 'API', 'api', 5, CURRENT_TIMESTAMP),
    ('seed-solution-type-ia', 'IA', 'ia', 6, CURRENT_TIMESTAMP),
    ('seed-solution-type-ocr', 'OCR', 'ocr', 7, CURRENT_TIMESTAMP),
    ('seed-solution-type-integracao', 'Integração', 'integracao', 8, CURRENT_TIMESTAMP),
    ('seed-solution-type-dashboards', 'Dashboards', 'dashboards', 9, CURRENT_TIMESTAMP),
    ('seed-solution-type-plataformas', 'Plataformas', 'plataformas', 10, CURRENT_TIMESTAMP),
    ('seed-solution-type-chatbots', 'Chatbots', 'chatbots', 11, CURRENT_TIMESTAMP),
    ('seed-solution-type-outros', 'Outros', 'outros', 12, CURRENT_TIMESTAMP),
    ('seed-solution-type-python', 'Python', 'python', 13, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- CreateTable: junction table for the new Project <-> ProjectKind many-to-many.
-- Prisma's implicit-m2m naming: table "_ProjectSolutionTypes" (from the
-- @relation("ProjectSolutionTypes") name), "A" = projects.id, "B" =
-- project_kinds.id ("Project" sorts before "ProjectKind" alphabetically).
CREATE TABLE "_ProjectSolutionTypes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_ProjectSolutionTypes_AB_unique" ON "_ProjectSolutionTypes"("A", "B");
CREATE INDEX "_ProjectSolutionTypes_B_index" ON "_ProjectSolutionTypes"("B");

ALTER TABLE "_ProjectSolutionTypes" ADD CONSTRAINT "_ProjectSolutionTypes_A_fkey" FOREIGN KEY ("A") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProjectSolutionTypes" ADD CONSTRAINT "_ProjectSolutionTypes_B_fkey" FOREIGN KEY ("B") REFERENCES "project_kinds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: each project that had a single "Tipo de Projeto" keeps that
-- exact same value, now as one of possibly several selected solution types.
INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", p."projectKindId" FROM "projects" p WHERE p."projectKindId" IS NOT NULL
ON CONFLICT ("A", "B") DO NOTHING;

-- Backfill 2: each legacy fixed "Tipo de Solução" key becomes a link to the
-- matching project_kinds row, per the mapping confirmed with the user.
-- "ia-ocr" maps to both "ia" and "ocr" (two separate links).
INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'rpa' AND p."solutionTypes" @> '["rpa"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'api' AND p."solutionTypes" @> '["api"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'ia' AND p."solutionTypes" @> '["ia-ocr"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'ocr' AND p."solutionTypes" @> '["ia-ocr"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'plataformas' AND p."solutionTypes" @> '["power-platform"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'python' AND p."solutionTypes" @> '["python"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'integracao' AND p."solutionTypes" @> '["integracao"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'dashboards' AND p."solutionTypes" @> '["dashboard"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

INSERT INTO "_ProjectSolutionTypes" ("A", "B")
SELECT p."id", k."id" FROM "projects" p, "project_kinds" k
WHERE k."slug" = 'outros' AND p."solutionTypes" @> '["outro"]'::jsonb
ON CONFLICT ("A", "B") DO NOTHING;

-- Drop the two old fields now that their data has been migrated.
ALTER TABLE "projects" DROP CONSTRAINT "projects_projectKindId_fkey";
ALTER TABLE "projects" DROP COLUMN "projectKindId";
ALTER TABLE "projects" DROP COLUMN "solutionTypes";
