// Mock uuid before importing service
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated habit insight'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

// Mock prisma and productivity scoring
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    task: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
  },
}));

import {
  calculateStreak,
  pearsonCorrelation,
} from '@/modules/analytics/services/habit-tracking-service';

describe('calculateStreak', () => {
  it('should return 0 for empty history', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('should return consecutive completions from today', () => {
    const history = [
      { date: '2026-02-12', completed: true },
      { date: '2026-02-13', completed: true },
      { date: '2026-02-14', completed: true },
      { date: '2026-02-15', completed: true },
    ];
    expect(calculateStreak(history)).toBe(4);
  });

  it('should break streak on missed day', () => {
    const history = [
      { date: '2026-02-11', completed: true },
      { date: '2026-02-12', completed: false },
      { date: '2026-02-13', completed: true },
      { date: '2026-02-14', completed: true },
      { date: '2026-02-15', completed: true },
    ];
    // Most recent 3 are complete, then a false breaks it
    expect(calculateStreak(history)).toBe(3);
  });

  it('should handle weekday-only frequency', () => {
    // Only weekday entries present
    const history = [
      { date: '2026-02-10', completed: true }, // Monday
      { date: '2026-02-11', completed: true }, // Tuesday
      { date: '2026-02-12', completed: true }, // Wednesday
      { date: '2026-02-13', completed: true }, // Thursday
      { date: '2026-02-14', completed: true }, // Friday
    ];
    expect(calculateStreak(history)).toBe(5);
  });
});

describe('calculateCorrelations (Pearson)', () => {
  it('should return Pearson correlation coefficient', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const r = pearsonCorrelation(x, y);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it('should return positive correlation for correlated data', () => {
    const x = [1, 1, 0, 1, 0, 1, 1, 0, 1, 1];
    const y = [80, 85, 60, 75, 55, 90, 82, 58, 88, 79];
    const r = pearsonCorrelation(x, y);
    expect(r).toBeGreaterThan(0);
  });

  it('should return negative correlation for anti-correlated data', () => {
    const x = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    const y = [50, 90, 55, 85, 48, 92, 52, 88, 49, 91];
    const r = pearsonCorrelation(x, y);
    expect(r).toBeLessThan(0);
  });

  it('should return near-zero for uncorrelated data', () => {
    const x = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    const y = [70, 72, 68, 75, 71, 69, 73, 70, 72, 71];
    const r = pearsonCorrelation(x, y);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  it('should handle insufficient data points gracefully', () => {
    const x = [1];
    const y = [80];
    const r = pearsonCorrelation(x, y);
    expect(r).toBe(0);
  });
});
