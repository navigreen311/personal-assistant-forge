import { calculateLinkConfidence, suggestLinks, applyLink, removeLink } from '@/modules/knowledge/services/auto-linker';
import type { KnowledgeEntry } from '@/shared/types';

// tenancy-pattern.md sec.8 trap 1: the service now scopes its reads with
// findFirst and its writes with updateMany. A mock that only defines
// findUnique/update would return undefined and fail silently, so both are
// aliased onto the same jest.fn.
jest.mock('@/lib/db', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  return {
    prisma: {
      knowledgeEntry: {
        findUnique,
        findFirst: (...a: unknown[]) => findUnique(...a),
        findMany: jest.fn(),
        update,
        updateMany: (...a: unknown[]) => update(...a),
      },
    },
  };
});

import { prisma } from '@/lib/db';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const mockFindUnique = prisma.knowledgeEntry.findUnique as jest.Mock;
const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;
const mockUpdate = prisma.knowledgeEntry.update as jest.Mock;

const ENTITY_1 = verifiedEntityIdForTest('entity-1');

function makeEntry(overrides: Partial<KnowledgeEntry> & { title?: string; body?: string }): KnowledgeEntry {
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

describe('auto-linker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateLinkConfidence', () => {
    it('should return higher confidence for entries with shared tags', () => {
      const source = makeEntry({ tags: ['react', 'typescript', 'hooks'] });
      const target = makeEntry({ tags: ['react', 'typescript', 'patterns'] });
      const noTags = makeEntry({ tags: [] });

      const withShared = calculateLinkConfidence(source, target);
      const withoutShared = calculateLinkConfidence(source, noTags);

      expect(withShared).toBeGreaterThan(withoutShared);
    });

    it('should apply correct weights (tags 0.3, keywords 0.5, entity 0.2)', () => {
      // Same entity, no shared tags, no shared keywords
      const source = makeEntry({ id: 's1', entityId: 'e1', tags: [], body: 'alpha' });
      const target = makeEntry({ id: 't1', entityId: 'e1', tags: [], body: 'beta' });

      const sameEntityScore = calculateLinkConfidence(source, target);
      // Same entity gives at most 0.2 score
      expect(sameEntityScore).toBeCloseTo(0.2, 1);
    });

    it('should return 0 for entries with nothing in common and different entities', () => {
      const source = makeEntry({ entityId: 'e1', tags: ['aaa'], body: 'unique1 content1' });
      const target = makeEntry({ entityId: 'e2', tags: ['zzz'], body: 'unique2 content2' });

      const score = calculateLinkConfidence(source, target);
      expect(score).toBeLessThan(0.1);
    });

    it('should return score between 0 and 1', () => {
      const source = makeEntry({ tags: ['a', 'b'], body: 'shared words here' });
      const target = makeEntry({ tags: ['a', 'b'], body: 'shared words here' });

      const score = calculateLinkConfidence(source, target);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should increase confidence with keyword overlap', () => {
      const source = makeEntry({ body: 'react typescript development framework' });
      const targetWithOverlap = makeEntry({ body: 'react typescript patterns' });
      const targetWithout = makeEntry({ body: 'cooking recipes food' });

      const withOverlap = calculateLinkConfidence(source, targetWithOverlap);
      const without = calculateLinkConfidence(source, targetWithout);

      expect(withOverlap).toBeGreaterThan(without);
    });
  });

  describe('suggestLinks', () => {
    it('should return suggestions sorted by confidence', async () => {
      const source = makeEntry({ id: 'source', tags: ['react', 'typescript'], body: 'React TypeScript hooks' });
      const candidate1 = makeEntry({ id: 'c1', tags: ['react'], body: 'React development' });
      const candidate2 = makeEntry({ id: 'c2', tags: ['react', 'typescript'], body: 'React TypeScript guide' });

      mockFindUnique.mockResolvedValue(source);
      mockFindMany.mockResolvedValue([candidate1, candidate2]);

      const suggestions = await suggestLinks('source', ENTITY_1);

      expect(suggestions.length).toBeGreaterThan(0);
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].confidence).toBeGreaterThanOrEqual(suggestions[i].confidence);
      }
    });

    it('should not suggest already-linked entries', async () => {
      const source = makeEntry({ id: 'source', linkedEntities: ['c1'] });
      const candidate1 = makeEntry({ id: 'c1' });

      mockFindUnique.mockResolvedValue(source);
      mockFindMany.mockResolvedValue([candidate1]);

      const suggestions = await suggestLinks('source', ENTITY_1);
      expect(suggestions.find((s) => s.targetId === 'c1')).toBeUndefined();
    });

    it('should return empty array for non-existent entry', async () => {
      mockFindUnique.mockResolvedValue(null);
      const suggestions = await suggestLinks('nonexistent', ENTITY_1);
      expect(suggestions).toEqual([]);
    });
  });

  describe('applyLink', () => {
    it('should add bidirectional link', async () => {
      const source = makeEntry({ id: 'source', linkedEntities: [] });
      const target = makeEntry({ id: 'target', linkedEntities: [] });

      mockFindUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      mockUpdate.mockResolvedValue({});

      await applyLink('source', 'target', ENTITY_1);

      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('should throw for non-existent source', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(applyLink('nonexistent', 'target', ENTITY_1)).rejects.toThrow();
    });

    /**
     * applyLink is bidirectional: it writes to the TARGET row too. Before the
     * target was scoped, naming another tenant's entry here edited that
     * tenant's row -- a cross-tenant write reached through a graph edge.
     */
    it("refuses a target outside the caller's entity, and writes nothing", async () => {
      const source = makeEntry({ id: 'source', linkedEntities: [] });
      mockFindUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null); // target not in scope

      await expect(applyLink('source', 'foreign', ENTITY_1)).rejects.toThrow('not found');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removeLink', () => {
    it('should remove bidirectional link', async () => {
      const source = makeEntry({ id: 'source', linkedEntities: ['target'] });
      const target = makeEntry({ id: 'target', linkedEntities: ['source'] });

      mockFindUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      mockUpdate.mockResolvedValue({});

      await removeLink('source', 'target', ENTITY_1);

      expect(mockUpdate).toHaveBeenCalledTimes(2);
      const firstCall = mockUpdate.mock.calls[0][0];
      expect(firstCall.data.linkedEntities).not.toContain('target');
    });
  });
});
