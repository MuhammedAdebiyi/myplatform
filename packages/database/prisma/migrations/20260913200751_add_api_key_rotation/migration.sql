-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "rotatedAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" TEXT;
