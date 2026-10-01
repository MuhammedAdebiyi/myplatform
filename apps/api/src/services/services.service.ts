import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Service, EnvVar, ActorType } from '@myplatform/database';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { CreateEnvVarDto } from './dto/create-env-var.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { enqueueOutboxEvent } from '../common/outbox.js';
import { paginateQuery, parseLimit, type CursorPaginationResult } from '../common/pagination.js';
import {
  encryptSecret,
  isEncryptedValue,
  toPublicEnvVar,
  toPublicEnvVars,
  type PublicEnvVar,
} from '../common/env-secret.js';

@Injectable()
export class ServicesService {
  constructor(private readonly audit: AuditService) {}

  private async requireService(
    organizationId: string,
    projectId: string,
    serviceId: string,
  ): Promise<{ id: string; name: string }> {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, projectId, organizationId },
      select: { id: true, name: true },
    });
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} not found`);
    }
    return service;
  }

  /** Encrypt any legacy plaintext secret rows found while reading (at-rest fix). */
  private async encryptLegacySecrets(rows: EnvVar[]): Promise<void> {
    for (const row of rows) {
      if (row.isSecret && !isEncryptedValue(row.value)) {
        await prisma.envVar.update({
          where: { id: row.id },
          data: { value: encryptSecret(row.value) },
        });
      }
    }
  }

  async listEnvVars(
    organizationId: string,
    projectId: string,
    serviceId: string,
  ): Promise<PublicEnvVar[]> {
    await this.requireService(organizationId, projectId, serviceId);
    const rows = await prisma.envVar.findMany({
      where: { serviceId },
      orderBy: { key: 'asc' },
    });
    await this.encryptLegacySecrets(rows);
    return toPublicEnvVars(rows);
  }

  async createEnvVar(
    organizationId: string,
    projectId: string,
    serviceId: string,
    dto: CreateEnvVarDto,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<PublicEnvVar> {
    await this.requireService(organizationId, projectId, serviceId);

    const existing = await prisma.envVar.findUnique({
      where: { serviceId_key: { serviceId, key: dto.key } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Env var ${dto.key} already exists`);
    }

    const isSecret = dto.isSecret ?? false;
    const storedValue = isSecret ? encryptSecret(dto.value) : dto.value;

    const envVar = await prisma.envVar.create({
      data: {
        serviceId,
        key: dto.key,
        value: storedValue,
        isSecret,
      },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.env_var.create',
      resourceType: 'EnvVar',
      resourceId: envVar.id,
      metadata: { serviceId, key: envVar.key, isSecret },
    });

    // Create-once plaintext (same pattern as API keys / OAuth secrets).
    return { ...envVar, value: dto.value };
  }

  async removeEnvVar(
    organizationId: string,
    projectId: string,
    serviceId: string,
    envVarId: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<PublicEnvVar> {
    await this.requireService(organizationId, projectId, serviceId);

    const envVar = await prisma.envVar.findFirst({
      where: { id: envVarId, serviceId },
    });
    if (!envVar) {
      throw new NotFoundException(`Env var ${envVarId} not found`);
    }

    await prisma.envVar.delete({ where: { id: envVarId } });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.env_var.delete',
      resourceType: 'EnvVar',
      resourceId: envVarId,
      metadata: { serviceId, key: envVar.key },
    });

    return toPublicEnvVar(envVar);
  }

  findAllForProject(
    organizationId: string,
    projectId: string,
    limit?: number,
    cursor?: string,
  ): Promise<CursorPaginationResult<Service>> {
    return paginateQuery(
      (args) => prisma.service.findMany(args),
      { projectId, organizationId, lifecycle: 'ACTIVE' },
      parseLimit(limit),
      cursor,
      { id: 'asc' },
    );
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<Service & { envVars: PublicEnvVar[] }> {
    const service = await prisma.service.findFirst({
      where: { id, organizationId, lifecycle: 'ACTIVE' },
      select: {
        id: true,
        projectId: true,
        organizationId: true,
        name: true,
        type: true,
        region: true,
        lifecycle: true,
        repoUrl: true,
        branch: true,
        githubRepositoryId: true,
        deployPullRequests: true,
        dockerfilePath: true,
        buildCommand: true,
        startCommand: true,
        image: true,
        cpuRequest: true,
        cpuLimit: true,
        memRequestMb: true,
        memLimitMb: true,
        diskMb: true,
        replicas: true,
        restartPolicy: true,
        deploymentStrategy: true,
        createdAt: true,
        updatedAt: true,
        envVars: {
          select: { id: true, serviceId: true, key: true, value: true, isSecret: true },
        },
        domains: {
          select: { id: true, serviceId: true, hostname: true, isCustom: true },
        },
        healthCheck: {
          select: {
            id: true, serviceId: true, path: true, intervalSeconds: true,
            timeoutSeconds: true, healthyThreshold: true, unhealthyThreshold: true,
          },
        },
        // RULE 11: last 20 deployments, newest first — never the full history.
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, serviceId: true, status: true, commitSha: true,
            imageDigest: true, createdAt: true, updatedAt: true,
          },
        },
      },
    });
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    await this.encryptLegacySecrets(service.envVars as EnvVar[]);
    const result: Service & { envVars: PublicEnvVar[] } = {
      ...service,
      envVars: toPublicEnvVars(service.envVars as EnvVar[]),
    } as Service & { envVars: PublicEnvVar[] };
    return result;
  }

  async create(
    organizationId: string,
    projectId: string,
    dto: CreateServiceDto,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Service> {
    // Tenant path: resolve the project through organizationId (RULE 03/34).
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId, lifecycle: 'ACTIVE' },
      select: { id: true, organizationId: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const service = await prisma.service.create({
      data: { ...dto, projectId, organizationId: project.organizationId },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.created',
      resourceType: 'Service',
      resourceId: service.id,
      metadata: { name: service.name, type: service.type },
    });

    return service;
  }

  async remove(
    organizationId: string,
    id: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ): Promise<Service> {
    // Async lifecycle delete (scope §32 / RULE 24) — same as Project.remove.
    const existing = await prisma.service.findFirst({
      where: { id, organizationId, lifecycle: 'ACTIVE' },
      select: { id: true, name: true, projectId: true },
    });
    if (!existing) throw new NotFoundException(`Service ${id} not found`);

    const [service] = await prisma.$transaction(async (tx) => {
      const updated = await tx.service.update({
        where: { id },
        data: { lifecycle: 'DELETING' },
      });
      await enqueueOutboxEvent(tx, {
        aggregate: 'Service',
        aggregateId: id,
        eventType: 'service.cleanup',
        payload: { serviceId: id, organizationId },
      });
      return [updated];
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'service.deleted',
      resourceType: 'Service',
      resourceId: id,
      metadata: { name: existing.name, mode: 'async_lifecycle' },
    });

    return service;
  }
}
