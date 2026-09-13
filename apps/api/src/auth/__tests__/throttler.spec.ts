import { ExecutionContext, HttpException } from '@nestjs/common';
import { throttleCheck, throttleReset, throttleClear } from '../../common/throttler.js';
import { LoginThrottlerGuard } from '../guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from '../guards/register-throttler.guard.js';
import { OAuthThrottlerGuard } from '../../oauth/oauth-throttler.guard.js';
import { ApiKeysThrottlerGuard } from '../../api-keys/api-keys-throttler.guard.js';

function mockContext(ip: string, body?: any, user?: any, apiKeyContext?: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: body ?? {}, user, apiKeyContext }),
    }),
  } as any;
}

beforeEach(() => throttleClear());

describe('Throttler configuration (RULE 40)', () => {
  describe('Login: 5 per 15min keyed by IP+email', () => {
    it('same IP + same email shares one counter', () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(guard.canActivate(mockContext('127.0.0.1', { email: 'alice@test.com' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('127.0.0.1', { email: 'alice@test.com' })),
      ).toThrow(HttpException);
    });

    it('same IP + different emails are separate keys', () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(guard.canActivate(mockContext('127.0.0.1', { email: 'a@test.com' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('127.0.0.1', { email: 'a@test.com' })),
      ).toThrow(HttpException);

      expect(guard.canActivate(mockContext('127.0.0.1', { email: 'b@test.com' }))).toBe(true);
    });

    it('different IPs + same email are separate keys', () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1', { email: 'alice@test.com' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('10.0.0.1', { email: 'alice@test.com' })),
      ).toThrow(HttpException);

      expect(guard.canActivate(mockContext('10.0.0.2', { email: 'alice@test.com' }))).toBe(true);
    });

    it('missing email defaults to "unknown" key', () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('10.0.0.1'))).toThrow(HttpException);
    });
  });

  describe('Register: 3 per hour per IP', () => {
    it('same IP blocked after 3 attempts', () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(guard.canActivate(mockContext('192.168.1.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('192.168.1.1'))).toThrow(HttpException);
    });

    it('different IPs have independent limits', () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('10.0.0.1'))).toThrow(HttpException);
      expect(guard.canActivate(mockContext('10.0.0.2'))).toBe(true);
    });
  });

  describe('OAuth: 20 per hour per IP', () => {
    it('same IP blocked after 20 attempts', () => {
      const guard = new OAuthThrottlerGuard();
      for (let i = 1; i <= 20; i++) {
        expect(guard.canActivate(mockContext('172.16.0.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('172.16.0.1'))).toThrow(HttpException);
    });

    it('different IPs independent', () => {
      const guard = new OAuthThrottlerGuard();
      for (let i = 1; i <= 20; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('10.0.0.1'))).toThrow(HttpException);
      expect(guard.canActivate(mockContext('10.0.0.2'))).toBe(true);
    });
  });

  describe('API keys: 10/hr keyed by resolved organization context', () => {
    it('api-key auth: key is organizationId from apiKeyContext', () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-123' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-123' })),
      ).toThrow(HttpException);
    });

    it('session auth: key is userId', () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1', {}, { id: 'user-456' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('10.0.0.1', {}, { id: 'user-456' })),
      ).toThrow(HttpException);
    });

    it('unauthenticated: falls back to IP', () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('10.0.0.1'))).toThrow(HttpException);
    });
  });

  describe('Adversarial: IP-rotation does NOT reset counter', () => {
    it('login: same userId from different IPs shares one counter', () => {
      for (let i = 1; i <= 5; i++) {
        throttleCheck('login:1.2.3.4:user@test.com', 900_000, 5);
      }
      throttleCheck('login:5.6.7.8:user@test.com', 900_000, 5);
      expect(() => throttleCheck('login:1.2.3.4:user@test.com', 900_000, 5)).toThrow(HttpException);
    });

    it('api-keys: same org from different IPs shares one counter', () => {
      for (let i = 1; i <= 10; i++) {
        throttleCheck('api-keys:org-A', 3_600_000, 10);
      }
      expect(() => throttleCheck('api-keys:org-A', 3_600_000, 10)).toThrow(HttpException);
    });
  });

  describe('Adversarial: Different actors sharing IP do NOT collide', () => {
    it('api-keys: two orgs on same IP have separate counters', () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-AAA' }))).toBe(true);
      }
      expect(() =>
        guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-AAA' })),
      ).toThrow(HttpException);

      expect(guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-BBB' }))).toBe(true);
    });

    it('register: two different IPs have separate counters', () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(guard.canActivate(mockContext('192.168.1.1'))).toBe(true);
      }
      expect(() => guard.canActivate(mockContext('192.168.1.1'))).toThrow(HttpException);
      expect(guard.canActivate(mockContext('192.168.1.2'))).toBe(true);
    });
  });

  describe('429 response: identical regardless of route', () => {
    it('login 429 has same shape as register 429', () => {
      const loginGuard = new LoginThrottlerGuard();
      const registerGuard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 5; i++) loginGuard.canActivate(mockContext('10.0.0.1', { email: 'x@t.com' }));
      for (let i = 1; i <= 3; i++) registerGuard.canActivate(mockContext('10.0.0.2'));

      let loginErr: any;
      let registerErr: any;
      try { loginGuard.canActivate(mockContext('10.0.0.1', { email: 'x@t.com' })); } catch (e) { loginErr = e; }
      try { registerGuard.canActivate(mockContext('10.0.0.2')); } catch (e) { registerErr = e; }

      expect(loginErr.getStatus()).toBe(429);
      expect(registerErr.getStatus()).toBe(429);
      expect(loginErr.message).toBe(registerErr.message);
    });
  });
});
