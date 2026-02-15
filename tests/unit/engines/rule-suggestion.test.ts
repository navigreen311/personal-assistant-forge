import { detectCorrectionPattern } from '@/engines/policy/rule-suggestion';

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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('detectCorrectionPattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(suggestions[0].evidence).toContain('3 times');
  });

  it('should not suggest when fewer than 3 corrections found', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong', timestamp: new Date() },
      { target: 'email', actionType: 'OVERRIDE_SEND', reason: 'Wrong', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1');
    expect(suggestions).toHaveLength(0);
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

  it('should generate descriptive evidence strings', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
      { target: 'task', actionType: 'OVERRIDE_ASSIGN', reason: 'Wrong person', timestamp: new Date() },
    ]);

    const suggestions = await detectCorrectionPattern('user1', 14);

    expect(suggestions[0].evidence).toContain('4 times');
    expect(suggestions[0].evidence).toContain('14 days');
  });
});
