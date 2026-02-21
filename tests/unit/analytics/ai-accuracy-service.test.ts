jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
    workflow: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated insight'),
  generateJSON: jest.fn().mockResolvedValue({}),
}));

import { prisma } from '@/lib/db';
import {
  calculateAccuracyMetrics,
  getAccuracyTrend,
  trackPrediction,
  recordOutcome,
  getAccuracyByModule,
  getOverallAccuracy,
  getAccuracyTrendByPredictions,
} from '@/modules/analytics/services/ai-accuracy-service';

const mockPrisma = prisma as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('calculateAccuracyMetrics', () => {
  it('should return 100% for all dimensions when no data exists', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    expect(result.triageAccuracy).toBe(100);
    expect(result.draftApprovalRate).toBe(100);
    expect(result.predictionAccuracy).toBe(100);
    expect(result.automationSuccess).toBe(100);
    expect(result.overallScore).toBe(100);
    expect(result.period).toBe('2026-02-W7');
  });

  it('should calculate triage accuracy from action log overrides', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { actionType: 'TRIAGE', status: 'COMPLETED' },
      { actionType: 'TRIAGE', status: 'COMPLETED' },
      { actionType: 'TRIAGE', status: 'ROLLED_BACK' },
      { actionType: 'TRIAGE', status: 'COMPLETED' },
    ]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    // 3 out of 4 correct = 75%
    expect(result.triageAccuracy).toBe(75);
  });

  it('should calculate draft approval rate from messages', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([
      { draftStatus: 'APPROVED' },
      { draftStatus: 'SENT' },
      { draftStatus: 'DRAFT' },
      { draftStatus: 'DRAFT' },
    ]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    // 2 approved/sent out of 4 drafts = 50%
    expect(result.draftApprovalRate).toBe(50);
  });

  it('should calculate prediction accuracy from on-time task completion', async () => {
    const dueDate = new Date('2026-02-20');
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([
      { dueDate, updatedAt: new Date('2026-02-19') }, // on time
      { dueDate, updatedAt: new Date('2026-02-20') }, // on time (same day)
      { dueDate, updatedAt: new Date('2026-02-21') }, // late
    ]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    // 2 out of 3 on time = 67%
    expect(result.predictionAccuracy).toBe(67);
  });

  it('should calculate automation success from workflow success rates', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([
      { status: 'ACTIVE', successRate: 90 },
      { status: 'ACTIVE', successRate: 80 },
      { status: 'ACTIVE', successRate: 70 },
    ]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    // Average of 90, 80, 70 = 80
    expect(result.automationSuccess).toBe(80);
  });

  it('should compute overall score as average of all four dimensions', async () => {
    // Triage: 3/4 = 75%
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { actionType: 'TRIAGE', status: 'COMPLETED' },
      { actionType: 'TRIAGE', status: 'COMPLETED' },
      { actionType: 'TRIAGE', status: 'ROLLED_BACK' },
      { actionType: 'TRIAGE', status: 'COMPLETED' },
    ]);
    // Drafts: 1/2 = 50%
    mockPrisma.message.findMany.mockResolvedValue([
      { draftStatus: 'APPROVED' },
      { draftStatus: 'DRAFT' },
    ]);
    // Tasks: all on time = 100%
    mockPrisma.task.findMany.mockResolvedValue([
      { dueDate: new Date('2026-02-20'), updatedAt: new Date('2026-02-19') },
    ]);
    // Workflows: avg 60%
    mockPrisma.workflow.findMany.mockResolvedValue([
      { status: 'ACTIVE', successRate: 60 },
    ]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02-W7');

    // (75 + 50 + 100 + 60) / 4 = 71.25 -> 71
    expect(result.overallScore).toBe(71);
  });

  it('should parse month-format period correctly', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await calculateAccuracyMetrics('entity-1', '2026-02');

    expect(result.period).toBe('2026-02');
    // Should still call prisma with date range
    expect(mockPrisma.actionLog.findMany).toHaveBeenCalled();
  });
});

