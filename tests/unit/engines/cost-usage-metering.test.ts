import {
  getUnitCost,
  recordUsage,
  getUsageSummary,
  getRealtimeUsage,
} from '@/engines/cost/usage-metering';

jest.mock('@/lib/db', () => ({
  prisma: {
    usageRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('usage-metering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUnitCost', () => {
    it('should return correct unit cost for each metric type', () => {
      expect(getUnitCost('TOKENS')).toBe(0.00001);
      expect(getUnitCost('VOICE_MINUTES')).toBe(0.05);
      expect(getUnitCost('STORAGE_MB')).toBe(0.01);
      expect(getUnitCost('WORKFLOW_RUNS')).toBe(0.10);
      expect(getUnitCost('API_CALLS')).toBe(0.001);
    });
  });

  describe('recordUsage', () => {
    it('should create a usage record with correct cost calculation', async () => {
      (mockPrisma.usageRecord.create as jest.Mock).mockResolvedValue({
        id: 'rec-1',
        entityId: 'e1',
        model: 'TOKENS',
        inputTokens: 5000,
        outputTokens: 0,
        cost: 0.05, // 5000 * 0.00001
        module: 'chat-module',
        createdAt: new Date('2025-01-15'),
        metadata: { metricType: 'TOKENS', amount: 5000, unitCost: 0.00001 },
      });

      const result = await recordUsage('e1', 'TOKENS', 5000, 'chat-module');

      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: {
          entityId: 'e1',
          model: 'TOKENS',
          inputTokens: 5000,
          outputTokens: 0,
          cost: 0.05,
          module: 'chat-module',
          metadata: { metricType: 'TOKENS', amount: 5000, unitCost: 0.00001 },
        },
      });

      expect(result.id).toBe('rec-1');
      expect(result.entityId).toBe('e1');
      expect(result.metricType).toBe('TOKENS');
      expect(result.amount).toBe(5000);
      expect(result.totalCost).toBe(0.05);
      expect(result.source).toBe('chat-module');
    });

    it('should set inputTokens to 0 for non-TOKENS metric types', async () => {
      (mockPrisma.usageRecord.create as jest.Mock).mockResolvedValue({
        id: 'rec-2',
        entityId: 'e1',
        model: 'VOICE_MINUTES',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0.50, // 10 * 0.05
        module: 'voice-call',
        createdAt: new Date(),
        metadata: { metricType: 'VOICE_MINUTES', amount: 10, unitCost: 0.05 },
      });

      await recordUsage('e1', 'VOICE_MINUTES', 10, 'voice-call');

      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inputTokens: 0,
            cost: 0.50,
          }),
        })
      );
    });

    it('should calculate cost correctly for WORKFLOW_RUNS', async () => {
      (mockPrisma.usageRecord.create as jest.Mock).mockResolvedValue({
        id: 'rec-3',
        entityId: 'e1',
        model: 'WORKFLOW_RUNS',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0.30, // 3 * 0.10
        module: 'scheduler',
        createdAt: new Date(),
        metadata: { metricType: 'WORKFLOW_RUNS', amount: 3, unitCost: 0.10 },
      });

      const result = await recordUsage('e1', 'WORKFLOW_RUNS', 3, 'scheduler');

      expect(result.totalCost).toBe(0.30);
      expect(result.unitCost).toBe(0.10);
    });
  });

  describe('getUsageSummary', () => {
    it('should return zeroed summary when no records exist', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getUsageSummary(
        'e1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.totalCost).toBe(0);
      expect(result.byMetric.TOKENS).toEqual({ amount: 0, cost: 0 });
      expect(result.byMetric.VOICE_MINUTES).toEqual({ amount: 0, cost: 0 });
      expect(result.byMetric.STORAGE_MB).toEqual({ amount: 0, cost: 0 });
      expect(result.byMetric.WORKFLOW_RUNS).toEqual({ amount: 0, cost: 0 });
      expect(result.byMetric.API_CALLS).toEqual({ amount: 0, cost: 0 });
    });

    it('should aggregate usage by metric type', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1',
          entityId: 'e1',
          model: 'TOKENS',
          cost: 0.05,
          module: 'chat',
          createdAt: new Date('2025-01-10'),
          metadata: { metricType: 'TOKENS', amount: 5000, unitCost: 0.00001 },
        },
        {
          id: 'r2',
          entityId: 'e1',
          model: 'TOKENS',
          cost: 0.10,
          module: 'chat',
          createdAt: new Date('2025-01-12'),
          metadata: { metricType: 'TOKENS', amount: 10000, unitCost: 0.00001 },
        },
        {
          id: 'r3',
          entityId: 'e1',
          model: 'API_CALLS',
          cost: 0.01,
          module: 'integrations',
          createdAt: new Date('2025-01-15'),
          metadata: { metricType: 'API_CALLS', amount: 10, unitCost: 0.001 },
        },
      ]);

      const result = await getUsageSummary(
        'e1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.totalCost).toBeCloseTo(0.16);
      expect(result.byMetric.TOKENS.amount).toBe(15000);
      expect(result.byMetric.TOKENS.cost).toBeCloseTo(0.15);
      expect(result.byMetric.API_CALLS.amount).toBe(10);
      expect(result.byMetric.API_CALLS.cost).toBeCloseTo(0.01);
    });

    it('should query prisma with correct date range', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const start = new Date('2025-03-01');
      const end = new Date('2025-03-31');
      await getUsageSummary('e1', start, end);

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'e1',
          createdAt: { gte: start, lte: end },
        },
      });
    });
  });

  describe('getRealtimeUsage', () => {
    it('should return zero spend when no records exist', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getRealtimeUsage('e1');

      expect(result.todaySpend).toBe(0);
      expect(result.monthSpend).toBe(0);
      expect(result.topSources).toEqual([]);
    });

    it('should separate today spend from total month spend', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      const todayRecord = {
        id: 'r1',
        entityId: 'e1',
        model: 'TOKENS',
        cost: 0.20,
        module: 'chat',
        createdAt: now,
        metadata: { metricType: 'TOKENS', amount: 20000, unitCost: 0.00001 },
      };

      const yesterdayRecord = {
        id: 'r2',
        entityId: 'e1',
        model: 'TOKENS',
        cost: 0.30,
        module: 'chat',
        createdAt: yesterday,
        metadata: { metricType: 'TOKENS', amount: 30000, unitCost: 0.00001 },
      };

      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        todayRecord,
        yesterdayRecord,
      ]);

      const result = await getRealtimeUsage('e1');

      expect(result.todaySpend).toBeCloseTo(0.20);
      expect(result.monthSpend).toBeCloseTo(0.50);
    });

    it('should return top sources sorted by cost descending', async () => {
      const now = new Date();

      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1', entityId: 'e1', model: 'TOKENS', cost: 0.50,
          module: 'chat', createdAt: now,
          metadata: { metricType: 'TOKENS', amount: 50000, unitCost: 0.00001 },
        },
        {
          id: 'r2', entityId: 'e1', model: 'API_CALLS', cost: 1.00,
          module: 'integrations', createdAt: now,
          metadata: { metricType: 'API_CALLS', amount: 1000, unitCost: 0.001 },
        },
        {
          id: 'r3', entityId: 'e1', model: 'TOKENS', cost: 0.20,
          module: 'search', createdAt: now,
          metadata: { metricType: 'TOKENS', amount: 20000, unitCost: 0.00001 },
        },
      ]);

      const result = await getRealtimeUsage('e1');

      expect(result.topSources).toHaveLength(3);
      expect(result.topSources[0].source).toBe('integrations');
      expect(result.topSources[0].cost).toBeCloseTo(1.00);
      expect(result.topSources[1].source).toBe('chat');
      expect(result.topSources[2].source).toBe('search');
    });

    it('should limit topSources to 5 entries', async () => {
      const now = new Date();
      const records = Array.from({ length: 8 }, (_, i) => ({
        id: `r${i}`,
        entityId: 'e1',
        model: 'API_CALLS',
        cost: (i + 1) * 0.10,
        module: `source-${i}`,
        createdAt: now,
        metadata: { metricType: 'API_CALLS' as const, amount: (i + 1) * 10, unitCost: 0.001 },
      }));

      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue(records);

      const result = await getRealtimeUsage('e1');

      expect(result.topSources).toHaveLength(5);
      // Should be sorted by cost descending, so source-7 first
      expect(result.topSources[0].source).toBe('source-7');
    });
  });
});
