import {
  calculateTrustScore,
  getTrustScoreSummary,
  getTrustScores,
  getTrustTrend,
} from '@/engines/trust-ui/trust-score-service';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Trust score is high with good accuracy.'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      findMany: jest.fn(),
    },
    consentReceipt: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

const createActionLog = (overrides = {}) => ({
  id: 'al-1',
  actor: 'system',
  actorId: 'user-1',
  actionType: 'EMAIL_SEND',
  target: 'client@example.com',
  reason: 'Auto-reply',
  blastRadius: 'LOW',
  reversible: true,
  rollbackPath: null,
  status: 'EXECUTED',
  cost: null,
  timestamp: new Date(),
  ...overrides,
});

describe('calculateTrustScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return default scores when no action logs exist', async () => {
    // First call: current period, second call: previous period
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.domain).toBe('EMAIL');
    expect(result.overallScore).toBe(50);
    expect(result.dimensions.accuracy).toBe(50);
    expect(result.dimensions.transparency).toBe(50);
    expect(result.dimensions.reversibility).toBe(50);
    expect(result.dimensions.userOverrideRate).toBe(0);
    expect(result.trend).toBe('STABLE');
    expect(result.sampleSize).toBe(0);
  });

  it('should calculate high accuracy when all actions are EXECUTED', async () => {
    const logs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', status: 'EXECUTED' }),
      createActionLog({ id: 'al-3', status: 'EXECUTED' }),
    ];
    // First call: current period logs
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)   // current period
      .mockResolvedValueOnce([]);    // previous period
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.dimensions.accuracy).toBe(100);
    expect(result.sampleSize).toBe(3);
  });

  it('should calculate reduced accuracy when some actions FAILED', async () => {
    const logs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', status: 'FAILED' }),
      createActionLog({ id: 'al-3', status: 'EXECUTED' }),
      createActionLog({ id: 'al-4', status: 'EXECUTED' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    // accuracy = ((3 executed - 1 failed) / 4 total) * 100 = 50
    expect(result.dimensions.accuracy).toBe(50);
  });

  it('should calculate transparency based on receipt coverage', async () => {
    const logs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', status: 'EXECUTED' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([]);
    // 1 receipt for 2 actions = 50% transparency
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([
      { id: 'cr-1', actionId: 'al-1' },
    ]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.dimensions.transparency).toBe(50);
  });

  it('should calculate reversibility based on proportion of reversible actions', async () => {
    const logs = [
      createActionLog({ id: 'al-1', reversible: true, status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', reversible: false, status: 'EXECUTED' }),
      createActionLog({ id: 'al-3', reversible: true, status: 'EXECUTED' }),
      createActionLog({ id: 'al-4', reversible: false, status: 'EXECUTED' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.dimensions.reversibility).toBe(50);
  });

  it('should calculate userOverrideRate from ROLLED_BACK actions', async () => {
    const logs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', status: 'ROLLED_BACK' }),
      createActionLog({ id: 'al-3', status: 'EXECUTED' }),
      createActionLog({ id: 'al-4', status: 'ROLLED_BACK' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.dimensions.userOverrideRate).toBe(50);
  });

  it('should determine IMPROVING trend when current accuracy exceeds previous by > 5', async () => {
    const currentLogs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-2', status: 'EXECUTED' }),
    ];
    const previousLogs = [
      createActionLog({ id: 'al-p1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-p2', status: 'FAILED' }),
      createActionLog({ id: 'al-p3', status: 'FAILED' }),
      createActionLog({ id: 'al-p4', status: 'FAILED' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(currentLogs)   // current: 100% accuracy
      .mockResolvedValueOnce(previousLogs); // previous: 25% accuracy
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.trend).toBe('IMPROVING');
  });

  it('should determine DECLINING trend when current accuracy is much lower than previous', async () => {
    const currentLogs = [
      createActionLog({ id: 'al-1', status: 'FAILED' }),
      createActionLog({ id: 'al-2', status: 'FAILED' }),
      createActionLog({ id: 'al-3', status: 'EXECUTED' }),
    ];
    const previousLogs = [
      createActionLog({ id: 'al-p1', status: 'EXECUTED' }),
      createActionLog({ id: 'al-p2', status: 'EXECUTED' }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(currentLogs)   // current: (1-2)/3 = -33% accuracy (clamped to 0)
      .mockResolvedValueOnce(previousLogs); // previous: 100% accuracy
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.trend).toBe('DECLINING');
  });

  it('should clamp overall score between 0 and 100', async () => {
    const logs = [
      createActionLog({ id: 'al-1', status: 'EXECUTED', reversible: true }),
    ];
    (mockPrisma.actionLog.findMany as jest.Mock)
      .mockResolvedValueOnce(logs)
      .mockResolvedValueOnce([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([
      { id: 'cr-1', actionId: 'al-1' },
    ]);

    const result = await calculateTrustScore('EMAIL', 'user-1');

    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});

describe('getTrustScoreSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no logs
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should return score and AI-generated summary when AI succeeds', async () => {
    mockGenerateText.mockResolvedValue('Your EMAIL trust score is excellent at 50/100.');

    const result = await getTrustScoreSummary('EMAIL', 'user-1');

    expect(result.score).toBeDefined();
    expect(result.score.domain).toBe('EMAIL');
    expect(result.summary).toBe('Your EMAIL trust score is excellent at 50/100.');
  });

  it('should return fallback summary when AI fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

    const result = await getTrustScoreSummary('EMAIL', 'user-1');

    expect(result.summary).toContain('Trust score for EMAIL');
    expect(result.summary).toContain('50');
    expect(result.summary).toContain('STABLE');
  });

  it('should call generateText with score dimensions', async () => {
    await getTrustScoreSummary('CALENDAR', 'user-1');

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.stringContaining('CALENDAR'),
      expect.objectContaining({ temperature: 0.5 })
    );
  });
});

describe('getTrustScores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should return trust scores for all default domains', async () => {
    const results = await getTrustScores('user-1');

    expect(results).toHaveLength(6);
    const domains = results.map((r) => r.domain);
    expect(domains).toContain('EMAIL');
    expect(domains).toContain('CALENDAR');
    expect(domains).toContain('TASK');
    expect(domains).toContain('DOCUMENT');
    expect(domains).toContain('FINANCIAL');
    expect(domains).toContain('COMMUNICATION');
  });

  it('should return default scores for each domain when no logs exist', async () => {
    const results = await getTrustScores('user-1');

    for (const result of results) {
      expect(result.overallScore).toBe(50);
      expect(result.sampleSize).toBe(0);
    }
  });
});

describe('getTrustTrend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return weekly data points over default 30 days', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    const results = await getTrustTrend('EMAIL', 'user-1');

    // 30 days / 7-day intervals = approximately 5 data points
    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(results.length).toBeLessThanOrEqual(6);
    for (const point of results) {
      expect(point.date).toBeInstanceOf(Date);
      expect(typeof point.score).toBe('number');
    }
  });

  it('should return score of 50 for periods with no actions', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    const results = await getTrustTrend('EMAIL', 'user-1');

    for (const point of results) {
      expect(point.score).toBe(50);
    }
  });

  it('should calculate score based on EXECUTED ratio for periods with actions', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockImplementation(({ where }) => {
      // Return actions for a specific period simulation
      return Promise.resolve([
        createActionLog({ id: 'al-1', status: 'EXECUTED' }),
        createActionLog({ id: 'al-2', status: 'EXECUTED' }),
        createActionLog({ id: 'al-3', status: 'FAILED' }),
      ]);
    });

    const results = await getTrustTrend('EMAIL', 'user-1');

    // 2 executed / 3 total = ~67%
    for (const point of results) {
      expect(point.score).toBe(67);
    }
  });

  it('should accept custom day range', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    const results = await getTrustTrend('EMAIL', 'user-1', 14);

    // 14 days / 7-day intervals = approximately 3 data points
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.length).toBeLessThanOrEqual(4);
  });

  it('should query actionLog with domain filter and date range', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    await getTrustTrend('CALENDAR', 'user-1', 7);

    expect(mockPrisma.actionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'user-1',
          actionType: { contains: 'CALENDAR' },
        }),
      })
    );
  });
});
