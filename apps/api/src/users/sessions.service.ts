import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import { AuditService } from '../audit/audit.service.js';
import { paginateQuery, parseLimit, type CursorPaginationResult } from '../common/pagination.js';

export interface SessionListItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  isCurrent: boolean;
}

@Injectable()
export class SessionsService {
  constructor(private readonly audit: AuditService) {}

  async list(
    userId: string,
    currentSessionId: string,
    limit?: number,
    cursor?: string,
  ): Promise<CursorPaginationResult<SessionListItem>> {
    const result = await paginateQuery(
      (args) => prisma.session.findMany({
        ...args,
        where: { ...args.where, expiresAt: { gt: new Date() } },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          lastUsedAt: true,
        },
      }),
      { userId, revokedAt: null },
      parseLimit(limit),
      cursor,
      { id: 'desc' },
    );

    return {
      ...result,
      items: result.items.map((s) => ({
        ...s,
        isCurrent: s.id === currentSessionId,
      })),
    };
  }

  async revoke(userId: string, sessionId: string, currentSessionId: string, ip?: string, userAgent?: string) {
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'session.revoked',
      resourceType: 'Session',
      resourceId: sessionId,
      metadata: {
        revokedSessionId: sessionId,
        isSelfRevoked: sessionId === currentSessionId,
        mode: 'single',
      },
      ipAddress: ip,
      userAgent,
    });
  }

  async revokeAll(userId: string, currentSessionId: string, includeCurrent: boolean, ip?: string, userAgent?: string) {
    const where: any = {
      userId,
      revokedAt: null,
    };

    if (!includeCurrent) {
      where.id = { not: currentSessionId };
    }

    const result = await prisma.session.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'session.revoked',
      resourceType: 'Session',
      metadata: {
        mode: 'bulk',
        includeCurrent,
        revokedCount: result.count,
      },
      ipAddress: ip,
      userAgent,
    });

    return { revokedCount: result.count };
  }
}
