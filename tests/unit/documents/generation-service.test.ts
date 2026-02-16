jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Improved document content.'),
  generateJSON: jest.fn().mockResolvedValue({
    citations: [
      { claim: 'Revenue grew 20%', suggestedSource: 'Annual financial report' },
    ],
  }),
}));

import {
  generateDocument,
  renderTemplate,
  applyBrandKit,
  convertFormat,
} from '@/modules/documents/services/document-generation-service';
import {
  templateStore,
  getDefaultTemplates,
} from '@/modules/documents/services/template-service';
import { generateText, generateJSON } from '@/lib/ai';
import type { BrandKit } from '@/shared/types/index';
import type { DocumentGeneration } from '@/modules/documents/types';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('document-generation-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure template store has defaults
    templateStore.clear();
    for (const tpl of getDefaultTemplates()) {
      templateStore.set(tpl.id, tpl);
    }
  });

  describe('renderTemplate', () => {
    it('replaces {{variable}} placeholders with provided values', () => {
      const template = '# {{title}}\n\nBy {{author}} on {{date}}';
      const variables = { title: 'My Doc', author: 'John', date: '2026-01-15' };

      const result = renderTemplate(template, variables);

      expect(result).toBe('# My Doc\n\nBy John on 2026-01-15');
      expect(result).not.toContain('{{');
    });

    it('leaves unmatched placeholders intact', () => {
      const template = '# {{title}} - {{subtitle}}';
      const variables = { title: 'My Doc' };

      const result = renderTemplate(template, variables);

      expect(result).toContain('My Doc');
      expect(result).toContain('{{subtitle}}');
    });
  });

  describe('applyBrandKit', () => {
    it('prepends style tag and optional logo header', () => {
      const brandKit: BrandKit = {
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
        fontFamily: 'Helvetica',
        logoUrl: 'https://example.com/logo.png',
      };

      const result = applyBrandKit('# Hello', brandKit);

      expect(result).toContain('<style>');
      expect(result).toContain('font-family: Helvetica');
      expect(result).toContain('color: #FF0000');
      expect(result).toContain('color: #00FF00');
      expect(result).toContain('<img src="https://example.com/logo.png"');
      expect(result).toContain('# Hello');
    });

    it('omits logo header when logoUrl is not provided', () => {
      const brandKit: BrandKit = {
        primaryColor: '#FF0000',
        secondaryColor: '#00FF00',
      };

      const result = applyBrandKit('# Hello', brandKit);

      expect(result).toContain('<style>');
      expect(result).not.toContain('<img');
      expect(result).toContain('# Hello');
    });
  });

  describe('generateDocument', () => {
    it('calls getTemplate, renders, and returns a Document with DRAFT status', async () => {
      mockGenerateText.mockResolvedValueOnce('Enhanced document content here.');

      const request: DocumentGeneration = {
        templateId: 'tpl-exec-brief',
        variables: {
          title: 'Q1 Brief',
          recipient: 'CEO',
          date: '2026-01-15',
          summary: 'Good quarter',
          keyPoints: 'Revenue up',
        },
        entityId: 'entity-1',
        outputFormat: 'PDF',
        citationsEnabled: false,
      };

      const doc = await generateDocument(request);

      expect(doc.id).toBeDefined();
      expect(doc.title).toBe('Q1 Brief');
      expect(doc.entityId).toBe('entity-1');
      expect(doc.type).toBe('BRIEF');
      expect(doc.status).toBe('DRAFT');
      expect(doc.version).toBe(1);
      expect(doc.templateId).toBe('tpl-exec-brief');
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
    });

    it('with citationsEnabled includes AI-suggested citations', async () => {
      mockGenerateText.mockResolvedValueOnce('Enhanced doc content.');
      mockGenerateJSON.mockResolvedValueOnce({
        citations: [
          { claim: 'Revenue grew 20%', suggestedSource: 'Annual financial report' },
          { claim: 'Market share increased', suggestedSource: 'Industry analysis' },
        ],
      });

      const request: DocumentGeneration = {
        templateId: 'tpl-exec-brief',
        variables: {
          title: 'Q1 Brief',
          recipient: 'CEO',
          date: '2026-01-15',
          summary: 'Revenue grew 20%',
          keyPoints: 'Market share increased',
        },
        entityId: 'entity-1',
        outputFormat: 'PDF',
        citationsEnabled: true,
      };

      const doc = await generateDocument(request);

      expect(doc.citations.length).toBeGreaterThanOrEqual(2);
      // First citation is the template reference
      expect(doc.citations[0].sourceType).toBe('DOCUMENT');
      expect(doc.citations[0].sourceId).toBe('tpl-exec-brief');
      // AI citations follow
      const aiCitations = doc.citations.filter((c) => c.sourceType === 'KNOWLEDGE');
      expect(aiCitations.length).toBe(2);
      expect(aiCitations[0].sourceId).toBe('ai-suggestion');
    });

    it('throws when template not found', async () => {
      const request: DocumentGeneration = {
        templateId: 'non-existent-template',
        variables: {},
        entityId: 'entity-1',
        outputFormat: 'PDF',
        citationsEnabled: false,
      };

      await expect(generateDocument(request)).rejects.toThrow(
        'Template non-existent-template not found'
      );
    });

    it('applies brand kit when provided', async () => {
      mockGenerateText.mockResolvedValueOnce('Enhanced content.');

      const request: DocumentGeneration = {
        templateId: 'tpl-memo',
        variables: {
          to: 'Team',
          from: 'Manager',
          date: '2026-01-15',
          subject: 'Update',
          body: 'Good progress.',
        },
        entityId: 'entity-1',
        brandKit: {
          primaryColor: '#123456',
          secondaryColor: '#654321',
          fontFamily: 'Georgia',
          logoUrl: 'https://example.com/logo.png',
        },
        outputFormat: 'HTML',
        citationsEnabled: false,
      };

      const doc = await generateDocument(request);

      expect(doc.content).toContain('<style>');
      expect(doc.content).toContain('#123456');
    });
  });

  describe('convertFormat', () => {
    it('returns content as-is (placeholder behavior)', () => {
      const content = '# Hello World';
      const result = convertFormat(content, 'MARKDOWN', 'PDF');

      expect(result).toBe(content);
    });
  });
});
