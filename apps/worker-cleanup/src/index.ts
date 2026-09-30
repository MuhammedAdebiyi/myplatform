import 'dotenv/config';
import { prisma } from '@myplatform/database';
import { createQueue, createWorker, getRedisConnection } from '@myplatform/queue';
import { publishPendingOutboxEvents } from './outbox-pump';

interface CleanupJobData {
  resourceType: 'Project' | 'Service';
  resourceId: string;
  organizationId: string;
}

const log = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  warn: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'error', msg, ...meta })),
};

// Purge window: rows older than this are physically deleted by the sweeper.
const EXPIRED_SWEEP_OLDER_THAN_MS = 24 * 60 * 60 * 1000; // 24h past expiry
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const OUTBOX_POLL_INTERVAL_MS = 10_000;

async function cleanupProject(projectId: string) {
  // Idempotent (RULE 20): finalize to DELETED regardless of current state.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, lifecycle: true },
  });
  if (!project || project.lifecycle === 'DELETED') return;

  // Services of a deleted project are removed with it (DB cascade handles rows;
  // we mark lifecycle first for auditability).
  await prisma.service.updateMany({
    where: { projectId, lifecycle: { not: 'DELETED' } },
    data: { lifecycle: 'DELETED' },
  });
  await prisma.project.update({
    where: { id: projectId },
    data: { lifecycle: 'DELETED' },
  });

  log.info('project cleanup finalized', { projectId });
}

async function cleanupService(serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, lifecycle: true },
  });
  if (!service || service.lifecycle === 'DELETED') return;

  // In a full deployment pipeline this is where container teardown, domain
  // release, and volume cleanup would be enqueued per KR-002. Rows cascade.
  await prisma.service.update({
    where: { id: serviceId },
    data: { lifecycle: 'DELETED' },
  });

  log.info('service cleanup finalized', { serviceId });
}

/**
 * Publish pending outbox events to their routed queues: deployment.* → build
 * (consumed by worker-build), *.cleanup → cleanup (this worker).
 */
async function pumpOutbox(): Promise<void> {
  const queues = {
    cleanup: createQueue('cleanup'),
    build: createQueue('build'),
    deploy: createQueue('deploy'),
  };
  const { published, skipped } = await publishPendingOutboxEvents(queues);
  if (published > 0) {
    log.info('outbox events published', { count: published });
  }
  if (skipped.length > 0) {
    log.warn('outbox events skipped (no route)', { count: skipped.length });
  }
}

async function sweepExpiredAuthArtifacts(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRED_SWEEP_OLDER_THAN_MS);

  // OAuth state rows: TTL is 10 minutes; sweep anything past expiry.
  const oauthStates = await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const installationStates = await prisma.installationState.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const verificationCodes = await prisma.emailVerificationCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { consumedAt: { not: null, lt: cutoff } },
      ],
    },
  });

  const resetTokens = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { consumedAt: { not: null, lt: cutoff } },
      ],
    },
  });

  const sessions = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { revokedAt: { not: null, lt: cutoff } },
      ],
    },
  });

  const idempotencyKeys = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  const handoffCodes = await prisma.oAuthHandoffCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { not: null, lt: cutoff } },
      ],
    },
  });

  // Tombstoned tenant resources (scope §32): physically purge DELETED rows
  // past the retention window so soft-deleted records don't accumulate.
  const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const tombstoneCutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS);

  const deletedServices = await prisma.service.deleteMany({
    where: { lifecycle: 'DELETED', updatedAt: { lt: tombstoneCutoff } },
  });
  const deletedProjects = await prisma.project.deleteMany({
    where: { lifecycle: 'DELETED', updatedAt: { lt: tombstoneCutoff } },
  });

  const total =
    oauthStates.count + installationStates.count + verificationCodes.count +
    resetTokens.count + sessions.count + idempotencyKeys.count + handoffCodes.count +
    deletedServices.count + deletedProjects.count;

  if (total > 0) {
    log.info('expired artifacts and tombstones swept', {
      oauthStates: oauthStates.count,
      installationStates: installationStates.count,
      verificationCodes: verificationCodes.count,
      resetTokens: resetTokens.count,
      sessions: sessions.count,
      idempotencyKeys: idempotencyKeys.count,
      handoffCodes: handoffCodes.count,
      deletedServices: deletedServices.count,
      deletedProjects: deletedProjects.count,
    });
  }
}

async function start() {
  log.info('worker-cleanup starting');

  const worker = createWorker<CleanupJobData>(
    'cleanup',
    async (job) => {
      const { resourceType, resourceId } = job.data;
      log.info('cleanup job received', { resourceType, resourceId, jobId: job.id });

      if (resourceType === 'Project') {
        await cleanupProject(resourceId);
      } else if (resourceType === 'Service') {
        await cleanupService(resourceId);
      } else {
        log.warn('unknown cleanup resource type', { resourceType });
      }
    },
    { concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    log.error('cleanup job failed', { jobId: job?.id, error: err.message });
  });

  // Outbox pump (RULE 23): publish committed-but-unpublished events.
  setInterval(() => {
    pumpOutbox().catch((err) =>
      log.error('outbox pump failed', { error: (err as Error).message }),
    );
  }, OUTBOX_POLL_INTERVAL_MS);

  // Expired-artifact sweeper (RULE 11: no unbounded collections).
  setInterval(() => {
    sweepExpiredAuthArtifacts().catch((err) =>
      log.error('expired sweep failed', { error: (err as Error).message }),
    );
  }, SWEEP_INTERVAL_MS);

  // Initial runs so a cold start doesn't wait an hour.
  pumpOutbox().catch((err) =>
    log.error('initial outbox pump failed', { error: (err as Error).message }),
  );
  sweepExpiredAuthArtifacts().catch((err) =>
    log.error('initial sweep failed', { error: (err as Error).message }),
  );

  log.info('worker-cleanup ready');
}

start().catch((err) => {
  log.error('worker-cleanup failed to start', { error: (err as Error).message });
  getRedisConnection().disconnect();
  process.exit(1);
});
