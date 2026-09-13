import { Injectable, Logger } from '@nestjs/common';
import { prisma, ActorType, Prisma } from '@myplatform/database';

export interface AuditContext {
  organizationId?: string;
  actorType: ActorType;
  actorUserId?: string;
  actorApiKeyId?: string;
  actorSystemId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  log(ctx: AuditContext): void {
    prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId ?? null,
        actorType: ctx.actorType,
        actorUserId: ctx.actorUserId ?? null,
        actorApiKeyId: ctx.actorApiKeyId ?? null,
        actorSystemId: ctx.actorSystemId ?? null,
        action: ctx.action,
        resourceType: ctx.resourceType,
        resourceId: ctx.resourceId ?? null,
        metadata: ctx.metadata ? (ctx.metadata as Prisma.InputJsonValue) : undefined,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    }).catch((err) => {
      this.logger.error({ err, action: ctx.action, resourceType: ctx.resourceType }, 'audit log write failed');
    });
  }
}
