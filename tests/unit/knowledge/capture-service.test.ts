import { generateAutoTags, generateTitle, capture, batchCapture } from '@/modules/knowledge/services/capture-service';
import type { CaptureType } from '@/modules/knowledge/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockCreate = prisma.knowledgeEntry.create as jest.Mock;

describe('capture-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAutoTags', () => {
    it('should extract keywords from content', () => {
      const tags = generateAutoTags('TypeScript React development framework JavaScript');
      expect(tags).toContain('typescript');
      expect(tags).toContain('react');
      expect(tags).toContain('development');
      expect(tags).toContain('framework');
      expect(tags).toContain('javascript');
    });

    it('should filter stop words', () => {
      const tags = generateAutoTags('the quick brown fox jumped over the lazy dog');
      expect(tags).not.toContain('the');
      expect(tags).not.toContain('over');
      expect(tags).toContain('quick');
      expect(tags).toContain('brown');
    });

    it('should return empty array for empty content', () => {
      expect(generateAutoTags('')).toEqual([]);
      expect(generateAutoTags('   ')).toEqual([]);
    });

    it('should limit to max 8 tags', () => {
      const content = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike';
      const tags = generateAutoTags(content);
      expect(tags.length).toBeLessThanOrEqual(8);
    });

    it('should sort by frequency', () => {
      const tags = generateAutoTags('react react react typescript typescript javascript');
      expect(tags[0]).toBe('react');
      expect(tags[1]).toBe('typescript');
    });

    it('should filter short words (less than 3 chars)', () => {
      const tags = generateAutoTags('go is an ok language');
      expect(tags).not.toContain('go');
      expect(tags).not.toContain('is');
      expect(tags).not.toContain('an');
      expect(tags).not.toContain('ok');
    });
  });

  describe('generateTitle', () => {
    it('should extract first sentence up to 60 chars', () => {
      const title = generateTitle('This is a short title. And more content here.', 'NOTE');
      expect(title).toBe('This is a short title');
    });

    it('should truncate long first lines with ellipsis', () => {
      const longContent = 'A'.repeat(100);
      const title = generateTitle(longContent, 'NOTE');
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });

    it('should return "Untitled TYPE" for empty content', () => {
      expect(generateTitle('', 'NOTE')).toBe('Untitled NOTE');
      expect(generateTitle('   ', 'BOOKMARK')).toBe('Untitled BOOKMARK');
    });

    it('should use content before first newline', () => {
      const title = generateTitle('First line\nSecond line', 'NOTE');
      expect(title).toBe('First line');
    });
  });

  describe('capture', () => {
    it('should create a knowledge entry with auto-generated title and tags', async () => {
      const now = new Date();
      mockCreate.mockResolvedValue({
        id: 'test-id',
        content: JSON.stringify({
          type: 'NOTE',
          title: 'TypeScript best practices',
          body: 'TypeScript best practices for large codebases',
          autoTags: ['typescript', 'best', 'practices', 'large', 'codebases'],
        }),
        tags: ['typescript', 'best', 'practices', 'large', 'codebases'],
        entityId: 'entity-1',
        source: 'manual',
        linkedEntities: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await capture({
        entityId: 'entity-1',
        type: 'NOTE',
        content: 'TypeScript best practices for large codebases',
        source: 'manual',
      });

      expect(result.id).toBe('test-id');
      expect(result.type).toBe('NOTE');
      expect(result.title).toBe('TypeScript best practices');
      expect(result.autoTags.length).toBeGreaterThan(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should use provided title when given', async () => {
      const now = new Date();
      mockCreate.mockResolvedValue({
        id: 'test-id-2',
        content: JSON.stringify({
          type: 'BOOKMARK',
          title: 'My Custom Title',
          body: 'Some content',
          autoTags: ['content'],
        }),
        tags: ['dev', 'content'],
        entityId: 'entity-1',
        source: 'web-clip',
        linkedEntities: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await capture({
        entityId: 'entity-1',
        type: 'BOOKMARK',
        content: 'Some content',
        title: 'My Custom Title',
        source: 'web-clip',
        tags: ['dev'],
      });

      expect(result.title).toBe('My Custom Title');
    });

    it('should merge user tags with auto tags', async () => {
      const now = new Date();
      mockCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'test-id-3',
        content: data.content,
        tags: data.tags,
        entityId: data.entityId,
        source: data.source,
        linkedEntities: data.linkedEntities,
        createdAt: now,
        updatedAt: now,
      }));

      await capture({
        entityId: 'entity-1',
        type: 'NOTE',
        content: 'React hooks are powerful for state management',
        source: 'manual',
        tags: ['react', 'frontend'],
      });

      const callArgs = mockCreate.mock.calls[0][0].data;
      const tags = callArgs.tags as string[];
      expect(tags).toContain('react');
      expect(tags).toContain('frontend');
    });
  });

  describe('batchCapture', () => {
    it('should capture multiple entries', async () => {
      const now = new Date();
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        return {
          id: `test-id-${callCount}`,
          content: JSON.stringify({ type: 'NOTE', title: `Note ${callCount}`, body: 'Content', autoTags: [] }),
          tags: [],
          entityId: 'entity-1',
          source: 'manual',
          linkedEntities: [],
          createdAt: now,
          updatedAt: now,
        };
      });

      const results = await batchCapture([
        { entityId: 'entity-1', type: 'NOTE', content: 'Note 1', source: 'manual' },
        { entityId: 'entity-1', type: 'NOTE', content: 'Note 2', source: 'manual' },
        { entityId: 'entity-1', type: 'NOTE', content: 'Note 3', source: 'manual' },
      ]);

      expect(results).toHaveLength(3);
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });
});
