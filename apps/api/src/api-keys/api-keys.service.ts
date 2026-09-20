import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import { generateApiKey } from '@myplatform/auth';
import { Permission } from '../rbac/permissions.js';
import { AuditService } from '../audit/audit.service.js';
import { paginateQuery, parseLimit } from '../common/pagination.js';

const MAX_PERMISSIONS_PER_KEY: Permission[] = [
  Permission.PROJECT_READ,
  Permission.PROJECT_CREATE,
  Permission.PROJECT_UPDATE,
  Permission.PROJECT_DELETE,
  Permission.SERVICE_READ,
  Permission.SERVICE_CREATE,
  Permission.SERVICE_UPDATE,
  Permission.SERVICE_DELETE,
  Permission.MEMBER_LIST,
  Permission.AUDIT_READ,
];

@Injectable()
export class ApiKeysService {
  constructor(private readonly audit: AuditService) {}

  async create(
    organizationId: string,
    createdById: string,
    dto: { name: string; permissions?: string[]; expiresIn?: string },
  ) {
    const permissions = dto.permissions ?? [];

    for (const perm of permissions) {
      if (!MAX_PERMISSIONS_PER_KEY.includes(perm as Permission)) {
        throw new ForbiddenException(
          `Permission ${perm} cannot be assigned to API keys`,
        );
      }
    }

    const key = generateApiKey();

    let expiresAt: Date | undefined;
    if (dto.expiresIn) {
      expiresAt = parseExpiresIn(dto.expiresIn);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        createdById,
        name: dto.name,
        keyPrefix: key.prefix,
        keyHash: key.hash,
        permissions,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId: createdById,
      action: 'api_key.create',
      resourceType: 'ApiKey',
      resourceId: apiKey.id,
      metadata: { name: apiKey.name, permissions },
    });

    return { ...apiKey, key: key.raw };
  }

  async list(organizationId: string, limit?: number, cursor?: string) {
    return paginateQuery(
      (args) => prisma.apiKey.findMany({
        ...args,
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
      { organizationId, revokedAt: null },
      parseLimit(limit),
      cursor,
      { id: 'desc' },
    );
  }

  async revoke(organizationId: string, keyId: string, actorUserId?: string) {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id: keyId, organizationId },
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.revokedAt) {
      throw new ForbiddenException('API key already revoked');
    }

    await prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId,
      action: 'api_key.revoke',
      resourceType: 'ApiKey',
      resourceId: keyId,
      metadata: { name: apiKey.name },
    });
  }

  async rotate(
    organizationId: string,
    keyId: string,
    actorUserId?: string,
    overrideExpiresIn?: string,
  ) {
    const oldKey = await prisma.apiKey.findFirst({
      where: { id: keyId, organizationId },
    });
    if (!oldKey) {
      throw new NotFoundException('API key not found');
    }
    if (oldKey.revokedAt) {
      throw new ForbiddenException('Cannot rotate a revoked API key');
    }
    if (oldKey.rotatedAt) {
      throw new ForbiddenException('API key has already been rotated');
    }

    const newKey = generateApiKey();

    // Copy expiresAt policy unless overridden
    let expiresAt = oldKey.expiresAt;
    if (overrideExpiresIn) {
      expiresAt = parseExpiresIn(overrideExpiresIn);
    }

    const newApiKey = await prisma.$transaction([
      // Create the new key
      prisma.apiKey.create({
        data: {
          organizationId,
          createdById: oldKey.createdById,
          name: oldKey.name,
          keyPrefix: newKey.prefix,
          keyHash: newKey.hash,
          permissions: oldKey.permissions,
          expiresAt,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      // Mark the old key as rotated with 24h grace period
      prisma.apiKey.update({
        where: { id: keyId },
        data: {
          rotatedAt: new Date(),
          supersededById: null, // Will be set after we know the new key id
        },
      }),
    ]);

    // Now set the supersededById on the old key
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { supersededById: newApiKey[0].id },
    });

    this.audit.log({
      organizationId,
      actorType: ActorType.USER,
      actorUserId,
      action: 'api_key.rotated',
      resourceType: 'ApiKey',
      resourceId: keyId,
      metadata: {
        oldKeyPrefix: oldKey.keyPrefix,
        newKeyId: newApiKey[0].id,
        newKeyPrefix: newApiKey[0].keyPrefix,
      },
    });

    return { ...newApiKey[0], key: newKey.raw };
  }

  async validateKey(rawKey: string) {
    const { hashApiKey } = await import('@myplatform/auth');
    const hash = hashApiKey(rawKey);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hash },
      select: {
        id: true,
        organizationId: true,
        permissions: true,
        expiresAt: true,
        revokedAt: true,
        rotatedAt: true,
      },
    });

    if (!apiKey) return null;
    if (apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Rotated key: still valid during 24h grace period, then treated as revoked
    if (apiKey.rotatedAt) {
      const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
      const graceExpires = new Date(apiKey.rotatedAt.getTime() + GRACE_PERIOD_MS);
      if (new Date() > graceExpires) {
        return null;
      }
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: apiKey.id,
      organizationId: apiKey.organizationId,
      permissions: apiKey.permissions,
    };
  }
}

function parseExpiresIn(expiresIn: string): Date {
  const match = expiresIn.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new ForbiddenException(
      'Invalid expiresIn format. Use number + d(ays)/h(ours)/m(inutes)',
    );
  }

  const [, amount, unit] = match;
  const now = new Date();
  const value = parseInt(amount, 10);

  switch (unit) {
    case 'd':
      now.setDate(now.getDate() + value);
      break;
    case 'h':
      now.setHours(now.getHours() + value);
      break;
    case 'm':
      now.setMinutes(now.getMinutes() + value);
      break;
  }

  return now;
}
