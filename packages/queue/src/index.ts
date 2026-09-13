import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function createQueue<T = unknown>(name: string, opts?: Partial<QueueOptions>) {
  return new Queue<T>(name, { connection: getConnection(), ...opts });
}

export function createWorker<T = unknown>(
  name: string,
  processor: (job: { data: T }) => Promise<void>,
  opts?: Partial<WorkerOptions>
) {
  return new Worker<T>(name, processor, { connection: getConnection(), ...opts });
}
