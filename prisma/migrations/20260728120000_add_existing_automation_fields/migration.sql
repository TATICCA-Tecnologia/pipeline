-- Ficha de sustentação das automações existentes.
-- Seis colunas opcionais em projects; nenhum backfill — o texto livre já
-- existente em "currentApplicationDetails" permanece intocado como observações.
ALTER TABLE "projects" ADD COLUMN "currentApplicationHosting" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationHostingCustom" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAuthor" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationOwner" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAccessLocation" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationAccessReference" TEXT;
ALTER TABLE "projects" ADD COLUMN "currentApplicationLiveSince" TIMESTAMP(3);
