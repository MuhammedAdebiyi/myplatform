import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  sessionExpiresAt,
} from '@myplatform/auth';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly audit: AuditService) {}

  async register(
    dto: { email: string; password: string; name: string },
    ip?: string,
    userAgent?: string,
  ) {
    const existing = await prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(dto.password);
    const session = generateSessionToken();

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        sessions: {
          create: {
            tokenHash: session.hash,
            ipAddress: ip ?? null,
            userAgent: userAgent ?? null,
            expiresAt: sessionExpiresAt(),
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: 'user.register',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { email: user.email },
      ipAddress: ip,
      userAgent,
    });

    return { user, sessionToken: session.raw };
  }

  async login(
    dto: { email: string; password: string },
    ip?: string,
    userAgent?: string,
  ) {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = generateSessionToken();

    await prisma.$transaction([
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: session.hash,
          ipAddress: ip ?? null,
          userAgent: userAgent ?? null,
          expiresAt: sessionExpiresAt(),
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: 'user.login',
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return { sessionToken: session.raw };
  }

  async logout(sessionId: string, userId: string, ip?: string, userAgent?: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'user.logout',
      resourceType: 'Session',
      resourceId: sessionId,
      ipAddress: ip,
      userAgent,
    });
  }

  async validateSession(tokenHash: string) {
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;
    if (session.user.status !== 'ACTIVE') return null;

    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      sessionId: session.id,
      userId: session.userId,
      user: session.user,
    };
  }
}
