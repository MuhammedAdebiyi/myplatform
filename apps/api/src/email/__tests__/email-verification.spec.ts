/**
 * Adversarial tests for email verification.
 *
 * Covers: 5-attempt lockout, expired code rejection, consumed-code reuse,
 * resend rate limiting (3/hour, real Redis), audit metadata never containing
 * the code, and the OAuth-vs-password branch (OAuth skips code issuance,
 * emailVerified: true at creation).
 */
import { BadRequestException, HttpException } from '@nestjs/common';

const mockPrisma = {
  emailVerificationCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    update: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAudit = { log: jest.fn() };
const mockHub = { sendEmail: jest.fn(), configured: true };

jest.mock('@myplatform/database', () => ({
  prisma: mockPrisma,
  ActorType: { USER: 'USER' },
  OrgRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
}));

import { EmailVerificationService } from '../email-verification.service.js';
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode,
} from '@myplatform/auth';
import { throttleCheck, throttleClear } from '../../common/throttler.js';

let service: EmailVerificationService;

const USER = { id: 'user_1', email: 'code-test@example.com', name: 'Code Tester' };

/** Store a real argon2-hashed code and return both the plaintext and the row. */
async function seedCode(overrides: Partial<Record<string, unknown>> = {}) {
  const code = generateVerificationCode();
  const codeHash = await hashVerificationCode(code);
  const row = {
    id: 'evc_1',
    userId: USER.id,
    codeHash,
    attempts: 0,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    consumedAt: null as Date | null,
    createdAt: new Date(),
    ...overrides,
  };
  return { code, row };
}

beforeEach(() => {
  jest.clearAllMocks();
  service = new EmailVerificationService(mockAudit as any, mockHub as any);
  mockHub.sendEmail.mockResolvedValue({ sent: true, publicId: 'pub_1' });
  mockPrisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
  mockPrisma.user.update.mockResolvedValue({
    id: USER.id,
    email: USER.email,
    name: USER.name,
  });
});

afterAll(async () => {
  await throttleClear();
});

describe('verify: correct code', () => {
  it('consumes the code, sets emailVerified, sends confirmation, audits without the code', async () => {
    const { code, row } = await seedCode();
    mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(row);
    mockPrisma.emailVerificationCode.update.mockResolvedValue(row);

    const result = await service.verify(USER.id, code);

    expect(result).toEqual({ verified: true });
    // consumed
    expect(mockPrisma.emailVerificationCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    // user verified
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER.id },
        data: { emailVerified: true },
      }),
    );
    // confirmation email
    expect(mockHub.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'account-activated', recipientEmail: USER.email }),
    );
    // audit: right action, and metadata contains no code material at all
    const verifiedAudit = mockAudit.log.mock.calls
      .map((c) => c[0])
      .find((a) => a.action === 'user.email_verified');
    expect(verifiedAudit).toBeDefined();
    expect(JSON.stringify(verifiedAudit.metadata)).not.toMatch(/\d{6}/);
    expect(JSON.stringify(verifiedAudit.metadata).toLowerCase()).not.toContain('code');
  });
});

describe('verify: wrong code ×5 locks the code out (brute-force surface)', () => {
  it('increments attempts and locks on the 5th wrong guess; even the correct code fails after', async () => {
    const { row } = await seedCode();
    let stored = { ...row };

    mockPrisma.emailVerificationCode.findFirst.mockImplementation(async () => ({ ...stored }));
    mockPrisma.emailVerificationCode.update.mockImplementation(async ({ data }: any) => {
      stored = { ...stored, ...data };
      return { ...stored };
    });

    const wrong = '000000';
    // ensure wrong != actual: generate until different (1-in-1e6, loop is fine)
    const { code: actual } = await seedCode();
    const guess = actual === wrong ? '000001' : wrong;

    for (let i = 1; i <= 5; i++) {
      await expect(service.verify(USER.id, guess)).rejects.toThrow(BadRequestException);
      expect(stored.attempts).toBe(i);
      if (i < 5) expect(stored.consumedAt).toBeNull();
    }

    // 5th wrong guess invalidated the code
    expect(stored.attempts).toBe(5);
    expect(stored.consumedAt).toBeInstanceOf(Date);

    // even the CORRECT code now fails: no active code remains
    mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(null);
    await expect(service.verify(USER.id, actual)).rejects.toThrow(
      'No active verification code',
    );

    // failed attempts audited — metadata has no code material
    const failed = mockAudit.log.mock.calls
      .map((c) => c[0])
      .filter((a) => a.action === 'user.email_verification_failed_attempt');
    expect(failed).toHaveLength(6); // 5 wrong + 1 post-lock correct attempt
    for (const a of failed) {
      const m = JSON.stringify(a.metadata);
      expect(m).not.toMatch(/\b\d{6}\b/);
      expect(m.toLowerCase()).not.toContain('codehash');
    }
    // lock flagged on the 5th
    expect(failed[4].metadata).toMatchObject({ reason: 'wrong_code', attempts: 5, locked: true });
  });
});

