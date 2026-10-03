import 'dotenv/config';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '@myplatform/database';
import { createQueue, createWorker } from '@myplatform/queue';
import {
  generateAppJwt,
  createInstallationAccessToken,
  getRepoArchive,
} from '@myplatform/github';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
// tar v7 is dual ESM/CJS with NO default export — a default import resolves
// to undefined under tsx and 'tar.x' throws "Cannot read properties of
// undefined (reading 'x')" (found on the first real build, RULE 31).
import * as tar from 'tar';

const execFileAsync = promisify(execFile);

interface BuildJobData {
  deploymentId: string;
  serviceId: string;
  // Outbox-wrapped payloads (RULE 23) carry these extra fields; legacy bare
  // payloads (push-event direct enqueue) omit them.
  eventType?: string;
}

/**
 * Extract outbox-wrapped or bare job payloads. The outbox pump publishes
 * { outboxEventId, eventType, payload: {deploymentId, serviceId} } while the
 * legacy push path enqueues { deploymentId, serviceId } directly.
 */
function unwrapJobData(raw: BuildJobData): { deploymentId: string; serviceId: string } {
  const wrapped = raw as unknown as { payload?: { deploymentId: string; serviceId: string } };
  if (wrapped.payload?.deploymentId) return wrapped.payload;
  return { deploymentId: raw.deploymentId, serviceId: raw.serviceId };
}

const log = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  warn: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'error', msg, ...meta })),
};

function getGitHubAppConfig() {
  const appId = parseInt(process.env.GITHUB_APP_ID!, 10);
  const privateKey = Buffer.from(
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64!,
    'base64',
  ).toString('utf8');
  return { appId, privateKey };
}

async function extractTarball(tarballPath: string, destDir: string): Promise<string> {
  // GitHub tarballs have a single top-level directory
  await tar.x({ file: tarballPath, cwd: destDir });
  const entries = await readdir(destDir);
  if (entries.length === 1 && entries[0].startsWith('github.com-')) {
    return join(destDir, entries[0]);
  }
  return destDir;
}

async function runDockerBuild(
  buildDir: string,
  dockerfilePath: string | null,
  serviceName: string,
  commitSha: string,
): Promise<{ success: boolean; log: string; imageTag: string }> {
  const imageTag = `myplatform/${serviceName}:${commitSha}`;
  const dockerfileArg = dockerfilePath ? ['-f', dockerfilePath] : [];

  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['build', ...dockerfileArg, '-t', imageTag, '.'],
      { cwd: buildDir, maxBuffer: 50 * 1024 * 1024, timeout: 600_000 },
    );
    return { success: true, log: stdout + stderr, imageTag };
  } catch (err: any) {
    return { success: false, log: err.stdout + err.stderr + err.message, imageTag };
  }
}

/**
 * Load the service's env vars for the deploy snapshot. Secret values are
 * passed to the container at runtime by worker-deploy — they never enter
 * build logs or this job's output (RULE 07). Values stay encrypted at rest
 * until worker-deploy decrypts them just before container creation.
 */
async function loadServiceEnvVars(serviceId: string): Promise<Array<{ key: string; value: string; isSecret: boolean }>> {
  const rows = await prisma.envVar.findMany({
    where: { serviceId },
    select: { key: true, value: true, isSecret: true },
  });
  return rows;
}

let deployQueue: ReturnType<typeof createQueue> | undefined;

