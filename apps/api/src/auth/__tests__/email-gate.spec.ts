/**
 * Email verification gate — HTTP-level integration tests through real
 * controllers, guards, DTO validation and byte-level responses.
 *
 * The gate's contract (RULE 01/25):
 *  1. Email/password session, unverified → POST /organizations = 403 with
 *     stable code EMAIL_NOT_VERIFIED (direct API call, frontend bypassed).
 *  2. Wrong code keeps the gate shut; correct code opens it for the same
 *     session (no re-login).
 *  3. OAuth-created user (born emailVerified=true) mutates with zero
 *     verification steps and zero emails.
 *  4. API-key (mp_…) requests are unaffected by the gate.
 */
import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { AddressInfo } from 'node:net';

// Fixed 6-digit code so the register → verify HTTP chain can complete without
// scraping the plaintext code out of a delivered email.
jest.mock('@myplatform/auth', () => ({
  ...jest.requireActual('@myplatform/auth'),
  generateVerificationCode: () => '123456',
}));

const mockAudit = { log: jest.fn() };
const mockHub = { sendEmail: jest.fn(), configured: true };
const mockApiKeys = { validateKey: jest.fn() };

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  session: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  emailVerificationCode: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  organization: { findUnique: jest.fn(), create: jest.fn() },
  project: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@myplatform/database', () => ({
  prisma: mockPrisma,
  ActorType: { USER: 'USER', API_KEY: 'API_KEY' },
  OrgRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' },
}));

import { AuthController } from '../auth.controller.js';
import { AuthService } from '../auth.service.js';
import { PasswordResetService } from '../password-reset.service.js';
import { EmailVerificationService } from '../../email/email-verification.service.js';
import { SessionsService } from '../../users/sessions.service.js';
import { SessionGuard } from '../guards/session.guard.js';
import { EmailVerifiedGuard } from '../guards/email-verified.guard.js';
import { ApiKeyGuard } from '../guards/api-key.guard.js';
import { LoginThrottlerGuard } from '../guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from '../guards/register-throttler.guard.js';
import { ResendVerificationThrottlerGuard } from '../guards/resend-verification-throttler.guard.js';
import { ForgotPasswordThrottlerGuard } from '../guards/forgot-password-throttler.guard.js';
import { ResetPasswordThrottlerGuard } from '../guards/reset-password-throttler.guard.js';
import { AuditService } from '../../audit/audit.service.js';
import { NotificationHubService } from '../../email/notification-hub.service.js';
import { ApiKeysService } from '../../api-keys/api-keys.service.js';
import { OrganizationsController } from '../../organizations/organizations.controller.js';
import { OrganizationsService } from '../../organizations/organizations.service.js';
import { ProjectsController } from '../../projects/projects.controller.js';
import { ProjectsService } from '../../projects/projects.service.js';
import { OrganizationGuard } from '../../rbac/guards/organization.guard.js';
import { Permission } from '../../rbac/permissions.js';
import {
  generateSessionToken,
  sessionExpiresAt,
} from '@myplatform/auth';
import { throttleReset } from '../../common/throttler.js';

// ---------------------------------------------------------------------------
// In-memory state behind the prisma mock — stateful so the gate opening/closing
// is observable on the same user, not just "was function X called".
// ---------------------------------------------------------------------------
const store = {
  users: [] as any[],
  sessions: [] as any[],
  codes: [] as any[],
  orgs: [] as any[],
  projects: [] as any[],
};

