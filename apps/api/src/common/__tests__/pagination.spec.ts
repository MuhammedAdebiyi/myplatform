import { paginateQuery, parseLimit } from '../pagination';

const mockPrisma = {
  findMany: jest.fn(),
};

function createFindMany() {
  return (args: any) => mockPrisma.findMany(args);
}

describe('Cursor pagination (RULE 15/26)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseLimit', () => {
    it('defaults to 20 when no value provided', () => {
      expect(parseLimit(undefined)).toBe(20);
    });

    it('defaults to 20 for invalid values', () => {
      expect(parseLimit('abc')).toBe(20);
      expect(parseLimit('')).toBe(20);
      expect(parseLimit(null)).toBe(20);
    });

    it('parses valid integers', () => {
      expect(parseLimit('10')).toBe(10);
      expect(parseLimit(50)).toBe(50);
    });

    it('clamps to max 100', () => {
      expect(parseLimit(100)).toBe(100);
      expect(parseLimit(101)).toBe(100);
      expect(parseLimit(1000)).toBe(100);
      expect(parseLimit(9999)).toBe(100);
    });

    it('floors fractional values', () => {
      expect(parseLimit('10.5')).toBe(10);
    });

    it('rejects zero and negatives', () => {
      expect(parseLimit(0)).toBe(20);
      expect(parseLimit(-1)).toBe(20);
    });
  });

  describe('paginateQuery', () => {
    it('returns first page with nextCursor when more items exist', async () => {
      // Simulates limit=3, returns 4 items (3 + 1 extra to detect next page)
      mockPrisma.findMany.mockResolvedValue([
        { id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' },
      ]);

      const result = await paginateQuery(createFindMany(), {}, 3, undefined);

      expect(result.items).toEqual([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
      expect(result.nextCursor).toBe('a3');
      expect(mockPrisma.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { id: 'asc' },
        take: 4, // limit + 1
        skip: 0,
        cursor: undefined,
      });
    });

    it('returns last page with null nextCursor', async () => {
      // Simulates limit=3, returns only 2 items (no extra)
      mockPrisma.findMany.mockResolvedValue([
        { id: 'a4' }, { id: 'a5' },
      ]);

      const result = await paginateQuery(createFindMany(), {}, 3, 'a3');

      expect(result.items).toEqual([{ id: 'a4' }, { id: 'a5' }]);
      expect(result.nextCursor).toBeNull();
      expect(mockPrisma.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { id: 'asc' },
        take: 4,
        skip: 1, // skip cursor
        cursor: { id: 'a3' },
      });
    });

    it('returns empty result when no items', async () => {
      mockPrisma.findMany.mockResolvedValue([]);

      const result = await paginateQuery(createFindMany(), {}, 10, undefined);

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('passes where clause through', async () => {
      mockPrisma.findMany.mockResolvedValue([{ id: 'x1' }]);

      await paginateQuery(createFindMany(), { organizationId: 'org-1' }, 10, undefined);

      expect(mockPrisma.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('respects custom orderBy', async () => {
      mockPrisma.findMany.mockResolvedValue([{ id: 'z1' }]);

      await paginateQuery(createFindMany(), {}, 10, undefined, { id: 'desc' });

      expect(mockPrisma.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'desc' } }),
      );
    });
  });

  describe('Full pagination flow: 25 items, limit=10', () => {
    // Simulates the full 3-page fetch cycle without a real DB
    // by counting calls and tracking cursor values
    it('pages through 25 items in 3 requests with no overlap', async () => {
      const allItems = Array.from({ length: 25 }, (_, i) => ({
        id: `item-${String(i + 1).padStart(2, '0')}`,
        name: `Item ${i + 1}`,
      }));

      // Track which items the mock returns based on cursor
      mockPrisma.findMany.mockImplementation((args: any) => {
        const cursorIdx = args.cursor
          ? allItems.findIndex((i) => i.id === args.cursor.id) + 1
          : 0;
        const limit = args.take - 1; // take is limit+1
        return Promise.resolve(allItems.slice(cursorIdx, cursorIdx + limit + 1));
      });

      // Page 1
      const page1 = await paginateQuery(createFindMany(), {}, 10, undefined);
      expect(page1.items).toHaveLength(10);
      expect(page1.items[0].id).toBe('item-01');
      expect(page1.items[9].id).toBe('item-10');
      expect(page1.nextCursor).toBe('item-10');

      // Page 2 — no overlap with page 1
      const page2 = await paginateQuery(createFindMany(), {}, 10, page1.nextCursor!);
      expect(page2.items).toHaveLength(10);
      expect(page2.items[0].id).toBe('item-11');
      expect(page2.items[9].id).toBe('item-20');
      expect(page2.nextCursor).toBe('item-20');

      // Verify no overlap
      const page1Ids = new Set(page1.items.map((i) => i.id));
      const page2Ids = new Set(page2.items.map((i) => i.id));
      const overlap = [...page1Ids].filter((id) => page2Ids.has(id));
      expect(overlap).toEqual([]);

      // Page 3 — remaining 5 items, nextCursor null
      const page3 = await paginateQuery(createFindMany(), {}, 10, page2.nextCursor!);
      expect(page3.items).toHaveLength(5);
      expect(page3.items[0].id).toBe('item-21');
      expect(page3.items[4].id).toBe('item-25');
      expect(page3.nextCursor).toBeNull();

      // Verify no overlap across all pages
      const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
      expect(new Set(allIds).size).toBe(25);
    });

    it('limit=1000 gets clamped to 100, not honored as-is', async () => {
      // 25 items, limit=1000 (clamped to 100)
      const allItems = Array.from({ length: 25 }, (_, i) => ({
        id: `item-${String(i + 1).padStart(2, '0')}`,
      }));

      mockPrisma.findMany.mockImplementation((args: any) => {
        const limit = args.take - 1;
        return Promise.resolve(allItems.slice(0, limit + 1));
      });

      const result = await paginateQuery(createFindMany(), {}, parseLimit(1000), undefined);

      // parseLimit(1000) = 100, so take=101
      expect(mockPrisma.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 101 }),
      );

      // Only 25 items exist, so all returned in one page
      expect(result.items).toHaveLength(25);
      expect(result.nextCursor).toBeNull();
    });
  });
});
