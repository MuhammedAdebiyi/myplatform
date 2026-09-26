/**
 * Adversarial tests for password reset — the 7 required scenarios:
 *  1. forgot-password: non-existent vs real email → byte-identical response
 *     body AND same status code (HTTP-level, raw-text comparison)
 *  2. OAuth-only account → different ("no password") email, generic response
 *  3. consumed token reuse fails
 *  4. expired token fails
 *  5. second forgot-password invalidates the first (never two valid links)
 *  6. after reset, ALL prior sessions revoked — traced through SessionGuard
 *  7. rate limit trips at exactly 3/hour per email (real Redis)
 * Plus: one generic error message for invalid/expired/consumed, audit
 * metadata never containing token/password material, argon2 password swap.
 */
import {
  BadRequestException,
  Module,
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';

const mockPrisma = {
  user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  session: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  emailVerificationCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };
const mockHub = { sendEmail: jest.fn(), configured: true };

jest.mock('@myplatform/database', () => ({
  prisma: mockPrisma,
  ActorType: { USER: 'USER' },
}));

import { AuthController } from '../auth.controller.js';
import { AuthService } from '../auth.service.js';
import { PasswordResetService } from '../password-reset.service.js';
import { EmailVerificationService } from '../../email/email-verification.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { NotificationHubService } from '../../email/notification-hub.service.js';
import { SessionsService } from '../../users/sessions.service.js';
import { SessionGuard } from '../guards/session.guard.js';
import { LoginThrottlerGuard } from '../guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from '../guards/register-throttler.guard.js';
import { ResendVerificationThrottlerGuard } from '../guards/resend-verification-throttler.guard.js';
import { ForgotPasswordThrottlerGuard } from '../guards/forgot-password-throttler.guard.js';
import { ResetPasswordThrottlerGuard } from '../guards/reset-password-throttler.guard.js';
import {
  generatePasswordResetToken,
  generateSessionToken,
  sessionExpiresAt,
  hashPassword,
  verifyPassword,
} from '@myplatform/auth';
import { throttleReset } from '../../common/throttler.js';

/**
 * Parallel jest suites call throttleClear() (deletes EVERY throttle:* key).
 * A clear landing between our increments resets the counter and voids the
 * expectation, so retry the sequence with keys re-reset. A genuinely wrong
 * limit fails all attempts and still surfaces.
 */
async function expectExactThrottle(
  resetKeys: string[],
  sequence: () => Promise<void>,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const key of resetKeys) await throttleReset(key);
    try {
      await sequence();
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a reset link.";
const INVALID_LINK_MESSAGE = 'This reset link is invalid or has expired';

// ---------------------------------------------------------------------------
// In-memory state behind the prisma mock — stateful so token invalidation and
// session revocation are observable, not just "was function X called".
// ---------------------------------------------------------------------------
const store = {
  users: [] as any[],
  tokens: [] as any[],
  sessions: [] as any[],
};

function wirePrismaMocks() {
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
    const u = store.users.find(
      (x) => (where.id && x.id === where.id) || (where.email && x.email === where.email),
    );
    return u ? { ...u } : null;
  });
  mockPrisma.user.update.mockImplementation(async ({ where, data }: any) => {
    const u = store.users.find((x) => x.id === where.id);
    if (u) Object.assign(u, data);
    return u ? { ...u } : null;
  });
  mockPrisma.passwordResetToken.create.mockImplementation(async ({ data }: any) => {
    const row = {
      id: `prt_${store.tokens.length + 1}`,
      consumedAt: null as Date | null,
      createdAt: new Date(),
      ...data,
    };
    store.tokens.push(row);
    return { ...row };
  });
  mockPrisma.passwordResetToken.findUnique.mockImplementation(async ({ where }: any) => {
    const row = store.tokens.find((t) => t.tokenHash === where.tokenHash);
    if (!row) return null;
    const u = store.users.find((x) => x.id === row.userId);
    return { ...row, user: u ? { email: u.email, name: u.name } : null };
  });
  mockPrisma.passwordResetToken.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0;
    for (const t of store.tokens) {
      if (where.userId && t.userId !== where.userId) continue;
      if (where.id && t.id !== where.id) continue;
      if (where.consumedAt === null && t.consumedAt !== null) continue;
      if (where.expiresAt?.gt && !(t.expiresAt > where.expiresAt.gt)) continue;
      Object.assign(t, data);
      count++;
    }
    return { count };
  });
  mockPrisma.session.findUnique.mockImplementation(async ({ where }: any) => {
    const s = store.sessions.find((x) => x.tokenHash === where.tokenHash);
    if (!s) return null;
    const u = store.users.find((x) => x.id === s.userId);
    return {
      id: s.id,
      userId: s.userId,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      user: u ? { id: u.id, email: u.email, name: u.name, status: u.status } : null,
    };
  });
  mockPrisma.session.update.mockImplementation(async ({ where, data }: any) => {
    const s = store.sessions.find((x) => x.id === where.id);
    if (s) Object.assign(s, data);
    return s ? { ...s } : null;
  });
  mockPrisma.session.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0;
    for (const s of store.sessions) {
      if (where.userId && s.userId !== where.userId) continue;
      if (where.revokedAt === null && s.revokedAt !== null) continue;
      if (where.id?.not && s.id === where.id.not) continue;
      Object.assign(s, data);
      count++;
    }
    return { count };
  });
  // supports both interactive (fn) and sequential-array transactions
  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  );
}

