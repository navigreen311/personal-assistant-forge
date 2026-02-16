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
  forecastEnergy,
  getOptimalSchedule,
} from '@/modules/health/services/energy-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('energy-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no sleep or energy data
    (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);
  });

  describe('forecastEnergy', () => {
    it('produces 24-hour energy forecast', async () => {
      const result = await forecastEnergy('user-1', '2026-02-15');

      expect(result.hourlyEnergy).toHaveLength(24);
      expect(result.hourlyEnergy[0]).toEqual({
        hour: 0,
        energyLevel: expect.any(Number),
        confidence: expect.any(Number),
      });
      expect(result.userId).toBe('user-1');
      expect(result.date).toBe('2026-02-15');
    });

    it('uses sleep data to calculate base energy', async () => {
      // Good sleep data
      (mockPrisma.healthMetric.findMany as jest.Mock)
        .mockResolvedValueOnce([ // sleep query
          { id: 'hm-1', entityId: 'user-1', type: 'sleep', value: 8.0, unit: 'hours', source: 'manual', metadata: null, recordedAt: new Date(), createdAt: new Date() },
          { id: 'hm-2', entityId: 'user-1', type: 'sleep', value: 7.5, unit: 'hours', source: 'manual', metadata: null, recordedAt: new Date(), createdAt: new Date() },
        ])
        .mockResolvedValueOnce([]); // energy history query

      const goodSleepResult = await forecastEnergy('user-1', '2026-02-15');

      // Poor sleep data
      (mockPrisma.healthMetric.findMany as jest.Mock)
        .mockResolvedValueOnce([ // sleep query
          { id: 'hm-3', entityId: 'user-1', type: 'sleep', value: 4.0, unit: 'hours', source: 'manual', metadata: null, recordedAt: new Date(), createdAt: new Date() },
        ])
        .mockResolvedValueOnce([]); // energy history query

      const poorSleepResult = await forecastEnergy('user-1', '2026-02-15');

      // Peak energy should be higher with good sleep
      const goodPeakEnergy = Math.max(...goodSleepResult.hourlyEnergy.map(h => h.energyLevel));
      const poorPeakEnergy = Math.max(...poorSleepResult.hourlyEnergy.map(h => h.energyLevel));

      expect(goodPeakEnergy).toBeGreaterThan(poorPeakEnergy);
    });

    it('calls generateJSON for recommendation', async () => {
      mockGenerateJSON.mockResolvedValue({
        recommendation: 'Focus on deep work in the morning.',
        peakHours: [10, 11],
        troughHours: [14],
      });

      const result = await forecastEnergy('user-1', '2026-02-15');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result.recommendation).toBe('Focus on deep work in the morning.');
    });

    it('falls back to rule-based recommendation when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await forecastEnergy('user-1', '2026-02-15');

      expect(result.recommendation).toBeTruthy();
      expect(typeof result.recommendation).toBe('string');
    });

    it('energy levels are deterministic (no Math.random)', async () => {
      const result1 = await forecastEnergy('user-1', '2026-02-15');

      // Reset mock to return same data
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result2 = await forecastEnergy('user-1', '2026-02-15');

      // Energy levels should be identical for same inputs
      for (let i = 0; i < 24; i++) {
        expect(result1.hourlyEnergy[i].energyLevel).toBe(result2.hourlyEnergy[i].energyLevel);
      }
    });

    it('produces different results for different dates', async () => {
      const result1 = await forecastEnergy('user-1', '2026-02-15');

      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result2 = await forecastEnergy('user-1', '2026-02-16');

      // At least some hours should differ due to date-based perturbation
      const anyDifferent = result1.hourlyEnergy.some(
        (h, i) => h.energyLevel !== result2.hourlyEnergy[i].energyLevel
      );
      expect(anyDifferent).toBe(true);
    });
  });

  describe('getOptimalSchedule', () => {
    it('categorizes hours into deep work, meetings, breaks', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await getOptimalSchedule('user-1', '2026-02-15');

      expect(result).toHaveProperty('deepWorkSlots');
      expect(result).toHaveProperty('meetingSlots');
      expect(result).toHaveProperty('breakSlots');
      expect(Array.isArray(result.deepWorkSlots)).toBe(true);
      expect(Array.isArray(result.meetingSlots)).toBe(true);
      expect(Array.isArray(result.breakSlots)).toBe(true);
    });

    it('uses AI-generated schedule when available', async () => {
      mockGenerateJSON
        .mockResolvedValueOnce({ recommendation: 'test', peakHours: [10], troughHours: [14] }) // from forecastEnergy
        .mockResolvedValueOnce({
          deepWorkSlots: ['10:00', '11:00'],
          meetingSlots: ['14:00'],
          breakSlots: ['13:00'],
        });

      const result = await getOptimalSchedule('user-1', '2026-02-15');

      expect(result.deepWorkSlots).toContain('10:00');
      expect(result.meetingSlots).toContain('14:00');
    });

    it('falls back to rule-based slots when AI fails', async () => {
      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await getOptimalSchedule('user-1', '2026-02-15');

      // All time strings should be in HH:00 format
      const allSlots = [...result.deepWorkSlots, ...result.meetingSlots, ...result.breakSlots];
      for (const slot of allSlots) {
        expect(slot).toMatch(/^\d{2}:00$/);
      }
    });
  });
});
