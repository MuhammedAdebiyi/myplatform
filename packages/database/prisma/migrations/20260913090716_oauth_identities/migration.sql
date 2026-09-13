-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'GITHUB');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AccountIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "redirectTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountIdentity_userId_idx" ON "AccountIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountIdentity_provider_providerAccountId_key" ON "AccountIdentity"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "LinkAccount_targetId_idx" ON "LinkAccount"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkAccount_userId_targetId_key" ON "LinkAccount"("userId", "targetId");

-- AddForeignKey
ALTER TABLE "AccountIdentity" ADD CONSTRAINT "AccountIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkAccount" ADD CONSTRAINT "LinkAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkAccount" ADD CONSTRAINT "LinkAccount_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
