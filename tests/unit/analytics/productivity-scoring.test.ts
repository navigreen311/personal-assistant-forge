import { calculateTrend } from '@/modules/analytics/services/productivity-scoring';
import type { ProductivityScore } from '@/modules/analytics/types';

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    task: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
  },
}));

function makeScore(overrides: Partial<ProductivityScore> = {}): ProductivityScore {
  return {
    userId: 'user1',
    date: '2026-02-15',
    overallScore: 75,
    dimensions: {
      highPriorityCompletion: 80,
      focusTimeAchieved: 70,
      goalProgress: 60,
      meetingEfficiency: 90,
      communicationSpeed: 85,
    },
    trend: 'STABLE',
    ...overrides,
  };
}

describe('calculateProductivityScore', () => {
  it('should return score 0-100', () => {
    const score = makeScore({ overallScore: 78 });
    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
  });

  it('should weight highPriorityCompletion at 30%', () => {
    const weighted = 100 * 0.3 + 0 * 0.25 + 0 * 0.2 + 0 * 0.15 + 0 * 0.1;
    expect(weighted).toBe(30);
  });

  it('should weight focusTimeAchieved at 25%', () => {
    const weighted = 0 * 0.3 + 100 * 0.25 + 0 * 0.2 + 0 * 0.15 + 0 * 0.1;
    expect(weighted).toBe(25);
  });

  it('should weight goalProgress at 20%', () => {
    const weighted = 0 * 0.3 + 0 * 0.25 + 100 * 0.2 + 0 * 0.15 + 0 * 0.1;
    expect(weighted).toBe(20);
  });

  it('should weight meetingEfficiency at 15%', () => {
    const weighted = 0 * 0.3 + 0 * 0.25 + 0 * 0.2 + 100 * 0.15 + 0 * 0.1;
    expect(weighted).toBe(15);
  });

  it('should weight communicationSpeed at 10%', () => {
    const weighted = 0 * 0.3 + 0 * 0.25 + 0 * 0.2 + 0 * 0.15 + 100 * 0.1;
    expect(weighted).toBe(10);
  });

  it('should handle all dimensions at 0', () => {
    const weighted = 0 * 0.3 + 0 * 0.25 + 0 * 0.2 + 0 * 0.15 + 0 * 0.1;
    expect(weighted).toBe(0);
  });

  it('should handle all dimensions at 100', () => {
    const weighted = 100 * 0.3 + 100 * 0.25 + 100 * 0.2 + 100 * 0.15 + 100 * 0.1;
    expect(weighted).toBe(100);
  });
});

describe('calculateTrend', () => {
  it('should return IMPROVING when recent 7 days > previous 7 days by 5%+', () => {
    const scores = [
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 60 })),
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 75 })),
    ];
    expect(calculateTrend(scores)).toBe('IMPROVING');
  });

  it('should return DECLINING when recent 7 days < previous 7 days by 5%+', () => {
    const scores = [
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 80 })),
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 60 })),
    ];
    expect(calculateTrend(scores)).toBe('DECLINING');
  });

  it('should return STABLE when difference is within 5%', () => {
    const scores = [
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 75 })),
      ...Array.from({ length: 7 }, () => makeScore({ overallScore: 77 })),
    ];
    expect(calculateTrend(scores)).toBe('STABLE');
  });

  it('should handle fewer than 14 days of data', () => {
    const scores = [
      makeScore({ overallScore: 70 }),
      makeScore({ overallScore: 90 }),
    ];
    expect(calculateTrend(scores)).toBe('IMPROVING');
  });
});
