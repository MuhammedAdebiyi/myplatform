import { prisma, Prisma } from '@myplatform/database';

/** The transactional client passed to `prisma.$transaction(async (tx) => ...)`. */
type TxClient = Omit<Prisma.TransactionClient, '$transaction' | '$extends'>;

export interface OutboxEventInput {
  aggregate: string;
  aggregateId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Transactional outbox writer (RULE 23). Call inside the SAME transaction
 * (`tx`) that commits the state change the event mirrors. The outbox worker
 * publishes these to the queue and marks them published — so a Redis outage
 * between COMMIT and enqueue can no longer strand a deployment.
 */
export async function enqueueOutboxEvent(
  tx: TxClient,
  event: OutboxEventInput,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      aggregate: event.aggregate,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
    },
  });
}

/**
 * Publish pending outbox events to a BullMQ queue. Returns how many were
 * published. Called by the outbox pump (worker-cleanup), never inline with
 * the originating transaction.
 */
export async function publishPendingOutboxEvents(
  queue: { add: (name: string, data: unknown, opts?: object) => Promise<unknown> },
  queueName: string,
  limit = 100,
): Promise<number> {
  void queueName;
  const pending = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let published = 0;
  for (const event of pending) {
    await queue.add(event.eventType, {
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
  return published;
}
