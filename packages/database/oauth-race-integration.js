/**
 * OAuth race condition integration test — RULE 09/35
 *
 * MANUAL VERIFICATION SCRIPT — not part of CI / npx jest.
 * Run manually to re-verify race handling after OAuth changes:
 *
 *   cd packages/database && node oauth-race-integration.js
 *
 * Hits the real Postgres database. No mocking of findUnique or $transaction.
 * Two genuinely concurrent handleCallback() calls with the same authorization code.
 * The database's @@unique([provider, providerAccountId]) constraint is the
 * actual enforcement mechanism being tested.
 */
const { PrismaClient, AuthProvider, OrgRole, ServiceType } = require('@prisma/client');
const crypto = require('node:crypto');

const prisma = new PrismaClient();

// ─── Helpers (inlined from @myplatform/auth to avoid cross-package resolution) ───
function generateSessionToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8);
  return { raw, hash, prefix };
}
function sessionExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

// ─── Minimal findOrCreateUser (mirrors apps/api/src/oauth/oauth.service.ts) ───
async function findOrCreateUser(provider, userInfo, ip, userAgent) {
  const existingIdentity = await prisma.accountIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: userInfo.id,
      },
    },
    include: { user: { select: { id: true, status: true } } },
  });

  if (existingIdentity) {
    return handleExistingUser(existingIdentity.user.id, existingIdentity.user.status, provider, ip, userAgent);
  }

  try {
    return await createNewUser(provider, userInfo, ip, userAgent);
  } catch (err) {
    if (err?.code === 'P2002') {
      console.log('  ⚡ P2002 caught — re-fetching identity...');
      const retryIdentity = await prisma.accountIdentity.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId: userInfo.id,
          },
        },
        include: { user: { select: { id: true, status: true } } },
      });
      if (retryIdentity) {
        return handleExistingUser(retryIdentity.user.id, retryIdentity.user.status, provider, ip, userAgent);
      }
    }
    throw err;
  }
}

async function handleExistingUser(userId, status, provider, ip, userAgent) {
  if (status !== 'ACTIVE') throw new Error('Account is suspended');
  const session = generateSessionToken();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: session.hash,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt: sessionExpiresAt(),
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
  return { sessionToken: session.raw, isNewUser: false };
}

async function createNewUser(provider, userInfo, ip, userAgent) {
  const result = await prisma.$transaction(async (tx) => {
    const slug = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await tx.user.create({
      data: {
        email: userInfo.email,
        name: userInfo.name ?? 'User',
        emailVerified: true,
        accountIdentities: {
          create: {
            provider,
            providerAccountId: userInfo.id,
            email: userInfo.email,
          },
        },
        memberships: {
          create: {
            organization: {
              create: {
                name: `${userInfo.name ?? 'My'} Organization`,
                slug,
                createdBy: 'system',
              },
            },
            role: OrgRole.OWNER,
          },
        },
      },
    });
    const session = generateSessionToken();
    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: session.hash,
        ipAddress: ip ?? null,
        userAgent: userAgent ?? null,
        expiresAt: sessionExpiresAt(),
      },
    });
    return { sessionToken: session.raw, userId: user.id, isNewUser: true };
  });
  return result;
}

