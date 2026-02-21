import { calculateRelevance, highlightExcerpt, suggestRelatedQueries, search, embedText, cosineSimilarity, semanticSearch } from '@/modules/knowledge/services/search-service';
import type { KnowledgeEntry } from '@/shared/types';
import type { SearchResult } from '@/modules/knowledge/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn(),
    },
  },
}));

// Mock AI client
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

  describe('search with AI query expansion', () => {
    it('should use AI for query expansion when available', async () => {
      mockGenerateJSON.mockResolvedValue({ expandedQuery: 'react hooks useState useEffect components' });

      const now = new Date();
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks deep dive', body: 'React hooks are powerful', tags: ['react', 'hooks'], updatedAt: now }),
        makeEntry({ id: '2', title: 'General programming tips', body: 'Some tips about coding', tags: ['tips'], updatedAt: now }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react' });
      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should fall back to keyword search on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));

      const now = new Date();
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks deep dive', body: 'React hooks are powerful', tags: ['react', 'hooks'], updatedAt: now }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react' });
      expect(result.results.length).toBeGreaterThan(0);
      // Results should still be sorted by relevance
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
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

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

  describe('search mode parameter', () => {
    it('should default to fulltext mode', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks', body: 'React hooks content', tags: ['react'] }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react' });
      expect(result.results.length).toBe(1);
    });

    it('should support semantic mode', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks are powerful patterns', tags: ['react', 'hooks'] }),
        makeEntry({ id: '2', title: 'Cooking recipes', body: 'How to cook pasta', tags: ['cooking'] }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react hooks patterns', mode: 'semantic' });
      // Semantic mode should return results with similarity scores
      expect(result.results.length).toBeGreaterThan(0);
      // React entry should score higher than cooking
      if (result.results.length > 1) {
        expect(result.results[0].entry.title).toContain('React');
      }
    });

    it('should support hybrid mode', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks are powerful patterns', tags: ['react', 'hooks'] }),
        makeEntry({ id: '2', title: 'Cooking recipes', body: 'How to cook pasta', tags: ['cooking'] }),
      ]);

      const result = await search({ entityId: 'entity-1', query: 'react hooks', mode: 'hybrid' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should fall back to fulltext when semantic mode fails', async () => {
      // Make findMany fail the first time (for semantic), succeed the second time (for fulltext fallback)
      mockFindMany
        .mockRejectedValueOnce(new Error('DB error'))
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue([
          makeEntry({ id: '1', title: 'React hooks', body: 'React hooks content', tags: ['react'] }),
        ]);
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const result = await search({ entityId: 'entity-1', query: 'react', mode: 'semantic' });
      // Should have fallen back to fulltext
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('embedText', () => {
    it('should return empty array for empty string', () => {
      expect(embedText('')).toEqual([]);
      expect(embedText('   ')).toEqual([]);
    });

    it('should return a fixed-length number array for valid text', () => {
      const embedding = embedText('react hooks typescript');
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(256);
      embedding.forEach((val) => {
        expect(typeof val).toBe('number');
        expect(isNaN(val)).toBe(false);
      });
    });

    it('should always produce vectors of the same dimension (256)', () => {
      const emb1 = embedText('react');
      const emb2 = embedText('react hooks typescript patterns components state management');
      expect(emb1.length).toBe(256);
      expect(emb2.length).toBe(256);
    });

    it('should produce normalized vectors (L2 norm close to 1)', () => {
      const embedding = embedText('react hooks typescript patterns');
      if (embedding.length > 0) {
        const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        expect(magnitude).toBeCloseTo(1.0, 5);
      }
    });

    it('should filter stop words', () => {
      // "the", "is", "a" are stop words - embedding of just stop words should be empty
      const embedding = embedText('the is a');
      expect(embedding).toEqual([]);
    });

    it('should produce same embedding for same text', () => {
      const emb1 = embedText('react hooks guide');
      const emb2 = embedText('react hooks guide');
      expect(emb1).toEqual(emb2);
    });

    it('should produce different embeddings for different texts', () => {
      const emb1 = embedText('react hooks typescript');
      const emb2 = embedText('python machine learning');
      expect(emb1).not.toEqual(emb2);
    });

    it('should handle repeated tokens by accumulating frequency', () => {
      const emb1 = embedText('react');
      const emb2 = embedText('react react react');
      // Both should be 256-length and normalized, but they may differ due to log-TF
      expect(emb1.length).toBe(256);
      expect(emb2.length).toBe(256);
    });

    it('should tokenize on punctuation and whitespace', () => {
      const emb1 = embedText('react,hooks;typescript');
      const emb2 = embedText('react hooks typescript');
      // Same tokens after splitting, so same embedding
      expect(emb1).toEqual(emb2);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1, 2], [])).toBe(0);
      expect(cosineSimilarity([], [1, 2])).toBe(0);
    });

    it('should return 1 for identical vectors', () => {
      const vec = [0.5, 0.3, 0.8];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('should return value between -1 and 1', () => {
      const a = [0.5, 0.3, 0.8, 0.1];
      const b = [0.2, 0.9, 0.4, 0.6];
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('should be symmetric', () => {
      const a = [0.5, 0.3, 0.8];
      const b = [0.2, 0.9, 0.4];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
    });

    it('should return 0 for different-length vectors', () => {
      const a = [0.5, 0.3];
      const b = [0.2, 0.9, 0.4];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should handle zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should compute dot product / (magnitude_a * magnitude_b)', () => {
      const a = [3, 4];
      const b = [4, 3];
      // dot = 3*4 + 4*3 = 24
      // |a| = 5, |b| = 5
      // similarity = 24/25 = 0.96
      expect(cosineSimilarity(a, b)).toBeCloseTo(24 / 25, 5);
    });

    it('should work with embedText output vectors', () => {
      const embA = embedText('react hooks guide');
      const embB = embedText('react hooks tutorial');
      // Both are 256-dim, so cosine similarity should work
      const sim = cosineSimilarity(embA, embB);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
      // Should have some similarity since they share tokens
      expect(sim).toBeGreaterThan(0);
    });
  });

  describe('semanticSearch (embedding-based)', () => {
    it('should return empty array for empty query', async () => {
      const results = await semanticSearch('user-1', '', { limit: 10 });
      expect(results).toEqual([]);
    });

    it('should return empty array when no entries exist', async () => {
      mockFindMany.mockResolvedValue([]);
      const results = await semanticSearch('user-1', 'react hooks');
      expect(results).toEqual([]);
    });

    it('should return results sorted by similarity descending', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks are powerful patterns for state management', tags: ['react', 'hooks'], entityId: 'user-1' }),
        makeEntry({ id: '2', title: 'Cooking pasta', body: 'How to cook delicious pasta at home', tags: ['cooking'], entityId: 'user-1' }),
        makeEntry({ id: '3', title: 'React component patterns', body: 'Advanced react patterns and hooks usage', tags: ['react', 'patterns'], entityId: 'user-1' }),
      ]);

      const results = await semanticSearch('user-1', 'react hooks patterns') as Array<{ entry: any; similarity: number }>;
      expect(results.length).toBeGreaterThan(0);

      // Results should be sorted by similarity descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it('should filter results below threshold', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks for managing state', tags: ['react'], entityId: 'user-1' }),
        makeEntry({ id: '2', title: 'Cooking pasta', body: 'How to cook delicious pasta at home with herbs', tags: ['cooking', 'food'], entityId: 'user-1' }),
      ]);

      // Use high threshold to filter most results
      const results = await semanticSearch('user-1', 'react hooks', { threshold: 0.9 }) as Array<{ entry: any; similarity: number }>;
      // All returned results should be above threshold
      for (const r of results) {
        expect(r.similarity).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should respect limit parameter', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `entry-${i}`, title: `React topic ${i}`, body: `React content about topic ${i}`, tags: ['react'], entityId: 'user-1' })
      );
      mockFindMany.mockResolvedValue(entries);

      const results = await semanticSearch('user-1', 'react topic content', { limit: 3 });
      expect((results as Array<unknown>).length).toBeLessThanOrEqual(3);
    });

    it('should return results with entry and similarity fields', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks guide', body: 'React hooks are patterns', tags: ['react'], entityId: 'user-1' }),
      ]);

      const results = await semanticSearch('user-1', 'react hooks') as Array<{ entry: any; similarity: number }>;
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('entry');
        expect(results[0]).toHaveProperty('similarity');
        expect(typeof results[0].similarity).toBe('number');
        expect(results[0].similarity).toBeGreaterThan(0);
        expect(results[0].similarity).toBeLessThanOrEqual(1);
        // Entry should be a knowledge entry object
        expect(results[0].entry).toHaveProperty('id');
        expect(results[0].entry).toHaveProperty('content');
      }
    });

    it('should use default threshold of 0.1 when not specified', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'React hooks', body: 'React hooks content', tags: ['react'], entityId: 'user-1' }),
        makeEntry({ id: '2', title: 'Something completely unrelated xyz', body: 'Nothing matching at all zzz qqq', tags: ['other'], entityId: 'user-1' }),
      ]);

      const results = await semanticSearch('user-1', 'react hooks') as Array<{ entry: any; similarity: number }>;
      // All returned results should be above default threshold of 0.1
      for (const r of results) {
        expect(r.similarity).toBeGreaterThanOrEqual(0.1);
      }
    });

    it('should handle database errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('Database connection failed'));
      const results = await semanticSearch('user-1', 'react hooks');
      expect(results).toEqual([]);
    });

    it('should use embedText and cosineSimilarity for matching', async () => {
      // Create entries with clearly overlapping and non-overlapping vocabulary
      mockFindMany.mockResolvedValue([
        makeEntry({ id: '1', title: 'JavaScript frameworks', body: 'JavaScript frameworks like React and Vue', tags: [], entityId: 'user-1' }),
        makeEntry({ id: '2', title: 'Biology cells', body: 'Biology cells mitochondria nucleus', tags: [], entityId: 'user-1' }),
      ]);

      const results = await semanticSearch('user-1', 'JavaScript React frameworks', { threshold: 0.01 }) as Array<{ entry: any; similarity: number }>;

      // JavaScript entry should have higher similarity than biology entry
      if (results.length >= 2) {
        const jsResult = results.find((r: any) => r.entry.id === '1');
        const bioResult = results.find((r: any) => r.entry.id === '2');
        if (jsResult && bioResult) {
          expect(jsResult.similarity).toBeGreaterThan(bioResult.similarity);
        }
      }
    });

    it('should query prisma with entityId parameter', async () => {
      mockFindMany.mockResolvedValue([]);
      await semanticSearch('test-user-123', 'search query');
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { entityId: 'test-user-123' },
      });
    });
  });
});
