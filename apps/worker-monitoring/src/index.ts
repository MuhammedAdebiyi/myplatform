import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '@myplatform/database';
import { createLogger } from '@myplatform/logger';

const execFileAsync = promisify(execFile);
const log = createLogger('worker-monitoring');

const SWEEP_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS ?? 60_000);
// Deployments stuck in a transient state longer than this are failed.
const STUCK_DEPLOYMENT_MS = 30 * 60 * 1000; // 30 min

/**
 * Monitoring worker (RULE 18/24 support):
 *  - fails deployments stuck in PENDING/BUILDING/DEPLOYING past a deadline
 *  - logs container drift (myplatform-svc-* containers whose service is gone)
 * Real metrics export (Prometheus/OTLP) is deferred until infra exists.
 */
async function sweepStuckDeployments(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_DEPLOYMENT_MS);

  const stuck = await prisma.deployment.findMany({
    where: {
      status: { in: ['PENDING', 'BUILDING', 'DEPLOYING'] },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, status: true, serviceId: true },
    take: 50,
  });

  for (const d of stuck) {
    await prisma.deployment.update({
      where: { id: d.id },
      data: { status: 'FAILED', rollbackReason: 'stuck_timeout' },
    });
    log.warn('failed stuck deployment', { deploymentId: d.id, previousStatus: d.status });
  }
}

async function sweepContainerDrift(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('docker', [
      'ps', '--filter', 'name=myplatform-svc-', '--format', '{{.Names}}',
    ]);
    const containers = stdout.trim().split('\n').filter(Boolean);

    for (const name of containers) {
      const serviceId = name.replace('myplatform-svc-', '');
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { lifecycle: true },
      });
      if (!service || service.lifecycle === 'DELETED' || service.lifecycle === 'DELETING') {
        log.warn('orphaned container detected', { container: name, serviceId });
        await execFileAsync('docker', ['rm', '-f', name]).catch(() => {});
      }
    }
  } catch (err) {
    log.error('container drift sweep failed', { error: (err as Error).message });
  }
}

async function start() {
  log.info('worker-monitoring starting');

  setInterval(() => {
    sweepStuckDeployments().catch((err) =>
      log.error('stuck-deployment sweep failed', { error: (err as Error).message }));
    sweepContainerDrift().catch((err) =>
      log.error('container-drift sweep failed', { error: (err as Error).message }));
  }, SWEEP_INTERVAL_MS);

  // Initial sweep so a cold start doesn't wait an interval.
  sweepStuckDeployments().catch((err) =>
    log.error('initial sweep failed', { error: (err as Error).message }));
  sweepContainerDrift().catch((err) =>
    log.error('initial sweep failed', { error: (err as Error).message }));

  log.info('worker-monitoring ready');
}

start().catch((err) => {
  log.error('worker-monitoring failed to start', { error: (err as Error).message });
  process.exit(1);
});
