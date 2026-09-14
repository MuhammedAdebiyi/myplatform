import { UnauthorizedException } from '@nestjs/common';
import { OAuthService } from '../oauth.service';
import { AuthProvider, prisma } from '@myplatform/database';

jest.mock('@myplatform/database', () => {
  const actual = jest.requireActual('@myplatform/database');
  return {
    ...actual,
    prisma: {
      oAuthState: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      accountIdentity: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest.fn(),
      },
      membership: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    },
  };
});

jest.mock('@myplatform/auth', () => ({
  generatePkcePair: jest.fn(() => ({
    codeVerifier: 'test-verifier',
    codeChallenge: 'test-challenge',
  })),
  generateOAuthState: jest.fn(() => 'test-state-abc123'),
  generateSessionToken: jest.fn(() => ({
    raw: 'mp_test_session_token',
    hash: 'test-hash',
    prefix: 'mp_test_s',
  })),
  hashSessionToken: jest.fn(() => 'test-hash'),
  sessionExpiresAt: jest.fn(() => new Date(Date.now() + 86400000)),
}));

describe('OAuth Security (RULE 33 adversarial tests)', () => {
  let oauthService: OAuthService;
  let mockAudit: { log: jest.Mock };

  beforeEach(() => {
    mockAudit = { log: jest.fn() };
    oauthService = new OAuthService(mockAudit as any);
    jest.clearAllMocks();
  });

  describe('Adversarial: Tampered state parameter', () => {
    it('rejects callback with non-existent state', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        oauthService.handleCallback(
          AuthProvider.GOOGLE,
          'auth-code',
          'tampered-state-value',
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.oAuthState.findUnique).toHaveBeenCalledWith({
        where: { state: 'tampered-state-value' },
      });
    });

    it('rejects callback with state from different provider', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'valid-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        oauthService.handleCallback(
          AuthProvider.GITHUB,
          'auth-code',
          'valid-state',
        ),
      ).rejects.toThrow('Provider mismatch');
    });
  });

  describe('Adversarial: Reused state parameter', () => {
    it('rejects callback with already-consumed state', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        oauthService.handleCallback(
          AuthProvider.GOOGLE,
          'auth-code',
          'already-used-state',
        ),
      ).rejects.toThrow('Invalid or expired OAuth state');
    });
  });

  describe('Adversarial: Same email as existing password user', () => {
    it('creates a SEPARATE user, does not auto-link', async () => {
      const existingUser = {
        id: 'existing-user-1',
        email: 'alice@example.com',
        passwordHash: 'hashed-password',
      };

      const newIdentity = {
        id: 'identity-1',
        userId: 'new-user-2',
        provider: AuthProvider.GOOGLE,
        providerAccountId: 'google-12345',
        email: 'alice@example.com',
      };

      const newUser = {
        id: 'new-user-2',
        email: 'alice@example.com',
      };

      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'valid-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        expiresAt: new Date(Date.now() + 60000),
      });

      (prisma.accountIdentity.findUnique as jest.Mock).mockResolvedValue(null);

      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(newUser),
            update: jest.fn().mockResolvedValue({}),
          },
          session: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      jest.spyOn(oauthService as any, 'exchangeCode').mockResolvedValue({
        access_token: 'mock-token',
      });
      jest.spyOn(oauthService as any, 'fetchUserInfo').mockResolvedValue({
        id: 'google-12345',
        email: 'alice@example.com',
        name: 'Alice',
      });

      const result = await oauthService.handleCallback(
        AuthProvider.GOOGLE,
        'auth-code',
        'valid-state',
      );

      expect(result.isNewUser).toBe(true);
    });
  });

  describe('Happy path: New user via OAuth', () => {
    it('creates user + org + membership + session in transaction', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'valid-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        expiresAt: new Date(Date.now() + 60000),
      });

      (prisma.accountIdentity.findUnique as jest.Mock).mockResolvedValue(null);

      const newUser = { id: 'new-user-1' };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
        const tx = {
          user: {
            create: jest.fn().mockResolvedValue(newUser),
            update: jest.fn().mockResolvedValue({}),
          },
          session: {
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(tx);
      });

      jest.spyOn(oauthService as any, 'exchangeCode').mockResolvedValue({
        access_token: 'mock-token',
      });
      jest.spyOn(oauthService as any, 'fetchUserInfo').mockResolvedValue({
        id: 'google-12345',
        email: 'newuser@gmail.com',
        name: 'New User',
      });

      const result = await oauthService.handleCallback(
        AuthProvider.GOOGLE,
        'auth-code',
        'valid-state',
      );

      expect(result.isNewUser).toBe(true);
      expect(result.sessionToken).toBe('mp_test_session_token');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.oauth.register',
          metadata: expect.objectContaining({ provider: AuthProvider.GOOGLE }),
        }),
      );
    });
  });

  describe('Happy path: Existing OAuth user login', () => {
    it('creates session, does not create new user', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'valid-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        expiresAt: new Date(Date.now() + 60000),
      });

      (prisma.accountIdentity.findUnique as jest.Mock).mockResolvedValue({
        id: 'identity-1',
        userId: 'existing-user-1',
        provider: AuthProvider.GOOGLE,
        providerAccountId: 'google-12345',
        user: { id: 'existing-user-1', status: 'ACTIVE' },
      });

      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.session.create as jest.Mock).mockResolvedValue({});

      jest.spyOn(oauthService as any, 'exchangeCode').mockResolvedValue({
        access_token: 'mock-token',
      });
      jest.spyOn(oauthService as any, 'fetchUserInfo').mockResolvedValue({
        id: 'google-12345',
        email: 'existing@gmail.com',
        name: 'Existing User',
      });

      const result = await oauthService.handleCallback(
        AuthProvider.GOOGLE,
        'auth-code',
        'valid-state',
      );

      expect(result.isNewUser).toBe(false);
      expect(result.sessionToken).toBe('mp_test_session_token');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('Adversarial: Link CSRF — attacker tries to link their OAuth to victim session', () => {
    it('rejects link callback when session user differs from initiating user', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'link-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        initiatingUserId: 'user-A-who-started-link',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        oauthService.handleLinkCallback(
          AuthProvider.GOOGLE,
          'auth-code',
          'link-state',
          'user-B-different-session',
        ),
      ).rejects.toThrow('Session user does not match the user who initiated the link');

      expect(prisma.oAuthState.delete).toHaveBeenCalledWith({
        where: { state: 'link-state' },
      });
    });

    it('accepts link callback when session user matches initiating user', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'link-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        initiatingUserId: 'user-A',
        expiresAt: new Date(Date.now() + 60000),
      });

      (prisma.accountIdentity.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.accountIdentity.create as jest.Mock).mockResolvedValue({});

      jest.spyOn(oauthService as any, 'exchangeCode').mockResolvedValue({
        access_token: 'mock-token',
      });
      jest.spyOn(oauthService as any, 'fetchUserInfo').mockResolvedValue({
        id: 'google-attacker-123',
        email: 'attacker@gmail.com',
        name: 'Attacker',
      });

      const result = await oauthService.handleLinkCallback(
        AuthProvider.GOOGLE,
        'auth-code',
        'link-state',
        'user-A',
      );

      expect(result.linked).toBe(true);
      expect(prisma.accountIdentity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-A',
            provider: AuthProvider.GOOGLE,
          }),
        }),
      );
    });

    it('rejects link callback when userId is undefined (unauthenticated request)', async () => {
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1',
        state: 'link-state',
        provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier',
        initiatingUserId: 'user-A',
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        oauthService.handleLinkCallback(
          AuthProvider.GOOGLE,
          'auth-code',
          'link-state',
          undefined as any,
        ),
      ).rejects.toThrow('Authentication required to link accounts');

      expect(prisma.oAuthState.delete).not.toHaveBeenCalled();
    });
  });

  describe('RULE 35: Concurrent callback race condition (TOCTOU)', () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock fetch to simulate token exchange and user info
      fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('googleapis.com/token')) {
          return { ok: true, json: async () => ({ access_token: 'mock-token', token_type: 'Bearer', scope: '' }) } as any;
        }
        if (typeof url === 'string' && url.includes('googleapis.com/oauth2')) {
          return { ok: true, json: async () => ({ sub: 'google-user-123', email: 'test@gmail.com', name: 'Test User' }) } as any;
        }
        return { ok: false, text: async () => 'not found' } as any;
      });
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('second request recovers gracefully when first wins the create race', async () => {
      // State validation passes
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1', state: 'race-state', provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier', expiresAt: new Date(Date.now() + 60000),
      });
      (prisma.oAuthState.delete as jest.Mock).mockResolvedValue({});

      // Initial identity lookup returns null (race: both see null)
      (prisma.accountIdentity.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)  // First request's initial lookup
        .mockResolvedValueOnce(null)  // Second request's initial lookup
        .mockResolvedValueOnce({      // Second request's retry after P2002
          id: 'identity-1', userId: 'user-1',
          user: { id: 'user-1', status: 'ACTIVE' },
        });

      // First request's transaction succeeds
      (prisma.$transaction as jest.Mock)
        .mockResolvedValueOnce({ sessionToken: 'token-1', userId: 'user-1' });

      // Second request's transaction throws P2002
      const p2002Error = new Error('Unique constraint failed') as any;
      p2002Error.code = 'P2002';
      (prisma.$transaction as jest.Mock)
        .mockRejectedValueOnce(p2002Error);

      // Session creation for the re-fetched existing user
      (prisma.session.create as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      // Run two concurrent callbacks
      const [result1, result2] = await Promise.all([
        oauthService.handleCallback(AuthProvider.GOOGLE, 'auth-code', 'race-state', '1.2.3.4', 'Chrome'),
        oauthService.handleCallback(AuthProvider.GOOGLE, 'auth-code', 'race-state', '5.6.7.8', 'Firefox'),
      ]);

      // Both should succeed
      expect(result1.sessionToken).toBeDefined();
      expect(result2.sessionToken).toBeDefined();
    });

    it('second request re-fetches and returns the existing user after P2002', async () => {
      const existingUser = {
        id: 'identity-1', userId: 'user-existing',
        user: { id: 'user-existing', status: 'ACTIVE' },
      };

      // Initial lookup: null
      (prisma.accountIdentity.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUser); // Retry after P2002

      // State validation
      (prisma.oAuthState.findUnique as jest.Mock).mockResolvedValue({
        id: 'state-1', state: 'race-state', provider: AuthProvider.GOOGLE,
        codeVerifier: 'verifier', expiresAt: new Date(Date.now() + 60000),
      });
      (prisma.oAuthState.delete as jest.Mock).mockResolvedValue({});

      // Transaction throws P2002
      const p2002Error = new Error('Unique constraint failed') as any;
      p2002Error.code = 'P2002';
      (prisma.$transaction as jest.Mock).mockRejectedValueOnce(p2002Error);

      // Session creation for re-fetched user
      (prisma.session.create as jest.Mock).mockResolvedValue({});
      (prisma.user.update as jest.Mock).mockResolvedValue({});

      const result = await oauthService.handleCallback(
        AuthProvider.GOOGLE, 'auth-code', 'race-state', '1.2.3.4',
      );

      expect(result.sessionToken).toBeDefined();
      expect(result.isNewUser).toBe(false);
      expect(prisma.accountIdentity.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