async function start() {
  log.info('worker-build starting — consuming build queue');
  deployQueue = createQueue('deploy');

  const worker = createWorker<BuildJobData>(
    'build',
    async (job) => {
      const { deploymentId, serviceId } = unwrapJobData(job.data);
      log.info('build job received', { deploymentId, serviceId, jobId: job.id, eventType: job.data.eventType });

      // Look up service + repo
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        include: { githubRepository: true },
      });

      if (!service) {
        log.error('service not found', { serviceId });
        return;
      }

      if (!service.githubRepository) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED', buildLog: 'No GitHub repository connected to this service.' },
        });
        log.warn('no github repository connected', { serviceId, deploymentId });
        return;
      }

      // RULE 22/27: verify state from the DB before executing. A stale,
      // cancelled, or unknown deploymentId fails the job gracefully instead
      // of building something nobody asked for.
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        select: {
          id: true,
          status: true,
          commitSha: true,
          commitMessage: true,
          service: { select: { lifecycle: true } },
        },
      });

      if (!deployment) {
        log.error('deployment not found — skipping build', { deploymentId });
        return;
      }
      if (deployment.status === 'CANCELLED') {
        log.warn('deployment already cancelled — skipping build', { deploymentId });
        return;
      }
      if (deployment.service.lifecycle !== 'ACTIVE') {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'CANCELLED' },
        });
        log.warn('service is DELETING — cancelling build', { deploymentId });
        return;
      }

      const commitSha = deployment.commitSha || 'HEAD';

      // Claim the build atomically: only claim from PENDING. A concurrent
      // cancel between the queue and here flips status to CANCELLED, and this
      // updateMany matches 0 rows — the cancel wins (RULE 24 state machine).
      const claimed = await prisma.deployment.updateMany({
        where: { id: deploymentId, status: 'PENDING' },
        data: { status: 'BUILDING' },
      });
      if (claimed.count !== 1) {
        log.warn('deployment no longer PENDING — skipping build', { deploymentId });
        return;
      }
      log.info('deployment marked BUILDING', { deploymentId });

      let buildDir: string | null = null;

      try {
        // Get GitHub access token
        const config = getGitHubAppConfig();
        const appJwt = generateAppJwt(config);
        const installation = await prisma.gitHubInstallation.findUniqueOrThrow({
          where: { id: service.githubRepository.installationId },
        });
        const token = await createInstallationAccessToken(appJwt, installation.installationId);

        // Manual deploys (POST /deployments with no webhook) have no commit
        // metadata yet — backfill it from GitHub best-effort so the deploy
        // list shows WHAT was built, not just the sha.
        if (commitSha !== 'HEAD' && !deployment.commitMessage) {
          try {
            const res = await fetch(
              `https://api.github.com/repos/${service.githubRepository.fullName}/commits/${commitSha}`,
              {
                headers: {
                  Authorization: `Bearer ${token.token}`,
                  Accept: 'application/vnd.github+json',
                  'X-GitHub-Api-Version': '2022-11-28',
                },
              },
            );
            if (res.ok) {
              const data = (await res.json()) as {
                commit?: { message?: string };
                author?: { login?: string } | null;
              };
              const message = data.commit?.message?.split('\n')[0]?.slice(0, 200) ?? null;
              const author = data.author?.login ?? null;
              if (message || author) {
                await prisma.deployment.update({
                  where: { id: deploymentId },
                  data: { commitMessage: message, commitAuthor: author },
                });
              }
            }
          } catch (err: any) {
            log.warn('commit metadata backfill failed', { deploymentId, error: err.message });
          }
        }

        // Download repo archive
        log.info('downloading repo archive', {
          repo: service.githubRepository.fullName,
          ref: commitSha,
        });
        const archive = await getRepoArchive(
          token.token,
          service.githubRepository.fullName,
          commitSha,
        );

        // Extract to temp directory
        buildDir = await mkdtemp(join(tmpdir(), 'build-'));
        const tarballPath = join(buildDir, 'repo.tar.gz');
        await writeFile(tarballPath, archive);
        const sourceDir = await extractTarball(tarballPath, buildDir);

        // Run Docker build
        log.info('starting docker build', { buildDir: sourceDir });
        const result = await runDockerBuild(
          sourceDir,
          service.dockerfilePath,
          service.name,
          commitSha,
        );

        if (result.success) {
          // Store image digest
          const { stdout } = await execFileAsync('docker', [
            'inspect', '--format={{index .RepoDigests 0}}', result.imageTag,
          ]).catch(() => ({ stdout: result.imageTag }));

          // BUILD_SUCCEEDED semantics: a successful docker build puts the
          // deployment in DEPLOYING — worker-deploy runs the container and
          // flips it to HEALTHY after the health check passes (RULE 24).
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              status: 'DEPLOYING',
              imageDigest: stdout.trim() || result.imageTag,
              buildLog: result.log.slice(-10000), // last 10KB of build log
              configSnapshot: {
                imageTag: result.imageTag,
                startCommand: service.startCommand,
                envVars: await loadServiceEnvVars(serviceId),
              },
            },
          });
          log.info('deployment marked DEPLOYING', { deploymentId, imageTag: result.imageTag });

          // Hand off to worker-deploy (RULE 24 state machine):
          // PENDING → BUILDING → DEPLOYING → HEALTHY/FAILED.
          await deployQueue?.add('deploy', {
            deploymentId,
            serviceId,
          });
        } else {
          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              status: 'FAILED',
              buildLog: result.log.slice(-10000),
            },
          });
          log.error('build failed', { deploymentId });
        }
      } catch (err: any) {
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'FAILED',
            buildLog: err.message || 'Unknown build error',
          },
        }).catch(() => {});
        log.error('build error', { deploymentId, error: err.message });
      } finally {
        // Cleanup temp directory
        if (buildDir) {
          await rm(buildDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
    { concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error('build job failed', { error: err.message });
  });

  worker.on('completed', () => {
    log.info('build job completed');
  });

  log.info('worker-build ready');
}

start().catch((err) => {
  log.error('worker-build failed to start', { error: err.message });
  process.exit(1);
});