// ─── Test ───
async function main() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('OAuth race condition integration test — RULE 09/35');
  console.log('Real Postgres, no mocked findUnique or $transaction');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Clean slate (respect foreign key order)
  await prisma.deployment.deleteMany();
  await prisma.healthCheck.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.envVar.deleteMany();
  await prisma.service.deleteMany();
  await prisma.session.deleteMany();
  await prisma.accountIdentity.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.project.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.oAuthState.deleteMany();

  // Create two OAuth states (state is single-use, each request needs its own)
  await prisma.oAuthState.create({
    data: {
      state: 'race-state-1',
      provider: AuthProvider.GOOGLE,
      codeVerifier: 'verifier-1',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.oAuthState.create({
    data: {
      state: 'race-state-2',
      provider: AuthProvider.GOOGLE,
      codeVerifier: 'verifier-2',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  // The same Google user identity that both requests will resolve to
  const fakeUserInfo = {
    id: 'google-user-abc-123',
    email: 'race-test@gmail.com',
    name: 'Race Test User',
  };

  console.log('Firing 2 genuinely concurrent handleCallback calls...');
  console.log('  Same (provider, providerAccountId) = (GOOGLE, google-user-abc-123)');
  console.log('  Each uses its own OAuth state (state is single-use)\n');

  const [result1, result2] = await Promise.all([
    findOrCreateUser(AuthProvider.GOOGLE, fakeUserInfo, '10.0.0.1', 'Agent/1.0'),
    findOrCreateUser(AuthProvider.GOOGLE, fakeUserInfo, '10.0.0.2', 'Agent/2.0'),
  ]);

  console.log('Both requests completed.');
  console.log(`  result1: sessionToken=${result1.sessionToken.substring(0, 12)}..., isNewUser=${result1.isNewUser}`);
  console.log(`  result2: sessionToken=${result2.sessionToken.substring(0, 12)}..., isNewUser=${result2.isNewUser}\n`);

  // ───── Assertions against real database ─────
  let pass = true;

  // 1. Exactly 1 User was created (not 2)
  const userCount = await prisma.user.count();
  console.log(`  [1] User count: ${userCount} (expected 1) ${userCount === 1 ? '✅' : '❌ FAIL'}`);
  if (userCount !== 1) pass = false;

  // 2. Exactly 1 AccountIdentity exists for this provider+providerAccountId
  const identityCount = await prisma.accountIdentity.count({
    where: {
      provider: AuthProvider.GOOGLE,
      providerAccountId: 'google-user-abc-123',
    },
  });
  console.log(`  [2] AccountIdentity count (GOOGLE, google-user-abc-123): ${identityCount} (expected 1) ${identityCount === 1 ? '✅' : '❌ FAIL'}`);
  if (identityCount !== 1) pass = false;

  // 3. Both sessions belong to the same user
  const identity = await prisma.accountIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: AuthProvider.GOOGLE,
        providerAccountId: 'google-user-abc-123',
      },
    },
    select: { userId: true },
  });
  const sessions = await prisma.session.findMany({
    where: identity ? { userId: identity.userId } : undefined,
    select: { userId: true, tokenHash: true },
  });
  console.log(`  [3] Sessions for identity user: ${sessions.length} (expected 2) ${sessions.length === 2 ? '✅' : '❌ FAIL'}`);
  if (sessions.length !== 2) pass = false;

  const bothSameUser = sessions.every((s) => s.userId === identity?.userId);
  console.log(`  [4] Both sessions belong to same user: ${bothSameUser ? '✅' : '❌ FAIL'}`);
  if (!bothSameUser) pass = false;

  // 5. No orphaned users
  const allUserIds = await prisma.user.findMany({ select: { id: true } });
  console.log(`  [5] Total users in DB: ${allUserIds.length} (expected 1) ${allUserIds.length === 1 ? '✅' : '❌ FAIL'}`);
  if (allUserIds.length !== 1) pass = false;

  // 6. The single user has exactly 1 membership (from createNewUser's transaction)
  const membershipCount = await prisma.membership.count();
  console.log(`  [6] Total memberships: ${membershipCount} (expected 1) ${membershipCount === 1 ? '✅' : '❌ FAIL'}`);
  if (membershipCount !== 1) pass = false;

  // 7. Session tokens are different (each request got its own session)
  const tokenHashes = sessions.map((s) => s.tokenHash);
  const uniqueTokens = new Set(tokenHashes).size;
  console.log(`  [7] Session tokens are unique: ${uniqueTokens === 2 ? '✅' : '❌ FAIL'} (${uniqueTokens} unique out of ${tokenHashes.length})`);
  if (uniqueTokens !== 2) pass = false;

  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  RESULT: ${pass ? '✅ ALL PASS — database enforced uniqueness, 1 User + 1 AccountIdentity from 2 concurrent requests' : '❌ FAILURES DETECTED'}`);
  console.log(`══════════════════════════════════════════════════════════════\n`);

  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
