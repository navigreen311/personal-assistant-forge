import {
  calculateConfidence,
  getConfidenceDistribution,
} from '@/modules/ai-quality/services/confidence-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { findMany: jest.fn() },
  },
}));

const { prisma } = require('@/lib/db');

describe('ConfidenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateConfidence', () => {
    it('should return HUMAN_REQUIRED with 0 confidence for empty factors', () => {
      const result = calculateConfidence('action-1', []);

      expect(result.actionId).toBe('action-1');
      expect(result.confidence).toBe(0);
      expect(result.factors).toEqual([]);
      expect(result.recommendation).toBe('HUMAN_REQUIRED');
    });

    it('should return AUTO_EXECUTE for confidence >= 0.9', () => {
      const result = calculateConfidence('action-2', [
        { factor: 'historical', weight: 1, value: 0.95 },
        { factor: 'model', weight: 1, value: 0.92 },
      ]);

      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.recommendation).toBe('AUTO_EXECUTE');
    });

    it('should return REVIEW_RECOMMENDED for confidence >= 0.7 and < 0.9', () => {
      const result = calculateConfidence('action-3', [
        { factor: 'historical', weight: 1, value: 0.8 },
        { factor: 'model', weight: 1, value: 0.75 },
      ]);

      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.confidence).toBeLessThan(0.9);
      expect(result.recommendation).toBe('REVIEW_RECOMMENDED');
    });

    it('should return HUMAN_REQUIRED for confidence < 0.7', () => {
      const result = calculateConfidence('action-4', [
        { factor: 'historical', weight: 1, value: 0.3 },
        { factor: 'model', weight: 1, value: 0.5 },
      ]);

      expect(result.confidence).toBeLessThan(0.7);
      expect(result.recommendation).toBe('HUMAN_REQUIRED');
    });

    it('should compute weighted average correctly', () => {
      const result = calculateConfidence('action-5', [
        { factor: 'a', weight: 3, value: 1.0 },
        { factor: 'b', weight: 1, value: 0.0 },
      ]);

      // (3*1.0 + 1*0.0) / (3+1) = 0.75
      expect(result.confidence).toBe(0.75);
    });

    it('should clamp confidence to [0, 1] range', () => {
      const result = calculateConfidence('action-6', [
        { factor: 'a', weight: 1, value: 1.5 },
      ]);

      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should include factors in the result', () => {
      const factors = [
        { factor: 'history', weight: 2, value: 0.8 },
        { factor: 'context', weight: 1, value: 0.6 },
      ];
      const result = calculateConfidence('action-7', factors);

      expect(result.factors).toEqual(factors);
    });
  });

  describe('getConfidenceDistribution', () => {
    it('should bucket action log entries by confidence', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        { cost: 0.1 },
        { cost: 0.4 },
        { cost: 0.6 },
        { cost: 0.8 },
        { cost: 0.95 },
      ]);

      const result = await getConfidenceDistribution('entity-1', '2026-02');

      expect(result).toHaveLength(5);
      const bucketMap = Object.fromEntries(result.map((b) => [b.bucket, b.count]));
      expect(bucketMap['0-0.3']).toBe(1);
      expect(bucketMap['0.3-0.5']).toBe(1);
      expect(bucketMap['0.5-0.7']).toBe(1);
      expect(bucketMap['0.7-0.9']).toBe(1);
      expect(bucketMap['0.9-1.0']).toBe(1);
    });

    it('should return all zero counts when no actions exist', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getConfidenceDistribution('entity-1', '2026-02');

      expect(result).toHaveLength(5);
      for (const bucket of result) {
        expect(bucket.count).toBe(0);
      }
    });

    it('should use 0.5 fallback when cost is null', async () => {
      (prisma.actionLog.findMany as jest.Mock).mockResolvedValue([
        { cost: null },
        { cost: undefined },
      ]);

      const result = await getConfidenceDistribution('entity-1', '2026-02');

      const bucketMap = Object.fromEntries(result.map((b) => [b.bucket, b.count]));
      expect(bucketMap['0.5-0.7']).toBe(2);
    });
  });
});
