-- CreateTable
CREATE TABLE "OAuthHandoffCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthHandoffCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthHandoffCode_codeHash_key" ON "OAuthHandoffCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthHandoffCode_expiresAt_idx" ON "OAuthHandoffCode"("expiresAt");

