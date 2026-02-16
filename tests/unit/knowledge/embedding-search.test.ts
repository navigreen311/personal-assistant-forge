import { semanticSearch } from '@/modules/knowledge/services/search-service';
import type { KnowledgeEntry } from '@/shared/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;
const mockGenerateJSON = generateJSON as jest.Mock;

function makeEntry(overrides: Partial<KnowledgeEntry> & { title?: string; body?: string } = {}): KnowledgeEntry {
  const title = overrides.title || 'Test Title';
  const body = overrides.body || 'Test content for this entry';
  return {
    id: overrides.id || 'entry-1',
    content: JSON.stringify({ type: 'NOTE', title, body, autoTags: [] }),
    tags: overrides.tags || [],
    entityId: overrides.entityId || 'entity-1',
    source: overrides.source || 'manual',
    linkedEntities: overrides.linkedEntities || [],
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
  };
}

describe('semanticSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return keyword results when query is empty', async () => {
    mockFindMany.mockResolvedValue([
      makeEntry({ id: '1' }),
      makeEntry({ id: '2' }),
    ]);

    const result = await semanticSearch({ entityId: 'entity-1', query: '' });

    expect(result.results.length).toBe(2);
    // generateJSON should only be called for expandQueryWithAI (not for re-ranking)
    // With empty query, expandQueryWithAI is skipped, so no AI re-ranking either
    expect(result.total).toBe(2);
  });

  it('should call AI to re-rank results and return re-ranked order', async () => {
    const now = new Date();
    // All entries match "react" in the body so keyword relevance is equal
    mockFindMany.mockResolvedValue([
      makeEntry({ id: '1', title: 'Alpha guide', body: 'Guide about react development basics', tags: [], updatedAt: now }),
      makeEntry({ id: '2', title: 'Beta guide', body: 'Another react tutorial for developers', tags: [], updatedAt: now }),
      makeEntry({ id: '3', title: 'Gamma guide', body: 'Deep react patterns and best practices', tags: [], updatedAt: now }),
    ]);

    // First call: expandQueryWithAI — return same query to keep scoring equal
    mockGenerateJSON.mockResolvedValueOnce({ expandedQuery: 'react' });
    // Second call: re-ranking — AI wants Gamma first, then Alpha, then Beta
    mockGenerateJSON.mockResolvedValueOnce({ rankedIds: [2, 0, 1] });

    const result = await semanticSearch({ entityId: 'entity-1', query: 'react' });

    expect(result.results.length).toBe(3);
    // AI was called twice: once for query expansion, once for re-ranking
    expect(mockGenerateJSON).toHaveBeenCalledTimes(2);
    // Second call should be the re-ranking call
    const reRankCall = mockGenerateJSON.mock.calls[1][0];
    expect(reRankCall).toContain('Re-rank');
    expect(reRankCall).toContain('react');

    // Verify the re-ranked order: AI said [2, 0, 1] so Gamma, Alpha, Beta
    expect(result.results[0].entry.title).toBe('Gamma guide');
    expect(result.results[1].entry.title).toBe('Alpha guide');
    expect(result.results[2].entry.title).toBe('Beta guide');
  });

  it('should fall back to keyword results when AI re-ranking fails', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks are powerful', tags: ['react', 'hooks'], updatedAt: now }),
      makeEntry({ id: '2', title: 'General programming tips', body: 'Some tips about coding', tags: ['tips'], updatedAt: now }),
    ]);

    // expandQueryWithAI succeeds
    mockGenerateJSON.mockResolvedValueOnce({ expandedQuery: 'react hooks components' });
    // re-ranking fails
    mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    const result = await semanticSearch({ entityId: 'entity-1', query: 'react' });

    // Should still return results (keyword-based)
    expect(result.results.length).toBeGreaterThan(0);
    // Results should be in keyword relevance order (React entry first)
    expect(result.results[0].entry.title).toBe('React hooks guide');
  });

  it('should handle zero results gracefully', async () => {
    mockFindMany.mockResolvedValue([]);
    // expandQueryWithAI won't even be called meaningfully with no entries
    mockGenerateJSON.mockResolvedValueOnce({ expandedQuery: 'nonexistent query terms' });

    const result = await semanticSearch({ entityId: 'entity-1', query: 'nonexistent' });

    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should handle AI returning invalid rankedIds gracefully', async () => {
    const now = new Date();
    mockFindMany.mockResolvedValue([
      makeEntry({ id: '1', title: 'React hooks', body: 'React hooks content', tags: ['react'], updatedAt: now }),
    ]);

    mockGenerateJSON.mockResolvedValueOnce({ expandedQuery: 'react hooks' });
    // AI returns object without rankedIds
    mockGenerateJSON.mockResolvedValueOnce({ something: 'else' });

    const result = await semanticSearch({ entityId: 'entity-1', query: 'react' });

    // Should fall back to keyword results
    expect(result.results.length).toBe(1);
    expect(result.results[0].entry.title).toBe('React hooks');
  });
});
