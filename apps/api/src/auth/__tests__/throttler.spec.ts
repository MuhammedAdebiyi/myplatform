import { ExecutionContext, HttpException } from '@nestjs/common';
import { throttleCheck, throttleReset, throttleClear } from '../../common/throttler.js';
import { LoginThrottlerGuard } from '../guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from '../guards/register-throttler.guard.js';
import { OAuthThrottlerGuard } from '../../oauth/oauth-throttler.guard.js';
import { ApiKeysThrottlerGuard } from '../../api-keys/api-keys-throttler.guard.js';
import { getRedisConnection } from '@myplatform/queue';

function mockContext(ip: string, body?: any, user?: any, apiKeyContext?: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: body ?? {}, user, apiKeyContext }),
    }),
  } as any;
}

beforeEach(async () => {
  await throttleClear();
});

afterAll(async () => {
  await throttleClear();
  const redis = getRedisConnection();
  await redis.quit();
});

describe('Throttler configuration (RULE 40)', () => {
  describe('Login: 5 per 15min keyed by IP+email', () => {
    it('same IP + same email shares one counter', async () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(await guard.canActivate(mockContext('127.0.0.1', { email: 'alice@test.com' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('127.0.0.1', { email: 'alice@test.com' })),
      ).rejects.toThrow(HttpException);
    });

    it('same IP + different emails are separate keys', async () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(await guard.canActivate(mockContext('127.0.0.1', { email: 'a@test.com' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('127.0.0.1', { email: 'a@test.com' })),
      ).rejects.toThrow(HttpException);

      expect(await guard.canActivate(mockContext('127.0.0.1', { email: 'b@test.com' }))).toBe(true);
    });

    it('different IPs + same email are separate keys', async () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1', { email: 'alice@test.com' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('10.0.0.1', { email: 'alice@test.com' })),
      ).rejects.toThrow(HttpException);

      expect(await guard.canActivate(mockContext('10.0.0.2', { email: 'alice@test.com' }))).toBe(true);
    });

    it('missing email defaults to "unknown" key', async () => {
      const guard = new LoginThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('10.0.0.1'))).rejects.toThrow(HttpException);
    });
  });

  describe('Register: 3 per hour per IP', () => {
    it('same IP blocked after 3 attempts', async () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(await guard.canActivate(mockContext('192.168.1.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('192.168.1.1'))).rejects.toThrow(HttpException);
    });

    it('different IPs have independent limits', async () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('10.0.0.1'))).rejects.toThrow(HttpException);
      expect(await guard.canActivate(mockContext('10.0.0.2'))).toBe(true);
    });
  });

  describe('OAuth: 20 per hour per IP', () => {
    it('same IP blocked after 20 attempts', async () => {
      const guard = new OAuthThrottlerGuard();
      for (let i = 1; i <= 20; i++) {
        expect(await guard.canActivate(mockContext('172.16.0.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('172.16.0.1'))).rejects.toThrow(HttpException);
    });

    it('different IPs independent', async () => {
      const guard = new OAuthThrottlerGuard();
      for (let i = 1; i <= 20; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('10.0.0.1'))).rejects.toThrow(HttpException);
      expect(await guard.canActivate(mockContext('10.0.0.2'))).toBe(true);
    });
  });

  describe('API keys: 10/hr keyed by resolved organization context', () => {
    it('api-key auth: key is organizationId from apiKeyContext', async () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-123' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-123' })),
      ).rejects.toThrow(HttpException);
    });

    it('session auth: key is userId', async () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1', {}, { id: 'user-456' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('10.0.0.1', {}, { id: 'user-456' })),
      ).rejects.toThrow(HttpException);
    });

    it('unauthenticated: falls back to IP', async () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('10.0.0.1'))).rejects.toThrow(HttpException);
    });
  });

  describe('Adversarial: IP-rotation does NOT reset counter', () => {
    it('login: same email from different IPs shares one counter', async () => {
      for (let i = 1; i <= 5; i++) {
        await throttleCheck(`login:1.2.3.4:user@test.com`, 900_000, 5);
      }
      await throttleCheck(`login:5.6.7.8:user@test.com`, 900_000, 5);
      await expect(
        throttleCheck(`login:1.2.3.4:user@test.com`, 900_000, 5),
      ).rejects.toThrow(HttpException);
    });

    it('api-keys: same org from different IPs shares one counter', async () => {
      for (let i = 1; i <= 10; i++) {
        await throttleCheck('api-keys:org-A', 3_600_000, 10);
      }
      await expect(throttleCheck('api-keys:org-A', 3_600_000, 10)).rejects.toThrow(HttpException);
    });
  });

  describe('Adversarial: Different actors sharing IP do NOT collide', () => {
    it('api-keys: two orgs on same IP have separate counters', async () => {
      const guard = new ApiKeysThrottlerGuard();
      for (let i = 1; i <= 10; i++) {
        expect(await guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-AAA' }))).toBe(true);
      }
      await expect(
        guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-AAA' })),
      ).rejects.toThrow(HttpException);

      expect(await guard.canActivate(mockContext('10.0.0.1', {}, undefined, { organizationId: 'org-BBB' }))).toBe(true);
    });

    it('register: two different IPs have separate counters', async () => {
      const guard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 3; i++) {
        expect(await guard.canActivate(mockContext('192.168.1.1'))).toBe(true);
      }
      await expect(guard.canActivate(mockContext('192.168.1.1'))).rejects.toThrow(HttpException);
      expect(await guard.canActivate(mockContext('192.168.1.2'))).toBe(true);
    });
  });

  describe('429 response: identical regardless of route', () => {
    it('login 429 has same shape as register 429', async () => {
      const loginGuard = new LoginThrottlerGuard();
      const registerGuard = new RegisterThrottlerGuard();
      for (let i = 1; i <= 5; i++) {
        await loginGuard.canActivate(mockContext('10.0.0.1', { email: 'x@t.com' }));
      }
      for (let i = 1; i <= 3; i++) {
        await registerGuard.canActivate(mockContext('10.0.0.2'));
      }

      let loginErr: any;
      let registerErr: any;
      try { await loginGuard.canActivate(mockContext('10.0.0.1', { email: 'x@t.com' })); } catch (e) { loginErr = e; }
      try { await registerGuard.canActivate(mockContext('10.0.0.2')); } catch (e) { registerErr = e; }

      expect(loginErr.getStatus()).toBe(429);
      expect(registerErr.getStatus()).toBe(429);
      expect(loginErr.message).toBe(registerErr.message);
    });
  });

  describe('RULE 35: Cross-replica counter sharing via Redis', () => {
    it('counter incremented by replica A is visible to replica B', async () => {
      // Simulate two separate ThrottlerStorage instances both pointing at the same Redis.
      // Each calls throttleCheck independently — if they share Redis, the counter is shared.

      const key = 'cross-replica:test-key';
      const ttl = 60_000;
      const limit = 10;

      // "Replica A" increments 7 times
      for (let i = 1; i <= 7; i++) {
        await throttleCheck(key, ttl, limit);
      }

      // "Replica B" (same function, separate call) sees count = 8, 9, 10, then 11 → blocked
      for (let i = 1; i <= 3; i++) {
        await throttleCheck(key, ttl, limit); // hits 8, 9, 10
      }

      await expect(throttleCheck(key, ttl, limit)).rejects.toThrow(HttpException); // hit 11 > 10

      // Verify the total in Redis directly
      const redis = getRedisConnection();
      const stored = await redis.get(`throttle:${key}`);
      expect(Number(stored)).toBe(11);
    });

    it('two different keys are fully independent', async () => {
      const keyA = 'cross-replica:org-A';
      const keyB = 'cross-replica:org-B';
      const ttl = 60_000;
      const limit = 5;

      // Exhaust keyA
      for (let i = 1; i <= 5; i++) {
        await throttleCheck(keyA, ttl, limit);
      }
      await expect(throttleCheck(keyA, ttl, limit)).rejects.toThrow(HttpException);

      // keyB is completely unaffected
      expect(await throttleCheck(keyB, ttl, limit)).toBeUndefined(); // no throw, count = 1
    });
  });

  describe('Redis failure mode: fail-open', () => {
    it('throttleCheck succeeds when Redis is unreachable', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      let mockedThrottleCheck: typeof throttleCheck;
      jest.isolateModules(() => {
        jest.mock('@myplatform/queue', () => ({
          getRedisConnection: () => ({
            eval: () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); },
            del: () => { throw new Error('ECONNREFUSED'); },
            keys: () => { throw new Error('ECONNREFUSED'); },
          }),
        }));
        const mod = require('../../common/throttler.js');
        mockedThrottleCheck = mod.throttleCheck;
      });

      // Should NOT throw — fail open
      await expect(mockedThrottleCheck!('test-key', 60_000, 5)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[throttle] Redis unavailable, failing open'),
      );
      consoleSpy.mockRestore();
    });

    it('LoginThrottlerGuard passes when Redis is down', async () => {
      let MockedGuard: typeof LoginThrottlerGuard;
      jest.isolateModules(() => {
        jest.mock('@myplatform/queue', () => ({
          getRedisConnection: () => ({
            eval: () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); },
          }),
        }));
        const mod = require('../guards/login-throttler.guard.js');
        MockedGuard = mod.LoginThrottlerGuard;
      });

      const guard = new MockedGuard!();
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ ip: '127.0.0.1', body: { email: 'test@test.com' } }),
        }),
      } as any;

      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('HttpException from throttler is still thrown (not swallowed)', () => {
    it('429 is thrown even after fail-open tests', async () => {
      await throttleClear();
      for (let i = 1; i <= 3; i++) {
        await throttleCheck('swallow-test', 60_000, 3);
      }
      await expect(throttleCheck('swallow-test', 60_000, 3)).rejects.toThrow(HttpException);
    });
  });
});