describe('trackPrediction', () => {
  it('should create an action log entry for a prediction', async () => {
    mockPrisma.actionLog.create.mockResolvedValue({ id: 'pred-1' });

    const prediction = {
      module: 'inbox',
      predictionType: 'deadline',
      predictedValue: '2026-03-01',
      confidence: 0.85,
      timestamp: new Date('2026-02-15'),
    };

    const result = await trackPrediction('entity-1', prediction);

    expect(result.id).toBe('pred-1');
    expect(mockPrisma.actionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'AI',
        actionType: 'AI_PREDICTION',
        target: 'entity-1',
        blastRadius: 'LOW',
        reversible: false,
        status: 'PENDING',
        timestamp: prediction.timestamp,
      }),
    });

    // Verify details are stored in reason as JSON
    const callArgs = mockPrisma.actionLog.create.mock.calls[0][0];
    const details = JSON.parse(callArgs.data.reason);
    expect(details.module).toBe('inbox');
    expect(details.predictionType).toBe('deadline');
    expect(details.predictedValue).toBe('2026-03-01');
    expect(details.confidence).toBe(0.85);
    expect(details.entityId).toBe('entity-1');
  });
});

describe('recordOutcome', () => {
  it('should mark prediction as COMPLETED when accurate', async () => {
    mockPrisma.actionLog.findUnique.mockResolvedValue({
      id: 'pred-1',
      reason: JSON.stringify({
        module: 'inbox',
        predictionType: 'category',
        predictedValue: 'urgent',
        confidence: 0.9,
      }),
    });
    mockPrisma.actionLog.update.mockResolvedValue({});

    await recordOutcome('pred-1', 'urgent');

    expect(mockPrisma.actionLog.update).toHaveBeenCalledWith({
      where: { id: 'pred-1' },
      data: expect.objectContaining({
        status: 'COMPLETED',
      }),
    });

    const updateArgs = mockPrisma.actionLog.update.mock.calls[0][0];
    const details = JSON.parse(updateArgs.data.reason);
    expect(details.accurate).toBe(true);
    expect(details.actualValue).toBe('urgent');
  });

  it('should mark prediction as ROLLED_BACK when inaccurate', async () => {
    mockPrisma.actionLog.findUnique.mockResolvedValue({
      id: 'pred-2',
      reason: JSON.stringify({
        module: 'inbox',
        predictionType: 'category',
        predictedValue: 'urgent',
        confidence: 0.9,
      }),
    });
    mockPrisma.actionLog.update.mockResolvedValue({});

    await recordOutcome('pred-2', 'low-priority');

    expect(mockPrisma.actionLog.update).toHaveBeenCalledWith({
      where: { id: 'pred-2' },
      data: expect.objectContaining({
        status: 'ROLLED_BACK',
      }),
    });

    const updateArgs = mockPrisma.actionLog.update.mock.calls[0][0];
    const details = JSON.parse(updateArgs.data.reason);
    expect(details.accurate).toBe(false);
    expect(details.actualValue).toBe('low-priority');
  });

  it('should throw error when prediction not found', async () => {
    mockPrisma.actionLog.findUnique.mockResolvedValue(null);

    await expect(recordOutcome('nonexistent', 'value')).rejects.toThrow(
      'Prediction not found: nonexistent'
    );
  });

  it('should handle malformed JSON in reason field gracefully', async () => {
    mockPrisma.actionLog.findUnique.mockResolvedValue({
      id: 'pred-3',
      reason: 'not-valid-json',
    });
    mockPrisma.actionLog.update.mockResolvedValue({});

    // Should not throw - falls back to empty details
    await recordOutcome('pred-3', 'some-value');

    expect(mockPrisma.actionLog.update).toHaveBeenCalledWith({
      where: { id: 'pred-3' },
      data: expect.objectContaining({
        status: 'ROLLED_BACK', // undefined !== 'some-value'
      }),
    });
  });
});