let service: PasswordResetService;

function makeService(): PasswordResetService {
  return new PasswordResetService(mockAudit as any, mockHub as any, new SessionsService(mockAudit as any));
}

function seedPasswordUser(email: string, passwordHash: string | null = '$argon2id$seed') {
  const u = {
    id: `usr_${store.users.length + 1}`,
    email,
    name: 'Reset Tester',
    passwordHash,
    status: 'ACTIVE',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.users.push(u);
  return u;
}

function seedResetToken(userId: string, overrides: any = {}) {
  const t = generatePasswordResetToken();
  store.tokens.push({
    id: `prt_${store.tokens.length + 1}`,
    userId,
    tokenHash: t.hash,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    consumedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
  return t;
}

/** Extract the raw reset token from the last password-reset-link email. */
function lastResetLinkToken(): string {
  const calls = mockHub.sendEmail.mock.calls.filter((c) => c[0]?.type === 'password-reset-link');
  if (calls.length === 0) throw new Error('no password-reset-link email was sent');
  const html = calls[calls.length - 1][0].html as string;
  const m = html.match(/token=([A-Za-z0-9_-]{40,})/);
  if (!m) throw new Error('reset email contains no token link');
  return m[1];
}

function audits(): any[] {
  return mockAudit.log.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  store.users.length = 0;
  store.tokens.length = 0;
  store.sessions.length = 0;
  wirePrismaMocks();
  mockHub.sendEmail.mockResolvedValue({ sent: true, publicId: 'pub_1' });
  service = makeService();
});

// ---------------------------------------------------------------------------
// HTTP harness — real controller, guards, DTO validation, byte-level responses
// ---------------------------------------------------------------------------
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    SessionsService,
    SessionGuard,
    LoginThrottlerGuard,
    RegisterThrottlerGuard,
    ResendVerificationThrottlerGuard,
    ForgotPasswordThrottlerGuard,
    ResetPasswordThrottlerGuard,
    { provide: AuditService, useValue: mockAudit },
    { provide: NotificationHubService, useValue: mockHub },
  ],
})
class PasswordResetHttpTestModule {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(PasswordResetHttpTestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await app?.close();
});

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

