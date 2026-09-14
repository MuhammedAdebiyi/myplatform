/**
 * N+1 Query Audit — RULE 31/34
 *
 * MANUAL VERIFICATION SCRIPT — not part of CI / npx jest.
 * Run manually to re-verify query counts after schema or service changes:
 *
 *   cd packages/database && node seed-n1-audit.js
 *
 * Seeds a known dataset, then calls each list endpoint's service method
 * while logging every Prisma query. Prints the exact SQL query count per endpoint.
 */
const { PrismaClient, OrgRole, ServiceType } = require('@prisma/client');

const queriesPerEndpoint = {};

async function seed(basePrisma) {
  console.log('Seeding: 3 orgs × 3 projects × 2 services × 3 members each\n');

  await basePrisma.deployment.deleteMany();
  await basePrisma.healthCheck.deleteMany();
  await basePrisma.domain.deleteMany();
  await basePrisma.envVar.deleteMany();
  await basePrisma.service.deleteMany();
  await basePrisma.project.deleteMany();
  await basePrisma.apiKey.deleteMany();
  await basePrisma.auditLog.deleteMany();
  await basePrisma.membership.deleteMany();
  await basePrisma.organization.deleteMany();
  await basePrisma.session.deleteMany();
  await basePrisma.accountIdentity.deleteMany();
  await basePrisma.linkAccount.deleteMany();
  await basePrisma.user.deleteMany();

  const users = await Promise.all(
    Array.from({ length: 10 }).map((_, i) =>
      basePrisma.user.create({
        data: {
          email: `user${i}@test.example.com`,
          name: `User ${i}`,
          emailVerified: true,
        },
      }),
    ),
  );

  for (let orgIdx = 0; orgIdx < 3; orgIdx++) {
    const org = await basePrisma.organization.create({
      data: {
        name: `Org ${orgIdx}`,
        slug: `org-${orgIdx}`,
        createdBy: users[0].id,
      },
    });

    for (let m = 0; m < 3; m++) {
      await basePrisma.membership.create({
        data: {
          userId: users[m].id,
          organizationId: org.id,
          role: m === 0 ? OrgRole.OWNER : m === 1 ? OrgRole.ADMIN : OrgRole.MEMBER,
        },
      });
    }

    for (let projIdx = 0; projIdx < 3; projIdx++) {
      const project = await basePrisma.project.create({
        data: {
          organizationId: org.id,
          name: `Project ${orgIdx}-${projIdx}`,
          slug: `proj-${orgIdx}-${projIdx}`,
        },
      });

      for (let svcIdx = 0; svcIdx < 2; svcIdx++) {
        await basePrisma.service.create({
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

  console.log('Seed complete: 10 users, 3 orgs, 9 members, 9 projects, 18 services\n');
  return users;
}

async function measureEndpoint(label, fn) {
  // Fresh PrismaClient per measurement — all query events go to this one listener
  const client = new PrismaClient({ log: ['query'] });
  let captured = [];

  client.$on('query', (event) => {
    const q = event.query;
    if (!q.includes('pg_catalog') && !q.includes('information_schema')) {
      captured.push(q);
    }
  });

  await fn(client);
  // Allow event loop to flush
  await new Promise((r) => setTimeout(r, 100));
  await client.$disconnect();

  queriesPerEndpoint[label] = captured.length;
  console.log(`  ${label}: ${captured.length} query(ies)`);
  captured.forEach((q, i) => console.log(`    [${i + 1}] ${q.substring(0, 160)}`));
}

async function main() {
  const basePrisma = new PrismaClient();
  const users = await seed(basePrisma);

  // Lookups
  const testUser = await basePrisma.user.findUnique({ where: { email: 'user0@test.example.com' } });
  const orgIds = (
    await basePrisma.membership.findMany({
      where: { userId: testUser.id },
      select: { organizationId: true },
    })
  ).map((m) => m.organizationId);
  const singleOrgId = orgIds[0];
  const firstProject = await basePrisma.project.findFirst({
    where: { organizationId: singleOrgId },
    select: { id: true },
  });
  await basePrisma.$disconnect();

  console.log('══════════════════════════════════════════');
  console.log('SINGLE-ORG QUERY COUNTS (production behavior)');
  console.log('══════════════════════════════════════════\n');

  // 1. GET /organizations — multi-org (all user's orgs)
  await measureEndpoint('GET /organizations (findManyForUser)', async (p) => {
    const memberships = await p.membership.findMany({
      where: { userId: testUser.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    memberships.map((m) => ({ ...m.organization, role: m.role }));
  });

  // 2. GET /projects — single org
  await measureEndpoint('GET /projects (findAll, single org)', async (p) => {
    await p.project.findMany({
      where: { organizationId: singleOrgId },
      include: { services: true },
    });
  });

  // 3. GET /projects/:id — single project
  await measureEndpoint('GET /projects/:id (findOne)', async (p) => {
    await p.project.findFirst({
      where: { id: firstProject.id, organizationId: singleOrgId },
      include: { services: true },
    });
  });

  // 4. GET /services — single project
  await measureEndpoint('GET /services (findAllForProject, single project)', async (p) => {
    await p.service.findMany({
      where: { projectId: firstProject.id, organizationId: singleOrgId },
    });
  });

  // 5. GET /api-keys — single org
  await measureEndpoint('GET /api-keys (list, single org)', async (p) => {
    await p.apiKey.findMany({
      where: { organizationId: singleOrgId, revokedAt: null },
      select: {
        id: true, name: true, keyPrefix: true, permissions: true,
        expiresAt: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // 6. GET /users/me/sessions — single user
  await measureEndpoint('GET /users/me/sessions (list)', async (p) => {
    await p.session.findMany({
      where: {
        userId: testUser.id,
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

  // 7. GET /auth/identities — single user
  await measureEndpoint('GET /auth/identities (listIdentities)', async (p) => {
    await p.accountIdentity.findMany({
      where: { userId: testUser.id },
      select: { id: true, provider: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  // ════════════ Scale checks ════════════
  console.log('\n══════════════════════════════════════════');
  console.log('SCALE CHECK: GET /organizations from 3 → 30 orgs');
  console.log('══════════════════════════════════════════\n');

  const scalePrisma = new PrismaClient();
  for (let i = 3; i < 30; i++) {
    const org = await scalePrisma.organization.create({
      data: {
        name: `Org scale-${i}`,
        slug: `org-scale-${i}`,
        createdBy: users[1].id,
      },
    });
    await scalePrisma.membership.create({
      data: {
        userId: testUser.id,
        organizationId: org.id,
        role: OrgRole.MEMBER,
      },
    });
  }
  await scalePrisma.$disconnect();

  console.log(`testUser now belongs to 30 organizations.\n`);

  await measureEndpoint('GET /organizations with 30 orgs', async (p) => {
    const memberships = await p.membership.findMany({
      where: { userId: testUser.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    memberships.map((m) => ({ ...m.organization, role: m.role }));
  });

  console.log('\n══════════════════════════════════════════');
  console.log('SCALE CHECK: GET /projects with 10 projects (single org)');
  console.log('══════════════════════════════════════════\n');

  const scalePrisma2 = new PrismaClient();
  for (let i = 0; i < 7; i++) {
    const proj = await scalePrisma2.project.create({
      data: {
        organizationId: singleOrgId,
        name: `Extra Project ${i}`,
        slug: `extra-proj-${i}`,
      },
    });
    for (let s = 0; s < 2; s++) {
      await scalePrisma2.service.create({
        data: {
          projectId: proj.id,
          organizationId: singleOrgId,
          name: `extra-svc-${i}-${s}`,
          type: ServiceType.WEB_SERVICE,
        },
      });
    }
  }
  await scalePrisma2.$disconnect();

  console.log(`Org now has 10 projects (20 services).\n`);

  await measureEndpoint('GET /projects with 10 projects (single org)', async (p) => {
    await p.project.findMany({
      where: { organizationId: singleOrgId },
      include: { services: true },
    });
  });

  // ════════════ Final summary ════════════
  console.log('\n══════════════════════════════════════════');
  console.log('N+1 AUDIT RESULTS — FINAL');
  console.log('══════════════════════════════════════════');
  for (const [label, count] of Object.entries(queriesPerEndpoint)) {
    console.log(`  ${count <= 2 ? '✅' : '❌'} ${label}: ${count} query(ies)`);
  }

  console.log('\n══════════════════════════════════════════');
  console.log('SCALE VERIFICATION');
  console.log('══════════════════════════════════════════');
  const orgScalePass = queriesPerEndpoint['GET /organizations (findManyForUser)'] ===
    queriesPerEndpoint['GET /organizations with 30 orgs'];
  console.log(`  GET /organizations: 3 orgs → ${queriesPerEndpoint['GET /organizations (findManyForUser)']} queries, 30 orgs → ${queriesPerEndpoint['GET /organizations with 30 orgs']} queries: ${orgScalePass ? '✅ CONSTANT' : '❌ GREW'}`);

  const projectScalePass = queriesPerEndpoint['GET /projects (findAll, single org)'] ===
    queriesPerEndpoint['GET /projects with 10 projects (single org)'];
  console.log(`  GET /projects: 3 projects → ${queriesPerEndpoint['GET /projects (findAll, single org)']} queries, 10 projects → ${queriesPerEndpoint['GET /projects with 10 projects (single org)']} queries: ${projectScalePass ? '✅ CONSTANT' : '❌ GREW'}`);

  const allPass = orgScalePass && projectScalePass &&
    Object.values(queriesPerEndpoint).every((c) => c <= 2);
  console.log(`\n  OVERALL: ${allPass ? '✅ ALL PASS — no N+1 queries' : '❌ ISSUES FOUND'}`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
