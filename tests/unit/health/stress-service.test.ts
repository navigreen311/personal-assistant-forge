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
  recordStressLevel,
  getStressHistory,
  suggestScheduleAdjustments,
  getStressTrend,
} from '@/modules/health/services/stress-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('stress-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordStressLevel', () => {
    it('creates HealthMetric with type=stress', async () => {
      (mockPrisma.healthMetric.create as jest.Mock).mockResolvedValue({
        id: 'hm-stress-1',
        entityId: 'user-1',
        type: 'stress',
        value: 65,
        unit: 'score',
        source: 'manual',
        metadata: { triggers: ['work'] },
        recordedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await recordStressLevel('user-1', 65, 'manual', ['work']);

      expect(mockPrisma.healthMetric.create).toHaveBeenCalledWith({
        data: {
          entityId: 'user-1',
          type: 'stress',
          value: 65,
          unit: 'score',
          source: 'manual',
          metadata: { triggers: ['work'] },
          recordedAt: expect.any(Date),
        },
      });
      expect(result.level).toBe(65);
      expect(result.userId).toBe('user-1');
    });

    it('stores triggers in metadata', async () => {
      const triggers = ['deadline', 'meetings', 'commute'];
      (mockPrisma.healthMetric.create as jest.Mock).mockResolvedValue({
        id: 'hm-stress-2',
        entityId: 'user-1',
        type: 'stress',
        value: 80,
        unit: 'score',
        source: 'manual',
        metadata: { triggers },
        recordedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await recordStressLevel('user-1', 80, 'manual', triggers);

      expect(result.triggers).toEqual(triggers);
    });

    it('clamps level to 0-100', async () => {
      // Test over 100
      (mockPrisma.healthMetric.create as jest.Mock).mockImplementation(({ data }: { data: { value: number } }) => ({
        id: 'hm-clamped',
        entityId: 'user-1',
        type: 'stress',
        value: data.value,
        unit: 'score',
        source: 'manual',
        metadata: { triggers: [] },
        recordedAt: new Date(),
        createdAt: new Date(),
      }));

      await recordStressLevel('user-1', 150, 'manual');
      expect(mockPrisma.healthMetric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ value: 100 }),
        })
      );

      // Test under 0
      await recordStressLevel('user-1', -10, 'manual');
      expect(mockPrisma.healthMetric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ value: 0 }),
        })
      );
    });

    it('defaults triggers to empty array when not provided', async () => {
      (mockPrisma.healthMetric.create as jest.Mock).mockResolvedValue({
        id: 'hm-no-triggers',
        entityId: 'user-1',
        type: 'stress',
        value: 40,
        unit: 'score',
        source: 'wearable',
        metadata: { triggers: [] },
        recordedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await recordStressLevel('user-1', 40, 'wearable');

      expect(mockPrisma.healthMetric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { triggers: [] },
          }),
        })
      );
      expect(result.triggers).toEqual([]);
    });
  });

  describe('getStressHistory', () => {
    it('queries DB with date filter', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getStressHistory('user-1', 7);

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          type: 'stress',
          recordedAt: { gte: expect.any(Date) },
        },
        orderBy: { recordedAt: 'desc' },
      });
    });

    it('maps DB records to StressLevel', async () => {
      const mockRecords = [
        {
          id: 'hm-1', entityId: 'user-1', type: 'stress', value: 75, unit: 'score',
          source: 'wearable', metadata: { triggers: ['meeting'] },
          recordedAt: new Date('2026-02-15T10:00:00Z'), createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      const result = await getStressHistory('user-1', 7);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        userId: 'user-1',
        timestamp: new Date('2026-02-15T10:00:00Z'),
        level: 75,
        source: 'wearable',
        triggers: ['meeting'],
      });
    });
  });

  describe('suggestScheduleAdjustments', () => {
    it('returns empty for low stress', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'hm-low', entityId: 'user-1', type: 'stress', value: 40, unit: 'score',
          source: 'manual', metadata: { triggers: [] },
          recordedAt: new Date(), createdAt: new Date(),
        },
      ]);

      const result = await suggestScheduleAdjustments('user-1');
      expect(result).toEqual([]);
    });

    it('returns empty when no stress data exists', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result = await suggestScheduleAdjustments('user-1');
      expect(result).toEqual([]);
    });

    it('calls generateJSON for high stress', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'hm-high', entityId: 'user-1', type: 'stress', value: 85, unit: 'score',
          source: 'manual', metadata: { triggers: ['deadline'] },
          recordedAt: new Date(), createdAt: new Date(),
        },
      ]);

      const mockAdjustments = [
        { suggestion: 'Take a 10 minute break', adjustmentType: 'BREAK', reason: 'Stress is high' },
      ];
      mockGenerateJSON.mockResolvedValue(mockAdjustments);

      const result = await suggestScheduleAdjustments('user-1');

      expect(mockGenerateJSON).toHaveBeenCalled();
      expect(result).toEqual(mockAdjustments);
    });

    it('falls back to rule-based suggestions when AI fails', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'hm-critical', entityId: 'user-1', type: 'stress', value: 95, unit: 'score',
          source: 'manual', metadata: { triggers: [] },
          recordedAt: new Date(), createdAt: new Date(),
        },
      ]);

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await suggestScheduleAdjustments('user-1');

      expect(result.length).toBeGreaterThan(0);
      // Critical stress (>90) should include CANCEL and BREAK
      const types = result.map(a => a.adjustmentType);
      expect(types).toContain('CANCEL');
      expect(types).toContain('BREAK');
    });
  });

  describe('getStressTrend', () => {
    it('aggregates daily averages correctly', async () => {
      const mockRecords = [
        {
          id: 'hm-1', entityId: 'user-1', type: 'stress', value: 60, unit: 'score',
          source: 'manual', metadata: { triggers: [] },
          recordedAt: new Date('2026-02-15T08:00:00Z'), createdAt: new Date(),
        },
        {
          id: 'hm-2', entityId: 'user-1', type: 'stress', value: 80, unit: 'score',
          source: 'manual', metadata: { triggers: [] },
          recordedAt: new Date('2026-02-15T14:00:00Z'), createdAt: new Date(),
        },
        {
          id: 'hm-3', entityId: 'user-1', type: 'stress', value: 50, unit: 'score',
          source: 'manual', metadata: { triggers: [] },
          recordedAt: new Date('2026-02-14T10:00:00Z'), createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockRecords);

      const result = await getStressTrend('user-1', 7);

      expect(result).toHaveLength(2);
      // Sorted by date ascending
      expect(result[0].date).toBe('2026-02-14');
      expect(result[0].average).toBe(50);
      expect(result[1].date).toBe('2026-02-15');
      expect(result[1].average).toBe(70); // (60 + 80) / 2
    });

    it('returns empty for no data', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getStressTrend('user-1', 7);
      expect(result).toEqual([]);
    });
  });
});
