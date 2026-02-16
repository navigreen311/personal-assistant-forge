import { calculateConfidence } from '@/modules/ai-quality/services/confidence-service';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: { findMany: jest.fn() },
  },
}));

describe('calculateConfidence', () => {
  it('should return AUTO_EXECUTE for confidence >= 0.9', () => {
    const result = calculateConfidence('action1', [
      { factor: 'accuracy', weight: 1, value: 0.95 },
    ]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.recommendation).toBe('AUTO_EXECUTE');
  });

  it('should return REVIEW_RECOMMENDED for confidence 0.7-0.9', () => {
    const result = calculateConfidence('action2', [
      { factor: 'accuracy', weight: 1, value: 0.8 },
    ]);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.confidence).toBeLessThan(0.9);
    expect(result.recommendation).toBe('REVIEW_RECOMMENDED');
  });

  it('should return HUMAN_REQUIRED for confidence < 0.7', () => {
    const result = calculateConfidence('action3', [
      { factor: 'accuracy', weight: 1, value: 0.5 },
    ]);
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.recommendation).toBe('HUMAN_REQUIRED');
  });

  it('should calculate weighted average correctly', () => {
    const result = calculateConfidence('action4', [
      { factor: 'a', weight: 0.6, value: 1.0 },
      { factor: 'b', weight: 0.4, value: 0.5 },
    ]);
    // Expected: (0.6 * 1.0 + 0.4 * 0.5) / (0.6 + 0.4) = 0.8 / 1.0 = 0.8
    expect(result.confidence).toBeCloseTo(0.8, 2);
    expect(result.recommendation).toBe('REVIEW_RECOMMENDED');
  });

  it('should handle empty factors array', () => {
    const result = calculateConfidence('action5', []);
    expect(result.confidence).toBe(0);
    expect(result.recommendation).toBe('HUMAN_REQUIRED');
  });
});