// ---------------------------------------------------------------------------
describe('1. forgot-password: non-existent vs real email → byte-identical response', () => {
  beforeEach(async () => {
    await throttleReset('forgot-password:ip:127.0.0.1');
    await throttleReset('forgot-password:email:no-such-user@example.com');
    await throttleReset('forgot-password:email:reset-real@example.com');
  });

  it('same status code and raw body text for unknown and existing accounts', async () => {
    const existing = seedPasswordUser('reset-real@example.com');

    const unknownRes = await post('/auth/forgot-password', {
      email: 'no-such-user@example.com',
    });
    mockHub.sendEmail.mockClear();
    const knownRes = await post('/auth/forgot-password', {
      email: 'reset-real@example.com',
    });

    expect(unknownRes.status).toBe(200);
    expect(knownRes.status).toBe(200);
    // byte-identical raw bodies (JSON equality, not "similar")
    expect(knownRes.text).toBe(unknownRes.text);
    expect(JSON.parse(knownRes.text)).toEqual(JSON.parse(unknownRes.text));
    expect(JSON.parse(knownRes.text)).toEqual({ message: GENERIC_MESSAGE });

    // the internal behavior still differed: link went to the real owner only
    expect(mockHub.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockHub.sendEmail.mock.calls[0][0]).toMatchObject({
      type: 'password-reset-link',
      recipientEmail: existing.email,
    });
    // and a real single-use token row exists for the known account
    expect(store.tokens).toHaveLength(1);
    expect(store.tokens[0].userId).toBe(existing.id);
    expect(store.tokens[0].consumedAt).toBeNull();
  });

  it('unknown account stores no token and sends no email', async () => {
    const res = await post('/auth/forgot-password', { email: 'no-such-user@example.com' });
    expect(res.status).toBe(200);
    expect(res.text).toBe(
      JSON.stringify({ message: GENERIC_MESSAGE }),
    );
    expect(store.tokens).toHaveLength(0);
    expect(mockHub.sendEmail).not.toHaveBeenCalled();
    expect(audits()).toHaveLength(0); // nothing to audit — no actor exists
  });
});

describe('2. OAuth-only account: different email, same generic response', () => {
  beforeEach(async () => {
    await throttleReset('forgot-password:ip:127.0.0.1');
    await throttleReset('forgot-password:email:oauth-only@example.com');
    await throttleReset('forgot-password:email:no-such-user@example.com');
  });

  it('sends the no-password notice (not a reset link) and returns the generic body', async () => {
    const oauthUser = seedPasswordUser('oauth-only@example.com', null); // passwordHash null

    const unknownRes = await post('/auth/forgot-password', {
      email: 'no-such-user@example.com',
    });
    mockHub.sendEmail.mockClear();
    const oauthRes = await post('/auth/forgot-password', {
      email: 'oauth-only@example.com',
    });

    // still byte-identical + same status as the non-existent branch
    expect(oauthRes.status).toBe(unknownRes.status);
    expect(oauthRes.text).toBe(unknownRes.text);

    // different email content: the oauth notice, never a reset link
    expect(mockHub.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockHub.sendEmail.mock.calls[0][0]).toMatchObject({
      type: 'password-reset-oauth-notice',
      recipientEmail: 'oauth-only@example.com',
    });
    const sentHtml = mockHub.sendEmail.mock.calls[0][0].html as string;
    expect(sentHtml).not.toMatch(/reset-password\?token=/);

    // no reset token row was created (nothing to reset)
    expect(store.tokens).toHaveLength(0);

    const attempt = audits().find((a) => a.action === 'password.reset_oauth_only_attempt');
    expect(attempt).toBeDefined();
    expect(attempt.actorUserId).toBe(oauthUser.id);
  });
});

