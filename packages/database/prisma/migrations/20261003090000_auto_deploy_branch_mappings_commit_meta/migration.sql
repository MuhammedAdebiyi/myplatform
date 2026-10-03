-- AlterTable: auto-deploy on reconnect (Vercel-style)
ALTER TABLE "Service" ADD COLUMN "autoDeployOnConnect" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: commit metadata on deployments
ALTER TABLE "Deployment" ADD COLUMN "commitMessage" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "commitAuthor" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "branch" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "deploymentTarget" TEXT;

-- CreateEnum
CREATE TYPE "BranchMappingTarget" AS ENUM ('PRODUCTION', 'PREVIEW');

-- CreateTable: branch mappings (production branch + preview branches)
CREATE TABLE "ServiceBranchMapping" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "target" "BranchMappingTarget" NOT NULL DEFAULT 'PREVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBranchMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBranchMapping_serviceId_branch_key" ON "ServiceBranchMapping"("serviceId", "branch");
CREATE INDEX "ServiceBranchMapping_serviceId_idx" ON "ServiceBranchMapping"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceBranchMapping" ADD CONSTRAINT "ServiceBranchMapping_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
