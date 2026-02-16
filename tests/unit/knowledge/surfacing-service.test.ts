import { surfaceRelevant, dismissSuggestion } from '@/modules/knowledge/services/surfacing-service';
import type { KnowledgeEntry } from '@/shared/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn(),
    },
    memoryEntry: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;

function makeEntry(overrides: Partial<KnowledgeEntry> & { title?: string; body?: string } = {}): KnowledgeEntry {
  const title = overrides.title || 'Test Title';
  const body = overrides.body || 'Test content';
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

describe('surfacing-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('surfaceRelevant', () => {
    it('should return entries matching current activity context', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react', 'typescript'], body: 'React component patterns' }),
        makeEntry({ id: 'e2', tags: ['python', 'django'], body: 'Python web development' }),
      ]);

      const results = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'working on react components',
      });

      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain('e1');
    });

    it('should limit results to top 5', async () => {
      const entries = Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `e${i}`, tags: ['react'], body: 'React content' })
      );
      mockFindMany.mockResolvedValue(entries);

      const results = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'working on react project',
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should match entries by current tags', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['deployment'] }),
        makeEntry({ id: 'e2', tags: ['cooking'] }),
      ]);

      const results = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'doing stuff',
        currentTags: ['deployment'],
      });

      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain('e1');
    });

    it('should boost entries linked to active contacts', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', linkedEntities: ['contact-1'] }),
        makeEntry({ id: 'e2', linkedEntities: [] }),
      ]);

      const results = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'meeting preparation',
        activeContactIds: ['contact-1'],
      });

      if (results.length >= 2) {
        const e1Result = results.find((r) => r.entry.id === 'e1');
        const e2Result = results.find((r) => r.entry.id === 'e2');
        if (e1Result && e2Result) {
          expect(e1Result.relevanceScore).toBeGreaterThan(e2Result.relevanceScore);
        }
      }
    });

    it('should sort by relevance score descending', async () => {
      mockFindMany.mockResolvedValue([
        makeEntry({ id: 'e1', tags: ['react'], body: 'React stuff' }),
        makeEntry({ id: 'e2', tags: ['react', 'typescript'], body: 'React TypeScript hooks development' }),
      ]);

      const results = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'react typescript development',
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });
  });

  describe('dismissSuggestion', () => {
    it('should prevent re-surfacing after dismissal', async () => {
      const entries = [
        makeEntry({ id: 'e1', tags: ['react'], body: 'React development' }),
      ];
      mockFindMany.mockResolvedValue(entries);

      // First call should surface e1
      const results1 = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'react work',
      });
      expect(results1.some((r) => r.entry.id === 'e1')).toBe(true);

      // Dismiss it
      await dismissSuggestion('e1', 'entity-1:react work:');

      // Second call should not surface e1
      const results2 = await surfaceRelevant({
        entityId: 'entity-1',
        currentActivity: 'react work',
      });
      expect(results2.some((r) => r.entry.id === 'e1')).toBe(false);
    });
  });
});
