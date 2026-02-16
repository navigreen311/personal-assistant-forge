import { calculateRelevance, highlightExcerpt, suggestRelatedQueries, search } from '@/modules/knowledge/services/search-service';
import type { KnowledgeEntry } from '@/shared/types';
import type { SearchResult } from '@/modules/knowledge/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;

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

describe('search-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRelevance', () => {
    it('should return 0 for empty query', () => {
      const entry = makeEntry();
      expect(calculateRelevance('', entry)).toBe(0);
      expect(calculateRelevance('   ', entry)).toBe(0);
    });

    it('should weight title matches higher than content', () => {
      const entry = makeEntry({ title: 'react hooks guide', body: 'some other content' });
      const titleScore = calculateRelevance('react', entry);

      const entry2 = makeEntry({ title: 'general guide', body: 'about react development' });
      const contentScore = calculateRelevance('react', entry2);

      expect(titleScore).toBeGreaterThan(contentScore);
    });

    it('should weight tag matches higher than content', () => {
      const entry = makeEntry({ tags: ['react'], body: 'no matching content here' });
      const tagScore = calculateRelevance('react', entry);

      const entry2 = makeEntry({ tags: [], body: 'about react development' });
      const contentScore = calculateRelevance('react', entry2);

      expect(tagScore).toBeGreaterThan(contentScore);
    });

    it('should return score between 0 and 1', () => {
      const entry = makeEntry({ title: 'react typescript', tags: ['react'], body: 'react hooks' });
      const score = calculateRelevance('react', entry);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should boost recent entries', () => {
      const recentEntry = makeEntry({ updatedAt: new Date() });
      const oldEntry = makeEntry({ updatedAt: new Date('2020-01-01') });

      const recentScore = calculateRelevance('test', recentEntry);
      const oldScore = calculateRelevance('test', oldEntry);

      expect(recentScore).toBeGreaterThanOrEqual(oldScore);
    });
  });

  describe('highlightExcerpt', () => {
    it('should extract snippet around first match', () => {
      const content = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. React is a great framework for building user interfaces.';
      const excerpt = highlightExcerpt(content, 'React', 30);
      expect(excerpt).toContain('React');
    });

    it('should return beginning of content when no match', () => {
      const content = 'Some content that does not match';
      const excerpt = highlightExcerpt(content, 'xyz', 50);
      expect(excerpt).toBe(content.substring(0, 100));
    });

    it('should add ellipsis for truncated excerpts', () => {
      const content = 'A'.repeat(50) + ' react ' + 'B'.repeat(50);
      const excerpt = highlightExcerpt(content, 'react', 20);
      expect(excerpt).toContain('...');
    });

    it('should handle empty content', () => {
      const excerpt = highlightExcerpt('', 'test', 50);
      expect(excerpt).toBe('');
    });
  });

  describe('suggestRelatedQueries', () => {
    it('should suggest queries based on tags from results', () => {
      const results: SearchResult[] = [
        {
          entry: {
            id: '1', entityId: 'e1', type: 'NOTE', title: 'React Guide', content: 'content',
            source: 'manual', tags: ['react', 'typescript', 'hooks'], autoTags: [], linkedEntries: [],
            createdAt: new Date(), updatedAt: new Date(),
          },
          relevanceScore: 0.8, matchedFields: ['title'], highlightedExcerpt: '...',
        },
      ];

      const suggestions = suggestRelatedQueries('react', results);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should not suggest the original query terms', () => {
      const results: SearchResult[] = [
        {
          entry: {
            id: '1', entityId: 'e1', type: 'NOTE', title: 'React Guide', content: 'content',
            source: 'manual', tags: ['react', 'typescript'], autoTags: [], linkedEntries: [],
            createdAt: new Date(), updatedAt: new Date(),
          },
          relevanceScore: 0.8, matchedFields: ['title'], highlightedExcerpt: '...',
        },
      ];

      const suggestions = suggestRelatedQueries('react', results);
      const hasReactOnly = suggestions.some((s) => s === 'react');
      expect(hasReactOnly).toBe(false);
    });
  });

  describe('search', () => {
    it('should return results sorted by relevance', async () => {
      const now = new Date();
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks deep dive', body: 'React hooks are powerful', tags: ['react', 'hooks'], updatedAt: now }),
        makeEntry({ id: '2', title: 'General programming tips', body: 'Some tips about coding', tags: ['tips'], updatedAt: now }),
        makeEntry({ id: '3', title: 'Advanced react patterns', body: 'React patterns for scale', tags: ['react', 'patterns'], updatedAt: now }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react' });

      expect(result.results.length).toBeGreaterThan(0);
      // All results with positive scores should be sorted descending
      for (let i = 1; i < result.results.length; i++) {
        expect(result.results[i - 1].relevanceScore).toBeGreaterThanOrEqual(result.results[i].relevanceScore);
      }
    });

    it('should handle empty query by returning all entries', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1' }),
        makeEntry({ id: '2' }),
      ]);

      const result = await search({ entityId: 'entity-1', query: '' });
      expect(result.results.length).toBe(2);
    });

    it('should paginate results', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `entry-${i}`, title: `React entry ${i}`, body: `React content ${i}` })
      );
      mockFindMany.mockResolvedValue(entries);

      const result = await search({ entityId: 'entity-1', query: 'react', page: 1, pageSize: 3 });
      expect(result.results.length).toBe(3);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(3);
    });
  });
});