describe('3+4. invalid, expired, and consumed tokens share ONE generic error', () => {
  it('rejected with identical message and 400 in all three cases; password untouched', async () => {
    const user = seedPasswordUser('token-checks@example.com');
    const good = seedResetToken(user.id);
    const expired = seedResetToken(user.id, { expiresAt: new Date(Date.now() - 1000) });
    const consumed = seedResetToken(user.id, { consumedAt: new Date() });

    const messages: string[] = [];
    const statuses: number[] = [];

    for (const raw of [generatePasswordResetToken().raw, expired.raw, consumed.raw]) {
      try {
        await service.resetPassword(raw, 'Whatever123');
        throw new Error('expected resetPassword to reject');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        messages.push(err.message);
        statuses.push(err.getStatus());
      }
    }

    expect(messages).toEqual([INVALID_LINK_MESSAGE, INVALID_LINK_MESSAGE, INVALID_LINK_MESSAGE]);
    expect(statuses).toEqual([400, 400, 400]);
    // no password changed, no session touched by the failures
    expect(user.passwordHash).toBe('$argon2id$seed');
    expect(store.sessions).toHaveLength(0);

    // sanity: the untouched good token still works (same code path would accept it)
    await expect(service.resetPassword(good.raw, 'FreshPass123')).resolves.toEqual({
      message: 'Password has been reset successfully.',
    });
  });
});

describe('5. second forgot-password invalidates the first token', () => {
  it('never keeps two valid links; first token then fails, second succeeds', async () => {
    const user = seedPasswordUser('two-links@example.com');

    await service.forgotPassword('two-links@example.com');
    const token1 = lastResetLinkToken();
    await service.forgotPassword('two-links@example.com');
    const token2 = lastResetLinkToken();
    expect(token1).not.toBe(token2);

    // exactly ONE unconsumed token remains; the first was consumed by the second request
    const active = store.tokens.filter((t) => t.consumedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]).toBe(store.tokens[1]); // the second link is the live one
    expect(store.tokens[0].consumedAt).toBeInstanceOf(Date);

    // old link is dead
    await expect(service.resetPassword(token1, 'BrandNew123')).rejects.toThrow(
      INVALID_LINK_MESSAGE,
    );
    // new link works
    const result = await service.resetPassword(token2, 'BrandNew123');
    expect(result).toEqual({ message: 'Password has been reset successfully.' });

    // and the new one is single-use too
    await expect(service.resetPassword(token2, 'BrandNew456')).rejects.toThrow(
      INVALID_LINK_MESSAGE,
    );
  });

  it('audit metadata never contains token or password material', async () => {
    const user = seedPasswordUser('audit-hygiene@example.com');
    await service.forgotPassword('audit-hygiene@example.com');
    const raw = lastResetLinkToken();
    await service.resetPassword(raw, 'Hygiene123');

    const all = JSON.stringify(audits());
    expect(all).not.toContain(raw);
    expect(all).not.toContain('Hygiene123');
    expect(all).not.toContain('$argon2id$');
    expect(all).not.toMatch(/tokenHash/);

    const actions = audits().map((a) => a.action);
    expect(actions).toContain('password.reset_requested');
    expect(actions).toContain('password.reset_completed');
    expect(actions).toContain('session.revoked');
    expect(user.passwordHash).not.toBe('$argon2id$seed');
  });
});

