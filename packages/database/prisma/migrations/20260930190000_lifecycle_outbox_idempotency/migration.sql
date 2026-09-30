-- CreateEnum
CREATE TYPE "ResourceLifecycle" AS ENUM ('ACTIVE', 'DELETING', 'DELETED');

-- AlterTable: lifecycle states on tenant resources (scope §32)
ALTER TABLE "Organization" ADD COLUMN "lifecycle" "ResourceLifecycle" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Project" ADD COLUMN "lifecycle" "ResourceLifecycle" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Service" ADD COLUMN "lifecycle" "ResourceLifecycle" NOT NULL DEFAULT 'ACTIVE';

-- Organization.createdBy was a bare string with no FK and no owner semantics;
-- the OWNER membership is the source of truth. Drop it.
ALTER TABLE "Organization" DROP COLUMN "createdBy";

-- Deployment can now be cancelled (RULE 24 state machine).
-- ALTER TYPE ... ADD VALUE cannot run inside the migration transaction that
-- other statements use, so it executes in its own via this guard.
-- Deployment can now be cancelled (RULE 24 state machine).
-- Postgres cannot run ALTER TYPE ... ADD VALUE in a transaction with other
-- DDL (pre-v12 rule Prisma still enforces); isolate it in its own txn.
COMMIT;
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
BEGIN;

-- CreateTable (OutboxEvent — RULE 23 transactional outbox)
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable (IdempotencyKey — RULE 21)
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_key_endpoint_key" ON "IdempotencyKey"("organizationId", "key", "endpoint");

-- CreateIndex
CREATE INDEX "IdempotencyKey_organizationId_createdAt_idx" ON "IdempotencyKey"("organizationId", "createdAt");
