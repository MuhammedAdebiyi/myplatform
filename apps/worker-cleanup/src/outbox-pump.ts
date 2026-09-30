// Outbox pump (RULE 23). Publishes committed-but-unpublished events to the
// correct queue per event type. Routing table here is the single place that
// maps event types to consumers.
import { prisma } from '@myplatform/database';

export interface QueueLike {
  add: (name: string, data: unknown, opts?: object) => Promise<unknown>;
}

/** eventType → queue name. Unknown types are logged and skipped, never lost. */
const EVENT_ROUTING: Record<string, string> = {
  'deployment.created': 'build',
  'deployment.rollback': 'build',
  'deployment.deploy': 'deploy',
  'project.cleanup': 'cleanup',
  'service.cleanup': 'cleanup',
};

export function queueForEvent(eventType: string): string | null {
  return EVENT_ROUTING[eventType] ?? null;
}

export async function publishPendingOutboxEvents(
  queues: Record<string, QueueLike>,
  limit = 100,
): Promise<{ published: number; skipped: string[] }> {
  const pending = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let published = 0;
  const skipped: string[] = [];

  for (const event of pending) {
    const queueName = queueForEvent(event.eventType);
    if (!queueName || !queues[queueName]) {
      skipped.push(event.id);
      continue;
    }

    await queues[queueName].add(event.eventType, {
      outboxEventId: event.id,
      aggregate: event.aggregate,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
    published++;
  }

  return { published, skipped };
}
