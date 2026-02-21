import {
  attributeCostToWorkflow,
  getTopCostlyWorkflows,
  getCostTimeline,
} from '@/engines/cost/cost-attribution';

jest.mock('@/lib/db', () => ({
  prisma: {
    usageRecord: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('cost-attribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('attributeCostToWorkflow', () => {
    it('should return zero-cost attribution when no records exist', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const result = await attributeCostToWorkflow(
        'wf-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.workflowId).toBe('wf-1');
      expect(result.workflowName).toBe('Workflow wf-1');
      expect(result.totalCostUsd).toBe(0);
      expect(result.breakdown).toEqual([]);
      expect(result.totalRuns).toBe(1); // Math.max(0, 1)
      expect(result.costPerRun).toBe(0);
    });

    it('should aggregate cost breakdown by metric type', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1',
          cost: 0.05,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-10'),
          metadata: { metricType: 'TOKENS', amount: 5000 },
        },
        {
          id: 'r2',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-10'),
          metadata: { metricType: 'TOKENS', amount: 10000 },
        },
        {
          id: 'r3',
          cost: 0.50,
          model: 'VOICE_MINUTES',
          module: 'wf-1',
          createdAt: new Date('2025-01-11'),
          metadata: { metricType: 'VOICE_MINUTES', amount: 10 },
        },
      ]);

      const result = await attributeCostToWorkflow(
        'wf-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.totalCostUsd).toBeCloseTo(0.65);
      expect(result.breakdown).toHaveLength(2);

      const tokensBreakdown = result.breakdown.find(b => b.metricType === 'TOKENS');
      expect(tokensBreakdown).toBeDefined();
      expect(tokensBreakdown!.cost).toBeCloseTo(0.15);
      expect(tokensBreakdown!.amount).toBe(15000);

      const voiceBreakdown = result.breakdown.find(b => b.metricType === 'VOICE_MINUTES');
      expect(voiceBreakdown).toBeDefined();
      expect(voiceBreakdown!.cost).toBeCloseTo(0.50);
      expect(voiceBreakdown!.amount).toBe(10);
    });

    it('should count unique days as proxy for totalRuns', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-10T08:00:00Z'),
          metadata: { metricType: 'TOKENS', amount: 100 },
        },
        {
          id: 'r2',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-10T14:00:00Z'),
          metadata: { metricType: 'TOKENS', amount: 100 },
        },
        {
          id: 'r3',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-12T10:00:00Z'),
          metadata: { metricType: 'TOKENS', amount: 100 },
        },
      ]);

      const result = await attributeCostToWorkflow(
        'wf-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.totalRuns).toBe(2); // Two unique days: Jan 10 and Jan 12
      expect(result.costPerRun).toBeCloseTo(0.30 / 2);
    });

    it('should fall back to model field when metadata.metricType is missing', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1',
          cost: 0.25,
          model: 'API_CALLS',
          module: 'wf-1',
          createdAt: new Date('2025-01-15'),
          metadata: {},
        },
      ]);

      const result = await attributeCostToWorkflow(
        'wf-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].metricType).toBe('API_CALLS');
      expect(result.breakdown[0].amount).toBe(0); // No amount in metadata
    });

    it('should use the last record createdAt as lastRunDate', async () => {
      const latestDate = new Date('2025-01-20');
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'r1',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: new Date('2025-01-10'),
          metadata: { metricType: 'TOKENS', amount: 100 },
        },
        {
          id: 'r2',
          cost: 0.10,
          model: 'TOKENS',
          module: 'wf-1',
          createdAt: latestDate,
          metadata: { metricType: 'TOKENS', amount: 100 },
        },
      ]);

      const result = await attributeCostToWorkflow(
        'wf-1',
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(result.lastRunDate).toEqual(latestDate);
    });

    it('should query prisma with correct date range filter', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const start = new Date('2025-02-01');
      const end = new Date('2025-02-28');
      await attributeCostToWorkflow('wf-test', start, end);

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: {
          module: 'wf-test',
          createdAt: { gte: start, lte: end },
        },
      });
    });
  });

  describe('getTopCostlyWorkflows', () => {
    it('should return workflows sorted by total cost descending', async () => {
      // First call: findMany with entityId (gets all records)
      // Then for each top workflow: findMany with module + date range
      (mockPrisma.usageRecord.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'r1', cost: 5.00, model: 'TOKENS', module: 'wf-cheap', createdAt: new Date('2025-01-10'), metadata: {}, entityId: 'e1' },
          { id: 'r2', cost: 20.00, model: 'TOKENS', module: 'wf-expensive', createdAt: new Date('2025-01-10'), metadata: {}, entityId: 'e1' },
          { id: 'r3', cost: 10.00, model: 'TOKENS', module: 'wf-mid', createdAt: new Date('2025-01-10'), metadata: {}, entityId: 'e1' },
        ])
        // attributeCostToWorkflow calls for each of the 3 workflows (sorted: expensive, mid, cheap)
        .mockResolvedValueOnce([
          { id: 'r2', cost: 20.00, model: 'TOKENS', module: 'wf-expensive', createdAt: new Date('2025-01-10'), metadata: { metricType: 'TOKENS', amount: 2000 } },
        ])
        .mockResolvedValueOnce([
          { id: 'r3', cost: 10.00, model: 'TOKENS', module: 'wf-mid', createdAt: new Date('2025-01-10'), metadata: { metricType: 'TOKENS', amount: 1000 } },
        ])
        .mockResolvedValueOnce([
          { id: 'r1', cost: 5.00, model: 'TOKENS', module: 'wf-cheap', createdAt: new Date('2025-01-10'), metadata: { metricType: 'TOKENS', amount: 500 } },
        ]);

      const result = await getTopCostlyWorkflows('e1', 10);

      expect(result).toHaveLength(3);
      expect(result[0].workflowId).toBe('wf-expensive');
      expect(result[1].workflowId).toBe('wf-mid');
      expect(result[2].workflowId).toBe('wf-cheap');
    });

    it('should respect the limit parameter', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'r1', cost: 5.00, model: 'TOKENS', module: 'wf-a', createdAt: new Date(), metadata: {}, entityId: 'e1' },
          { id: 'r2', cost: 20.00, model: 'TOKENS', module: 'wf-b', createdAt: new Date(), metadata: {}, entityId: 'e1' },
          { id: 'r3', cost: 10.00, model: 'TOKENS', module: 'wf-c', createdAt: new Date(), metadata: {}, entityId: 'e1' },
        ])
        // Only top 2 workflows get attributeCostToWorkflow calls
        .mockResolvedValueOnce([
          { id: 'r2', cost: 20.00, model: 'TOKENS', module: 'wf-b', createdAt: new Date(), metadata: { metricType: 'TOKENS', amount: 100 } },
        ])
        .mockResolvedValueOnce([
          { id: 'r3', cost: 10.00, model: 'TOKENS', module: 'wf-c', createdAt: new Date(), metadata: { metricType: 'TOKENS', amount: 100 } },
        ]);

      const result = await getTopCostlyWorkflows('e1', 2);

      expect(result).toHaveLength(2);
    });
  });

  describe('getCostTimeline', () => {
    it('should return timeline with one entry per day', async () => {
      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getCostTimeline('e1', 3);

      expect(result).toHaveLength(3);
      // Each entry should have a date string and a cost
      for (const entry of result) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('cost');
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('should aggregate costs per day and fill missing days with zero', async () => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);

      (mockPrisma.usageRecord.findMany as jest.Mock).mockResolvedValue([
        { id: 'r1', cost: 0.123, createdAt: today, entityId: 'e1' },
        { id: 'r2', cost: 0.456, createdAt: today, entityId: 'e1' },
      ]);

      const result = await getCostTimeline('e1', 7);

      expect(result).toHaveLength(7);

      const todayEntry = result.find(e => e.date === todayStr);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.cost).toBeCloseTo(0.58); // Rounded to 2 decimal places: Math.round(0.579 * 100) / 100

      // Days without data should be 0
      const zeroDays = result.filter(e => e.date !== todayStr);
      for (const day of zeroDays) {
        expect(day.cost).toBe(0);
      }
    });
  });
});
