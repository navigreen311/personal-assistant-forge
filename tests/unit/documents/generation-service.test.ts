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
    describe('same format passthrough', () => {
      it('returns content unchanged when fromFormat equals toFormat', () => {
        const content = '# Hello World';
        expect(convertFormat(content, 'markdown', 'markdown')).toBe(content);
        expect(convertFormat(content, 'html', 'html')).toBe(content);
      });
    });

    describe('markdown to html', () => {
      it('converts headings to HTML h tags', () => {
        const result = convertFormat('# Title\n## Subtitle\n### Section', 'markdown', 'html');
        expect(result).toContain('<h1>Title</h1>');
        expect(result).toContain('<h2>Subtitle</h2>');
        expect(result).toContain('<h3>Section</h3>');
      });

      it('converts bold text', () => {
        const result = convertFormat('This is **bold** text', 'markdown', 'html');
        expect(result).toContain('<strong>bold</strong>');
      });

      it('converts italic text', () => {
        const result = convertFormat('This is *italic* text', 'markdown', 'html');
        expect(result).toContain('<em>italic</em>');
      });

      it('converts links', () => {
        const result = convertFormat('[Click here](https://example.com)', 'markdown', 'html');
        expect(result).toContain('<a href="https://example.com">Click here</a>');
      });

      it('converts inline code', () => {
        const result = convertFormat('Use `console.log()` to debug', 'markdown', 'html');
        expect(result).toContain('<code>console.log()</code>');
      });

      it('converts fenced code blocks', () => {
        const result = convertFormat('```js\nconst x = 1;\n```', 'markdown', 'html');
        expect(result).toContain('<pre><code>');
        expect(result).toContain('const x = 1;');
        expect(result).toContain('</code></pre>');
      });

      it('converts unordered list items', () => {
        const result = convertFormat('- Item 1\n- Item 2', 'markdown', 'html');
        expect(result).toContain('<li>Item 1</li>');
        expect(result).toContain('<li>Item 2</li>');
        expect(result).toContain('<ul>');
      });

      it('wraps plain text lines in paragraph tags', () => {
        const result = convertFormat('Hello world', 'markdown', 'html');
        expect(result).toContain('<p>Hello world</p>');
      });
    });

    describe('html to markdown', () => {
      it('converts heading tags to markdown headings', () => {
        const result = convertFormat('<h1>Title</h1><h2>Sub</h2>', 'html', 'markdown');
        expect(result).toContain('# Title');
        expect(result).toContain('## Sub');
      });

      it('converts strong/b tags to bold markdown', () => {
        const result = convertFormat('<strong>bold</strong> and <b>also bold</b>', 'html', 'markdown');
        expect(result).toContain('**bold**');
        expect(result).toContain('**also bold**');
      });

      it('converts em/i tags to italic markdown', () => {
        const result = convertFormat('<em>italic</em> and <i>also italic</i>', 'html', 'markdown');
        expect(result).toContain('*italic*');
        expect(result).toContain('*also italic*');
      });

      it('converts anchor tags to markdown links', () => {
        const result = convertFormat('<a href="https://example.com">Link</a>', 'html', 'markdown');
        expect(result).toContain('[Link](https://example.com)');
      });

      it('converts code tags to backticks', () => {
        const result = convertFormat('<code>foo()</code>', 'html', 'markdown');
        expect(result).toContain('`foo()`');
      });

      it('converts list items to markdown list syntax', () => {
        const result = convertFormat('<ul><li>One</li><li>Two</li></ul>', 'html', 'markdown');
        expect(result).toContain('- One');
        expect(result).toContain('- Two');
      });

      it('strips remaining HTML tags', () => {
        const result = convertFormat('<div class="wrapper"><span>Text</span></div>', 'html', 'markdown');
        expect(result).not.toContain('<div');
        expect(result).not.toContain('<span');
        expect(result).toContain('Text');
      });

      it('decodes common HTML entities', () => {
        const result = convertFormat('<p>&amp; &lt; &gt; &quot;</p>', 'html', 'markdown');
        expect(result).toContain('&');
        expect(result).toContain('<');
        expect(result).toContain('>');
        expect(result).toContain('"');
      });
    });

    describe('html to plaintext', () => {
      it('strips all HTML tags', () => {
        const result = convertFormat('<h1>Title</h1><p>Paragraph</p>', 'html', 'plaintext');
        expect(result).not.toContain('<');
        expect(result).not.toContain('>');
        expect(result).toContain('Title');
        expect(result).toContain('Paragraph');
      });

      it('decodes common HTML entities', () => {
        const result = convertFormat('&amp; &lt; &gt; &quot;', 'html', 'plaintext');
        expect(result).toBe('& < > "');
      });

      it('preserves line breaks from block elements', () => {
        const result = convertFormat('<p>One</p><p>Two</p>', 'html', 'plaintext');
        expect(result).toContain('One');
        expect(result).toContain('Two');
        // Should have some separation
        expect(result).not.toBe('OneTwo');
      });
    });

    describe('markdown to plaintext', () => {
      it('removes heading markers', () => {
        const result = convertFormat('# Title\n## Subtitle', 'markdown', 'plaintext');
        expect(result).toContain('Title');
        expect(result).toContain('Subtitle');
        expect(result).not.toContain('#');
      });

      it('removes bold and italic markers', () => {
        const result = convertFormat('**bold** and *italic* and ***both***', 'markdown', 'plaintext');
        expect(result).toContain('bold');
        expect(result).toContain('italic');
        expect(result).toContain('both');
        expect(result).not.toContain('*');
      });

      it('extracts link text and removes URL syntax', () => {
        const result = convertFormat('[Click](https://example.com)', 'markdown', 'plaintext');
        expect(result).toContain('Click');
        expect(result).not.toContain('https://example.com');
        expect(result).not.toContain('[');
        expect(result).not.toContain(']');
      });

      it('removes inline code backticks', () => {
        const result = convertFormat('Use `console.log()` to debug', 'markdown', 'plaintext');
        expect(result).toContain('console.log()');
        expect(result).not.toContain('`');
      });

      it('removes list markers', () => {
        const result = convertFormat('- Item 1\n- Item 2', 'markdown', 'plaintext');
        expect(result).toContain('Item 1');
        expect(result).toContain('Item 2');
        expect(result).not.toMatch(/^- /m);
      });

      it('removes fenced code block markers', () => {
        const result = convertFormat('```js\nconst x = 1;\n```', 'markdown', 'plaintext');
        expect(result).toContain('const x = 1;');
        expect(result).not.toContain('```');
      });
    });

    describe('unrecognized format pairs', () => {
      it('returns content unchanged for unrecognized conversions', () => {
        const content = '# Hello World';
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = convertFormat(content, 'markdown', 'pdf');
        expect(result).toBe(content);

        warnSpy.mockRestore();
      });

      it('emits a console.warn for unrecognized format pair', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        convertFormat('content', 'docx', 'rtf');
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unrecognized format conversion')
        );

        warnSpy.mockRestore();
      });
    });

    describe('case insensitivity', () => {
      it('handles uppercase format names', () => {
        const result = convertFormat('# Title', 'MARKDOWN', 'HTML');
        expect(result).toContain('<h1>Title</h1>');
      });

      it('handles mixed case format names', () => {
        const result = convertFormat('<h1>Title</h1>', 'Html', 'Markdown');
        expect(result).toContain('# Title');
      });
    });
  });
});
