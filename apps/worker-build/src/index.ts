import 'dotenv/config';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '@myplatform/database';
import { createWorker } from '@myplatform/queue';
import {
  generateAppJwt,
  createInstallationAccessToken,
  getRepoArchive,
} from '@myplatform/github';
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import tar from 'tar';

const execFileAsync = promisify(execFile);

interface BuildJobData {
  deploymentId: string;
  serviceId: string;
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

async function start() {
  log.info('worker-build starting — consuming build queue');

  const worker = createWorker<BuildJobData>(
    'build',
    async (job) => {
      const { deploymentId, serviceId } = job.data;
      log.info('build job received', { deploymentId, serviceId, jobId: job.id });

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

      const commitSha = await getCommitSha(deploymentId);

      // Mark BUILDING
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'BUILDING' },
      });
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

          await prisma.deployment.update({
            where: { id: deploymentId },
            data: {
              status: 'HEALTHY',
              imageDigest: stdout.trim() || result.imageTag,
              buildLog: result.log.slice(-10000), // last 10KB of build log
            },
          });
          log.info('deployment marked HEALTHY', { deploymentId, imageTag: result.imageTag });
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

async function getCommitSha(deploymentId: string): Promise<string> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    select: { commitSha: true },
  });
  return deployment.commitSha || 'HEAD';
}

start().catch((err) => {
  log.error('worker-build failed to start', { error: err.message });
  process.exit(1);
});
