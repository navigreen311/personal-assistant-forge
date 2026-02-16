// Mock prisma to avoid PrismaClient initialization in test environment
jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import {
  parseSearchQuery,
  buildSearchQuery,
  generateSnippet,
  buildResultUrl,
  SEARCHABLE_MODELS,
  type SearchableModel,
} from '@/lib/search/full-text';

// ---------------------------------------------------------------------------
// parseSearchQuery
// ---------------------------------------------------------------------------

describe('Full-Text Search', () => {
  describe('parseSearchQuery', () => {
    it('should convert simple words to AND query', () => {
      const result = parseSearchQuery('hello world');
      expect(result).toBe('hello & world');
    });

    it('should handle quoted phrases with proximity operator', () => {
      const result = parseSearchQuery('"exact phrase"');
      expect(result).toBe('exact <-> phrase');
    });

    it('should handle OR operator', () => {
      const result = parseSearchQuery('word1 OR word2');
      expect(result).toContain('word1');
      expect(result).toContain('|');
      expect(result).toContain('word2');
    });

    it('should handle prefix matching with asterisk', () => {
      const result = parseSearchQuery('word*');
      expect(result).toBe('word:*');
    });

    it('should handle mixed operators', () => {
      const result = parseSearchQuery('"exact match" other OR another prefix*');
      expect(result).toContain('exact <-> match');
      expect(result).toContain('other');
      expect(result).toContain('|');
      expect(result).toContain('another');
      expect(result).toContain('prefix:*');
    });

    it('should sanitize special characters', () => {
      const result = parseSearchQuery('hello; DROP TABLE--');
      // Should strip special chars and produce valid terms
      expect(result).not.toContain(';');
      expect(result).not.toContain('--');
    });

    it('should handle empty query', () => {
      expect(parseSearchQuery('')).toBe('');
      expect(parseSearchQuery('   ')).toBe('');
    });

    it('should truncate very long queries to 10 terms', () => {
      const longQuery = 'a b c d e f g h i j k l m n o';
      const result = parseSearchQuery(longQuery);
      // Count actual term tokens (exclude & operators)
      const terms = result.split(' ').filter((t) => t !== '&' && t !== '|');
      expect(terms.length).toBeLessThanOrEqual(10);
    });
  });

  // ---------------------------------------------------------------------------
  // buildSearchQuery
  // ---------------------------------------------------------------------------

  describe('buildSearchQuery', () => {
    const taskModel: SearchableModel = SEARCHABLE_MODELS.find(
      (m) => m.model === 'task',
    )!;

    it('should build valid SQL for task model', () => {
      const { sql, params } = buildSearchQuery({
        model: taskModel,
        query: 'important',
        filters: {},
        limit: 20,
        offset: 0,
      });

      expect(sql).toContain('to_tsvector');
      expect(sql).toContain('to_tsquery');
      expect(sql).toContain('ts_rank_cd');
      expect(sql).toContain('"Task"');
      expect(params[0]).toBe('important');
    });

    it('should include entity filter when provided', () => {
      const { sql, params } = buildSearchQuery({
        model: taskModel,
        query: 'test',
        filters: { entityId: 'entity-123' },
        limit: 20,
        offset: 0,
      });

      expect(sql).toContain('"entityId"');
      expect(params).toContain('entity-123');
    });

    it('should include date range filters', () => {
      const dateFrom = new Date('2024-01-01');
      const dateTo = new Date('2024-12-31');

      const { sql, params } = buildSearchQuery({
        model: taskModel,
        query: 'test',
        filters: { dateFrom, dateTo },
        limit: 20,
        offset: 0,
      });

      expect(sql).toContain('"createdAt" >=');
      expect(sql).toContain('"createdAt" <=');
      expect(params).toContain(dateFrom);
      expect(params).toContain(dateTo);
    });

    it('should apply limit and offset', () => {
      const { sql, params } = buildSearchQuery({
        model: taskModel,
        query: 'test',
        filters: {},
        limit: 10,
        offset: 5,
      });

      expect(sql).toContain('LIMIT');
      expect(sql).toContain('OFFSET');
      expect(params).toContain(10);
      expect(params).toContain(5);
    });

    it('should parameterize user input (no SQL injection)', () => {
      const { sql, params } = buildSearchQuery({
        model: taskModel,
        query: "'; DROP TABLE Task;--",
        filters: { entityId: "'; DELETE FROM Entity;--" },
        limit: 20,
        offset: 0,
      });

      // The malicious strings should be in params, not inlined in SQL
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain('DELETE FROM');
      // Params contain the sanitized query term (parseSearchQuery strips special chars)
      expect(params.length).toBeGreaterThan(0);
    });

    it('should return empty sql for empty query', () => {
      const { sql } = buildSearchQuery({
        model: taskModel,
        query: '',
        filters: {},
        limit: 20,
        offset: 0,
      });

      expect(sql).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // generateSnippet
  // ---------------------------------------------------------------------------

  describe('generateSnippet', () => {
    it('should highlight matching terms with <mark> tags', () => {
      const snippet = generateSnippet(
        'This is an important task about testing',
        'important',
      );
      expect(snippet).toContain('<mark>important</mark>');
    });

    it('should extract context around first match', () => {
      const longText =
        'A'.repeat(200) + ' important word here ' + 'B'.repeat(200);
      const snippet = generateSnippet(longText, 'important', 100);
      expect(snippet).toContain('<mark>important</mark>');
      expect(snippet.length).toBeLessThanOrEqual(200); // with marks and ellipsis
    });

    it('should handle multiple matches', () => {
      const snippet = generateSnippet(
        'test one and test two',
        'test',
      );
      // At least the first match is highlighted
      expect(snippet).toContain('<mark>test</mark>');
    });

    it('should respect maxLength', () => {
      const longText = 'word '.repeat(100);
      const snippet = generateSnippet(longText, 'word', 50);
      // Raw text (without marks/ellipsis) shouldn't exceed maxLength significantly
      const rawLength = snippet.replace(/<\/?mark>/g, '').replace(/\.\.\./g, '').length;
      expect(rawLength).toBeLessThanOrEqual(60); // small buffer for boundary
    });

    it('should handle no matches gracefully', () => {
      const snippet = generateSnippet(
        'This text has no matching terms',
        'zzzzz',
      );
      // Should return the beginning of the text
      expect(snippet).toContain('This text');
    });

    it('should handle empty text', () => {
      const snippet = generateSnippet('', 'test');
      expect(snippet).toBe('');
    });

    it('should handle empty query', () => {
      const snippet = generateSnippet('some text', '');
      expect(snippet).toBe('some text');
    });
  });

  // ---------------------------------------------------------------------------
  // buildResultUrl
  // ---------------------------------------------------------------------------

  describe('buildResultUrl', () => {
    it('should build correct URL for task results', () => {
      const url = buildResultUrl('task', 'task-1', 'entity-1');
      expect(url).toBe('/entities/entity-1/tasks/task-1');
    });

    it('should build correct URL for message results', () => {
      const url = buildResultUrl('message', 'msg-1', 'entity-1');
      expect(url).toBe('/entities/entity-1/messages/msg-1');
    });

    it('should build correct URL for document results', () => {
      const url = buildResultUrl('document', 'doc-1', 'entity-1');
      expect(url).toBe('/entities/entity-1/documents/doc-1');
    });

    it('should build correct URL for contact results', () => {
      const url = buildResultUrl('contact', 'contact-1', 'entity-1');
      expect(url).toBe('/entities/entity-1/contacts/contact-1');
    });

    it('should build correct URL for knowledge entry results', () => {
      const url = buildResultUrl('knowledgeEntry', 'ke-1', 'entity-1');
      expect(url).toBe('/entities/entity-1/knowledge/ke-1');
    });
  });
});
