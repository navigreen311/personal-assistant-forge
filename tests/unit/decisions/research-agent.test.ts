import {
  conductResearch,
  evaluateSourceCredibility,
  analyzeDocument,
} from '@/modules/decisions/services/research-agent';
import type { ResearchRequest, ResearchSource } from '@/modules/decisions/types';

describe('Research Agent', () => {
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

  describe('conductResearch', () => {
    it('should return a research report with findings and sources', async () => {
      const request: ResearchRequest = {
        query: 'Market trends in AI',
        entityId: 'entity-1',
        depth: 'STANDARD',
        sourceTypes: ['WEB', 'DOCUMENT'],
        maxSources: 5,
      };

      const report = await conductResearch(request);
      expect(report.query).toBe('Market trends in AI');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.sources.length).toBeGreaterThan(0);
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.summary).toContain('Market trends in AI');
    });

    it('should have confidence based on depth', async () => {
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
