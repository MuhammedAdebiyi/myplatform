import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// RULE 16: connection pools are explicitly bounded. API, workers, and build
// workers each open their own pool; unbounded defaults (num_cpus*2+1 per
// process) can exhaust PostgreSQL's max_connections as processes scale.
//
// Sizing (defaults, override via env):
//   api      → 20   (the main request path)
//   workers  → 5    (queue consumers, low concurrency)
//   default  → 10
//
// Set DATABASE_CONNECTION_LIMIT per process, or PROCESS_TYPE=api|worker to
// pick the preset. Prisma's connection_limit is passed via the datasource URL.
function boundedDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const explicit = process.env.DATABASE_CONNECTION_LIMIT;
  const limit =
    explicit ??
    (process.env.PROCESS_TYPE === 'api'
      ? '20'
      : process.env.PROCESS_TYPE === 'worker'
        ? '5'
        : '10');

  const u = new URL(url);
  u.searchParams.set('connection_limit', limit);
  return u.toString();
}

// RULE 18: slow queries are observable. Every query slower than the threshold
// (default 500ms) is logged with its duration so latency regressions on
// endpoints like GET /projects are investigable.
const SLOW_QUERY_MS = Number(process.env.DATABASE_SLOW_QUERY_MS ?? 500);

function createPrismaClient(): PrismaClient {
  const log: Array<'warn' | 'error' | 'query'> =
    process.env.NODE_ENV === 'development'
      ? ['warn', 'error', 'query']
      : ['warn', 'error'];

  const client = new PrismaClient({
    log,
    datasources: { db: { url: boundedDatabaseUrl() } },
  });

  if (process.env.NODE_ENV !== 'test') {
    client.$on('query' as never, (event: unknown) => {
      const e = event as { duration: number; query: string };
      if (e.duration >= SLOW_QUERY_MS) {
        console.error(
          JSON.stringify({
            level: 'warn',
            msg: 'slow_query',
            durationMs: e.duration,
            thresholdMs: SLOW_QUERY_MS,
            query: e.query.slice(0, 500),
          }),
        );
      }
    });
  }

  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
