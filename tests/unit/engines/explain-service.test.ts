import {
  explainAction,
  explainWithContext,
  buildExplainFromEvaluated,
} from '@/engines/trust-ui/explain-service';
import type { EvaluatedRule } from '@/engines/policy/types';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue(
    'DESCRIPTION: The assistant sent an automated reply.\nALTERNATIVES:\n- Draft and hold for review\n- Skip reply entirely'
  ),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('The action was taken because the auto-reply rule matched.'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    consentReceipt: {
      findMany: jest.fn(),
    },
    rule: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateText, chat } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockChat = chat as jest.MockedFunction<typeof chat>;

const mockActionLog = {
  id: 'action-1',
  actor: 'system',
  actorId: 'user-1',
  actionType: 'EMAIL_SEND',
  target: 'client@example.com',
  reason: 'Auto-reply rule triggered',
  blastRadius: 'LOW',
  reversible: true,
  rollbackPath: '/rollback/action-1',
  status: 'EXECUTED',
  cost: null,
  timestamp: new Date('2025-06-01T12:00:00Z'),
};

describe('explainAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return not-found response when actionLog does not exist', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await explainAction('nonexistent');

    expect(result.actionDescription).toBe('Action not found');
    expect(result.rulesApplied).toEqual([]);
    expect(result.dataSources).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.alternatives).toEqual([]);
  });

  it('should include action log as a data source', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);

    const result = await explainAction('action-1');

    expect(result.dataSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ActionLog', id: 'action-1' }),
      ])
    );
  });

  it('should include consent receipts as data sources', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([
      { id: 'cr-1', actionId: 'action-1', description: 'Email sent consent' },
    ]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);

    const result = await explainAction('action-1');

    expect(result.dataSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ConsentReceipt', id: 'cr-1' }),
      ])
    );
  });

  it('should match rules whose action type matches the action log type', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Auto Reply Rule',
        isActive: true,
        action: { type: 'EMAIL_SEND' },
      },
      {
        id: 'rule-2',
        name: 'Calendar Rule',
        isActive: true,
        action: { type: 'CALENDAR_CREATE' },
      },
    ]);

    const result = await explainAction('action-1');

    expect(result.rulesApplied).toHaveLength(1);
    expect(result.rulesApplied[0].ruleId).toBe('rule-1');
    expect(result.rulesApplied[0].ruleName).toBe('Auto Reply Rule');
  });

  it('should use AI-generated description and alternatives when AI succeeds', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);
    mockGenerateText.mockResolvedValue(
      'DESCRIPTION: The assistant automatically replied to the client email.\nALTERNATIVES:\n- Queue for manual review\n- Ignore the email'
    );

    const result = await explainAction('action-1');

    expect(result.actionDescription).toBe(
      'The assistant automatically replied to the client email.'
    );
    expect(result.alternatives).toEqual(
      expect.arrayContaining([
        { description: 'Queue for manual review' },
        { description: 'Ignore the email' },
      ])
    );
  });

  it('should fall back to basic description when AI fails', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);
    mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

    const result = await explainAction('action-1');

    expect(result.actionDescription).toContain('EMAIL_SEND');
    expect(result.actionDescription).toContain('client@example.com');
    expect(result.alternatives).toEqual([]);
  });

  it('should use first receipt confidence when receipts exist', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([
      { id: 'cr-1', actionId: 'action-1', description: 'Test', confidence: 0.92 },
    ]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);

    const result = await explainAction('action-1');

    expect(result.confidence).toBe(0.92);
  });

  it('should use default confidence 0.5 when no receipts exist', async () => {
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);

    const result = await explainAction('action-1');

    expect(result.confidence).toBe(0.5);
  });
});

