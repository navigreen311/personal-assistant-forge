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
      INCORRECT: 'AI: Improve model accuracy.',
      WRONG_TONE: 'AI: Adjust tone settings.',
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
    it('should create an override record with all fields', async () => {
      const record = await recordOverride(
        'action-1',
        'user-1',
        'Original text',
        'Overridden text',
        'INCORRECT',
        'Factual error in the output'
      );

      expect(record.id).toBeDefined();
      expect(record.actionId).toBe('action-1');
      expect(record.userId).toBe('user-1');
      expect(record.originalOutput).toBe('Original text');
      expect(record.overriddenOutput).toBe('Overridden text');
      expect(record.reason).toBe('INCORRECT');
      expect(record.reasonDetail).toBe('Factual error in the output');
      expect(record.timestamp).toBeInstanceOf(Date);
    });

    it('should allow reasonDetail to be undefined', async () => {
      const record = await recordOverride(
        'action-2',
        'user-1',
        'Original',
        'Override',
        'PREFERENCE'
      );

      expect(record.reasonDetail).toBeUndefined();
    });

    it('should add the override to the store', async () => {
      await recordOverride('action-1', 'user-1', 'A', 'B', 'INCORRECT');
      await recordOverride('action-2', 'user-1', 'C', 'D', 'WRONG_TONE');

      expect(_getOverrideStore()).toHaveLength(2);
    });
  });

  describe('analyzeOverrides', () => {
    it('should calculate override rate as overrides/totalActions', async () => {
      // Record overrides with timestamps in the right period
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

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.totalOverrides).toBe(1);
      expect(result.overrideRate).toBe(0.1);
    });

    it('should return zero override rate when no actions exist', async () => {
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.overrideRate).toBe(0);
    });

    it('should count overrides by reason', async () => {
      const store = _getOverrideStore();
      const ts = new Date('2026-02-10');
      store.push(
        { id: 'o1', actionId: 'a1', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o2', actionId: 'a2', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'INCORRECT' as const, timestamp: ts },
        { id: 'o3', actionId: 'a3', userId: 'u1', originalOutput: 'a', overriddenOutput: 'b', reason: 'WRONG_TONE' as const, timestamp: ts }
      );

      (prisma.actionLog.count as jest.Mock).mockResolvedValue(100);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.byReason['INCORRECT']).toBe(2);
      expect(result.byReason['WRONG_TONE']).toBe(1);
    });

    it('should determine trend as STABLE when no previous overrides exist', async () => {
      (prisma.actionLog.count as jest.Mock).mockResolvedValue(0);

      const result = await analyzeOverrides('entity-1', '2026-02');

      expect(result.trend).toBe('STABLE');
    });
  });

  describe('getOverridePatterns', () => {
    it('should return empty array when no overrides exist', async () => {
      const result = await getOverridePatterns('entity-1');
      expect(result).toEqual([]);
    });

    it('should group overrides by reason with counts', async () => {
      const store = _getOverrideStore();
      store.push(
        { id: 'o1', actionId: 'a1', userId: 'u1', originalOutput: 'orig1', overriddenOutput: 'over1', reason: 'INCORRECT' as const, timestamp: new Date() },
        { id: 'o2', actionId: 'a2', userId: 'u1', originalOutput: 'orig2', overriddenOutput: 'over2', reason: 'INCORRECT' as const, timestamp: new Date() },
        { id: 'o3', actionId: 'a3', userId: 'u1', originalOutput: 'orig3', overriddenOutput: 'over3', reason: 'WRONG_TONE' as const, timestamp: new Date() }
      );

      const result = await getOverridePatterns('entity-1');

      expect(result).toHaveLength(2);
      expect(result[0].pattern).toBe('INCORRECT');
      expect(result[0].count).toBe(2);
      expect(result[1].pattern).toBe('WRONG_TONE');
      expect(result[1].count).toBe(1);
    });

    it('should use AI-generated fixes when available', async () => {
      const store = _getOverrideStore();
      store.push({
        id: 'o1', actionId: 'a1', userId: 'u1',
        originalOutput: 'orig', overriddenOutput: 'over',
        reason: 'INCORRECT' as const, timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(result[0].suggestedFix).toBe('AI: Improve model accuracy.');
    });

    it('should fall back to default fixes when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

      const store = _getOverrideStore();
      store.push({
        id: 'o1', actionId: 'a1', userId: 'u1',
        originalOutput: 'orig', overriddenOutput: 'over',
        reason: 'INCORRECT' as const, timestamp: new Date(),
      });

      const result = await getOverridePatterns('entity-1');

      expect(result[0].suggestedFix).toBe(
        'Review training data and model prompts for factual accuracy.'
      );
    });
  });
});
