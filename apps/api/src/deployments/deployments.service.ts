import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, ActorType, DeploymentStatus } from '@myplatform/database';
import { AuditService } from '../audit/audit.service.js';
import { enqueueOutboxEvent } from '../common/outbox.js';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  failIdempotencyKey,
} from '../common/idempotency.js';
import { paginateQuery, parseLimit, type CursorPaginationResult } from '../common/pagination.js';

@Injectable()
export class DeploymentsService {
  constructor(private readonly audit: AuditService) {}

  /** Tenant-scoped service lookup — the ownership path User→Membership→Org→Project→Service. */
  private async requireService(organizationId: string, projectId: string, serviceId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, projectId, organizationId, lifecycle: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        organizationId: true,
        projectId: true,
        branch: true,
        githubRepository: { select: { id: true, fullName: true, defaultBranch: true } },
      },
    });
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);
    return service;
  }

  listForService(
    organizationId: string,
    projectId: string,
    serviceId: string,
    limit?: number,
    cursor?: string,
  ): Promise<CursorPaginationResult<{
    id: string;
    status: DeploymentStatus;
    commitSha: string | null;
    commitMessage: string | null;
    commitAuthor: string | null;
    branch: string | null;
    deploymentTarget: string | null;
    imageDigest: string | null;
    rollbackReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    // Cursor-paginated, tenant-scoped, selected fields only (RULES 11/13/15).
    return paginateQuery(
      (args) =>
        prisma.deployment.findMany({
          ...args,
          select: {
            id: true,
            status: true,
            commitSha: true,
            commitMessage: true,
            commitAuthor: true,
            branch: true,
            deploymentTarget: true,
            imageDigest: true,
            rollbackReason: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      {
        service: {
          id: serviceId,
          projectId,
          organizationId,
        },
      },
      parseLimit(limit),
      cursor,
      { id: 'desc' },
    );
  }

  async findOne(organizationId: string, projectId: string, serviceId: string, id: string): Promise<{
    id: string;
    status: DeploymentStatus;
    imageDigest: string | null;
    commitSha: string | null;
    previousRelease: string | null;
    configSnapshot: unknown;
    rollbackReason: string | null;
    buildLog: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const deployment = await prisma.deployment.findFirst({
      where: { id, serviceId, service: { id: serviceId, projectId, organizationId } },
      select: {
        id: true,
        status: true,
        imageDigest: true,
        commitSha: true,
        previousRelease: true,
        configSnapshot: true,
        rollbackReason: true,
        buildLog: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!deployment) throw new NotFoundException(`Deployment ${id} not found`);
    return deployment;
  }

  /**
   * POST /deployments — RULE 21 (Idempotency-Key) + RULE 23 (outbox).
   *
   * The deployment row AND the outbox event are written in one transaction;
   * the queue enqueue happens from the outbox afterwards. DB state remains
   * the source of truth (RULE 22).
   */
  async create(
    organizationId: string,
    projectId: string,
    serviceId: string,
    dto: { commitSha?: string; branch?: string },
    actorUserId: string | undefined,
    actorApiKeyId: string | undefined,
    idempotency?: { organizationId: string; key: string; endpoint: string },
  ): Promise<{ deployment: unknown; idempotentReplay: boolean }> {
    if (idempotency) {
      const claim = await claimIdempotencyKey(
        idempotency.organizationId,
        idempotency.key,
        idempotency.endpoint,
      );
      if (claim.reused) {
        if (claim.status === 'COMPLETED') {
          return { deployment: claim.responseBody, idempotentReplay: true };
        }
        // PENDING or FAILED prior attempt: force the client to use a new key
        // rather than guessing what the first attempt did.
        throw new ConflictException(
          `Idempotency key '${idempotency.key}' was already used (status: ${claim.status ?? 'PENDING'}). Use a new key to retry.`,
        );
      }
    }

    const service = await this.requireService(organizationId, projectId, serviceId);
    const branch = dto.branch ?? service.branch ?? service.githubRepository?.defaultBranch;
    const commitSha = dto.commitSha ?? null;

    const [deployment] = await prisma.$transaction(async (tx) => {
      const created = await tx.deployment.create({
        data: {
          serviceId: service.id,
          status: 'PENDING',
          commitSha,
        },
      });

      // Outbox event commits atomically with the deployment row (RULE 23).
      await enqueueOutboxEvent(tx, {
        aggregate: 'Deployment',
        aggregateId: created.id,
        eventType: 'deployment.created',
        payload: {
          deploymentId: created.id,
          serviceId: service.id,
          commitSha: commitSha ?? null,
        },
      });

      return [created];
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'deployment.created',
      resourceType: 'Deployment',
      resourceId: deployment.id,
      metadata: { serviceId: service.id, commitSha, branch, via: 'api' },
    });

    const response = {
      id: deployment.id,
      status: deployment.status,
      commitSha: deployment.commitSha,
      createdAt: deployment.createdAt,
    };

    if (idempotency) {
      await completeIdempotencyKey(
        idempotency.organizationId,
        idempotency.key,
        idempotency.endpoint,
        response,
      );
    }

    return { deployment: response, idempotentReplay: false };
  }

  /** Cancel a pending/building deployment — RULE 24 state transition, audited. */
  async cancel(
    organizationId: string,
    projectId: string,
    serviceId: string,
    id: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ) {
    await this.requireService(organizationId, projectId, serviceId);

    const deployment = await prisma.deployment.findFirst({
      where: { id, serviceId, service: { projectId, organizationId } },
      select: { id: true, status: true },
    });
    if (!deployment) throw new NotFoundException(`Deployment ${id} not found`);

    if (deployment.status !== 'PENDING' && deployment.status !== 'BUILDING') {
      throw new ConflictException(
        `Deployment in status ${deployment.status} cannot be cancelled`,
      );
    }

    const updated = await prisma.deployment.update({
      where: { id: deployment.id },
      data: { status: 'CANCELLED' },
      select: { id: true, status: true, updatedAt: true },
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'deployment.cancelled',
      resourceType: 'Deployment',
      resourceId: deployment.id,
      metadata: { serviceId, previousStatus: deployment.status },
    });

    return updated;
  }

  /**
   * Roll back to a previous successful deployment. Creates a NEW deployment
   * whose imageDigest is the prior release's — never mutates history (RULE 24).
   */
  async rollback(
    organizationId: string,
    projectId: string,
    serviceId: string,
    targetDeploymentId: string,
    actorUserId?: string,
    actorApiKeyId?: string,
  ) {
    const service = await this.requireService(organizationId, projectId, serviceId);

    const target = await prisma.deployment.findFirst({
      where: {
        id: targetDeploymentId,
        serviceId,
        service: { projectId, organizationId },
        status: 'HEALTHY',
      },
      select: { id: true, imageDigest: true, commitSha: true },
    });
    if (!target || !target.imageDigest) {
      // 404, not 400/403 — don't reveal whether another tenant's deployment exists.
      throw new NotFoundException(`Deployment ${targetDeploymentId} not found`);
    }

    const [deployment] = await prisma.$transaction(async (tx) => {
      const created = await tx.deployment.create({
        data: {
          serviceId: service.id,
          status: 'PENDING',
          imageDigest: target.imageDigest,
          commitSha: target.commitSha,
          previousRelease: target.id,
          rollbackReason: 'manual_rollback',
        },
      });

      await enqueueOutboxEvent(tx, {
        aggregate: 'Deployment',
        aggregateId: created.id,
        eventType: 'deployment.rollback',
        payload: {
          deploymentId: created.id,
          serviceId: service.id,
          targetDeploymentId: target.id,
          imageDigest: target.imageDigest as string,
        },
      });

      return [created];
    });

    this.audit.log({
      organizationId,
      actorType: actorApiKeyId ? ActorType.API_KEY : ActorType.USER,
      actorUserId,
      actorApiKeyId,
      action: 'deployment.rollback',
      resourceType: 'Deployment',
      resourceId: deployment.id,
      metadata: { serviceId: service.id, targetDeploymentId: target.id },
    });

    return {
      id: deployment.id,
      status: deployment.status,
      rollbackTo: target.id,
      imageDigest: target.imageDigest,
    };
  }
}
