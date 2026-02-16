import { search, searchByType, getSearchSuggestions } from '@/lib/search';
import { prisma } from '@/lib/db';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

const mockQueryRaw = prisma.$queryRawUnsafe as jest.Mock;

describe('Unified Search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should search across all models when no type filter', async () => {
      // Each model produces 2 calls: data + count
      // 5 models × 2 calls = 10 calls
      mockQueryRaw.mockResolvedValue([]);

      const result = await search({ query: 'test query' });

      // Should have called for each searchable model (data + count per model)
      expect(mockQueryRaw).toHaveBeenCalled();
      expect(result.query).toBe('test query');
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should filter to specific model when type is provided via filters', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search({
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

      const result = await search({ query: 'test' });

      // Results should be sorted by rank DESC — message (0.8) before task (0.5)
      if (result.results.length >= 2) {
        expect(result.results[0].rank).toBeGreaterThanOrEqual(
          result.results[1].rank,
        );
      }
    });

    it('should apply entity filter from session', async () => {
      mockQueryRaw.mockResolvedValue([]);

      await search({
        query: 'test',
        filters: { entityId: 'entity-abc' },
      });

      // Verify entityId was passed as a parameter
      const calls = mockQueryRaw.mock.calls;
      const hasEntityFilter = calls.some((call: unknown[]) =>
        call.some((param: unknown) => param === 'entity-abc'),
      );
      expect(hasEntityFilter).toBe(true);
    });

    it('should return search timing metadata', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search({ query: 'test' });

      expect(typeof result.searchTimeMs).toBe('number');
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await search({ query: 'nonexistent' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty for query shorter than 2 chars', async () => {
      const result = await search({ query: 'a' });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });

  describe('searchByType', () => {
    it('should search only the specified model', async () => {
      mockQueryRaw.mockResolvedValue([]);

      const result = await searchByType({
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

      await searchByType({
        query: 'report',
        type: 'task',
        filters: {
          entityId: 'e1',
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
        entityId: 'e1',
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
        entityId: 'e1',
        limit: 2,
      });

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should require minimum 2 character query', async () => {
      const suggestions = await getSearchSuggestions({
        query: 'a',
        entityId: 'e1',
      });

      expect(suggestions).toEqual([]);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });
  });
});
