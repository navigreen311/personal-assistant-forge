import {
  createConsentReceipt,
  getReceiptsForAction,
  getRecentReceipts,
  formatReceiptSummary,
} from '@/engines/trust-ui/consent-service';
import type { ConsentReceipt } from '@/shared/types';

jest.mock('@/lib/db', () => ({
  prisma: {
    consentReceipt: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    actionLog: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockRawReceipt = (overrides = {}) => ({
  id: 'receipt-1',
  actionId: 'action-1',
  description: 'Sent email to client',
  reason: 'Auto-reply rule triggered',
  impacted: ['client@example.com'],
  reversible: true,
  rollbackLink: '/rollback/action-1',
  confidence: 0.85,
  timestamp: new Date('2025-06-01T12:00:00Z'),
  ...overrides,
});

describe('createConsentReceipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a consent receipt with all fields', async () => {
    const raw = mockRawReceipt();
    (mockPrisma.consentReceipt.create as jest.Mock).mockResolvedValue(raw);

    const result = await createConsentReceipt(
      'action-1',
      'Sent email to client',
      'Auto-reply rule triggered',
      ['client@example.com'],
      true,
      '/rollback/action-1',
      0.85
    );

    expect(result.id).toBe('receipt-1');
    expect(result.actionId).toBe('action-1');
    expect(result.description).toBe('Sent email to client');
    expect(result.reason).toBe('Auto-reply rule triggered');
    expect(result.impacted).toEqual(['client@example.com']);
    expect(result.reversible).toBe(true);
    expect(result.rollbackLink).toBe('/rollback/action-1');
    expect(result.confidence).toBe(0.85);
  });

  it('should pass correct data to prisma create', async () => {
    (mockPrisma.consentReceipt.create as jest.Mock).mockResolvedValue(mockRawReceipt());

    await createConsentReceipt(
      'action-2',
      'Deleted old files',
      'Cleanup policy',
      ['file1.txt', 'file2.txt'],
      false,
      undefined,
      0.7
    );

    expect(mockPrisma.consentReceipt.create).toHaveBeenCalledWith({
      data: {
        actionId: 'action-2',
        description: 'Deleted old files',
        reason: 'Cleanup policy',
        impacted: ['file1.txt', 'file2.txt'],
        reversible: false,
        rollbackLink: undefined,
        confidence: 0.7,
      },
    });
  });

  it('should use default confidence of 0.5 when not provided', async () => {
    (mockPrisma.consentReceipt.create as jest.Mock).mockResolvedValue(
      mockRawReceipt({ confidence: 0.5 })
    );

    await createConsentReceipt(
      'action-3',
      'Scheduled meeting',
      'Calendar rule',
      ['team@example.com'],
      true
    );

    expect(mockPrisma.consentReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        confidence: 0.5,
      }),
    });
  });

  it('should map rollbackLink to undefined when null in Prisma response', async () => {
    (mockPrisma.consentReceipt.create as jest.Mock).mockResolvedValue(
      mockRawReceipt({ rollbackLink: null })
    );

    const result = await createConsentReceipt(
      'action-4',
      'Test',
      'Test reason',
      [],
      false
    );

    expect(result.rollbackLink).toBeUndefined();
  });
});

describe('getReceiptsForAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return mapped receipts for a given actionId', async () => {
    const receipts = [
      mockRawReceipt({ id: 'r1' }),
      mockRawReceipt({ id: 'r2', description: 'Second action' }),
    ];
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue(receipts);

    const result = await getReceiptsForAction('action-1');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r1');
    expect(result[1].id).toBe('r2');
  });

  it('should query with correct actionId and order by timestamp desc', async () => {
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    await getReceiptsForAction('action-xyz');

    expect(mockPrisma.consentReceipt.findMany).toHaveBeenCalledWith({
      where: { actionId: 'action-xyz' },
      orderBy: { timestamp: 'desc' },
    });
  });

  it('should return empty array when no receipts exist', async () => {
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getReceiptsForAction('nonexistent');

    expect(result).toEqual([]);
  });
});

describe('getRecentReceipts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should find action logs for user then fetch consent receipts', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([
      { id: 'al-1' },
      { id: 'al-2' },
    ]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([
      mockRawReceipt({ id: 'r1', actionId: 'al-1' }),
    ]);

    const result = await getRecentReceipts('user-1', 10);

    expect(mockPrisma.actionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actorId: 'user-1' },
        select: { id: true },
        orderBy: { timestamp: 'desc' },
      })
    );
    expect(mockPrisma.consentReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { actionId: { in: ['al-1', 'al-2'] } },
        orderBy: { timestamp: 'desc' },
        take: 10,
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].actionId).toBe('al-1');
  });

  it('should use default limit of 20 when not specified', async () => {
    (mockPrisma.actionLog.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.consentReceipt.findMany as jest.Mock).mockResolvedValue([]);

    await getRecentReceipts('user-2');

    expect(mockPrisma.actionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 40 }) // limit * 2 = 20 * 2
    );
    expect(mockPrisma.consentReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    );
  });
});

describe('formatReceiptSummary', () => {
  it('should format a receipt with impacted entities and rollback link', () => {
    const receipt: ConsentReceipt = {
      id: 'r1',
      actionId: 'a1',
      description: 'Sent email',
      reason: 'Auto-reply rule',
      impacted: ['alice@example.com', 'bob@example.com'],
      reversible: true,
      rollbackLink: '/rollback/a1',
      confidence: 0.9,
      timestamp: new Date(),
    };

    const summary = formatReceiptSummary(receipt);

    expect(summary).toContain('Sent email');
    expect(summary).toContain('Auto-reply rule');
    expect(summary).toContain('alice@example.com, bob@example.com');
    expect(summary).toContain('reversible: [yes]');
    expect(summary).toContain('rollback: /rollback/a1');
  });

  it('should format a receipt with no impacted entities', () => {
    const receipt: ConsentReceipt = {
      id: 'r2',
      actionId: 'a2',
      description: 'Cleared cache',
      reason: 'Maintenance',
      impacted: [],
      reversible: false,
      confidence: 0.5,
      timestamp: new Date(),
    };

    const summary = formatReceiptSummary(receipt);

    expect(summary).toContain('impacted [none]');
    expect(summary).toContain('reversible: [no]');
    expect(summary).not.toContain('rollback:');
  });

  it('should omit rollback when rollbackLink is undefined', () => {
    const receipt: ConsentReceipt = {
      id: 'r3',
      actionId: 'a3',
      description: 'Created task',
      reason: 'Scheduling rule',
      impacted: ['team'],
      reversible: true,
      confidence: 0.8,
      timestamp: new Date(),
    };

    const summary = formatReceiptSummary(receipt);

    expect(summary).not.toContain('rollback:');
  });
});
