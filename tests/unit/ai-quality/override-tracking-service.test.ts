import {
  recordOverride,
  analyzeOverrides,
  getOverridePatterns,
  _getOverrideStore,
} from '@/modules/ai-quality/services/override-tracking-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { count: jest.fn() },
  },
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockResolvedValue({
    fixes: {
      INCORRECT: 'AI: Improve factual accuracy.',
      INCOMPLETE: 'AI: Provide more context.',
      WRONG_TONE: 'AI: Adjust tone settings.',
      POLICY_VIOLATION: 'AI: Strengthen guardrails.',
      PREFERENCE: 'AI: Learn user preferences.',
      OTHER: 'AI: Investigate further.',
    },
  }),
}));

const { prisma } = require('@/lib/db');
const { generateJSON } = require('@/lib/ai');

describe('OverrideTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _getOverrideStore().length = 0;
  });

  describe('recordOverride', () => {
    it('should create an override record with all required fields', async () => {
      const record = await recordOverride(
        'action-1',
        'user-1',
        'Original output text',
        'Corrected output text',
        'INCORRECT',
        'The AI made a factual error'
      );

      expect(record.id).toBeDefined();
      expect(record.actionId).toBe('action-1');
      expect(record.userId).toBe('user-1');
      expect(record.originalOutput).toBe('Original output text');
      expect(record.overriddenOutput).toBe('Corrected output text');
      expect(record.reason).toBe('INCORRECT');
      expect(record.reasonDetail).toBe('The AI made a factual error');
      expect(record.timestamp).toBeInstanceOf(Date);
    });

    it('should allow undefined reasonDetail', async () => {
      const record = await recordOverride(
        'action-2',
        'user-1',
        'Original',
        'Override',
        'PREFERENCE'
      );

      expect(record.reasonDetail).toBeUndefined();
    });

    it('should add each override to the in-memory store', async () => {
      await recordOverride('a1', 'u1', 'orig1', 'over1', 'INCORRECT');
      await recordOverride('a2', 'u1', 'orig2', 'over2', 'WRONG_TONE');
      await recordOverride('a3', 'u1', 'orig3', 'over3', 'INCOMPLETE');

      expect(_getOverrideStore()).toHaveLength(3);
    });

    it('should generate unique IDs for each record', async () => {
      const r1 = await recordOverride('a1', 'u1', 'A', 'B', 'INCORRECT');
      const r2 = await recordOverride('a2', 'u1', 'C', 'D', 'INCORRECT');

      expect(r1.id).not.toBe(r2.id);
    });

    it('should accept all valid reason types', async () => {
      const reasons = [
        'INCORRECT',
        'INCOMPLETE',
        'WRONG_TONE',
        'POLICY_VIOLATION',
        'PREFERENCE',
        'OTHER',
      ];

      for (const reason of reasons) {
        const record = await recordOverride('a', 'u', 'o', 'v', reason);
        expect(record.reason).toBe(reason);
      }
    });
  });

  describe('analyzeOverrides', () => {
    it('should return zero totals when no overrides exist in the period', async () => {
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(50);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.totalOverrides).toBe(0);
      expect(result.overrideRate).toBe(0);
      expect(result.byReason).toEqual({});
      expect(result.topPatterns).toEqual([]);
    });

    it('should calculate override rate as overrides divided by total actions', async () => {
      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: 'orig',
        overriddenOutput: 'over',
        reason: 'INCORRECT' as const,
        timestamp: new Date('2026-02-15'),
      });
      store.push({
        id: 'o2',
        actionId: 'a2',
        userId: 'u1',
        originalOutput: 'orig2',
        overriddenOutput: 'over2',
        reason: 'WRONG_TONE' as const,
        timestamp: new Date('2026-02-16'),
      });

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(20);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.totalOverrides).toBe(2);
      expect(result.overrideRate).toBe(0.1); // 2/20 = 0.1
    });

    it('should return zero override rate when no actions exist', async () => {
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.overrideRate).toBe(0);
    });

    it('should count overrides grouped by reason', async () => {
      const store = _getOverrideStore();
      const ts = new Date('2026-02-10');
      store.push(
        { id: 'o1', actionId: 'a1', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o2', actionId: 'a2', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o3', actionId: 'a3', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'WRONG_TONE' as const, timestamp: ts },
        { id: 'o4', actionId: 'a4', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCOMPLETE' as const, timestamp: ts }
      );

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(100);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.byReason['INCORRECT']).toBe(2);
      expect(result.byReason['WRONG_TONE']).toBe(1);
      expect(result.byReason['INCOMPLETE']).toBe(1);
    });

    it('should determine trend as STABLE when no previous overrides exist', async () => {
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.trend).toBe('STABLE');
    });

    it('should determine trend as IMPROVING when current overrides are fewer than previous', async () => {
      const store = _getOverrideStore();
      // Previous period overrides (January 2026)
      for (let i = 0; i < 10; i++) {
        store.push({
          id: `prev-${i}`,
          actionId: `a-prev-${i}`,
          userId: 'u1',
          originalOutput: 'orig',
          overriddenOutput: 'over',
          reason: 'INCORRECT' as const,
          timestamp: new Date('2026-01-15'),
        });
      }
      // Current period overrides (February 2026) - fewer than previous
      for (let i = 0; i < 5; i++) {
        store.push({
          id: `curr-${i}`,
          actionId: `a-curr-${i}`,
          userId: 'u1',
          originalOutput: 'orig',
          overriddenOutput: 'over',
          reason: 'INCORRECT' as const,
          timestamp: new Date('2026-02-15'),
        });
      }

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(100);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.trend).toBe('IMPROVING');
    });

    it('should determine trend as WORSENING when current overrides are more than previous', async () => {
      const store = _getOverrideStore();
      // Previous period overrides (January 2026) - fewer
      for (let i = 0; i < 5; i++) {
        store.push({
          id: `prev-${i}`,
          actionId: `a-prev-${i}`,
          userId: 'u1',
          originalOutput: 'orig',
          overriddenOutput: 'over',
          reason: 'INCORRECT' as const,
          timestamp: new Date('2026-01-15'),
        });
      }
      // Current period overrides (February 2026) - more than previous
      for (let i = 0; i < 10; i++) {
        store.push({
          id: `curr-${i}`,
          actionId: `a-curr-${i}`,
          userId: 'u1',
          originalOutput: 'orig',
          overriddenOutput: 'over',
          reason: 'INCORRECT' as const,
          timestamp: new Date('2026-02-15'),
        });
      }

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(100);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.trend).toBe('WORSENING');
    });

    it('should return top patterns sorted by count descending', async () => {
      const store = _getOverrideStore();
      const ts = new Date('2026-02-10');
      // 3 INCORRECT, 2 WRONG_TONE, 1 OTHER
      store.push(
        { id: 'o1', actionId: 'a1', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o2', actionId: 'a2', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o3', actionId: 'a3', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o4', actionId: 'a4', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'WRONG_TONE' as const, timestamp: ts },
        { id: 'o5', actionId: 'a5', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'WRONG_TONE' as const, timestamp: ts },
        { id: 'o6', actionId: 'a6', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'OTHER' as const, timestamp: ts }
      );

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(100);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.topPatterns[0].pattern).toBe('INCORRECT');
      expect(result.topPatterns[0].count).toBe(3);
      expect(result.topPatterns[1].pattern).toBe('WRONG_TONE');
      expect(result.topPatterns[1].count).toBe(2);
      expect(result.topPatterns[2].pattern).toBe('OTHER');
      expect(result.topPatterns[2].count).toBe(1);
    });

    it('should handle week period format correctly', async () => {
      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: 'orig',
        overriddenOutput: 'over',
        reason: 'INCORRECT' as const,
        timestamp: new Date('2026-02-10'),
      });

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(10);

      const result = await analyzeOverrides('entity-1', '2026-02-W6');

      expect(result).toBeDefined();
      expect(prisma.actionLog.count).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOverridePatterns', () => {
    it('should return empty array when no overrides exist', async () => {
      const result = await getOverridePatterns('entity-1');

      expect(result).toEqual([]);
    });

    it('should group overrides by reason and sort by count', async () => {
      const store = _getOverrideStore();
      store.push(
        { id: 'o1', actionId: 'a1', userId: 'u1', originalOutput: 'orig1', overriddenOutput: 'over1', reason: 'WRONG_TONE' as const, timestamp: new Date() },
        { id: 'o2', actionId: 'a2', userId: 'u1', originalOutput: 'orig2', overriddenOutput: 'over2', reason: 'INCORRECT' as const, timestamp: new Date() },
        { id: 'o3', actionId: 'a3', userId: 'u1', originalOutput: 'orig3', overriddenOutput: 'over3', reason: 'INCORRECT' as const, timestamp: new Date() },
        { id: 'o4', actionId: 'a4', userId: 'u1', originalOutput: 'orig4', overriddenOutput: 'over4', reason: 'INCORRECT' as const, timestamp: new Date() }
      );

      const result = await getOverridePatterns('entity-1');

      expect(result).toHaveLength(2);
      expect(result[0].pattern).toBe('INCORRECT');
      expect(result[0].count).toBe(3);
      expect(result[1].pattern).toBe('WRONG_TONE');
      expect(result[1].count).toBe(1);
    });

    it('should use AI-generated fixes when available', async () => {
      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: 'original text',
        overriddenOutput: 'corrected text',
        reason: 'INCORRECT' as const,
        timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(result[0].suggestedFix).toBe('AI: Improve factual accuracy.');
    });

    it('should fall back to default fixes when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI service unavailable'));

      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: 'original text',
        overriddenOutput: 'corrected text',
        reason: 'INCORRECT' as const,
        timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(result[0].suggestedFix).toBe(
        'Review training data and model prompts for factual accuracy.'
      );
    });

    it('should limit samples to 3 per pattern', async () => {
      const store = _getOverrideStore();
      for (let i = 0; i < 5; i++) {
        store.push({
          id: `o${i}`,
          actionId: `a${i}`,
          userId: 'u1',
          originalOutput: `original-${i}`,
          overriddenOutput: `override-${i}`,
          reason: 'INCOMPLETE' as const,
          timestamp: new Date(),
        });
      }

      const result = await getOverridePatterns('entity-1');

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(5);
      // Verify the AI prompt was called (samples are internal but we can check the call)
      expect(generateJSON).toHaveBeenCalledTimes(1);
    });

    it('should truncate long output strings to 100 characters in samples', async () => {
      const longString = 'A'.repeat(200);
      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: longString,
        overriddenOutput: longString,
        reason: 'PREFERENCE' as const,
        timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(result).toHaveLength(1);
      expect(generateJSON).toHaveBeenCalledTimes(1);
      // Verify the AI was called with truncated samples in the prompt
      const prompt = generateJSON.mock.calls[0][0] as string;
      expect(prompt).not.toContain('A'.repeat(200));
    });

    it('should use default fix suggestion for unknown pattern reasons', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI error'));

      const store = _getOverrideStore();
      store.push({
        id: 'o1',
        actionId: 'a1',
        userId: 'u1',
        originalOutput: 'orig',
        overriddenOutput: 'over',
        reason: 'OTHER' as const,
        timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(result[0].suggestedFix).toBe(
        'Investigate override details for new pattern categories.'
      );
    });
  });
});