describe('explainWithContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set up base mocks for explainAction
    (mockPrisma.actionLog.findUnique as jest.Mock).mockResolvedValue(mockActionLog);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.rule.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should return base explanation when no userQuestion is provided', async () => {
    const result = await explainWithContext('action-1');

    expect(mockChat).not.toHaveBeenCalled();
    expect(result.actionDescription).toBeDefined();
  });

  it('should append AI chat response to alternatives when question is provided', async () => {
    mockChat.mockResolvedValue('Because the auto-reply rule matched the incoming email pattern.');

    const result = await explainWithContext('action-1', 'Why was this email sent?');

    expect(mockChat).toHaveBeenCalled();
    expect(result.alternatives).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Because the auto-reply rule matched the incoming email pattern.',
        }),
      ])
    );
  });

  it('should fall back to keyword-based enhancement when AI chat fails with "why" question', async () => {
    mockChat.mockRejectedValue(new Error('Chat unavailable'));

    const result = await explainWithContext('action-1', 'Why did this happen?');

    expect(result.alternatives.some((a) => a.description.includes('action was taken because'))).toBe(true);
  });

  it('should return base explanation alternatives unchanged when AI fails and question has no keywords', async () => {
    mockChat.mockRejectedValue(new Error('Chat unavailable'));

    const result = await explainWithContext('action-1', 'Tell me more');

    // Should not add any keyword-based alternatives for non-"why" questions
    const baseResult = await explainWithContext('action-1');
    expect(result.alternatives.length).toBe(baseResult.alternatives.length);
  });
});

describe('buildExplainFromEvaluated', () => {
  const mockEvaluatedRules: EvaluatedRule[] = [
    {
      ruleId: 'r1',
      ruleName: 'Email Auto-Reply',
      matched: true,
      conditionResults: [],
      action: { type: 'EMAIL_SEND' } as unknown as EvaluatedRule['action'],
      precedence: 10,
      scope: 'user' as EvaluatedRule['scope'],
    },
    {
      ruleId: 'r2',
      ruleName: 'Calendar Suggest',
      matched: false,
      conditionResults: [],
      action: { type: 'CALENDAR_CREATE' } as unknown as EvaluatedRule['action'],
      precedence: 5,
      scope: 'user' as EvaluatedRule['scope'],
    },
    {
      ruleId: 'r3',
      ruleName: 'No Action Rule',
      matched: false,
      conditionResults: [],
      action: null,
      precedence: 1,
      scope: 'user' as EvaluatedRule['scope'],
    },
  ];

  it('should include only matched rules in rulesApplied', () => {
    const result = buildExplainFromEvaluated('action-1', mockEvaluatedRules, ['source1']);

    expect(result.rulesApplied).toHaveLength(1);
    expect(result.rulesApplied[0].ruleId).toBe('r1');
    expect(result.rulesApplied[0].ruleName).toBe('Email Auto-Reply');
  });

  it('should include unmatched rules with actions as alternatives', () => {
    const result = buildExplainFromEvaluated('action-1', mockEvaluatedRules, []);

    // r2 is unmatched with an action, r3 is unmatched with null action
    expect(result.alternatives).toHaveLength(1);
    expect(result.alternatives[0].ruleId).toBe('r2');
    expect(result.alternatives[0].description).toContain('Calendar Suggest');
  });

  it('should map data source strings to DataSource objects', () => {
    const result = buildExplainFromEvaluated('action-1', mockEvaluatedRules, [
      'Email inbox data',
      'Calendar API',
    ]);

    expect(result.dataSources).toHaveLength(2);
    expect(result.dataSources[0].type).toBe('DataSource');
    expect(result.dataSources[0].description).toBe('Email inbox data');
    expect(result.dataSources[1].description).toBe('Calendar API');
  });

  it('should calculate confidence as inverse of matched rule count', () => {
    const result = buildExplainFromEvaluated('action-1', mockEvaluatedRules, []);
    expect(result.confidence).toBe(1); // 1 matched rule -> 1/1

    const twoMatchedRules: EvaluatedRule[] = [
      { ...mockEvaluatedRules[0], matched: true },
      { ...mockEvaluatedRules[1], matched: true },
      { ...mockEvaluatedRules[2] },
    ];
    const result2 = buildExplainFromEvaluated('action-2', twoMatchedRules, []);
    expect(result2.confidence).toBe(0.5); // 2 matched rules -> 1/2
  });

  it('should return confidence 0 when no rules matched', () => {
    const noMatchRules: EvaluatedRule[] = [
      { ...mockEvaluatedRules[0], matched: false },
    ];
    const result = buildExplainFromEvaluated('action-1', noMatchRules, []);
    expect(result.confidence).toBe(0);
  });

  it('should include action description with rule count and action id', () => {
    const result = buildExplainFromEvaluated('action-99', mockEvaluatedRules, []);
    expect(result.actionDescription).toContain('3'); // total evaluated rules
    expect(result.actionDescription).toContain('action-99');
  });
});
