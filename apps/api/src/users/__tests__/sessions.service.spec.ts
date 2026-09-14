import { NotFoundException, ForbiddenException } from '@nestjs/common';

// Mock prisma
const mockPrismaSession = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};

const mockPrismaApiKey: any = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockPrisma = {
  session: mockPrismaSession,
  apiKey: mockPrismaApiKey,
  $transaction: jest.fn((fns: any[]) => Promise.all(fns)),
};

jest.mock('@myplatform/database', () => ({
  prisma: mockPrisma,
  ActorType: { USER: 'USER' },
  OrgRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', DEVELOPER: 'DEVELOPER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
}));

jest.mock('@myplatform/auth', () => ({
  generateApiKey: jest.fn(() => ({
    raw: 'mp_newkey1234567890abcdef12345678',
    prefix: 'mp_newkey123',
    hash: 'newkeyhash',
  })),
  hashApiKey: jest.fn((key: string) => `hashed_${key}`),
}));

const mockAudit = { log: jest.fn() };

import { SessionsService } from '../sessions.service.js';
import { ApiKeysService } from '../../api-keys/api-keys.service.js';

// ═══════════════════════════════════════════════════════════
// Session management tests
// ═══════════════════════════════════════════════════════════
describe('SessionsService', () => {
  let service: SessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionsService(mockAudit as any);
  });

  describe('list', () => {
    it('returns sessions with isCurrent flag', async () => {
      const sessions = [
        { id: 'sess-1', ipAddress: '1.2.3.4', userAgent: 'Chrome', createdAt: new Date(), lastUsedAt: new Date() },
        { id: 'sess-2', ipAddress: '5.6.7.8', userAgent: 'Firefox', createdAt: new Date(), lastUsedAt: new Date() },
      ];
      mockPrismaSession.findMany.mockResolvedValue(sessions);

      const result = await service.list('user-1', 'sess-1');

      expect(result).toEqual([
        { ...sessions[0], isCurrent: true },
        { ...sessions[1], isCurrent: false },
      ]);
    });

    it('returns empty array when no active sessions', async () => {
      mockPrismaSession.findMany.mockResolvedValue([]);
      const result = await service.list('user-1', 'sess-1');
      expect(result).toEqual([]);
    });
  });

  describe('revoke (single)', () => {
    it('revokes a session belonging to the user', async () => {
      mockPrismaSession.findFirst.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
      mockPrismaSession.update.mockResolvedValue({});

      await service.revoke('user-1', 'sess-1', 'sess-2', '1.2.3.4', 'Chrome');

      expect(mockPrismaSession.update).toHaveBeenCalledWith({
        where: { id: 'sess-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'session.revoked',
          metadata: expect.objectContaining({
            revokedSessionId: 'sess-1',
            isSelfRevoked: false,
            mode: 'single',
          }),
        }),
      );
    });

    it('marks isSelfRevoked when revoking current session', async () => {
      mockPrismaSession.findFirst.mockResolvedValue({ id: 'sess-1', userId: 'user-1' });
      mockPrismaSession.update.mockResolvedValue({});

      await service.revoke('user-1', 'sess-1', 'sess-1');

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ isSelfRevoked: true }),
        }),
      );
    });

    it('throws NotFoundException when session not found or not owned by user', async () => {
      mockPrismaSession.findFirst.mockResolvedValue(null);
      await expect(service.revoke('user-1', 'sess-B', 'sess-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeAll', () => {
    it('revokes all sessions except current', async () => {
      mockPrismaSession.updateMany.mockResolvedValue({ count: 3 });
      const result = await service.revokeAll('user-1', 'sess-current', false, '1.2.3.4', 'Chrome');
      expect(result).toEqual({ revokedCount: 3 });
    });

    it('revokes ALL sessions including current when includeCurrent=true', async () => {
      mockPrismaSession.updateMany.mockResolvedValue({ count: 4 });
      const result = await service.revokeAll('user-1', 'sess-current', true);
      expect(result).toEqual({ revokedCount: 4 });
    });
  });

  describe('RULE 03/26: Cross-user revoke returns 404 (not 403)', () => {
    it('user A revoking user B session gets NotFoundException', async () => {
      mockPrismaSession.findFirst.mockResolvedValue(null);
      await expect(service.revoke('user-A', 'sess-B', 'sess-A')).rejects.toThrow(NotFoundException);
      expect(mockPrismaSession.findFirst).toHaveBeenCalledWith({
        where: { id: 'sess-B', userId: 'user-A', revokedAt: null },
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════
// API key rotation tests
// ═══════════════════════════════════════════════════════════
describe('ApiKeysService', () => {
  let service: ApiKeysService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeysService(mockAudit as any);
  });

  describe('rotate', () => {
    it('creates a new key with same name and permissions', async () => {
      const oldKey = {
        id: 'key-old',
        organizationId: 'org-1',
        createdById: 'user-1',
        name: 'My Key',
        keyPrefix: 'mp_oldprefix',
        permissions: ['project:read', 'service:read'],
        expiresAt: new Date('2026-12-31'),
        revokedAt: null,
        rotatedAt: null,
      };
      mockPrismaApiKey.findFirst.mockResolvedValue(oldKey);
      mockPrismaApiKey.create.mockResolvedValue({
        id: 'key-new',
        name: 'My Key',
        keyPrefix: 'mp_newkey123',
        permissions: ['project:read', 'service:read'],
        expiresAt: new Date('2026-12-31'),
        createdAt: new Date(),
      });
      mockPrismaApiKey.update.mockResolvedValue({});

      const result = await service.rotate('org-1', 'key-old', 'user-1');

      expect(result.key).toBe('mp_newkey1234567890abcdef12345678');
      expect(result.name).toBe('My Key');
      expect(result.permissions).toEqual(['project:read', 'service:read']);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'api_key.rotated',
          metadata: expect.objectContaining({
            oldKeyPrefix: 'mp_oldprefix',
            newKeyId: 'key-new',
          }),
        }),
      );
    });

    it('marks old key with rotatedAt and supersededById', async () => {
      const oldKey = {
        id: 'key-old', organizationId: 'org-1', createdById: 'user-1',
        name: 'Key', keyPrefix: 'mp_old', permissions: [], expiresAt: null,
        revokedAt: null, rotatedAt: null,
      };
      mockPrismaApiKey.findFirst.mockResolvedValue(oldKey);
      mockPrismaApiKey.create.mockResolvedValue({
        id: 'key-new', name: 'Key', keyPrefix: 'mp_new', permissions: [],
        expiresAt: null, createdAt: new Date(),
      });
      mockPrismaApiKey.update.mockResolvedValue({});

      await service.rotate('org-1', 'key-old', 'user-1');

      // First update sets rotatedAt
      expect(mockPrismaApiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-old' },
        data: { rotatedAt: expect.any(Date), supersededById: null },
      });
      // Second update sets supersededById
      expect(mockPrismaApiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-old' },
        data: { supersededById: 'key-new' },
      });
    });

    it('throws NotFoundException when key not in scope (RULE 03/26)', async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue(null);
      await expect(service.rotate('org-B', 'key-A', 'user-A')).rejects.toThrow(NotFoundException);
      expect(mockPrismaApiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-A', organizationId: 'org-B' },
      });
    });

    it('throws ForbiddenException for revoked key', async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue({
        id: 'key-1', organizationId: 'org-1', revokedAt: new Date(),
        rotatedAt: null,
      });
      await expect(service.rotate('org-1', 'key-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for already-rotated key', async () => {
      mockPrismaApiKey.findFirst.mockResolvedValue({
        id: 'key-1', organizationId: 'org-1', revokedAt: null,
        rotatedAt: new Date(),
      });
      await expect(service.rotate('org-1', 'key-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateKey: rotated key grace period', () => {
    it('returns key data during grace period (rotatedAt < 24h ago)', async () => {
      const recentRotation = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      mockPrismaApiKey.findUnique.mockResolvedValue({
        id: 'key-old', organizationId: 'org-1', permissions: ['project:read'],
        expiresAt: null, revokedAt: null, rotatedAt: recentRotation,
      });
      mockPrismaApiKey.update.mockResolvedValue({});

      const result = await service.validateKey('mp_somekey');
      expect(result).toEqual({
        id: 'key-old', organizationId: 'org-1', permissions: ['project:read'],
      });
    });

    it('returns null after grace period elapsed (rotatedAt > 24h ago)', async () => {
      const oldRotation = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      mockPrismaApiKey.findUnique.mockResolvedValue({
        id: 'key-old', organizationId: 'org-1', permissions: ['project:read'],
        expiresAt: null, revokedAt: null, rotatedAt: oldRotation,
      });

      const result = await service.validateKey('mp_somekey');
      expect(result).toBeNull();
    });

    it('returns null for revoked key', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue({
        id: 'key-1', organizationId: 'org-1', permissions: [],
        expiresAt: null, revokedAt: new Date(), rotatedAt: null,
      });
      const result = await service.validateKey('mp_somekey');
      expect(result).toBeNull();
    });

    it('returns null for expired key', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue({
        id: 'key-1', organizationId: 'org-1', permissions: [],
        expiresAt: new Date('2020-01-01'), revokedAt: null, rotatedAt: null,
      });
      const result = await service.validateKey('mp_somekey');
      expect(result).toBeNull();
    });

    it('returns null for non-existent key', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(null);
      const result = await service.validateKey('mp_nonexistent');
      expect(result).toBeNull();
    });
  });
});
