import { prisma } from '@myplatform/database';

/**
 * Idempotency support (RULE 21): same key + same operation = same result.
 *
 * Flow for a mutation endpoint:
 *   1. claimIdempotencyKey(...) — INSERT with unique constraint. If the row
 *      already exists (P2002) the operation is a retry: return the recorded
 *      outcome (or PENDING/FAILED status for the caller to handle).
 *   2. Perform the mutation.
 *   3. completeIdempotencyKey(...) — record the response body so replays get
 *      the ORIGINAL response, not a second mutation.
 */
export interface IdempotencyClaim {
  reused: boolean;
  status?: string;
  responseBody?: unknown;
}

export async function claimIdempotencyKey(
  organizationId: string,
  key: string,
  endpoint: string,
): Promise<IdempotencyClaim> {
  try {
    await prisma.idempotencyKey.create({
      data: { organizationId, key, endpoint },
    });
    return { reused: false };
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err;
    const existing = await prisma.idempotencyKey.findUnique({
      where: {
        organizationId_key_endpoint: { organizationId, key, endpoint },
      },
    });
    return {
      reused: true,
      status: existing?.status,
      responseBody: existing?.responseBody ?? undefined,
    };
  }
}

export async function completeIdempotencyKey(
  organizationId: string,
  key: string,
  endpoint: string,
  responseBody: unknown,
): Promise<void> {
  await prisma.idempotencyKey.updateMany({
    where: { organizationId, key, endpoint, status: 'PENDING' },
    data: {
      status: 'COMPLETED',
      responseBody: responseBody as object,
    },
  });
}

export async function failIdempotencyKey(
  organizationId: string,
  key: string,
  endpoint: string,
): Promise<void> {
  await prisma.idempotencyKey.updateMany({
    where: { organizationId, key, endpoint, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}
