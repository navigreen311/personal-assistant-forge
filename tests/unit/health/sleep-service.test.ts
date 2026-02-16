jest.mock('@/lib/db', () => ({
  prisma: {
    healthMetric: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  getSleepHistory,
  analyzeSleepPatterns,
  getSleepScore,
} from '@/modules/health/services/sleep-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('sleep-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSleepHistory', () => {
    it('queries HealthMetric with type=sleep and date filter', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getSleepHistory('user-1', 14);

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          type: 'sleep',
          recordedAt: { gte: expect.any(Date) },
        },
        orderBy: { recordedAt: 'desc' },
      });
    });

    it('returns empty array when no data exists', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getSleepHistory('user-1', 7);
      expect(result).toEqual([]);
    });

    it('maps DB records to SleepData type correctly', async () => {
      const mockRecords = [
        {
          id: 'hm-1',
          entityId: 'user-1',
          type: 'sleep',
          value: 7.5,
          unit: 'hours',
          source: 'manual',
          metadata: {
            deepSleepHours: 1.8,
            remSleepHours: 1.5,
            lightSleepHours: 3.8,
            awakeMinutes: 12,
            bedTime: '22:30',
            wakeTime: '06:00',
          },
          recordedAt: new Date('2026-02-15'),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      const result = await getSleepHistory('user-1', 7);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        date: expect.stringMatching(/^2026-02-1[45]$/), // timezone-dependent
        totalHours: 7.5,
        deepSleepHours: 1.8,
        remSleepHours: 1.5,
        lightSleepHours: 3.8,
        awakeMinutes: 12,
        sleepScore: expect.any(Number),
        bedTime: '22:30',
        wakeTime: '06:00',
      });
    });

    it('handles records with missing metadata gracefully', async () => {
      const mockRecords = [
        {
          id: 'hm-2',
          entityId: 'user-1',
          type: 'sleep',
          value: 6.0,
          unit: 'hours',
          source: 'manual',
          metadata: null,
          recordedAt: new Date('2026-02-14'),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      const result = await getSleepHistory('user-1', 7);

      expect(result).toHaveLength(1);
      expect(result[0].totalHours).toBe(6.0);
      expect(result[0].deepSleepHours).toBe(0);
      expect(result[0].remSleepHours).toBe(0);
      expect(result[0].sleepScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sleep score calculation', () => {
    it('produces expected values from known metadata', async () => {
      // 8 hours total sleep, 1.6h deep (20%), 2.0h rem (25%), 10 min awake
      const mockRecords = [
        {
          id: 'hm-score',
          entityId: 'user-1',
          type: 'sleep',
          value: 8.0,
          unit: 'hours',
          source: 'manual',
          metadata: {
            deepSleepHours: 1.6,
            remSleepHours: 2.0,
            lightSleepHours: 4.2,
            awakeMinutes: 10,
            bedTime: '22:00',
            wakeTime: '06:00',
          },
          recordedAt: new Date('2026-02-15'),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      const result = await getSleepHistory('user-1', 7);
      const score = result[0].sleepScore;

      // Score should be reasonable for typical good sleep (deep=20%, rem=25%, 8h)
      expect(score).toBeGreaterThanOrEqual(40);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('gives lower scores for poor sleep metrics', async () => {
      // Poor sleep: 4 hours, lots of awake time
      const poorSleepRecords = [
        {
          id: 'hm-poor',
          entityId: 'user-1',
          type: 'sleep',
          value: 4.0,
          unit: 'hours',
          source: 'manual',
          metadata: {
            deepSleepHours: 0.3,
            remSleepHours: 0.5,
            lightSleepHours: 2.7,
            awakeMinutes: 60,
            bedTime: '02:00',
            wakeTime: '06:30',
          },
          recordedAt: new Date('2026-02-15'),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(poorSleepRecords);

      const poorResult = await getSleepHistory('user-1', 7);
      const poorScore = poorResult[0].sleepScore;

      // Good sleep for comparison
      const goodSleepRecords = [
        {
          id: 'hm-good',
          entityId: 'user-1',
          type: 'sleep',
          value: 8.0,
          unit: 'hours',
          source: 'manual',
          metadata: {
            deepSleepHours: 2.0,
            remSleepHours: 2.0,
            lightSleepHours: 3.8,
            awakeMinutes: 5,
            bedTime: '22:00',
            wakeTime: '06:00',
          },
          recordedAt: new Date('2026-02-15'),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(goodSleepRecords);

      const goodResult = await getSleepHistory('user-1', 7);
      const goodScore = goodResult[0].sleepScore;

      expect(poorScore).toBeLessThan(goodScore);
    });
  });

  describe('analyzeSleepPatterns', () => {
    it('returns default optimization when no data', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result = await analyzeSleepPatterns('user-1');

      expect(result).toEqual({
        userId: 'user-1',
        averageSleepScore: 0,
        idealBedTime: '22:30',
        idealWakeTime: '06:30',
        correlations: [],
        recommendations: ['Insufficient data to analyze sleep patterns.'],
      });
    });

    it('calls generateJSON with sleep data summary', async () => {
      const mockRecords = [
        {
          id: 'hm-1', entityId: 'user-1', type: 'sleep', value: 7.5, unit: 'hours',
          source: 'manual', metadata: { deepSleepHours: 1.5, remSleepHours: 1.5, lightSleepHours: 4.0, awakeMinutes: 10, bedTime: '22:30', wakeTime: '06:00' },
          recordedAt: new Date('2026-02-15'), createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      mockGenerateJSON.mockResolvedValue({
        correlations: [{ factor: 'Deep sleep', correlation: 0.9, suggestion: 'More deep sleep' }],
        recommendations: ['Go to bed earlier.'],
      });

      const result = await analyzeSleepPatterns('user-1');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.correlations).toHaveLength(1);
      expect(result.recommendations).toContain('Go to bed earlier.');
    });

    it('falls back to static analysis when AI fails', async () => {
      const mockRecords = [
        {
          id: 'hm-1', entityId: 'user-1', type: 'sleep', value: 7.0, unit: 'hours',
          source: 'manual', metadata: { deepSleepHours: 1.0, remSleepHours: 1.5, lightSleepHours: 4.0, awakeMinutes: 15, bedTime: '23:00', wakeTime: '06:00' },
          recordedAt: new Date('2026-02-15'), createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await analyzeSleepPatterns('user-1');

      expect(result.correlations.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.correlations[0].factor).toBe('Deep sleep duration');
    });
  });

  describe('getSleepScore', () => {
    it('returns score for specific date', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue({
        id: 'hm-1', entityId: 'user-1', type: 'sleep', value: 8.0, unit: 'hours',
        source: 'manual', metadata: { deepSleepHours: 2.0, remSleepHours: 2.0, lightSleepHours: 3.5, awakeMinutes: 10, bedTime: '22:00', wakeTime: '06:00' },
        recordedAt: new Date('2026-02-15'), createdAt: new Date(),
      });

      const score = await getSleepScore('user-1', '2026-02-15');

      expect(mockPrisma.healthMetric.findFirst).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          type: 'sleep',
          recordedAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        },
      });
      expect(score).toBeGreaterThan(0);
    });

    it('returns 0 when no record found', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue(null);

      const score = await getSleepScore('user-1', '2026-01-01');
      expect(score).toBe(0);
    });
  });
});
