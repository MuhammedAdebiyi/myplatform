import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class SessionsService {
  constructor(private readonly audit: AuditService) {}

  async list(userId: string, currentSessionId: string) {
    const sessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
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
