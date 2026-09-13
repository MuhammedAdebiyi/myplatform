-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WEB_SERVICE', 'WORKER', 'CRON_JOB', 'STATIC_SITE', 'PRIVATE_SERVICE');

-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('RECREATE', 'ROLLING', 'BLUE_GREEN', 'CANARY');

-- CreateEnum
CREATE TYPE "RestartPolicy" AS ENUM ('ALWAYS', 'ON_FAILURE', 'NEVER');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING', 'BUILDING', 'DEPLOYING', 'HEALTHY', 'FAILED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'default',
    "repoUrl" TEXT,
    "branch" TEXT,
    "dockerfilePath" TEXT,
    "buildCommand" TEXT,
    "startCommand" TEXT,
    "image" TEXT,
    "cpuRequest" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "cpuLimit" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "memRequestMb" INTEGER NOT NULL DEFAULT 256,
    "memLimitMb" INTEGER NOT NULL DEFAULT 1024,
    "diskMb" INTEGER NOT NULL DEFAULT 1024,
    "replicas" INTEGER NOT NULL DEFAULT 1,
    "restartPolicy" "RestartPolicy" NOT NULL DEFAULT 'ON_FAILURE',
    "deploymentStrategy" "DeploymentStrategy" NOT NULL DEFAULT 'ROLLING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvVar" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EnvVar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '/health',
    "intervalSeconds" INTEGER NOT NULL DEFAULT 10,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 5,
    "healthyThreshold" INTEGER NOT NULL DEFAULT 2,
    "unhealthyThreshold" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "imageDigest" TEXT,
    "commitSha" TEXT,
    "previousRelease" TEXT,
    "configSnapshot" JSONB,
    "rollbackReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Service_projectId_name_key" ON "Service"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EnvVar_serviceId_key_key" ON "EnvVar"("serviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCheck_serviceId_key" ON "HealthCheck"("serviceId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvVar" ADD CONSTRAINT "EnvVar_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCheck" ADD CONSTRAINT "HealthCheck_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
