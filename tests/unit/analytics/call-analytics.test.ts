jest.mock('@/lib/db', () => ({
  prisma: {
    call: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    contact: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Insight line 1\nInsight line 2'),
  generateJSON: jest.fn().mockResolvedValue({
    insights: ['Trend insight 1', 'Trend insight 2'],
    busiestHour: 14,
    sentimentTrend: 'improving',
  }),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  getCallAnalytics,
  getCallsPerPeriod,
  getAverageDuration,
  getSentimentDistribution,
  getOutcomeRates,
  getTopCallers,
  getCallTrends,
} from '@/modules/analytics/services/call-analytics-service';

const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCallsPerPeriod', () => {
  it('should aggregate calls by day', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { createdAt: new Date('2026-02-15T10:00:00Z'), outcome: 'CONNECTED', direction: 'OUTBOUND', duration: 300 },
      { createdAt: new Date('2026-02-15T14:00:00Z'), outcome: 'CONNECTED', direction: 'INBOUND', duration: 200 },
      { createdAt: new Date('2026-02-16T09:00:00Z'), outcome: 'NO_ANSWER', direction: 'OUTBOUND', duration: null },
    ]);

    const result = await getCallsPerPeriod('entity-1', 'day');

    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(2); // Feb 15
    expect(result[1].count).toBe(1); // Feb 16
  });

  it('should aggregate calls by week', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { createdAt: new Date('2026-02-09T10:00:00Z'), outcome: 'CONNECTED', direction: 'OUTBOUND', duration: 300 },
      { createdAt: new Date('2026-02-10T10:00:00Z'), outcome: 'CONNECTED', direction: 'OUTBOUND', duration: 200 },
      { createdAt: new Date('2026-02-16T10:00:00Z'), outcome: 'CONNECTED', direction: 'OUTBOUND', duration: 250 },
    ]);

    const result = await getCallsPerPeriod('entity-1', 'week');

    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by date range', async () => {
    mockPrisma.call.findMany.mockResolvedValue([]);

    const dateRange = {
      start: new Date('2026-02-01'),
      end: new Date('2026-02-28'),
    };

    await getCallsPerPeriod('entity-1', 'day', dateRange);

    expect(mockPrisma.call.findMany).toHaveBeenCalledWith({
      where: {
        entityId: 'entity-1',
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
  });
});

describe('getAverageDuration', () => {
  it('should calculate correct average duration', async () => {
    mockPrisma.call.aggregate.mockResolvedValue({
      _avg: { duration: 350 },
    });

    const result = await getAverageDuration('entity-1');

    expect(result).toBe(350);
    expect(mockPrisma.call.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        entityId: 'entity-1',
        duration: { not: null },
      }),
      _avg: { duration: true },
    });
  });

  it('should return 0 when no calls exist', async () => {
    mockPrisma.call.aggregate.mockResolvedValue({
      _avg: { duration: null },
    });

    const result = await getAverageDuration('entity-1');

    expect(result).toBe(0);
  });
});

describe('getSentimentDistribution', () => {
  it('should return percentage breakdown of sentiments', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { sentiment: 0.8 },  // positive
      { sentiment: 0.5 },  // positive
      { sentiment: 0.1 },  // neutral
      { sentiment: -0.5 }, // negative
    ]);

    const result = await getSentimentDistribution('entity-1');

    expect(result.positive).toBe(50); // 2/4
    expect(result.neutral).toBe(25);  // 1/4
    expect(result.negative).toBe(25); // 1/4
    expect(result.positive + result.neutral + result.negative).toBe(100);
  });
});

describe('getOutcomeRates', () => {
  it('should return counts and percentages per outcome', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { outcome: 'CONNECTED' },
      { outcome: 'CONNECTED' },
      { outcome: 'CONNECTED' },
      { outcome: 'NO_ANSWER' },
      { outcome: 'VOICEMAIL' },
    ]);

    const result = await getOutcomeRates('entity-1');

    const connected = result.find((r) => r.outcome === 'CONNECTED');
    expect(connected?.count).toBe(3);
    expect(connected?.percentage).toBe(60);
  });
});

describe('getTopCallers', () => {
  it('should return contacts with most calls', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { contactId: 'contact-1' },
      { contactId: 'contact-1' },
      { contactId: 'contact-1' },
      { contactId: 'contact-2' },
    ]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: 'contact-1', name: 'John Doe' },
      { id: 'contact-2', name: 'Jane Smith' },
    ]);

    const result = await getTopCallers('entity-1', 10);

    expect(result[0].contactId).toBe('contact-1');
    expect(result[0].callCount).toBe(3);
    expect(result[0].contactName).toBe('John Doe');
  });
});

describe('getCallTrends', () => {
  it('should call generateJSON for AI trend analysis', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { outcome: 'CONNECTED', sentiment: 0.5, duration: 300, createdAt: new Date() },
      { outcome: 'CONNECTED', sentiment: 0.7, duration: 250, createdAt: new Date() },
    ]);

    const result = await getCallTrends('entity-1');

    expect(generateJSON).toHaveBeenCalled();
    expect(result.insights).toHaveLength(2);
    expect(result.busiestHour).toBe(14);
  });

  it('should handle AI failure gracefully', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { outcome: 'CONNECTED', sentiment: 0.5, duration: 300, createdAt: new Date() },
    ]);
    (generateJSON as jest.Mock).mockRejectedValueOnce(new Error('AI error'));

    const result = await getCallTrends('entity-1');

    expect(result.insights).toHaveLength(1);
    expect(result.insights[0]).toContain('1 calls');
  });
});

describe('getCallAnalytics', () => {
  it('should return complete analytics with AI insights', async () => {
    mockPrisma.call.findMany.mockResolvedValue([
      { outcome: 'CONNECTED', sentiment: 0.8, duration: 300, direction: 'OUTBOUND', createdAt: new Date() },
      { outcome: 'NO_ANSWER', sentiment: null, duration: null, direction: 'OUTBOUND', createdAt: new Date() },
    ]);

    const result = await getCallAnalytics(
      'entity-1',
      new Date('2026-02-01'),
      new Date('2026-02-28')
    );

    expect(result.totalCalls).toBe(2);
    expect(result.connectRate).toBe(50);
    expect(result.averageDuration).toBe(300);
  });
});
