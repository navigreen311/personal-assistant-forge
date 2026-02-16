import { detectCorrectionPattern } from '@/engines/policy/rule-suggestion';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated explanation'),
  generateJSON: jest.fn().mockResolvedValue({
    suggestedName: 'AI-suggested rule: OVERRIDE_SEND for email',
    suggestedCondition: [{ field: 'actionType', operator: 'eq', value: 'OVERRIDE_SEND' }],
    suggestedAction: { type: 'NOTIFY', config: {} },
    suggestedScope: 'ENTITY',
    evidence: 'AI analysis: User corrected email sends 3 times due to wrong tone',
  }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    actionLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    rule: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('detectCorrectionPattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-set default mock for generateJSON
    mockGenerateJSON.mockResolvedValue({
      suggestedName: 'AI-suggested rule: OVERRIDE_SEND for email',
      suggestedCondition: [{ field: 'actionType', operator: 'eq', value: 'OVERRIDE_SEND' }],
      suggestedAction: { type: 'NOTIFY', config: {} },
      suggestedScope: 'ENTITY',
      evidence: 'AI analysis: User corrected email sends 3 times due to wrong tone',
    });
  });

  it('should suggest a rule when 3+ corrections of the same type found', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].correctionCount).toBe(3);
  });

  it('should call generateJSON to enhance suggestion quality', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
    ]);

    await detectCorrectionPattern('user1');

    expect(mockGenerateJSON).toHaveBeenCalled();
  });

  it('should still require 3+ corrections threshold', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1');
    expect(suggestions).toHaveLength(0);
    // AI should not be called when threshold not met
    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });

  it('should produce AI-enriched evidence strings', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong tone', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1');

    expect(suggestions[0].evidence).toContain('AI analysis');
  });

  it('should handle AI failure with basic pattern description', async () => {
    mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1', 14);

    expect(suggestions).toHaveLength(1);
    // Falls back to basic evidence
    expect(suggestions[0].evidence).toContain('4 times');
    expect(suggestions[0].evidence).toContain('14 days');
  });

  it('should respect lookback window', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);

    await detectCorrectionPattern('user1', 7);

    expect(mockPrisma.actionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
      })
    );

    // Verify the lookback date is approximately 7 days ago
    const call = (mockPrisma.actionLog.findMany as jest.Mock).mock.calls[0][0];
    const lookbackDate = call.where.timestamp.gte as Date;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Allow 1 second tolerance
    expect(Math.abs(lookbackDate.getTime() - sevenDaysAgo.getTime())).toBeLessThan(1000);
  });
});
