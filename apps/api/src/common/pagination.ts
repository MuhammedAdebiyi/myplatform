const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface CursorPaginationQuery {
  limit?: number;
  cursor?: string;
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
}

export function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export async function paginateQuery<T extends { id: string }>(
  findManyFn: (args: {
    where: any;
    orderBy: any;
    take: number;
    skip: number;
    cursor?: { id: string };
  }) => Promise<T[]>,
  where: any,
  limit: number,
  cursor?: string,
  orderBy: { id: 'asc' | 'desc' } = { id: 'asc' },
): Promise<CursorPaginationResult<T>> {
  const take = limit + 1; // fetch one extra to detect next page

  const items = await findManyFn({
    where,
    orderBy,
    take,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
  });

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].id : null;

  return { items: pageItems, nextCursor };
}
