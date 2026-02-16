jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import {
  extractKeyInfo,
  calculateSentiment,
  calculateSentimentWithAI,
  calculateTalkRatio,
  checkCompliance,
  generateSummary,
  analyzeCall,
  analyzeCallWithAI,
} from '@/modules/voiceforge/services/conversational-intel';
import type { TranscriptSegment } from '@/modules/voiceforge/types';
import { generateJSON } from '@/lib/ai';

const mockGenerateJSON = generateJSON as jest.Mock;

describe('Conversational Intelligence', () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
  });

  describe('extractKeyInfo', () => {
    it('should extract email addresses', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'CALLER',
          text: 'Send it to john@example.com please',
          startTime: 0,
          endTime: 5,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      const emails = results.filter((r) => r.type === 'EMAIL');
      expect(emails).toHaveLength(1);
      expect(emails[0].value).toBe('john@example.com');
    });

    it('should extract phone numbers', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'CALLER',
          text: 'Call me at 512-555-1234',
          startTime: 0,
          endTime: 5,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      const phones = results.filter((r) => r.type === 'PHONE');
      expect(phones).toHaveLength(1);
      expect(phones[0].value).toBe('512-555-1234');
    });

    it('should extract dollar amounts', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'AGENT',
          text: 'The total is $1,500.00',
          startTime: 10,
          endTime: 15,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      const amounts = results.filter((r) => r.type === 'AMOUNT');
      expect(amounts).toHaveLength(1);
      expect(amounts[0].value).toBe('$1,500.00');
    });

    it('should extract dates', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'CALLER',
          text: "Let's schedule for March 15, 2026",
          startTime: 20,
          endTime: 25,
          sentiment: 0.5,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      const dates = results.filter((r) => r.type === 'DATE');
      expect(dates).toHaveLength(1);
      expect(dates[0].value).toBe('March 15, 2026');
    });

    it('should extract multiple items from a single segment', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'CALLER',
          text: 'Email me at test@test.com and call me at 555-123-4567 about the $500.00 invoice',
          startTime: 0,
          endTime: 10,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      expect(results.filter((r) => r.type === 'EMAIL')).toHaveLength(1);
      expect(results.filter((r) => r.type === 'PHONE')).toHaveLength(1);
      expect(results.filter((r) => r.type === 'AMOUNT')).toHaveLength(1);
    });

    it('should return empty for segments with no extractable info', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'AGENT',
          text: 'Hello, how are you today?',
          startTime: 0,
          endTime: 3,
          sentiment: 0.5,
          confidence: 0.9,
        },
      ];
      const results = extractKeyInfo(segments);
      expect(results).toHaveLength(0);
    });

    it('should include correct segment index', () => {
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'Hello', startTime: 0, endTime: 2, sentiment: 0, confidence: 0.9 },
        { speaker: 'CALLER', text: 'My email is a@b.com', startTime: 2, endTime: 5, sentiment: 0, confidence: 0.9 },
      ];
      const results = extractKeyInfo(segments);
      expect(results[0].segmentIndex).toBe(1);
    });
  });

  describe('calculateSentiment', () => {
    it('should return positive for positive words', () => {
      expect(calculateSentiment('great excellent wonderful')).toBeGreaterThan(0);
    });

    it('should return negative for negative words', () => {
      expect(calculateSentiment('terrible awful hate')).toBeLessThan(0);
    });

    it('should return 0 for neutral text', () => {
      expect(calculateSentiment('the weather is cloudy')).toBe(0);
    });

    it('should be bounded between -1 and 1', () => {
      expect(calculateSentiment('great great great great great')).toBeLessThanOrEqual(1);
      expect(calculateSentiment('terrible terrible terrible terrible')).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('calculateTalkRatio', () => {
    it('should calculate duration-based talk ratio', () => {
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'Hello', startTime: 0, endTime: 10, sentiment: 0, confidence: 0.9 },
        { speaker: 'CALLER', text: 'Hi', startTime: 10, endTime: 30, sentiment: 0, confidence: 0.9 },
      ];
      const ratio = calculateTalkRatio(segments);
      // Agent: 10s, Caller: 20s, Total: 30s
      expect(ratio.agent).toBe(33); // 10/30 = 33%
      expect(ratio.caller).toBe(67); // 20/30 = 67%
    });

    it('should handle equal talk time', () => {
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'Hello', startTime: 0, endTime: 10, sentiment: 0, confidence: 0.9 },
        { speaker: 'CALLER', text: 'Hi', startTime: 10, endTime: 20, sentiment: 0, confidence: 0.9 },
      ];
      const ratio = calculateTalkRatio(segments);
      expect(ratio.agent).toBe(50);
      expect(ratio.caller).toBe(50);
    });

    it('should return zeros for empty segments', () => {
      const ratio = calculateTalkRatio([]);
      expect(ratio.agent).toBe(0);
      expect(ratio.caller).toBe(0);
    });

    it('should use duration not segment count', () => {
      // 3 agent segments (1s each) vs 1 caller segment (27s)
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'A', startTime: 0, endTime: 1, sentiment: 0, confidence: 0.9 },
        { speaker: 'AGENT', text: 'B', startTime: 1, endTime: 2, sentiment: 0, confidence: 0.9 },
        { speaker: 'AGENT', text: 'C', startTime: 2, endTime: 3, sentiment: 0, confidence: 0.9 },
        { speaker: 'CALLER', text: 'Long response', startTime: 3, endTime: 30, sentiment: 0, confidence: 0.9 },
      ];
      const ratio = calculateTalkRatio(segments);
      // Agent: 3s, Caller: 27s, Total: 30s
      expect(ratio.agent).toBe(10);
      expect(ratio.caller).toBe(90);
    });
  });

  describe('checkCompliance', () => {
    it('should detect HIPAA violations', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'AGENT',
          text: 'Let me look up the patient name in our records',
          startTime: 0,
          endTime: 5,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const issues = checkCompliance(segments, ['HIPAA']);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('HIPAA');
      expect(issues[0].severity).toBe('VIOLATION');
    });

    it('should detect GDPR keywords as warnings', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'CALLER',
          text: 'I want to exercise my right to erasure',
          startTime: 0,
          endTime: 5,
          sentiment: -0.3,
          confidence: 0.9,
        },
      ];
      const issues = checkCompliance(segments, ['GDPR']);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].severity).toBe('WARNING');
    });

    it('should return no issues when no compliance profile given', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'AGENT',
          text: 'The patient name is John',
          startTime: 0,
          endTime: 5,
          sentiment: 0,
          confidence: 0.9,
        },
      ];
      const issues = checkCompliance(segments, []);
      expect(issues).toHaveLength(0);
    });

    it('should return empty for non-matching profiles', () => {
      const segments: TranscriptSegment[] = [
        {
          speaker: 'AGENT',
          text: 'Hello, how are you?',
          startTime: 0,
          endTime: 3,
          sentiment: 0.5,
          confidence: 0.9,
        },
      ];
      const issues = checkCompliance(segments, ['HIPAA']);
      expect(issues).toHaveLength(0);
    });
  });

  describe('generateSummary', () => {
    it('should generate summary for non-empty segments', () => {
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'Hello, this is a follow-up call regarding your inquiry.', startTime: 0, endTime: 5, sentiment: 0.5, confidence: 0.9 },
        { speaker: 'CALLER', text: 'Yes, I was interested in learning more about the product.', startTime: 5, endTime: 10, sentiment: 0.3, confidence: 0.9 },
      ];
      const summary = generateSummary(segments, []);
      expect(summary.oneLineSummary).toBeTruthy();
      expect(summary.keyPoints.length).toBeGreaterThan(0);
    });

    it('should handle empty segments', () => {
      const summary = generateSummary([], []);
      expect(summary.oneLineSummary).toBe('No transcript data available');
    });
  });

  describe('analyzeCall', () => {
    it('should return a full analysis', async () => {
      const segments: TranscriptSegment[] = [
        { speaker: 'AGENT', text: 'Hello, how can I help?', startTime: 0, endTime: 5, sentiment: 0.5, confidence: 0.9 },
        { speaker: 'CALLER', text: 'I need to update my email to test@test.com', startTime: 5, endTime: 10, sentiment: 0, confidence: 0.9 },
      ];
      const analysis = await analyzeCall('call-1', segments);
      expect(analysis.callId).toBe('call-1');
      expect(analysis.transcript).toHaveLength(2);
      expect(analysis.talkRatio.agent + analysis.talkRatio.caller).toBe(100);
      expect(analysis.keyInfoExtracted.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeCallWithAI', () => {
    const segments: TranscriptSegment[] = [
      { speaker: 'AGENT', text: 'Hello, how can I help you today?', startTime: 0, endTime: 5, sentiment: 0.5, confidence: 0.9 },
      { speaker: 'CALLER', text: 'I want to discuss pricing for your services.', startTime: 5, endTime: 10, sentiment: 0, confidence: 0.9 },
    ];

    it('should call generateJSON with transcript content', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        sentimentScore: 0.7,
        topics: ['pricing'],
        actionItems: ['Send pricing sheet'],
        keyInsights: ['Customer interested in pricing'],
        overallTone: 'POSITIVE',
        followUpRecommendation: 'Send pricing proposal within 24 hours',
      });

      await analyzeCallWithAI('call-ai-1', segments);
      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateJSON.mock.calls[0][0] as string;
      expect(prompt).toContain('Analyze this call transcript');
    });

    it('should merge AI insights into base analysis', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        sentimentScore: 0.8,
        topics: ['pricing', 'services'],
        actionItems: ['Follow up on pricing'],
        keyInsights: ['Strong buying signal detected'],
        overallTone: 'POSITIVE',
        followUpRecommendation: 'Schedule demo',
      });

      const result = await analyzeCallWithAI('call-ai-2', segments);
      expect(result.overallSentiment).toBe(0.8);
      expect(result.summary.keyPoints).toContain('Strong buying signal detected');
    });

    it('should fallback to rule-based analysis on AI failure', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const result = await analyzeCallWithAI('call-ai-3', segments);
      expect(result.callId).toBe('call-ai-3');
      expect(result.transcript).toHaveLength(2);
      // Should still have basic analysis
      expect(result.talkRatio.agent + result.talkRatio.caller).toBe(100);
    });

    it('should add AI action items to summary', async () => {
      mockGenerateJSON.mockResolvedValueOnce({
        sentimentScore: 0.5,
        topics: [],
        actionItems: ['Send brochure', 'Schedule follow-up'],
        keyInsights: [],
        overallTone: 'NEUTRAL',
        followUpRecommendation: '',
      });

      const result = await analyzeCallWithAI('call-ai-4', segments);
      expect(result.summary.actionItems).toContain('Send brochure');
      expect(result.summary.actionItems).toContain('Schedule follow-up');
    });
  });

  describe('calculateSentimentWithAI', () => {
    it('should use keyword approach for short text', async () => {
      const result = await calculateSentimentWithAI('great excellent');
      expect(result).toBeGreaterThan(0);
      // Should NOT call generateJSON for short text
      expect(mockGenerateJSON).not.toHaveBeenCalled();
    });

    it('should call generateJSON for longer text', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ sentiment: 0.75 });

      const longText = 'This is a much longer piece of text that contains many words and should trigger the AI-based sentiment analysis because it exceeds the twenty word threshold that we set for short text processing and this should make it use the AI path instead';
      const result = await calculateSentimentWithAI(longText);

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
      expect(result).toBe(0.75);
    });

    it('should fallback to keyword approach on AI failure', async () => {
      mockGenerateJSON.mockRejectedValueOnce(new Error('AI error'));

      const longText = 'This is a much longer piece of text that contains many words and should trigger the AI based sentiment analysis great excellent wonderful amazing fantastic brilliant absolutely perfect happy pleased delighted';
      const result = await calculateSentimentWithAI(longText);

      // Should still return a result from keyword approach
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(-1);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should clamp AI result between -1 and 1', async () => {
      mockGenerateJSON.mockResolvedValueOnce({ sentiment: 5.0 });

      const longText = 'This is a much longer piece of text that contains many words and should trigger the AI based sentiment analysis because it exceeds the twenty word threshold that we set for processing';
      const result = await calculateSentimentWithAI(longText);

      expect(result).toBeLessThanOrEqual(1);
    });
  });
});
