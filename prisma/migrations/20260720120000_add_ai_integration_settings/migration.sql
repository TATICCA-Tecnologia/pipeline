-- AlterTable: add AI integration config columns (all nullable, no backfill — feature is new, no prior data)
ALTER TABLE "system_settings" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "aiApiKey" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "aiBaseUrl" TEXT;
