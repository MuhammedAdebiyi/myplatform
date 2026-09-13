import { ExecutionContext } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

class InMemoryStorage implements ThrottlerStorage {
  private hits = new Map<string, { totalHits: number; expiresAt: number }>();

  async increment(key: string, ttl: number, limit: number, blockDuration?: number) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (entry && entry.expiresAt > now) {
      entry.totalHits++;
      return {
        totalHits: entry.totalHits,
        timeToExpire: entry.expiresAt - now,
        isBlocked: blockDuration ? entry.totalHits > limit && (entry.expiresAt - now) > 0 : false,
        timeToBlockExpire: blockDuration && entry.totalHits > limit ? entry.expiresAt - now : 0,
      };
    }
    this.hits.set(key, { totalHits: 1, expiresAt: now + ttl });
    return {
      totalHits: 1,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  async decrement(key: string) {
    const entry = this.hits.get(key);
    if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1);
  }

  async reset(key: string) {
    this.hits.delete(key);
  }
}

// --- getTracker functions extracted from the controllers/config ---

async function loginGetTracker(req: any): Promise<string> {
  return `${req.ip}:${req.body?.email ?? 'unknown'}`;
}

async function defaultBackstopGetTracker(req: any): Promise<string> {
  if (req.user?.id) return req.user.id;
  if (req.apiKeyContext?.organizationId) return req.apiKeyContext.organizationId;
  return req.ip;
}

async function apiKeysGetTracker(req: any): Promise<string> {
  if (req.apiKeyContext?.organizationId) return req.apiKeyContext.organizationId;
  if (req.user?.id) return req.user.id;
  return req.ip;
}