describe('6. after reset, ALL prior sessions revoked — traced through SessionGuard', () => {
  it('guard passes before reset, rejects both old sessions after reset', async () => {
    const user = seedPasswordUser('sessions@example.com', await hashPassword('OldPassw0rd1'));

    // two live sessions for the victim account
    const s1 = generateSessionToken();
    const s2 = generateSessionToken();
    for (const [i, s] of [s1, s2].entries()) {
      store.sessions.push({
        id: `sess_${i + 1}`,
        userId: user.id,
        tokenHash: s.hash,
        expiresAt: sessionExpiresAt(),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      });
    }

    const authService = new AuthService(mockAudit as any, { issueCode: jest.fn() } as any);
    const guard = new SessionGuard(authService as any);
    const ctx = (raw: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: `Bearer ${raw}` } }),
        }),
      }) as any;

    // BEFORE: both sessions are accepted by the real guard
    expect(await guard.canActivate(ctx(s1.raw))).toBe(true);
    expect(await guard.canActivate(ctx(s2.raw))).toBe(true);

    // compromise recovery: reset via emailed link
    await service.forgotPassword('sessions@example.com');
    const resetRaw = lastResetLinkToken();
    const result = await service.resetPassword(resetRaw, 'Recovery123');
    expect(result).toEqual({ message: 'Password has been reset successfully.' });

    // AFTER: every prior session is dead through the guard (401), not just a DB flag
    await expect(guard.canActivate(ctx(s1.raw))).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(ctx(s2.raw))).rejects.toThrow(UnauthorizedException);
    expect(store.sessions.every((s) => s.revokedAt instanceof Date)).toBe(true);

    // revocation traced to sessions.service's bulk audit
    const revoked = audits().find(
      (a) => a.action === 'session.revoked' && a.metadata?.mode === 'bulk',
    );
    expect(revoked).toBeDefined();
    expect(revoked.metadata.revokedCount).toBe(2);
    const completed = audits().find((a) => a.action === 'password.reset_completed');
    expect(completed.metadata).toMatchObject({ sessionsRevoked: 2, channel: 'email' });

    // password actually swapped (argon2id — old one dead, new one live)
    expect(await verifyPassword('Recovery123', user.passwordHash!)).toBe(true);
    expect(await verifyPassword('OldPassw0rd1', user.passwordHash!)).toBe(false);

    // token is single-use: replay after success fails
    await expect(service.resetPassword(resetRaw, 'Again12345')).rejects.toThrow(
      INVALID_LINK_MESSAGE,
    );
  });
});

describe('7. rate limit: exactly 3/hour per email (real Redis)', () => {
  function guardCtx(email: string, ip: string) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ body: { email }, ip }) }),
    } as any;
  }

  it('3 requests pass, the 4th is 429 — for an EXISTING email', async () => {
    const guard = new ForgotPasswordThrottlerGuard();
    const email = `rate-existing-${Date.now()}@example.com`;
    const ip = '9.9.9.9';
    await expectExactThrottle(
      [`forgot-password:email:${email}`, `forgot-password:ip:${ip}`],
      async () => {
        for (let i = 1; i <= 3; i++) {
          expect(await guard.canActivate(guardCtx(email, ip))).toBe(true);
        }
        await expect(guard.canActivate(guardCtx(email, ip))).rejects.toMatchObject({ status: 429 });
      },
    );
  });

  it('identical 3/hour limit for a NON-EXISTENT email (keyed pre-lookup)', async () => {
    const guard = new ForgotPasswordThrottlerGuard();
    const email = `rate-unknown-${Date.now()}@example.com`;
    const ip = '9.9.9.9';
    await expectExactThrottle(
      [`forgot-password:email:${email}`, `forgot-password:ip:${ip}`],
      async () => {
        for (let i = 1; i <= 3; i++) {
          expect(await guard.canActivate(guardCtx(email, ip))).toBe(true);
        }
        await expect(guard.canActivate(guardCtx(email, ip))).rejects.toMatchObject({ status: 429 });
      },
    );
  });

  it('case variations share one budget (normalized key)', async () => {
    const guard = new ForgotPasswordThrottlerGuard();
    const base = `rate-case-${Date.now()}`;
    const ip = '9.9.9.6';
    await expectExactThrottle(
      [`forgot-password:email:${base.toLowerCase()}@example.com`, `forgot-password:ip:${ip}`],
      async () => {
        expect(await guard.canActivate(guardCtx(`${base}@Example.com`, ip))).toBe(true);
        expect(await guard.canActivate(guardCtx(`${base}@example.com`, ip))).toBe(true);
        expect(await guard.canActivate(guardCtx(`${base.toUpperCase()}@EXAMPLE.COM`, ip))).toBe(true);
        await expect(
          guard.canActivate(guardCtx(`${base}@example.com`, ip)),
        ).rejects.toMatchObject({ status: 429 });
      },
    );
  });

  it('per-IP backstop: 10/hour across many emails, 11th rejected', async () => {
    const guard = new ForgotPasswordThrottlerGuard();
    const ip = '9.9.9.8';
    const stamp = Date.now();
    await expectExactThrottle([`forgot-password:ip:${ip}`], async () => {
      for (let i = 1; i <= 10; i++) {
        expect(
          await guard.canActivate(guardCtx(`spray-${stamp}-${i}@example.com`, ip)),
        ).toBe(true);
      }
      await expect(
        guard.canActivate(guardCtx(`spray-${stamp}-11@example.com`, ip)),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  it('reset-password endpoint: 10/15min per IP', async () => {
    const guard = new ResetPasswordThrottlerGuard();
    const ip = '9.9.9.7';
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ body: {}, ip }) }),
    } as any;
    await expectExactThrottle([`reset-password:ip:${ip}`], async () => {
      for (let i = 1; i <= 10; i++) {
        expect(await guard.canActivate(ctx)).toBe(true);
      }
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
    });
  });

  it('both endpoints are wired to their throttle guards and return 200', () => {
    const guardsOf = (method: Function) =>
      (Reflect.getMetadata('__guards__', method) ?? []) as any[];

    expect(guardsOf(AuthController.prototype.forgotPassword)).toContain(
      ForgotPasswordThrottlerGuard,
    );
    expect(guardsOf(AuthController.prototype.resetPassword)).toContain(
      ResetPasswordThrottlerGuard,
    );
    // same static status on both branches by construction
    const forgotCode = Reflect.getMetadata('__httpCode__', AuthController.prototype.forgotPassword);
    const resetCode = Reflect.getMetadata('__httpCode__', AuthController.prototype.resetPassword);
    expect(forgotCode).toBe(200);
    expect(resetCode).toBe(200);
    expect(forgotCode).toBe(resetCode);
  });
});