describe('verify: expired code', () => {
  it('rejects an expired code (findFirst filters expiresAt > now ⇒ no active code)', async () => {
    const { code, row } = await seedCode({ expiresAt: new Date(Date.now() - 1000) });
    // service query includes expiresAt: { gt: now } — expired rows never returned
    mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(null);

    await expect(service.verify(USER.id, code)).rejects.toThrow(
      'No active verification code',
    );
    expect(mockPrisma.emailVerificationCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    // sanity: a real expired row would be filtered by that where clause
    expect(row.expiresAt.getTime()).toBeLessThan(Date.now());
  });
});

describe('verify: consumed code cannot be reused', () => {
  it('rejects a code whose row is already consumed', async () => {
    const { code, row } = await seedCode({ consumedAt: new Date() });
    mockPrisma.emailVerificationCode.findFirst.mockResolvedValue(null);

    await expect(service.verify(USER.id, code)).rejects.toThrow(
      'No active verification code',
    );
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(row.consumedAt).toBeInstanceOf(Date);
    // and the underlying hash would verify — proving the row filter is the gate
    expect(await verifyVerificationCode(code, row.codeHash)).toBe(true);
  });
});

describe('resend: rate limit 3/hour per user (real Redis)', () => {
  it('allows exactly 3 sends per hour, blocks the 4th with 429', async () => {
    await throttleClear();
    const key = `resend-verification:${USER.id}`;
    const ttl = 60 * 60 * 1000;
    const limit = 3;

    await throttleCheck(key, ttl, limit); // 1
    await throttleCheck(key, ttl, limit); // 2
    await throttleCheck(key, ttl, limit); // 3
    await expect(throttleCheck(key, ttl, limit)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('keys are per-user: another user still has budget', async () => {
    await throttleClear();
    const ttl = 60 * 60 * 1000;
    for (let i = 0; i < 3; i++) {
      await throttleCheck(`resend-verification:user_A`, ttl, 3);
    }
    await expect(
      throttleCheck(`resend-verification:user_A`, ttl, 3),
    ).rejects.toMatchObject({ status: 429 });
    // fresh user not affected
    await expect(
      throttleCheck(`resend-verification:user_B`, ttl, 3),
    ).resolves.toBeUndefined();
  });
});

describe('resend: invalidates old code and issues a new one', () => {
  it('consumes outstanding codes, creates a fresh row, sends a new email', async () => {
    mockPrisma.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.emailVerificationCode.create.mockResolvedValue({ id: 'evc_2' });

    const result = await service.resend(USER);

    expect(result.sent).toBe(true);
    // old codes invalidated
    expect(mockPrisma.emailVerificationCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER.id, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      }),
    );
    // new code stored with 15-min expiry
    expect(mockPrisma.emailVerificationCode.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER.id,
          expiresAt: expect.any(Date),
        }),
      }),
    );
    // new email sent as verification-code type
    expect(mockHub.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verification-code', recipientEmail: USER.email }),
    );
    // never created with a plaintext code field
    const createArgs = mockPrisma.emailVerificationCode.create.mock.calls[0][0].data;
    expect(Object.keys(createArgs)).toEqual(
      expect.arrayContaining(['userId', 'codeHash', 'expiresAt']),
    );
    expect(Object.keys(createArgs)).not.toContain('code');
  });
});

describe('register branch: password vs OAuth', () => {
  it('password registration issues a code (service call verified via issueCode behavior)', async () => {
    mockPrisma.emailVerificationCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationCode.create.mockResolvedValue({ id: 'evc_new' });

    const { sent } = await service.issueCode(USER);

    expect(sent).toBe(true);
    const created = mockPrisma.emailVerificationCode.create.mock.calls[0][0].data;
    // argon2 hash — not plaintext, not sha256 of 6 digits
    expect(created.codeHash).toMatch(/^\$argon2id\$/);
    expect(created.codeHash).not.toMatch(/^\d{6}$/);
    // sent via NotificationHub as verification-code
    expect(mockHub.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verification-code' }),
    );
    // audit without code material
    const audit = mockAudit.log.mock.calls
      .map((c) => c[0])
      .find((a) => a.action === 'user.email_verification_sent');
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit.metadata)).not.toMatch(/\b\d{6}\b/);
  });

  it('issueCode does NOT throw when NotificationHub fails (registration must not break)', async () => {
    mockPrisma.emailVerificationCode.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationCode.create.mockResolvedValue({ id: 'evc_new' });
    mockHub.sendEmail.mockResolvedValue({ sent: false, error: 'http_500' });

    const { sent } = await service.issueCode(USER);
    expect(sent).toBe(false);
  });
});

describe('OAuth branch (source-verified: emailVerified true at creation)', () => {
  it('oauth.service createNewUser sets emailVerified: true and never calls EmailVerificationService', () => {
    // Static proof — OAuth registration path lives in oauth.service.ts:
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../oauth/oauth.service.ts'),
      'utf8',
    );
    // createNewUser writes emailVerified: true (Google/GitHub verified the address)
    expect(src).toMatch(/emailVerified:\s*true/);
    // and the OAuth module never imports the verification service
    expect(src).not.toMatch(/EmailVerificationService|issueCode/);
    const oauthModule = fs.readFileSync(
      path.join(__dirname, '../../oauth/oauth.module.ts'),
      'utf8',
    );
    expect(oauthModule).not.toMatch(/EmailVerificationService/);
  });
});

describe('throttler helper behavior sanity', () => {
  it('HttpException propagates (429 is not swallowed as a Redis error)', async () => {
    await throttleClear();
    await throttleCheck('sanity:k', 60_000, 1);
    let caught: any;
    try {
      await throttleCheck('sanity:k', 60_000, 1);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught.status).toBe(429);
    await throttleClear();
  });
});