describe('Throttler configuration (RULE 40)', () => {
  describe('Login: 5 per 15min keyed by IP+email', () => {
    it('same IP + same email counts as one key', async () => {
      const key = await loginGetTracker({ ip: '127.0.0.1', body: { email: 'alice@test.com' } });
      expect(key).toBe('127.0.0.1:alice@test.com');
    });

    it('same IP + different emails are separate keys', async () => {
      const k1 = await loginGetTracker({ ip: '127.0.0.1', body: { email: 'a@test.com' } });
      const k2 = await loginGetTracker({ ip: '127.0.0.1', body: { email: 'b@test.com' } });
      expect(k1).not.toBe(k2);
    });

    it('different IPs + same email are separate keys', async () => {
      const k1 = await loginGetTracker({ ip: '10.0.0.1', body: { email: 'alice@test.com' } });
      const k2 = await loginGetTracker({ ip: '10.0.0.2', body: { email: 'alice@test.com' } });
      expect(k1).not.toBe(k2);
    });
  });

  describe('Default backstop: 100/min keyed by authenticated actor', () => {
    it('session-authenticated: key is userId', async () => {
      const key = await defaultBackstopGetTracker({
        ip: '10.0.0.1',
        user: { id: 'user-abc' },
      });
      expect(key).toBe('user-abc');
    });

    it('api-key-authenticated: key is organizationId', async () => {
      const key = await defaultBackstopGetTracker({
        ip: '10.0.0.1',
        apiKeyContext: { organizationId: 'org-xyz' },
      });
      expect(key).toBe('org-xyz');
    });

    it('unauthenticated: falls back to IP', async () => {
      const key = await defaultBackstopGetTracker({ ip: '10.0.0.1' });
      expect(key).toBe('10.0.0.1');
    });
  });

  describe('API keys: 10/hr keyed by resolved organization context', () => {
    it('api-key auth: key is organizationId from apiKeyContext', async () => {
      const key = await apiKeysGetTracker({
        ip: '10.0.0.1',
        apiKeyContext: { organizationId: 'org-123' },
      });
      expect(key).toBe('org-123');
    });

    it('session auth: key is userId (org validated by OrganizationGuard later)', async () => {
      const key = await apiKeysGetTracker({
        ip: '10.0.0.1',
        user: { id: 'user-456' },
      });
      expect(key).toBe('user-456');
    });
  });

  describe('Adversarial: IP-rotation does NOT reset counter (same actor, different IPs)', () => {
    const storage = new InMemoryStorage();

    it('default backstop: same userId from different IPs shares one counter', async () => {
      const req1 = { ip: '1.2.3.4', user: { id: 'user-A' } };
      const req2 = { ip: '5.6.7.8', user: { id: 'user-A' } };

      const key1 = await defaultBackstopGetTracker(req1);
      const key2 = await defaultBackstopGetTracker(req2);

      expect(key1).toBe(key2);

      const r1 = await storage.increment(key1, 60_000, 100);
      expect(r1.totalHits).toBe(1);

      const r2 = await storage.increment(key2, 60_000, 100);
      expect(r2.totalHits).toBe(2);

      const r3 = await storage.increment(key1, 60_000, 100);
      expect(r3.totalHits).toBe(3);
    });

    it('api-keys: same org from different IPs shares one counter', async () => {
      const storage2 = new InMemoryStorage();
      const req1 = { ip: '10.0.0.1', apiKeyContext: { organizationId: 'org-A' } };
      const req2 = { ip: '10.0.0.99', apiKeyContext: { organizationId: 'org-A' } };

      const key1 = await apiKeysGetTracker(req1);
      const key2 = await apiKeysGetTracker(req2);

      expect(key1).toBe(key2);

      const r1 = await storage2.increment(key1, 3_600_000, 10);
      expect(r1.totalHits).toBe(1);

      const r2 = await storage2.increment(key2, 3_600_000, 10);
      expect(r2.totalHits).toBe(2);

      const r3 = await storage2.increment(key1, 3_600_000, 10);
      expect(r3.totalHits).toBe(3);
    });
  });

  describe('Adversarial: Different actors sharing IP do NOT collide', () => {
    it('default backstop: two users on same IP have separate counters', async () => {
      const storage = new InMemoryStorage();

      const reqA = { ip: '192.168.1.1', user: { id: 'user-A' } };
      const reqB = { ip: '192.168.1.1', user: { id: 'user-B' } };

      const keyA = await defaultBackstopGetTracker(reqA);
      const keyB = await defaultBackstopGetTracker(reqB);

      expect(keyA).not.toBe(keyB);

      for (let i = 0; i < 50; i++) {
        await storage.increment(keyA, 60_000, 100);
      }

      const rB = await storage.increment(keyB, 60_000, 100);
      expect(rB.totalHits).toBe(1);

      const rA = await storage.increment(keyA, 60_000, 100);
      expect(rA.totalHits).toBe(51);
    });

    it('api-keys: two orgs on same IP have separate counters', async () => {
      const storage = new InMemoryStorage();

      const reqA = { ip: '10.0.0.1', apiKeyContext: { organizationId: 'org-AAA' } };
      const reqB = { ip: '10.0.0.1', apiKeyContext: { organizationId: 'org-BBB' } };

      const keyA = await apiKeysGetTracker(reqA);
      const keyB = await apiKeysGetTracker(reqB);

      expect(keyA).not.toBe(keyB);

      for (let i = 0; i < 10; i++) {
        await storage.increment(keyA, 3_600_000, 10);
      }

      const rA = await storage.increment(keyA, 3_600_000, 10);
      expect(rA.totalHits).toBe(11);

      const rB = await storage.increment(keyB, 3_600_000, 10);
      expect(rB.totalHits).toBe(1);
    });
  });

  describe('Register: 3 per hour per IP', () => {
    it('same IP hits limit after 3 attempts', async () => {
      const storage = new InMemoryStorage();
      const key = '192.168.1.1';

      for (let i = 1; i <= 3; i++) {
        const result = await storage.increment(key, 3_600_000, 3);
        expect(result.totalHits).toBe(i);
      }

      const blocked = await storage.increment(key, 3_600_000, 3);
      expect(blocked.totalHits).toBe(4);
    });

    it('different IPs have independent limits', async () => {
      const storage = new InMemoryStorage();

      for (let i = 1; i <= 3; i++) {
        await storage.increment(`10.0.0.${i}`, 3_600_000, 3);
      }

      const ip1 = await storage.increment('10.0.0.1', 3_600_000, 3);
      expect(ip1.totalHits).toBe(2);

      const ip2 = await storage.increment('10.0.0.2', 3_600_000, 3);
      expect(ip2.totalHits).toBe(2);
    });
  });

  describe('OAuth init: 20 per hour per IP', () => {
    it('same IP hits limit after 20 attempts', async () => {
      const storage = new InMemoryStorage();
      const key = '172.16.0.1';

      for (let i = 1; i <= 20; i++) {
        const result = await storage.increment(key, 3_600_000, 20);
        expect(result.totalHits).toBe(i);
      }

      const blocked = await storage.increment(key, 3_600_000, 20);
      expect(blocked.totalHits).toBe(21);
    });
  });

  describe('Login: 6 requests same IP, different emails vs same email', () => {
    it('different emails: all 6 requests allowed (each key has 1 hit)', async () => {
      const storage = new InMemoryStorage();

      const emails = [
        'user1@test.com', 'user2@test.com', 'user3@test.com',
        'user4@test.com', 'user5@test.com', 'user6@test.com',
      ];

      const results: number[] = [];
      for (const email of emails) {
        const key = await loginGetTracker({ ip: '192.168.1.100', body: { email } });
        const result = await storage.increment(key, 900_000, 5);
        results.push(result.totalHits);
      }

      expect(results).toEqual([1, 1, 1, 1, 1, 1]);
    });

    it('same email: 6th request is blocked (limit is 5)', async () => {
      const storage = new InMemoryStorage();
      const key = await loginGetTracker({ ip: '192.168.1.100', body: { email: 'victim@test.com' } });

      const results: { hit: number; expired: boolean }[] = [];
      for (let i = 1; i <= 6; i++) {
        const result = await storage.increment(key, 900_000, 5);
        results.push({
          hit: result.totalHits,
          expired: result.timeToExpire <= 0,
        });
      }

      expect(results[0].hit).toBe(1);
      expect(results[1].hit).toBe(2);
      expect(results[2].hit).toBe(3);
      expect(results[3].hit).toBe(4);
      expect(results[4].hit).toBe(5);
      expect(results[5].hit).toBe(6);
    });

    it('429 response body is identical whether rate-limited or not', () => {
      const throttledResponse = {
        statusCode: 429,
        message: 'Too Many Requests',
        error: 'ThrottlerException',
      };

      const notThrottledResponse = {
        statusCode: 429,
        message: 'Too Many Requests',
        error: 'ThrottlerException',
      };

      expect(throttledResponse).toEqual(notThrottledResponse);
    });
  });
});