describe('getAccuracyByModule', () => {
  it('should aggregate accuracy per module from prediction logs', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { reason: JSON.stringify({ module: 'inbox', accurate: true }) },
      { reason: JSON.stringify({ module: 'inbox', accurate: true }) },
      { reason: JSON.stringify({ module: 'inbox', accurate: false }) },
      { reason: JSON.stringify({ module: 'calendar', accurate: true }) },
      { reason: JSON.stringify({ module: 'calendar', accurate: false }) },
    ]);

    const result = await getAccuracyByModule('entity-1');

    expect(result).toHaveLength(2);
    const inbox = result.find((r) => r.module === 'inbox');
    expect(inbox?.accuracy).toBe(67); // 2/3
    expect(inbox?.total).toBe(3);
    const calendar = result.find((r) => r.module === 'calendar');
    expect(calendar?.accuracy).toBe(50); // 1/2
    expect(calendar?.total).toBe(2);
  });

  it('should filter by date range when provided', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const dateRange = {
      start: new Date('2026-02-01'),
      end: new Date('2026-02-28'),
    };

    await getAccuracyByModule('entity-1', dateRange);

    expect(mockPrisma.actionLog.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        actionType: 'AI_PREDICTION',
        target: 'entity-1',
        timestamp: { gte: dateRange.start, lte: dateRange.end },
      }),
    });
  });

  it('should skip entries with malformed JSON in reason', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { reason: 'bad-json' },
      { reason: JSON.stringify({ module: 'inbox', accurate: true }) },
    ]);

    const result = await getAccuracyByModule('entity-1');

    expect(result).toHaveLength(1);
    expect(result[0].module).toBe('inbox');
  });

  it('should return empty array when no predictions exist', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const result = await getAccuracyByModule('entity-1');

    expect(result).toEqual([]);
  });

  it('should classify module as "unknown" when not specified in reason', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { reason: JSON.stringify({ accurate: true }) },
    ]);

    const result = await getAccuracyByModule('entity-1');

    expect(result).toHaveLength(1);
    expect(result[0].module).toBe('unknown');
  });
});

describe('getOverallAccuracy', () => {
  it('should return aggregate accuracy across all modules', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([
      { reason: JSON.stringify({ module: 'inbox', accurate: true }) },
      { reason: JSON.stringify({ module: 'inbox', accurate: false }) },
      { reason: JSON.stringify({ module: 'calendar', accurate: true }) },
      { reason: JSON.stringify({ module: 'calendar', accurate: true }) },
    ]);

    const result = await getOverallAccuracy('entity-1');

    // inbox: 1/2 = 50%, calendar: 2/2 = 100%
    // total correct = round(50/100 * 2) + round(100/100 * 2) = 1 + 2 = 3
    // overall = round(3/4 * 100) = 75%
    expect(result.accuracy).toBe(75);
    expect(result.total).toBe(4);
  });

  it('should return 0% accuracy and 0 total when no data exists', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const result = await getOverallAccuracy('entity-1');

    expect(result.accuracy).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe('getAccuracyTrend', () => {
  it('should return metrics for the requested number of periods', async () => {
    // Mock all prisma calls to return empty data for simplicity
    mockPrisma.actionLog.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.workflow.findMany.mockResolvedValue([]);

    const result = await getAccuracyTrend('entity-1', 3);

    expect(result).toHaveLength(3);
    for (const metrics of result) {
      expect(metrics.period).toBeDefined();
      expect(metrics.overallScore).toBe(100); // all empty = 100%
    }
  });
});

describe('getAccuracyTrendByPredictions', () => {
  it('should return 4 rolling periods of prediction accuracy', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const result = await getAccuracyTrendByPredictions('entity-1', 7);

    expect(result).toHaveLength(4);
    for (const entry of result) {
      expect(entry.period).toBeDefined();
      expect(typeof entry.accuracy).toBe('number');
      expect(typeof entry.total).toBe('number');
    }
  });

  it('should include period dates as ISO date strings', async () => {
    mockPrisma.actionLog.findMany.mockResolvedValue([]);

    const result = await getAccuracyTrendByPredictions('entity-1', 7);

    for (const entry of result) {
      expect(entry.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
