import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

export function createQueue<T = unknown>(name: string, opts?: Partial<QueueOptions>) {
  return new Queue<T>(name, { connection: getRedisConnection(), ...opts });
}

export function createWorker<T = unknown>(
  name: string,
  processor: (job: { data: T }) => Promise<void>,
  opts?: Partial<WorkerOptions>
) {
  return new Worker<T>(name, processor, { connection: getRedisConnection(), ...opts });
}
