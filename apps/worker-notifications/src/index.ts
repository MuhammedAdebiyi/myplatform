import 'dotenv/config';
import { createWorker } from '@myplatform/queue';
import { createLogger } from '@myplatform/logger';

const log = createLogger('worker-notifications');

/**
 * Notification worker. Today the platform's user-facing emails (verification,
 * password reset) are sent inline by the API via NotificationHub. This worker
 * exists for future async notification paths (deployment status emails,
 * webhook fan-out, digest emails) that shouldn't block API requests.
 *
 * It consumes the 'notifications' queue; the outbox pump will route events
 * here as those flows land. Events received today are logged and acked so
 * nothing accumulates unbounded in Redis.
 */
interface NotificationJobData {
  eventType?: string;
  aggregate?: string;
  aggregateId?: string;
  payload?: unknown;
}

async function start() {
  log.info('worker-notifications starting — consuming notifications queue');

  const worker = createWorker<NotificationJobData>(
    'notifications',
    async (job) => {
      log.info('notification event received', {
        eventType: job.data.eventType,
        aggregate: job.data.aggregate,
        aggregateId: job.data.aggregateId,
      });
      // Future: render templates, call NotificationHub, respect per-user prefs.
    },
    { concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    log.error('notification job failed', { jobId: job?.id, error: err.message });
  });

  log.info('worker-notifications ready');
}

start().catch((err) => {
  log.error('worker-notifications failed to start', { error: (err as Error).message });
  process.exit(1);
});