function wirePrismaMocks() {
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
    const u = store.users.find(
      (x) => (where.id && x.id === where.id) || (where.email && x.email === where.email),
    );
    return u ? { ...u } : null;
  });
  mockPrisma.user.create.mockImplementation(async ({ data }: any) => {
    const u = {
      id: `usr_${store.users.length + 1}`,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      status: 'ACTIVE',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.users.push(u);
    if (data.sessions?.create) {
      store.sessions.push({
        id: `ses_${store.sessions.length + 1}`,
        userId: u.id,
        tokenHash: data.sessions.create.tokenHash,
        expiresAt: data.sessions.create.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      });
    }
    return { ...u };
  });
  mockPrisma.user.update.mockImplementation(async ({ where, data }: any) => {
    const u = store.users.find((x) => x.id === where.id);
    if (u) Object.assign(u, data);
    return u ? { ...u } : null;
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
      // SessionGuard/EmailVerifiedGuard read emailVerified off request.user.
      user: u
        ? { id: u.id, email: u.email, name: u.name, status: u.status, emailVerified: u.emailVerified }
        : null,
    };
  });
  mockPrisma.session.create.mockImplementation(async ({ data }: any) => {
    const s = {
      id: `ses_${store.sessions.length + 1}`,
      ...data,
      revokedAt: null,
      createdAt: new Date(),
    };
    store.sessions.push(s);
    return { ...s };
  });
  mockPrisma.session.update.mockImplementation(async ({ where, data }: any) => {
    const s = store.sessions.find((x) => x.id === where.id);
    if (s) Object.assign(s, data);
    return s ? { ...s } : null;
  });
  mockPrisma.session.updateMany.mockImplementation(async () => ({ count: 0 }));

  mockPrisma.emailVerificationCode.updateMany.mockImplementation(
    async ({ where, data }: any) => {
      let count = 0;
      for (const c of store.codes) {
        if (where.userId && c.userId !== where.userId) continue;
        if (where.consumedAt === null && c.consumedAt !== null) continue;
        Object.assign(c, data);
        count++;
      }
      return { count };
    },
  );
  mockPrisma.emailVerificationCode.create.mockImplementation(async ({ data }: any) => {
    const row = {
      id: `evc_${store.codes.length + 1}`,
      attempts: 0,
      consumedAt: null as Date | null,
      createdAt: new Date(),
      ...data,
    };
    store.codes.push(row);
    return { id: row.id };
  });
  mockPrisma.emailVerificationCode.findFirst.mockImplementation(async ({ where }: any) => {
    const matches = store.codes
      .filter(
        (c) =>
          c.userId === where.userId &&
          c.consumedAt === null &&
          (!where.expiresAt?.gt || c.expiresAt > where.expiresAt.gt),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ? { ...matches[0] } : null;
  });
  mockPrisma.emailVerificationCode.update.mockImplementation(async ({ where, data }: any) => {
    const c = store.codes.find((x) => x.id === where.id);
    if (c) Object.assign(c, data);
    return c ? { ...c } : null;
  });

  mockPrisma.organization.findUnique.mockImplementation(async ({ where }: any) => {
    const o = store.orgs.find(
      (x) => (where.slug && x.slug === where.slug) || (where.id && x.id === where.id),
    );
    return o ? { ...o } : null;
  });
  mockPrisma.organization.create.mockImplementation(async ({ data }: any) => {
    const o = {
      id: `org_${store.orgs.length + 1}`,
      name: data.name,
      slug: data.slug,
      createdBy: data.createdBy,
      createdAt: new Date(),
    };
    store.orgs.push(o);
    return { ...o };
  });

  mockPrisma.project.create.mockImplementation(async ({ data }: any) => {
    const p = { id: `prj_${store.projects.length + 1}`, ...data, createdAt: new Date() };
    store.projects.push(p);
    return { ...p };
  });

  mockPrisma.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
  );
}

