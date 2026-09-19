import 'dotenv/config';
import { prisma } from '@myplatform/database';
import { createWorker } from '@myplatform/queue';

interface BuildJobData {
  deploymentId: string;
  serviceId: string;
}

const logger = {
  info: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'info', msg, ...meta })),
  warn: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'warn', msg, ...meta })),
  error: (msg: string, meta?: object) => console.log(JSON.stringify({ level: 'error', msg, ...meta })),
};

const BUILD_DELAY_MS = 5_000;

async function start() {
  logger.info('worker-build starting — consuming build queue');

  const worker = createWorker<BuildJobData>(
    'build',
    async (job) => {
      const { deploymentId, serviceId } = job.data;

      logger.info('build job received', { deploymentId, serviceId, jobId: job.id });

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'BUILDING' },
      });

      logger.info('deployment marked BUILDING', { deploymentId });

      await new Promise((resolve) => setTimeout(resolve, BUILD_DELAY_MS));

      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'HEALTHY' },
      });

      logger.info('deployment marked HEALTHY (stub — no real build)', { deploymentId });
    },
    {
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('build job failed', { jobId: job?.id, error: err.message });
  });

  worker.on('completed', (job) => {
    logger.info('build job completed', { jobId: job.id });
  });

  logger.info('worker-build ready');
}

start().catch((err) => {
  logger.error('worker-build failed to start', { error: err.message });
  process.exit(1);
});
