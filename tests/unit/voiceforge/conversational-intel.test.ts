import {
  extractKeyInfo,
  calculateSentiment,
  calculateTalkRatio,
  checkCompliance,
  generateSummary,
  analyzeCall,
} from '@/modules/voiceforge/services/conversational-intel';
import type { TranscriptSegment } from '@/modules/voiceforge/types';

describe('Conversational Intelligence', () => {
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
});
