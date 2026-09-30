import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '@myplatform/database';
import { decryptSecret } from '@myplatform/auth';
import { createWorker } from '@myplatform/queue';
import { createLogger } from '@myplatform/logger';

const execFileAsync = promisify(execFile);

const log = createLogger('worker-deploy');

interface DeployJobData {
  deploymentId: string;
  serviceId: string;
  eventType?: string;
  payload?: { deploymentId: string; serviceId: string };
}

interface EnvVarRow {
  key: string;
  value: string;
  isSecret: boolean;
}

interface ConfigSnapshot {
  imageTag?: string;
  startCommand?: string;
  envVars?: EnvVarRow[];
}

const CONTAINER_NAME_PREFIX = 'myplatform-svc-';
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;

function unwrapJobData(raw: DeployJobData): { deploymentId: string; serviceId: string } {
  if (raw.payload?.deploymentId) return raw.payload;
  return { deploymentId: raw.deploymentId, serviceId: raw.serviceId };
}

function containerName(serviceId: string): string {
  return `${CONTAINER_NAME_PREFIX}${serviceId}`;
}

async function stopAndRemoveContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => {});
}

/**
 * Start the container for a deployment. Env vars are decrypted at the last
 * moment and passed via --env (RULE 07: never logged, never in job payloads).
 */
async function runContainer(
  serviceId: string,
  serviceName: string,
  imageTag: string,
  envVars: EnvVarRow[],
): Promise<void> {
  const name = containerName(serviceId);

  // Replace any previous release container for this service.
  await stopAndRemoveContainer(name);

  const args = [
    'run', '-d',
    '--name', name,
    '--label', `myplatform.service=${serviceName}`,
    '--restart', 'unless-stopped',
  ];

  for (const env of envVars) {
    const value = env.isSecret ? decryptSecret(env.value) : env.value;
    args.push('--env', `${env.key}=${value}`);
  }

  args.push(imageTag);

  await execFileAsync('docker', args, { maxBuffer: 10 * 1024 * 1024 });
}

/** Wait for the container to be running AND not crash-looping. */
async function waitForHealthy(serviceId: string): Promise<boolean> {
  const name = containerName(serviceId);
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('docker', [
        'inspect', '--format={{.State.Running}} {{.State.Restarting}} {{.State.ExitCode}}', name,
      ]);
      const [running, restarting, exitCode] = stdout.trim().split(' ');
      if (running === 'true' && restarting === 'false') {
        // Give it a beat to settle (an app that crashes on boot often
        // restarts within a few seconds).
        await new Promise((r) => setTimeout(r, 3_000));
        const { stdout: verify } = await execFileAsync('docker', [
          'inspect', '--format={{.State.Running}} {{.State.Restarting}}', name,
        ]);
        const [running2, restarting2] = verify.trim().split(' ');
        if (running2 === 'true' && restarting2 === 'false') return true;
      }
      if (exitCode !== '0' && running === 'false' && restarting === 'false') {
        return false; // exited and not restarting = dead
      }
    } catch {
      // container may not exist yet on the first poll
    }
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

async function start() {
  log.info('worker-deploy starting — consuming deploy queue');

  const worker = createWorker<DeployJobData>(
    'deploy',
    async (job) => {
      const { deploymentId, serviceId } = unwrapJobData(job.data);
      log.info('deploy job received', { deploymentId, serviceId, jobId: job.id });

      // RULE 22/27: DB is the source of truth. Only deploy DEPLOYING
      // deployments whose service is still ACTIVE.
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        select: {
          id: true,
          status: true,
          imageDigest: true,
          configSnapshot: true,
          service: {
            select: {
              id: true,
              name: true,
              lifecycle: true,
              startCommand: true,
            },
          },
        },
      });

      if (!deployment) {
        log.error('deployment not found — skipping deploy', { deploymentId });
        return;
      }
      if (deployment.service.lifecycle !== 'ACTIVE') {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'CANCELLED' },
        });
        log.warn('service is DELETING — deploy cancelled', { deploymentId });
        return;
      }
      if (deployment.status !== 'DEPLOYING') {
        log.warn('deployment not in DEPLOYING state — skipping', { deploymentId, status: deployment.status });
        return;
      }

      const snapshot = (deployment.configSnapshot ?? {}) as ConfigSnapshot;
      const imageTag = snapshot.imageTag ?? deployment.imageDigest;
      if (!imageTag) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED', rollbackReason: 'no_image' },
        });
        log.error('no image to deploy', { deploymentId });
        return;
      }

      try {
        log.info('starting container', { deploymentId, imageTag });
        await runContainer(
          deployment.service.id,
          deployment.service.name,
          imageTag,
          snapshot.envVars ?? [],
        );

        const healthy = await waitForHealthy(deployment.service.id);

        if (healthy) {
          // Record the previous release before marking this one healthy.
          const previous = await prisma.deployment.findFirst({
            where: { serviceId, status: 'HEALTHY', id: { not: deploymentId } },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          });

          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              status: 'HEALTHY',
              previousRelease: previous?.id ?? null,
            },
          });
          log.info('deployment marked HEALTHY', { deploymentId });
        } else {
          const { stdout: logs } = await execFileAsync('docker', [
            'logs', '--tail', '50', containerName(deployment.service.id),
          ]).catch(() => ({ stdout: '' }));

          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              status: 'FAILED',
              rollbackReason: 'health_check_failed',
              buildLog: logs.slice(-10000),
            },
          });
          log.error('deploy failed health check', { deploymentId });
        }
      } catch (err: any) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'FAILED',
            rollbackReason: 'deploy_error',
            buildLog: (err?.message || 'unknown deploy error').slice(0, 10000),
          },
        }).catch(() => {});
        log.error('deploy error', { deploymentId, error: err?.message });
      }
    },
    { concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error('deploy job failed', { jobId: job?.id, error: err.message });
  });

  log.info('worker-deploy ready');
}

start().catch((err) => {
  log.error('worker-deploy failed to start', { error: (err as Error).message });
  process.exit(1);
});
