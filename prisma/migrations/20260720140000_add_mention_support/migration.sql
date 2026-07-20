-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MENTION';

-- AlterTable
ALTER TABLE "comments" ADD COLUMN "mentionedUserIds" JSONB;
