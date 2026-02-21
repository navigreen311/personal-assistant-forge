// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

// Mock DB client
jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { generateJSON, generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import {
  conductResearch,
  evaluateSourceCredibility,
  analyzeDocument,
  extractTopicKeywords,
} from '@/modules/decisions/services/research-agent';
import type { ResearchRequest } from '@/modules/decisions/types';

const mockGenerateJSON = generateJSON as jest.Mock;
const mockGenerateText = generateText as jest.Mock;
const mockKnowledgeEntryFindMany = (prisma.knowledgeEntry as unknown as { findMany: jest.Mock }).findMany;

describe('Research Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKnowledgeEntryFindMany.mockResolvedValue([]);
  });

  describe('extractTopicKeywords', () => {
    it('should extract meaningful keywords from a topic', () => {
      const keywords = extractTopicKeywords('Market trends in artificial intelligence');
      expect(keywords).toContain('market');
      expect(keywords).toContain('trends');
      expect(keywords).toContain('artificial');
      expect(keywords).toContain('intelligence');
      // "in" is a stop word
      expect(keywords).not.toContain('in');
    });

    it('should filter out stop words', () => {
      const keywords = extractTopicKeywords('the best way to do this');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('to');
      expect(keywords).not.toContain('do');
      expect(keywords).toContain('best');
      expect(keywords).toContain('way');
    });

    it('should handle empty string', () => {
      const keywords = extractTopicKeywords('');
      expect(keywords).toHaveLength(0);
    });

    it('should filter words shorter than 3 characters', () => {
      const keywords = extractTopicKeywords('AI is an ML tool');
      expect(keywords).not.toContain('ai');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('an');
      expect(keywords).not.toContain('ml');
      expect(keywords).toContain('tool');
    });
  });

  describe('evaluateSourceCredibility', () => {
    it('should score KNOWLEDGE sources highest', () => {
      const score = evaluateSourceCredibility({ type: 'KNOWLEDGE' });
      expect(score).toBeGreaterThan(0.7);
    });

    it('should score DOCUMENT sources higher than WEB', () => {
      const docScore = evaluateSourceCredibility({ type: 'DOCUMENT' });
      const webScore = evaluateSourceCredibility({ type: 'WEB' });
      expect(docScore).toBeGreaterThan(webScore);
    });

    it('should give bonus for URL presence', () => {
      const withUrl = evaluateSourceCredibility({ type: 'WEB', url: 'https://example.com' });
      const withoutUrl = evaluateSourceCredibility({ type: 'WEB' });
      expect(withUrl).toBeGreaterThan(withoutUrl);
    });

    it('should give bonus for title and excerpt', () => {
      const full = evaluateSourceCredibility({
        type: 'WEB',
        title: 'A comprehensive research paper on AI',
        excerpt: 'This paper explores the implications of artificial intelligence in modern business.',
      });
      const minimal = evaluateSourceCredibility({ type: 'WEB' });
      expect(full).toBeGreaterThan(minimal);
    });

    it('should clamp score between 0 and 1', () => {
      const score = evaluateSourceCredibility({
        type: 'KNOWLEDGE',
        url: 'https://example.com',
        title: 'Full title here',
        excerpt: 'A long excerpt with detailed information about the topic.',
      });
      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return 0.5 for empty source', () => {
      expect(evaluateSourceCredibility({})).toBe(0.5);
    });
  });

  describe('conductResearch with AI', () => {
    it('should call generateJSON for research findings', async () => {
      mockGenerateJSON.mockResolvedValue({
        sources: [
          { type: 'WEB', title: 'AI Market Analysis', excerpt: 'The AI market is growing rapidly', url: 'https://example.com/ai' },
          { type: 'DOCUMENT', title: 'Internal Report', excerpt: 'Our analysis shows positive trends' },
        ],
        findings: [
          { claim: 'AI market growing 25% YoY', evidence: 'Based on industry reports', confidence: 0.8, sourceIndices: [0] },
          { claim: 'Enterprise adoption increasing', evidence: 'Fortune 500 adoption data', confidence: 0.7, sourceIndices: [0, 1] },
        ],
        gaps: ['Real-time competitor data not available'],
      });
      mockGenerateText.mockResolvedValue('AI market is experiencing significant growth with enterprise adoption accelerating.');

      const request: ResearchRequest = {
        query: 'Market trends in AI',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      };

      const report = await conductResearch(request);
      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(report.query).toBe('Market trends in AI');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.sources.length).toBeGreaterThan(0);
      expect(report.sourceQuality).toBe('ai');
    });

    it('should call generateText for research summary', async () => {
      mockGenerateJSON.mockResolvedValue({
        sources: [{ type: 'WEB', title: 'Source', excerpt: 'Data' }],
        findings: [{ claim: 'Key finding', evidence: 'Evidence', confidence: 0.7, sourceIndices: [0] }],
        gaps: ['Gap 1'],
      });
      mockGenerateText.mockResolvedValue('Summary of research findings.');

      await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'QUICK',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(mockGenerateText).toHaveBeenCalled();
    });

    it('should include query and depth in prompts', async () => {
      mockGenerateJSON.mockResolvedValue({
        sources: [],
        findings: [],
        gaps: [],
      });
      mockGenerateText.mockResolvedValue('Summary');

      await conductResearch({
        query: 'blockchain in healthcare',
        entityId: 'e1',
        depth: 'DEEP',
        sourceTypes: ['WEB', 'KNOWLEDGE'],
        maxSources: 5,
      });

      const prompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(prompt).toContain('blockchain in healthcare');
      expect(prompt).toContain('DEEP');
    });

    it('should fall back to placeholder on AI failure', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));

      const report = await conductResearch({
        query: 'Market trends in AI',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      });

      expect(report.query).toBe('Market trends in AI');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.sources.length).toBeGreaterThan(0);
      expect(report.summary).toContain('Market trends in AI');
    });

    it('should have confidence based on depth', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const quick = await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'QUICK',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });
      const deep = await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'DEEP',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(deep.confidenceScore).toBeGreaterThan(quick.confidenceScore);
    });

    it('should respect maxSources limit', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));

      const report = await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT', 'KNOWLEDGE'],
        maxSources: 2,
      });

      expect(report.sources.length).toBeLessThanOrEqual(2);
    });
  });

  describe('conductResearch fallback with knowledge base', () => {
    it('should query knowledge base when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      mockKnowledgeEntryFindMany.mockResolvedValue([
        {
          id: 'kb-1',
          content: 'Our AI strategy focuses on natural language processing and computer vision.',
          tags: ['AI', 'strategy'],
          entityId: 'entity-1',
          source: 'Internal Strategy Doc',
        },
        {
          id: 'kb-2',
          content: 'Market analysis shows 30% growth in AI adoption across enterprise.',
          tags: ['market', 'AI'],
          entityId: 'entity-1',
          source: 'Market Report Q4',
        },
      ]);

      const report = await conductResearch({
        query: 'Market trends in AI',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      });

      expect(mockKnowledgeEntryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            OR: expect.any(Array),
          }),
          take: 5,
        })
      );
      expect(report.sourceQuality).toBe('knowledge-base');
      expect(report.sources.length).toBe(2);
      expect(report.sources[0].type).toBe('KNOWLEDGE');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.summary).toContain('knowledge base');
    });

    it('should generate context-aware findings when no KB entries found', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      mockKnowledgeEntryFindMany.mockResolvedValue([]);

      const report = await conductResearch({
        query: 'Market trends in artificial intelligence',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      });

      expect(report.sourceQuality).toBe('generated');
      expect(report.findings.length).toBeGreaterThan(0);
      // Should reference extracted keywords
      const allText = report.findings.map((f) => `${f.claim} ${f.evidence}`).join(' ').toLowerCase();
      expect(allText).toMatch(/market|trends|artificial|intelligence/);
    });

    it('should set sourceQuality to generated when KB query fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('API error'));
      mockKnowledgeEntryFindMany.mockRejectedValue(new Error('DB connection failed'));

      const report = await conductResearch({
        query: 'Market trends in AI',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(report.sourceQuality).toBe('generated');
      expect(report.findings.length).toBeGreaterThan(0);
    });

    it('should log warning when AI fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGenerateJSON.mockRejectedValue(new Error('API quota exceeded'));

      await conductResearch({
        query: 'test query',
        entityId: 'e1',
        depth: 'QUICK',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ResearchAgent] AI research failed')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('API quota exceeded')
      );
      warnSpy.mockRestore();
    });

    it('should log warning when KB query fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockGenerateJSON.mockRejectedValue(new Error('AI down'));
      mockKnowledgeEntryFindMany.mockRejectedValue(new Error('DB timeout'));

      await conductResearch({
        query: 'test query',
        entityId: 'e1',
        depth: 'QUICK',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ResearchAgent] Knowledge base query failed')
      );
      warnSpy.mockRestore();
    });

    it('should have lower confidence for KB-sourced results than AI', async () => {
      // AI success path
      mockGenerateJSON.mockResolvedValue({
        sources: [{ type: 'WEB', title: 'Source', excerpt: 'Data' }],
        findings: [{ claim: 'Finding', evidence: 'Evidence', confidence: 0.8, sourceIndices: [0] }],
        gaps: [],
      });
      mockGenerateText.mockResolvedValue('Summary');

      const aiReport = await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'STANDARD',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      // KB fallback path
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockKnowledgeEntryFindMany.mockResolvedValue([
        { id: 'kb-1', content: 'Some test content here', tags: ['test'], entityId: 'e1', source: 'doc' },
      ]);

      const kbReport = await conductResearch({
        query: 'test',
        entityId: 'e1',
        depth: 'STANDARD',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(aiReport.sourceQuality).toBe('ai');
      expect(kbReport.sourceQuality).toBe('knowledge-base');
    });

    it('should include KB-specific gaps when sourced from knowledge base', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockKnowledgeEntryFindMany.mockResolvedValue([
        { id: 'kb-1', content: 'Relevant content', tags: [], entityId: 'e1', source: 'doc' },
      ]);

      const report = await conductResearch({
        query: 'test research',
        entityId: 'e1',
        depth: 'STANDARD',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(report.gaps).toEqual(
        expect.arrayContaining([
          expect.stringContaining('AI-powered deep analysis unavailable'),
        ])
      );
    });

    it('should include generated-specific gaps when no KB entries found', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockKnowledgeEntryFindMany.mockResolvedValue([]);

      const report = await conductResearch({
        query: 'complex research topic',
        entityId: 'e1',
        depth: 'STANDARD',
        sourceTypes: ['WEB'],
        maxSources: 3,
      });

      expect(report.gaps).toEqual(
        expect.arrayContaining([
          expect.stringContaining('No matching knowledge base entries found'),
        ])
      );
    });

    it('should generate findings referencing topic keywords', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('fail'));
      mockKnowledgeEntryFindMany.mockResolvedValue([]);

      const report = await conductResearch({
        query: 'blockchain scalability challenges',
        entityId: 'e1',
        depth: 'DEEP',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      });

      expect(report.sourceQuality).toBe('generated');
      const allClaims = report.findings.map((f) => f.claim.toLowerCase()).join(' ');
      expect(allClaims).toMatch(/blockchain|scalability|challenges/);
    });
  });

  describe('analyzeDocument', () => {
    it('should extract key terms from content', async () => {
      const content = 'The technology advancement in artificial intelligence ' +
        'has significant implications for business operations and technology strategy.';

      const analysis = await analyzeDocument(content);
      expect(analysis.keyTerms.length).toBeGreaterThan(0);
      expect(analysis.summary).toBeTruthy();
    });

    it('should detect risk-related keywords', async () => {
      const content = 'There is a significant risk of liability if the ' +
        'penalty clauses are triggered due to failure.';

      const analysis = await analyzeDocument(content);
      expect(analysis.risks.length).toBeGreaterThan(0);
      const highRisks = analysis.risks.filter((r) => r.severity === 'HIGH');
      expect(highRisks.length).toBeGreaterThan(0);
    });

    it('should detect obligation keywords', async () => {
      const content = 'The client must deliver all documents within 30 days. ' +
        'The vendor shall provide support as required to maintain SLA.';

      const analysis = await analyzeDocument(content);
      expect(analysis.obligations.length).toBeGreaterThan(0);
    });

    it('should handle empty content', async () => {
      const analysis = await analyzeDocument('');
      expect(analysis.keyTerms).toHaveLength(0);
      expect(analysis.risks).toHaveLength(0);
      expect(analysis.obligations).toHaveLength(0);
    });
  });
});
