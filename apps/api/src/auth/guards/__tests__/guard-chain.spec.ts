/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionGuard } from '../session.guard';
import { ApiKeyGuard } from '../api-key.guard';
import { OrganizationGuard } from '../../../rbac/guards/organization.guard';
import { AuthService } from '../../auth.service';
import { ApiKeysService } from '../../../api-keys/api-keys.service';
import { prisma } from '@myplatform/database';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      membership: { findUnique: jest.fn() },
    },
  };
});

describe('Guard chain: SessionGuard → ApiKeyGuard → OrganizationGuard', () => {
  let sessionGuard: SessionGuard;
  let apiKeyGuard: ApiKeyGuard;
  let organizationGuard: OrganizationGuard;
  let mockAuthService: { validateSession: jest.Mock };
  let mockApiKeysService: { validateKey: jest.Mock };
  let reflector: Reflector;

  beforeEach(() => {
    mockAuthService = { validateSession: jest.fn() };
    mockApiKeysService = { validateKey: jest.fn() };
    reflector = new Reflector();
    sessionGuard = new SessionGuard(mockAuthService as any);
    apiKeyGuard = new ApiKeyGuard(mockApiKeysService as any);
    organizationGuard = new OrganizationGuard(reflector);
    jest.clearAllMocks();
  });

  function makeRequest(
    headers: Record<string, string | undefined>,
    params: Record<string, string> = {},
  ) {
    return {
      headers,
      params,
      user: undefined as any,
      sessionId: undefined as any,
      apiKeyContext: undefined as any,
      organizationId: undefined as any,
      orgRole: undefined as any,
      authenticationMethod: undefined as any,
    };
  }

  function makeContext(request: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  // ──────────── Case 1: Valid session token → 200 ────────────
  describe('Case 1: Valid session token → 200', () => {
    it('passes all three guards and sets user + org context', async () => {
      const request = makeRequest(
        { authorization: 'Bearer session-token-abc' },
        { organizationId: 'org-123' },
      );
      const ctx = makeContext(request);

      mockAuthService.validateSession.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-1',
        user: { id: 'user-1', email: 'a@b.com', name: 'Test', status: 'ACTIVE' },
      });
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        organizationId: 'org-123',
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const s1 = await sessionGuard.canActivate(ctx);
      expect(s1).toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.id).toBe('user-1');

      const s2 = await apiKeyGuard.canActivate(ctx);
      expect(s2).toBe(true);
      expect(request.apiKeyContext).toBeUndefined();

      const s3 = await organizationGuard.canActivate(ctx);
      expect(s3).toBe(true);
      expect(request.organizationId).toBe('org-123');
      expect(request.authenticationMethod).toBe('SESSION');
    });
  });

  // ──────────── Case 2: Valid API key → 200 ────────────
  describe('Case 2: Valid API key → 200', () => {
    it('passes all three guards and sets apiKeyContext', async () => {
      const request = makeRequest(
        { authorization: 'Bearer mp_live_abc123xyz' },
        { organizationId: 'org-456' },
      );
      const ctx = makeContext(request);

      mockApiKeysService.validateKey.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-456',
        permissions: ['project:create', 'project:read'],
      });

      const s1 = await sessionGuard.canActivate(ctx);
      expect(s1).toBe(true);
      expect(request.user).toBeUndefined();

      const s2 = await apiKeyGuard.canActivate(ctx);
      expect(s2).toBe(true);
      expect(request.apiKeyContext).toBeDefined();
      expect(request.apiKeyContext.organizationId).toBe('org-456');

      const s3 = await organizationGuard.canActivate(ctx);
      expect(s3).toBe(true);
      expect(request.organizationId).toBe('org-456');
      expect(request.authenticationMethod).toBe('API_KEY');
    });
  });

  // ──────────── Case 3: No token → 401 ────────────
  describe('Case 3: No Authorization header → 401', () => {
    it('SessionGuard throws 401, subsequent guards never run', async () => {
      const request = makeRequest({}, { organizationId: 'org-123' });
      const ctx = makeContext(request);

      await expect(sessionGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ──────────── Case 4: Expired session token → 401 ────────────
  describe('Case 4: Expired session token → 401', () => {
    it('SessionGuard throws 401 when validateSession returns null', async () => {
      const request = makeRequest(
        { authorization: 'Bearer expired-token' },
        { organizationId: 'org-123' },
      );
      const ctx = makeContext(request);

      mockAuthService.validateSession.mockResolvedValue(null);

      await expect(sessionGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ──────────── Case 5: API key for wrong org → 403 ────────────
  describe('Case 5: API key for Org A hitting Org B route → 403', () => {
    it('ApiKeyGuard passes, OrganizationGuard throws 403', async () => {
      const request = makeRequest(
        { authorization: 'Bearer mp_live_orgA_key' },
        { organizationId: 'org-B' },
      );
      const ctx = makeContext(request);

      mockApiKeysService.validateKey.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-A',
        permissions: ['project:create', 'project:read', 'project:delete'],
      });

      const s1 = await sessionGuard.canActivate(ctx);
      expect(s1).toBe(true);

      const s2 = await apiKeyGuard.canActivate(ctx);
      expect(s2).toBe(true);
      expect(request.apiKeyContext.organizationId).toBe('org-A');

      await expect(organizationGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  // ──────────── Case 6: Session user with no membership → 403 ────────────
  describe('Case 6: Session user with no membership → 403', () => {
    it('SessionGuard passes, ApiKeyGuard passes, OrganizationGuard throws 403', async () => {
      const request = makeRequest(
        { authorization: 'Bearer valid-session-token' },
        { organizationId: 'org-orphan' },
      );
      const ctx = makeContext(request);

      mockAuthService.validateSession.mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-999',
        user: { id: 'user-999', email: 'x@y.com', name: 'NoOrg', status: 'ACTIVE' },
      });
      (prisma.membership.findUnique as jest.Mock).mockResolvedValue(null);

      const s1 = await sessionGuard.canActivate(ctx);
      expect(s1).toBe(true);
      expect(request.user.id).toBe('user-999');

      const s2 = await apiKeyGuard.canActivate(ctx);
      expect(s2).toBe(true);

      await expect(organizationGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});