function seedOAuthUser(email: string) {
  // oauth.service createNewUser: emailVerified=true at creation, no code issued.
  const u = {
    id: `usr_${store.users.length + 1}`,
    email,
    name: 'OAuth Tester',
    passwordHash: null,
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.users.push(u);
  const t = generateSessionToken();
  store.sessions.push({
    id: `ses_${store.sessions.length + 1}`,
    userId: u.id,
    tokenHash: t.hash,
    expiresAt: sessionExpiresAt(),
    revokedAt: null,
    createdAt: new Date(),
  });
  return { user: u, sessionToken: t.raw };
}

function seedOrg(id: string, slug: string) {
  const o = { id, name: 'API Key Org', slug, createdBy: 'usr_seed', createdAt: new Date() };
  store.orgs.push(o);
  return o;
}

// ---------------------------------------------------------------------------
// HTTP harness — real controllers, real guard chain, byte-level responses
// ---------------------------------------------------------------------------
@Module({
  controllers: [AuthController, OrganizationsController, ProjectsController],
  providers: [
    AuthService,
    EmailVerificationService,
    PasswordResetService,
    SessionsService,
    OrganizationsService,
    ProjectsService,
    SessionGuard,
    EmailVerifiedGuard,
    ApiKeyGuard,
    OrganizationGuard,
    LoginThrottlerGuard,
    RegisterThrottlerGuard,
    ResendVerificationThrottlerGuard,
    ForgotPasswordThrottlerGuard,
    ResetPasswordThrottlerGuard,
    { provide: AuditService, useValue: mockAudit },
    { provide: NotificationHubService, useValue: mockHub },
    { provide: ApiKeysService, useValue: mockApiKeys },
  ],
})
class EmailGateTestModule {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(EmailGateTestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const addr = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await app?.close();
});

async function req(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
}

beforeEach(async () => {
  jest.clearAllMocks();
  store.users.length = 0;
  store.sessions.length = 0;
  store.codes.length = 0;
  store.orgs.length = 0;
  store.projects.length = 0;
  wirePrismaMocks();
  mockHub.sendEmail.mockResolvedValue({ sent: true, publicId: 'pub_1' });
  mockApiKeys.validateKey.mockImplementation(async (token: string) =>
    token === 'mp_test_valid'
      ? {
          organizationId: 'org_api_1',
          permissions: [Permission.PROJECT_CREATE, Permission.PROJECT_READ],
        }
      : null,
  );
  // RegisterThrottlerGuard keys `register:${req.ip}` — reset both loopback
  // spellings (IPv4/IPv6) so live traffic on this machine can't starve the
  // suite: limit is 3/hour per key and the suite registers once per test.
  await throttleReset('register:127.0.0.1');
  await throttleReset('register:::1');
});

async function registerUser(email: string) {
  const res = await req('/auth/register', {
    body: { name: 'Gate Tester', email, password: 'Sup3rSecret!pass' },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.text}`);
  return res.json;
}

describe('1. unverified session, direct API call → 403 EMAIL_NOT_VERIFIED', () => {
  it('blocks POST /organizations before verification with the stable error code', async () => {
    const reg = await registerUser('gate-unverified@example.com');
    expect(reg.emailVerificationSent).toBe(true);
    expect(
      mockHub.sendEmail.mock.calls.some((c) => c[0]?.type === 'verification-code'),
    ).toBe(true);

    const res = await req('/organizations', {
      body: { name: 'Too Early', slug: 'too-early' },
      token: reg.sessionToken,
    });

    expect(res.status).toBe(403);
    expect(res.json).toEqual({
      statusCode: 403,
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email address not verified',
    });
    expect(store.orgs).toHaveLength(0);
  });
});

describe('2. wrong code keeps the gate shut; correct code opens it (same session)', () => {
  it('400 on wrong code, still 403 on mutation, then 201 after verification', async () => {
    const reg = await registerUser('gate-verify@example.com');

    const wrong = await req('/auth/verify-email', {
      body: { code: '000000' },
      token: reg.sessionToken,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.json.message).toBe('Incorrect code.');

    const stillShut = await req('/organizations', {
      body: { name: 'Still Early', slug: 'still-early' },
      token: reg.sessionToken,
    });
    expect(stillShut.status).toBe(403);
    expect(stillShut.json.error).toBe('EMAIL_NOT_VERIFIED');

    const ok = await req('/auth/verify-email', {
      body: { code: '123456' },
      token: reg.sessionToken,
    });
    expect(ok.status).toBe(201);
    expect(ok.json).toEqual({ verified: true });
    expect(store.users.find((u) => u.email === 'gate-verify@example.com')!.emailVerified).toBe(true);

    const open = await req('/organizations', {
      body: { name: 'Now Allowed', slug: 'now-allowed' },
      token: reg.sessionToken,
    });
    expect(open.status).toBe(201);
    expect(open.json).toMatchObject({ name: 'Now Allowed', slug: 'now-allowed' });
    expect(store.orgs).toHaveLength(1);
  });
});

describe('3. OAuth-created user (born verified) mutates with no verification step', () => {
  it('POST /organizations succeeds immediately — zero verify calls, zero emails', async () => {
    const oauth = seedOAuthUser('oauth-born@example.com');
    mockHub.sendEmail.mockClear();

    const res = await req('/organizations', {
      body: { name: 'OAuth Org', slug: 'oauth-org' },
      token: oauth.sessionToken,
    });

    expect(res.status).toBe(201);
    expect(mockHub.sendEmail).not.toHaveBeenCalled();
    expect(store.codes).toHaveLength(0);
  });
});

describe('4. API-key (mp_…) requests are unaffected by the gate', () => {
  it('POST projects with a valid API key succeeds with no session/user at all', async () => {
    seedOrg('org_api_1', 'api-key-org');

    const res = await req('/organizations/org_api_1/projects', {
      body: { name: 'Key Project', slug: 'key-project' },
      token: 'mp_test_valid',
    });

    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ name: 'Key Project', slug: 'key-project' });
    expect(mockHub.sendEmail).not.toHaveBeenCalled();
  });

  it('still rejects an invalid API key (gate exemption is not an auth bypass)', async () => {
    seedOrg('org_api_1', 'api-key-org');

    const res = await req('/organizations/org_api_1/projects', {
      body: { name: 'Bad Key', slug: 'bad-key' },
      token: 'mp_bogus_key',
    });

    expect(res.status).toBe(401);
    expect(store.projects).toHaveLength(0);
  });
});

describe('5. GET /auth/verification-status — the verify-page auto-send decision', () => {
  function seedUnverifiedUserWithoutCode(email: string) {
    // Pre-existing account registered before auto-issue existed: session but
    // zero emailVerificationCode rows.
    const u = {
      id: `usr_${store.users.length + 1}`,
      email,
      name: 'Legacy Unverified',
      passwordHash: '$argon2id$seed',
      status: 'ACTIVE',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.users.push(u);
    const t = generateSessionToken();
    store.sessions.push({
      id: `ses_${store.sessions.length + 1}`,
      userId: u.id,
      tokenHash: t.hash,
      expiresAt: sessionExpiresAt(),
      revokedAt: null,
      createdAt: new Date(),
    });
    return { user: u, sessionToken: t.raw };
  }

  it('false with no code, true after register, false once consumed; read path never throttled', async () => {
    const legacy = seedUnverifiedUserWithoutCode('gate-legacy@example.com');
    const s0 = await req('/auth/verification-status', {
      method: 'GET',
      token: legacy.sessionToken,
    });
    expect(s0.status).toBe(200);
    expect(s0.json).toEqual({ hasActiveCode: false });

    const reg = await registerUser('gate-status@example.com');
    const s1 = await req('/auth/verification-status', {
      method: 'GET',
      token: reg.sessionToken,
    });
    expect(s1.status).toBe(200);
    expect(s1.json).toEqual({ hasActiveCode: true });

    // Auto-send fires on the status call itself only — this read endpoint is
    // unthrottled, so a page reload can never be blocked by the 3/hour limit.
    for (let i = 0; i < 4; i++) {
      const r = await req('/auth/verification-status', {
        method: 'GET',
        token: reg.sessionToken,
      });
      expect(r.status).toBe(200);
    }

    await req('/auth/verify-email', {
      body: { code: '123456' },
      token: reg.sessionToken,
    });
    const s2 = await req('/auth/verification-status', {
      method: 'GET',
      token: reg.sessionToken,
    });
    expect(s2.json).toEqual({ hasActiveCode: false });

    const anon = await req('/auth/verification-status', { method: 'GET' });
    expect(anon.status).toBe(401);
  });
});
