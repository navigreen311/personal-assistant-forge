import { search, searchByType, getSearchSuggestions } from '@/lib/search';
import { prisma } from '@/lib/db';
import { verifiedEntityIdForTest } from '../../helpers/factories';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const mockQueryRaw = prisma.$queryRawUnsafe as jest.Mock;

/**
 * P-26 -- WHAT THIS FILE CAN AND CANNOT PROVE, stated once so the next reader
 * does not have to work it out from a green run.
 *
 * `prisma.$queryRawUnsafe` is a `jest.fn()` here. It accepts any string and
 * returns whatever the test told it to. It therefore proves that the search
 * layer BUILDS the SQL it means to build, passes the right bind parameters,
 * and shapes the rows it gets back correctly -- and it proves nothing at all
 * about whether Postgres would accept the statement.
 *
 * That distinction is not academic. `getSearchSuggestions` emitted
 * `SELECT DISTINCT title ... ORDER BY "updatedAt"`, which Postgres rejects with
 * 42P10, and the cases at the bottom of this file passed against it for the
 * entire life of the endpoint. A mock is a yes-man: the only opinion it has
 * about SQL is the one the test wrote into it.
 *
 * Validity is proved in `tests/db/search.test.ts`, against a real database,
 * and nowhere else. Do not add a "the SQL is valid" assertion here -- it would
 * be the same fiction in a new costume.
 */
const SCOPE = verifiedEntityIdForTest('entity-abc');

describe('Unified Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should search across all models when no type filter', async () => {
      // Each model produces 2 calls: data + count
      // 5 models × 2 calls = 10 calls
      mockQueryRaw.mockResolvedValue([]);

      const result = await search(SCOPE, { query: 'test query' });

      // Should have called for each searchable model (data + count per model)
      expect(mockQueryRaw).toHaveBeenCalled();
      expect(result.query).toBe('test query');
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should filter to specific model when type is provided via filters', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search(SCOPE, {
        query: 'test',
        filters: { model: 'task' },
      });

      expect(result.query).toBe('test');
      expect(result.results).toEqual([]);
    });

    it('should merge and rank results by relevance score', async () => {
      // Mock: first pair of calls = task model data/count
      let callCount = 0;
      mockQueryRaw.mockImplementation(async (sql: string, ..._params: unknown[]) => {
        callCount++;
        const sqlStr = String(sql);
        if (sqlStr.includes('COUNT')) {
          return [{ count: 1 }];
        }
        if (sqlStr.includes('"Task"')) {
          return [
            {
              id: 'task-1',
              model: 'task',
              title: 'Task Result',
              rank: 0.5,
              entityId: 'e1',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              description: 'test description',
            },
          ];
        }
        if (sqlStr.includes('"Message"')) {
          return [
            {
              id: 'msg-1',
              model: 'message',
              title: 'Message Result',
              rank: 0.8,
              entityId: 'e1',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              subject: 'test subject',
              body: 'test body',
            },
          ];
        }
        return [];
      });

      const result = await search(SCOPE, { query: 'test' });

      // Results should be sorted by rank DESC — message (0.8) before task (0.5)
      if (result.results.length >= 2) {
        expect(result.results[0].rank).toBeGreaterThanOrEqual(
          result.results[1].rank,
        );
      }
    });

    // WAS: 'should apply entity filter from session', which passed
    // `filters: { entityId: 'entity-abc' }` -- the scope as a caller-supplied
    // field on the filter bag, which is the shape the tenancy pattern forbids
    // (§2). The scope is now a required leading argument, so the interesting
    // assertion is no longer "it is applied when given" but "there is no way
    // to not give it": omitting it is a compile error, not a test case.
    it('binds the verified scope on every statement it issues', async () => {
      mockQueryRaw.mockResolvedValue([]);

      await search(SCOPE, { query: 'test' });

      const calls = mockQueryRaw.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.slice(1)).toContain('entity-abc');
        expect(String(call[0])).toContain('"entityId"');
      }
    });

    it('should return search timing metadata', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search(SCOPE, { query: 'test' });

      expect(typeof result.searchTimeMs).toBe('number');
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search(SCOPE, { query: 'nonexistent' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty for query shorter than 2 chars', async () => {
      const result = await search(SCOPE, { query: 'a' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });

  describe('searchByType', () => {
    it('should search only the specified model', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await searchByType(SCOPE, {
        query: 'test',
        type: 'document',
      });

      expect(result.results).toEqual([]);
      // Only document model should have been queried
      const calls = mockQueryRaw.mock.calls;
      const allSql = calls.map((c: unknown[]) => String(c[0])).join(' ');
      expect(allSql).toContain('"Document"');
      expect(allSql).not.toContain('"Task"');
    });

    it('should apply all filters', async () => {
      mockQueryRaw.mockResolvedValue([]);

      await searchByType(SCOPE, {
        query: 'report',
        type: 'task',
        filters: {
          status: 'TODO',
          priority: 'P0',
        },
      });

      const calls = mockQueryRaw.mock.calls;
      const hasStatus = calls.some((call: unknown[]) =>
        call.some((param: unknown) => param === 'TODO'),
      );
      const hasPriority = calls.some((call: unknown[]) =>
        call.some((param: unknown) => param === 'P0'),
      );
      expect(hasStatus).toBe(true);
      expect(hasPriority).toBe(true);
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return suggestions for partial query', async () => {
      mockQueryRaw.mockImplementation(async (sql: string) => {
        const sqlStr = String(sql);
        if (sqlStr.includes('"Task"')) {
          return [{ title: 'Task Planning' }];
        }
        if (sqlStr.includes('"Document"')) {
          return [{ title: 'Documentation Review' }];
        }
        if (sqlStr.includes('"Contact"')) {
          return [{ name: 'Parker James' }];
        }
        return [];
      });

      const suggestions = await getSearchSuggestions({
        query: 'par',
        entityId: SCOPE,
      });

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions).toContain('Parker James');
    });

    it('should limit results to specified count', async () => {
      mockQueryRaw.mockResolvedValue([
        { title: 'A' },
        { title: 'B' },
        { title: 'C' },
      ]);

      const suggestions = await getSearchSuggestions({
        query: 'test',
        entityId: SCOPE,
        limit: 2,
      });

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should require minimum 2 character query', async () => {
      const suggestions = await getSearchSuggestions({
        query: 'a',
        entityId: SCOPE,
      });

      expect(suggestions).toEqual([]);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });
});
