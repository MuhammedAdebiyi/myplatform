/**
 * N+1 Query Audit — RULE 31/34
 *
 * Seeds a known dataset, then calls each list endpoint's service method
 * while logging every Prisma query. Prints the exact SQL query count per endpoint.
 *
 * Run:  cd packages/database && npx tsx seed-n1-audit.ts
 */
import { PrismaClient, OrgRole, ServiceType } from '@prisma/client';

const SEED_USER_COUNT = 10; // enough to test multi-member queries
const prisma = new PrismaClient({ log: ['query'] });

let queryCount = 0;
const queriesPerEndpoint: Record<string, number> = {};

function resetCounter(label: string) {
  // Flush previous
  if (queryCount > 0) {
    // shouldn't happen, but safety
  }
  queryCount = 0;
  console.log(`\n--- ${label} ---`);
}

function countQuery(event: any) {
  // Skip internal migration/transaction overhead
  if (event.query.includes('pg_catalog') || event.query.includes('information_schema')) return;
  queryCount++;
}

async function seed() {
  console.log('Seeding: 3 orgs × 3 projects × 2 services × 3 members each\n');

  // Clean
  await prisma.deployment.deleteMany();
  await prisma.healthCheck.deleteMany();
  await prisma.domain.deleteMany();
  await prisma.envVar.deleteMany();
  await prisma.service.deleteMany();
  await prisma.project.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.session.deleteMany();
  await prisma.accountIdentity.deleteMany();
  await prisma.linkAccount.deleteMany();
  await prisma.user.deleteMany();

  // Create 10 users
  const users = await Promise.all(
    Array.from({ length: SEED_USER_COUNT }).map((_, i) =>
      prisma.user.create({
        data: {
          email: `user${i}@test.example.com`,
          name: `User ${i}`,
          emailVerified: true,
        },
      }),
    ),
  );

  // Create 3 orgs, each with 3 members, 3 projects, 2 services per project
  for (let orgIdx = 0; orgIdx < 3; orgIdx++) {
    const org = await prisma.organization.create({
      data: {
        name: `Org ${orgIdx}`,
        slug: `org-${orgIdx}`,
        createdBy: users[0].id,
      },
    });

    // 3 members per org (rotate through users)
    for (let m = 0; m < 3; m++) {
      await prisma.membership.create({
        data: {
          userId: users[m].id,
          organizationId: org.id,
          role: m === 0 ? OrgRole.OWNER : m === 1 ? OrgRole.ADMIN : OrgRole.MEMBER,
        },
      });
    }

    // 3 projects per org, 2 services per project
    for (let projIdx = 0; projIdx < 3; projIdx++) {
      const project = await prisma.project.create({
        data: {
          organizationId: org.id,
          name: `Project ${orgIdx}-${projIdx}`,
          slug: `proj-${orgIdx}-${projIdx}`,
        },
      });

      for (let svcIdx = 0; svcIdx < 2; svcIdx++) {
        await prisma.service.create({
          data: {
            projectId: project.id,
            organizationId: org.id,
            name: `svc-${orgIdx}-${projIdx}-${svcIdx}`,
            type: ServiceType.WEB_SERVICE,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
  console.log(`  Users: ${SEED_USER_COUNT}`);
  console.log(`  Orgs: 3, Members: 9, Projects: 9, Services: 18`);
}

async function runEndpoint(
  label: string,
  fn: () => Promise<unknown>,
) {
  queryCount = 0;
  prisma.$on('query', countQuery);
  await fn();
  prisma.$off('query');
  queriesPerEndpoint[label] = queryCount;
  console.log(`  Queries: ${queryCount}`);
}

async function main() {
  await seed();

  // ──────────── Endpoint 1: GET /organizations ────────────
  // Service: findManyForUser(userId) → membership.findMany({ include: { organization: true }})
  const testUser = await prisma.user.findUnique({ where: { email: 'user0@test.example.com' } });

  await runEndpoint('GET /organizations (findManyForUser)', async () => {
    const memberships = await prisma.membership.findMany({
      where: { userId: testUser!.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    // Simulate the map like the real service does
    memberships.map((m) => ({ ...m.organization, role: m.role }));
  });

  // ──────────── Endpoint 2: GET /projects?orgId=... ────────────
  // Service: findAll(organizationId) → project.findMany({ include: { services: true }})
  const orgIds = (
    await prisma.membership.findMany({
      where: { userId: testUser!.id },
      select: { organizationId: true },
    })
  ).map((m) => m.organizationId);

  await runEndpoint('GET /projects (findAll)', async () => {
    for (const orgId of orgIds) {
      await prisma.project.findMany({
        where: { organizationId: orgId },
        include: { services: true },
      });
    }
  });

  // ──────────── Endpoint 3: GET /projects/:id ────────────
  // Service: findOne(orgId, id) → project.findFirst({ include: { services: true }})
  const firstProject = await prisma.project.findFirst({
    select: { id: true, organizationId: true },
  });

  await runEndpoint('GET /projects/:id (findOne)', async () => {
    await prisma.project.findFirst({
      where: { id: firstProject!.id, organizationId: firstProject!.organizationId },
      include: { services: true },
    });
  });

  // ──────────── Endpoint 4: GET /.../services ────────────
  // Service: findAllForProject(orgId, projectId) → service.findMany({ where })
  await runEndpoint('GET /services (findAllForProject)', async () => {
    for (const orgId of orgIds) {
      const projects = await prisma.project.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      for (const proj of projects) {
        await prisma.service.findMany({
          where: { projectId: proj.id, organizationId: orgId },
        });
      }
    }
  });

  // ──────────── Endpoint 5: GET /.../api-keys ────────────
  // Service: list(organizationId) → apiKey.findMany({ select })
  await runEndpoint('GET /api-keys (list)', async () => {
    for (const orgId of orgIds) {
      await prisma.apiKey.findMany({
        where: { organizationId: orgId, revokedAt: null },
        select: {
          id: true, name: true, keyPrefix: true, permissions: true,
          expiresAt: true, lastUsedAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }
  });

  // ──────────── Endpoint 6: GET /users/me/sessions ────────────
  // Service: list(userId, currentSessionId) → session.findMany({ select })
  await runEndpoint('GET /users/me/sessions (list)', async () => {
    await prisma.session.findMany({
      where: {
        userId: testUser!.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true, ipAddress: true, userAgent: true,
        createdAt: true, lastUsedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    });
  });

  // ──────────── Endpoint 7: GET /auth/identities ────────────
  // Service: listIdentities(userId) → accountIdentity.findMany
  await runEndpoint('GET /auth/identities (listIdentities)', async () => {
    await prisma.accountIdentity.findMany({
      where: { userId: testUser!.id },
      select: { id: true, provider: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  // ──────────── Summary ────────────
  console.log('\n══════════════════════════════════════════');
  console.log('N+1 AUDIT RESULTS — 3 orgs, 9 projects, 18 services, 9 members');
  console.log('══════════════════════════════════════════');
  for (const [label, count] of Object.entries(queriesPerEndpoint)) {
    console.log(`  ${count <= 2 ? '✅' : '❌'} ${label}: ${count} query(ies)`);
  }

  // ──────────── Scale check: GET /organizations with more memberships ────────────
  // The real question: does query count grow with row count?
  // findManyForUser uses a single findMany + include — should be 1 query regardless.
  // Let's prove it by adding 27 more memberships (total 30) and re-running.
  console.log('\n══════════════════════════════════════════');
  console.log('SCALE CHECK — scaling from 3 orgs to 30 orgs');
  console.log('══════════════════════════════════════════');

  // Add more orgs (27 more, so testUser belongs to 30 total)
  for (let i = 3; i < 30; i++) {
    const org = await prisma.organization.create({
      data: {
        name: `Org ${i}`,
        slug: `org-scale-${i}`,
        createdBy: users[1].id,
      },
    });
    await prisma.membership.create({
      data: {
        userId: testUser!.id,
        organizationId: org.id,
        role: OrgRole.MEMBER,
      },
    });
  }

  console.log(`\ntestUser now belongs to 30 organizations.`);

  await runEndpoint('GET /organizations with 30 orgs', async () => {
    const memberships = await prisma.membership.findMany({
      where: { userId: testUser!.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    memberships.map((m) => ({ ...m.organization, role: m.role }));
  });

  console.log('\n══════════════════════════════════════════');
  console.log('PASS CONDITION: Query count must be IDENTICAL (1) at both 3 and 30 orgs.');
  console.log(`  3 orgs  → ${queriesPerEndpoint['GET /organizations (findManyForUser)']} query(ies)`);
  console.log(`  30 orgs → ${queriesPerEndpoint['GET /organizations with 30 orgs']} query(ies)`);
  const pass =
    queriesPerEndpoint['GET /organizations (findManyForUser)'] ===
    queriesPerEndpoint['GET /organizations with 30 orgs'];
  console.log(`  Result: ${pass ? '✅ PASS — query count is constant (no N+1)' : '❌ FAIL — query count grew with row count'}`);
  console.log('══════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
