import { applyDecay, reinforceMemory, cleanupWeakMemories, getDecayConfig } from '@/engines/memory/decay-service';

jest.mock('@/lib/db', () => ({
  prisma: {
    memoryEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('applyDecay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reduce short-term memory strength with 24-hour half-life', async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'SHORT_TERM',
        content: 'test',
        context: 'ctx',
        strength: 1.0,
        lastAccessed: oneDayAgo,
        createdAt: oneDayAgo,
      },
    ]);
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    expect(mockPrisma.memoryEntry.update).toHaveBeenCalled();
    const updateCall = (mockPrisma.memoryEntry.update as jest.Mock).mock.calls[0][0];
    // After 24 hours with 24-hour half-life, strength should be ~0.5
    expect(updateCall.data.strength).toBeCloseTo(0.5, 1);
    expect(result.decayed).toBe(1);
  });

  it('should reduce working memory strength with 14-day half-life', async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'WORKING',
        content: 'test',
        context: 'ctx',
        strength: 1.0,
        lastAccessed: fourteenDaysAgo,
        createdAt: fourteenDaysAgo,
      },
    ]);
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    const updateCall = (mockPrisma.memoryEntry.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.strength).toBeCloseTo(0.5, 1);
    expect(result.decayed).toBe(1);
  });

  it('should reduce long-term memory strength with 365-day half-life', async () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'LONG_TERM',
        content: 'test',
        context: 'ctx',
        strength: 1.0,
        lastAccessed: oneYearAgo,
        createdAt: oneYearAgo,
      },
    ]);
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    const updateCall = (mockPrisma.memoryEntry.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.strength).toBeCloseTo(0.5, 1);
    expect(result.decayed).toBe(1);
  });

  it('should reduce episodic memory strength with 730-day half-life', async () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'EPISODIC',
        content: 'test',
        context: 'ctx',
        strength: 1.0,
        lastAccessed: twoYearsAgo,
        createdAt: twoYearsAgo,
      },
    ]);
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    const updateCall = (mockPrisma.memoryEntry.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.strength).toBeCloseTo(0.5, 1);
    expect(result.decayed).toBe(1);
  });

  it('should clean up memories below minimum strength threshold', async () => {
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'SHORT_TERM',
        content: 'old',
        context: 'ctx',
        strength: 0.01, // Already very weak
        lastAccessed: longAgo,
        createdAt: longAgo,
      },
    ]);
    (mockPrisma.memoryEntry.delete as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    expect(mockPrisma.memoryEntry.delete).toHaveBeenCalledWith({
      where: { id: 'm1' },
    });
    expect(result.cleaned).toBe(1);
  });

  it('should not decay recently accessed memories significantly', async () => {
    const justNow = new Date(Date.now() - 1000); // 1 second ago

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1',
        userId: 'u1',
        type: 'LONG_TERM',
        content: 'fresh',
        context: 'ctx',
        strength: 1.0,
        lastAccessed: justNow,
        createdAt: justNow,
      },
    ]);

    const result = await applyDecay('u1');

    // Strength change should be minimal, so no update triggered
    expect(result.decayed).toBe(0);
    expect(result.cleaned).toBe(0);
  });

  it('should return correct counts of decayed and cleaned entries', async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const longAgo = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000);

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'SHORT_TERM',
        content: 'a', context: 'c', strength: 1.0,
        lastAccessed: oneDayAgo, createdAt: oneDayAgo,
      },
      {
        id: 'm2', userId: 'u1', type: 'SHORT_TERM',
        content: 'b', context: 'c', strength: 0.001,
        lastAccessed: longAgo, createdAt: longAgo,
      },
    ]);
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.memoryEntry.delete as jest.Mock).mockResolvedValue({});

    const result = await applyDecay('u1');

    expect(result.decayed).toBe(1);
    expect(result.cleaned).toBe(1);
  });
});

describe('reinforceMemory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should increase strength by boost amount', async () => {
    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.5,
      lastAccessed: new Date(), createdAt: new Date(),
    });
    (mockPrisma.memoryEntry.update as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.7,
      lastAccessed: new Date(), createdAt: new Date(),
    });

    const result = await reinforceMemory('m1');
    expect(result.strength).toBe(0.7);
  });

  it('should cap strength at 1.0', async () => {
    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.95,
      lastAccessed: new Date(), createdAt: new Date(),
    });
    (mockPrisma.memoryEntry.update as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'test', context: 'ctx', strength: data.strength,
        lastAccessed: data.lastAccessed, createdAt: new Date(),
      });
    });

    const result = await reinforceMemory('m1');

    expect(result.strength).toBeLessThanOrEqual(1.0);
    expect(result.strength).toBe(1.0);
  });

  it('should update lastAccessed timestamp', async () => {
    const oldDate = new Date('2024-01-01');

    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.5,
      lastAccessed: oldDate, createdAt: oldDate,
    });
    (mockPrisma.memoryEntry.update as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'test', context: 'ctx', strength: data.strength,
        lastAccessed: data.lastAccessed, createdAt: oldDate,
      });
    });

    const result = await reinforceMemory('m1');

    expect(result.lastAccessed.getTime()).toBeGreaterThan(oldDate.getTime());
  });
});

describe('cleanupWeakMemories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete memories below threshold', async () => {
    (mockPrisma.memoryEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

    const result = await cleanupWeakMemories('u1', 0.1);

    expect(mockPrisma.memoryEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        strength: { lt: 0.1 },
      },
    });
    expect(result).toBe(3);
  });

  it('should not delete memories above threshold', async () => {
    (mockPrisma.memoryEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await cleanupWeakMemories('u1', 0.01);

    expect(result).toBe(0);
  });

  it('should return count of deleted entries', async () => {
    (mockPrisma.memoryEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

    const result = await cleanupWeakMemories('u1');

    expect(result).toBe(5);
  });
});
