import { chunkContent, extractKeywords, generateSummary, ingestDocument } from '@/modules/knowledge/services/ingestion-service';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockCreate = prisma.knowledgeEntry.create as jest.Mock;

describe('ingestion-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chunkContent', () => {
    it('should return single chunk for small content', () => {
      const chunks = chunkContent('Small content here', 2000);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Small content here');
    });

    it('should split on double newlines (paragraphs)', () => {
      const content = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = chunkContent(content, 30);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should respect maxChunkSize', () => {
      const content = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. `.repeat(10)).join('\n\n');
      const chunks = chunkContent(content, 200);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(200);
      }
    });

    it('should fall back to single newline splitting for large paragraphs', () => {
      const largeParagraph = Array.from({ length: 50 }, (_, i) => `Line ${i} content`).join('\n');
      const chunks = chunkContent(largeParagraph, 200);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(200);
      }
    });

    it('should return empty array for empty content', () => {
      expect(chunkContent('', 2000)).toEqual([]);
      expect(chunkContent('   ', 2000)).toEqual([]);
    });

    it('should handle content with no paragraph breaks', () => {
      const content = 'A'.repeat(5000);
      const chunks = chunkContent(content, 2000);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should handle content equal to max chunk size', () => {
      const content = 'A'.repeat(2000);
      const chunks = chunkContent(content, 2000);
      expect(chunks).toHaveLength(1);
    });
  });

  describe('extractKeywords', () => {
    it('should extract top 10 keywords by frequency', () => {
      const content = 'react react react typescript typescript javascript development framework component hooks';
      const keywords = extractKeywords(content);
      expect(keywords.length).toBeLessThanOrEqual(10);
      expect(keywords[0]).toBe('react');
    });

    it('should filter stop words', () => {
      const content = 'the quick brown foxes jumped over these lazy dogs';
      const keywords = extractKeywords(content);
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('over');
      expect(keywords).not.toContain('these');
    });

    it('should filter words shorter than 4 chars', () => {
      const content = 'the big dog ran fast but not far from home';
      const keywords = extractKeywords(content);
      expect(keywords).not.toContain('big');
      expect(keywords).not.toContain('dog');
      expect(keywords).not.toContain('ran');
    });

    it('should return empty array for empty content', () => {
      expect(extractKeywords('')).toEqual([]);
      expect(extractKeywords('   ')).toEqual([]);
    });

    it('should filter numeric-only words', () => {
      const keywords = extractKeywords('year 2024 was great development time');
      expect(keywords).not.toContain('2024');
    });
  });

  describe('generateSummary', () => {
    it('should return first 3 sentences', () => {
      const content = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      const summary = generateSummary(content);
      expect(summary).toContain('First sentence.');
      expect(summary).toContain('Second sentence.');
      expect(summary).toContain('Third sentence.');
      expect(summary).not.toContain('Fourth sentence.');
    });

    it('should handle content with fewer than 3 sentences', () => {
      const content = 'Only one sentence.';
      const summary = generateSummary(content);
      expect(summary).toBe('Only one sentence.');
    });

    it('should return empty string for empty content', () => {
      expect(generateSummary('')).toBe('');
    });
  });

  describe('ingestDocument', () => {
    it('should create entries for each chunk', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(async () => {
        callCount++;
        return {
          id: `entry-${callCount}`,
          content: JSON.stringify({ type: 'ARTICLE', title: `Section ${callCount}`, body: 'Content', autoTags: [] }),
          tags: [],
          entityId: 'entity-1',
          source: 'upload',
          linkedEntities: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      const result = await ingestDocument({
        entityId: 'entity-1',
        filename: 'test.txt',
        mimeType: 'text/plain',
        content: 'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.',
        source: 'upload',
      });

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.summary).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.extractedKeywords.length).toBeGreaterThan(0);
    });

    it('should calculate word count correctly', async () => {
      mockCreate.mockResolvedValue({
        id: 'entry-1',
        content: JSON.stringify({ type: 'ARTICLE', title: 'Test', body: 'Content', autoTags: [] }),
        tags: [],
        entityId: 'entity-1',
        source: 'upload',
        linkedEntities: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await ingestDocument({
        entityId: 'entity-1',
        filename: 'test.txt',
        mimeType: 'text/plain',
        content: 'one two three four five',
        source: 'upload',
      });

      expect(result.wordCount).toBe(5);
    });
  });
});