describe('HTTP: validation and happy path', () => {
  beforeEach(async () => {
    await throttleReset('forgot-password:ip:127.0.0.1');
    await throttleReset('reset-password:ip:127.0.0.1');
  });

  it('rejects malformed token and short password at the DTO layer (400, no DB hit)', async () => {
    const short = await post('/auth/reset-password', { token: 'short', newPassword: 'longenough1' });
    expect(short.status).toBe(400);
    const weak = await post('/auth/reset-password', {
      token: 'a'.repeat(43),
      newPassword: 'abc',
    });
    expect(weak.status).toBe(400);
    expect(mockPrisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
  });

  it('full HTTP flow: forgot → emailed link → reset → 200, password swapped', async () => {
    const user = seedPasswordUser('http-flow@example.com', await hashPassword('StartPass1'));
    await throttleReset('forgot-password:email:http-flow@example.com');

    const forgot = await post('/auth/forgot-password', { email: 'http-flow@example.com' });
    expect(forgot.status).toBe(200);
    const raw = lastResetLinkToken();

    const bad = await post('/auth/reset-password', {
      token: generatePasswordResetToken().raw, // well-formed but unknown
      newPassword: 'Irrelevant1',
    });
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.text)).toMatchObject({ message: INVALID_LINK_MESSAGE });

    const good = await post('/auth/reset-password', { token: raw, newPassword: 'HttpFlow1' });
    expect(good.status).toBe(200);
    expect(JSON.parse(good.text)).toEqual({ message: 'Password has been reset successfully.' });

    expect(await verifyPassword('HttpFlow1', user.passwordHash!)).toBe(true);
    expect(await verifyPassword('StartPass1', user.passwordHash!)).toBe(false);
    expect(store.tokens.every((t) => t.consumedAt instanceof Date)).toBe(true);

    // confirmation email fired
    expect(mockHub.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'password-changed', recipientEmail: user.email }),
    );
  });

  it('429 is a real HTTP response on the 4th forgot-password request', async () => {
    const email = `http-429-${Date.now()}@example.com`;
    await expectExactThrottle([`forgot-password:email:${email}`, 'forgot-password:ip:127.0.0.1'], async () => {
      for (let i = 1; i <= 3; i++) {
        const r = await post('/auth/forgot-password', { email });
        expect(r.status).toBe(200);
      }
      const fourth = await post('/auth/forgot-password', { email });
      expect(fourth.status).toBe(429);
    });
  });
});
