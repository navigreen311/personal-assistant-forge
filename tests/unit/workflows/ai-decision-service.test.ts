jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
  generateJSON: jest.fn(),
}));

import {
  executeAIDecision,
  classifyInput,
  scoreInput,
  draftContent,
  summarizeInput,
} from '@/modules/workflows/services/ai-decision-service';
import type { AIDecisionNodeConfig } from '@/modules/workflows/types';
import { generateText, generateJSON } from '@/lib/ai';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('ai-decision-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------- classifyInput ----------
  describe('classifyInput', () => {
    it('returns category and confidence from AI', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ category: 'URGENT', confidence: 0.95 });

      const result = await classifyInput('Classify this ticket', 'Server is down!', ['URGENT', 'NORMAL', 'LOW']);

      expect(result.category).toBe('URGENT');
      expect(result.confidence).toBe(0.95);
      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    });

    it('falls back to first category with zero confidence when AI fails', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await classifyInput('Classify', 'input', ['HIGH', 'MEDIUM', 'LOW']);

      expect(result.category).toBe('HIGH');
      expect(result.confidence).toBe(0);
    });

    it('returns UNKNOWN when AI fails and categories list is empty', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await classifyInput('Classify', 'input', []);

      expect(result.category).toBe('UNKNOWN');
      expect(result.confidence).toBe(0);
    });
  });

  // ---------- scoreInput ----------
  describe('scoreInput', () => {
    it('returns score and breakdown from AI', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        score: 85,
        breakdown: { quality: 90, relevance: 80 },
      });

      const result = await scoreInput('Score this', 'input data', ['quality', 'relevance']);

      expect(result.score).toBe(85);
      expect(result.breakdown).toEqual({ quality: 90, relevance: 80 });
    });

    it('falls back to 50 for each dimension when AI fails', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await scoreInput('Score', 'input', ['quality', 'relevance']);

      expect(result.score).toBe(50);
      expect(result.breakdown.quality).toBe(50);
      expect(result.breakdown.relevance).toBe(50);
    });
  });

  // ---------- draftContent ----------
  describe('draftContent', () => {
    it('returns AI-generated content with confidence 0.8', async () => {
      mockGenerateText.mockResolvedValueOnce('Here is the drafted email body.');

      const result = await draftContent('Draft an email', '{"recipient":"John"}');

      expect(result.content).toBe('Here is the drafted email body.');
      expect(result.confidence).toBe(0.8);
    });

    it('returns fallback content with confidence 0 when AI fails', async () => {
      mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await draftContent('Draft an email', '{}');

      expect(result.content).toContain('[Draft unavailable]');
      expect(result.confidence).toBe(0);
    });
  });

  // ---------- summarizeInput ----------
  describe('summarizeInput', () => {
    it('returns AI-generated summary', async () => {
      mockGenerateText.mockResolvedValueOnce('This is a concise summary.');

      const result = await summarizeInput('Summarize this', 'Long text here...');

      expect(result.summary).toBe('This is a concise summary.');
    });

    it('returns truncated fallback when AI fails', async () => {
      mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

      const longInput = 'A'.repeat(300);
      const result = await summarizeInput('Summarize', longInput);

      expect(result.summary).toContain('[Summary unavailable]');
      expect(result.summary).toContain('...');
    });
  });

  // ---------- executeAIDecision ----------
  describe('executeAIDecision', () => {
    it('handles CLASSIFY decision type and maps outputs', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ category: 'SUPPORT', confidence: 0.9 });

      const config: AIDecisionNodeConfig = {
        nodeType: 'AI_DECISION',
        decisionType: 'CLASSIFY',
        prompt: 'Classify the ticket',
        outputMapping: { category: 'ticketCategory' },
        confidenceThreshold: 0.5,
      };

      const result = await executeAIDecision(config, { message: 'I need help' });

      expect(result.decision.category).toBe('SUPPORT');
      expect(result.decision.ticketCategory).toBe('SUPPORT');
      expect(result.confidence).toBe(0.9);
      expect(result.requiresHumanReview).toBe(false);
    });

    it('flags requiresHumanReview when confidence is below threshold', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ category: 'MAYBE', confidence: 0.3 });

      const config: AIDecisionNodeConfig = {
        nodeType: 'AI_DECISION',
        decisionType: 'CLASSIFY',
        prompt: 'Classify',
        outputMapping: { category: 'result' },
        confidenceThreshold: 0.8,
      };

      const result = await executeAIDecision(config, {});

      expect(result.requiresHumanReview).toBe(true);
      expect(result.confidence).toBe(0.3);
    });

    it('handles SCORE decision type', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        score: 72,
        breakdown: { clarity: 80, completeness: 64 },
      });

      const config: AIDecisionNodeConfig = {
        nodeType: 'AI_DECISION',
        decisionType: 'SCORE',
        prompt: 'Score this proposal',
        outputMapping: { score: 'proposalScore' },
      };

      const result = await executeAIDecision(config, { text: 'A proposal' });

      expect(result.decision.score).toBe(72);
      expect(result.decision.proposalScore).toBe(72);
      expect(result.confidence).toBeCloseTo(0.72);
    });

    it('handles DRAFT decision type', async () => {
      mockGenerateText.mockResolvedValueOnce('Dear client, thank you for reaching out.');

      const config: AIDecisionNodeConfig = {
        nodeType: 'AI_DECISION',
        decisionType: 'DRAFT',
        prompt: 'Draft a reply',
        outputMapping: { content: 'replyBody' },
      };

      const result = await executeAIDecision(config, { inquiry: 'Hello' });

      expect(result.decision.content).toBe('Dear client, thank you for reaching out.');
      expect(result.decision.replyBody).toBe('Dear client, thank you for reaching out.');
      expect(result.confidence).toBe(0.8);
    });

    it('handles SUMMARIZE decision type with fixed 0.9 confidence', async () => {
      mockGenerateText.mockResolvedValueOnce('Key points: revenue up, costs down.');

      const config: AIDecisionNodeConfig = {
        nodeType: 'AI_DECISION',
        decisionType: 'SUMMARIZE',
        prompt: 'Summarize the report',
        outputMapping: { summary: 'reportSummary' },
      };

      const result = await executeAIDecision(config, { report: 'Long report...' });

      expect(result.decision.summary).toBe('Key points: revenue up, costs down.');
      expect(result.decision.reportSummary).toBe('Key points: revenue up, costs down.');
      expect(result.confidence).toBe(0.9);
    });

    it('returns empty decision with 0 confidence for unknown decision type', async () => {
      const config = {
        nodeType: 'AI_DECISION',
        decisionType: 'UNKNOWN_TYPE',
        prompt: 'Do something',
        outputMapping: {},
      } as unknown as AIDecisionNodeConfig;

      const result = await executeAIDecision(config, {});

      expect(result.decision).toEqual({});
      expect(result.confidence).toBe(0);
    });
  });
});
