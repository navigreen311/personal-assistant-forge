jest.mock('@/lib/db', () => ({
  prisma: {
    usageRecord: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    actionLog: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Cost optimization recommendation'),
}));

import { prisma } from '@/lib/db';
import {
  getCostsByModule,
  getCostsByModel,
  getCostsByPeriod,
  getTotalCost,
  getCostTrend,
  getCostForecast,
  getTokenUsageSummary,
  getCostDashboard,
} from '@/modules/analytics/services/llm-cost-service';

const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCostsByModule', () => {
  it('should aggregate costs grouped by module', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'inbox', model: 'claude-sonnet', cost: 0.05, inputTokens: 1000, outputTokens: 500 },
      { module: 'inbox', model: 'claude-sonnet', cost: 0.03, inputTokens: 800, outputTokens: 300 },
      { module: 'calendar', model: 'claude-haiku', cost: 0.01, inputTokens: 200, outputTokens: 100 },
    ]);

    const result = await getCostsByModule('entity-1');

    expect(result).toHaveLength(2);
    const inbox = result.find((r) => r.module === 'inbox');
    expect(inbox?.totalCost).toBe(0.08);
    expect(inbox?.totalInputTokens).toBe(1800);
    expect(inbox?.totalOutputTokens).toBe(800);
    expect(inbox?.requestCount).toBe(2);
  });

  it('should filter by date range when provided', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([]);

    const dateRange = {
      start: new Date('2026-02-01'),
      end: new Date('2026-02-28'),
    };

    await getCostsByModule('entity-1', dateRange);

    expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
      where: {
        entityId: 'entity-1',
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
  });

  it('should include request count per module', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'chat', model: 'claude-sonnet', cost: 0.10, inputTokens: 2000, outputTokens: 1000 },
      { module: 'chat', model: 'claude-sonnet', cost: 0.08, inputTokens: 1500, outputTokens: 800 },
      { module: 'chat', model: 'claude-sonnet', cost: 0.12, inputTokens: 2500, outputTokens: 1200 },
    ]);

    const result = await getCostsByModule('entity-1');

    expect(result).toHaveLength(1);
    expect(result[0].requestCount).toBe(3);
  });
});

describe('getCostsByPeriod', () => {
  it('should return time series cost data', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'inbox', cost: 0.05, inputTokens: 1000, outputTokens: 500, createdAt: new Date('2026-02-10T12:00:00Z') },
      { module: 'inbox', cost: 0.03, inputTokens: 800, outputTokens: 300, createdAt: new Date('2026-02-10T14:00:00Z') },
      { module: 'calendar', cost: 0.07, inputTokens: 1500, outputTokens: 700, createdAt: new Date('2026-02-15T12:00:00Z') },
    ]);

    const result = await getCostsByPeriod('entity-1', 'month');

    expect(result).toHaveLength(1); // All in Feb 2026
    expect(result[0].period).toBe('2026-02');
    expect(result[0].cost).toBe(0.15);
  });
});

describe('getTotalCost', () => {
  it('should sum all costs for the entity', async () => {
    mockPrisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { cost: 42.50 },
    });

    const result = await getTotalCost('entity-1');

    expect(result).toBe(42.50);
  });

  it('should return 0 when no usage records exist', async () => {
    mockPrisma.usageRecord.aggregate.mockResolvedValue({
      _sum: { cost: null },
    });

    const result = await getTotalCost('entity-1');

    expect(result).toBe(0);
  });
});

describe('getCostTrend', () => {
  it('should calculate change percent over rolling periods', async () => {
    // Mock getTotalCost via aggregate for each period
    mockPrisma.usageRecord.aggregate
      .mockResolvedValueOnce({ _sum: { cost: 10 } })
      .mockResolvedValueOnce({ _sum: { cost: 15 } })
      .mockResolvedValueOnce({ _sum: { cost: 12 } });

    const result = await getCostTrend('entity-1', 3);

    expect(result).toHaveLength(3);
    expect(result[0].changePercent).toBe(0); // First period has no previous
    expect(result[1].changePercent).toBe(50); // 15 vs 10 = 50% increase
  });
});

describe('getCostForecast', () => {
  it('should project future costs from historical data', async () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      cost: 1.0,
      inputTokens: 1000,
      outputTokens: 500,
      createdAt: new Date(Date.now() - i * 86400000),
    }));
    mockPrisma.usageRecord.findMany.mockResolvedValue(records);

    const result = await getCostForecast('entity-1', 30);

    expect(result.forecastedCost).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.basedOnDays).toBeGreaterThan(0);
  });

  it('should handle insufficient data gracefully', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([]);

    const result = await getCostForecast('entity-1', 30);

    expect(result.forecastedCost).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.basedOnDays).toBe(0);
  });
});

describe('getTokenUsageSummary', () => {
  it('should return total input and output tokens', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'inbox', cost: 0.05, inputTokens: 1000, outputTokens: 500 },
      { module: 'inbox', cost: 0.03, inputTokens: 800, outputTokens: 300 },
      { module: 'calendar', cost: 0.10, inputTokens: 2000, outputTokens: 1000 },
    ]);

    const result = await getTokenUsageSummary('entity-1');

    expect(result.totalInputTokens).toBe(3800);
    expect(result.totalOutputTokens).toBe(1800);
    expect(result.avgTokensPerRequest).toBe(Math.round(5600 / 3));
  });

  it('should identify the most expensive module', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'inbox', cost: 0.05, inputTokens: 1000, outputTokens: 500 },
      { module: 'calendar', cost: 0.50, inputTokens: 5000, outputTokens: 2500 },
      { module: 'chat', cost: 0.02, inputTokens: 400, outputTokens: 200 },
    ]);

    const result = await getTokenUsageSummary('entity-1');

    expect(result.mostExpensiveModule).toBe('calendar');
  });

  it('should handle empty records', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([]);

    const result = await getTokenUsageSummary('entity-1');

    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.avgTokensPerRequest).toBe(0);
    expect(result.mostExpensiveModule).toBe('none');
  });
});

describe('getCostDashboard', () => {
  it('should aggregate costs from UsageRecord', async () => {
    mockPrisma.usageRecord.findMany.mockResolvedValue([
      { module: 'inbox', cost: 10.0, inputTokens: 100000, outputTokens: 50000, createdAt: new Date() },
      { module: 'calendar', cost: 5.0, inputTokens: 50000, outputTokens: 25000, createdAt: new Date() },
    ]);

    const result = await getCostDashboard('entity-1', '2026-02');

    expect(result.totalCostUsd).toBe(15);
    expect(result.byFeature).toHaveLength(2);
    expect(result.budgetCapUsd).toBe(500);
  });
});
