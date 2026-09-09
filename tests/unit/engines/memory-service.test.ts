import { searchMemories, recallMemory } from '@/engines/memory/memory-service';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated explanation'),
  generateJSON: jest.fn().mockResolvedValue({ rankedIds: [] }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

// P-13, tenancy-pattern.md 8 trap 1: the service now scopes by owner, so it
// calls findFirst/updateMany instead of findUnique/update. A mock without those
// delegates returns `undefined` and the test fails as if the product broke, so
// they are aliased onto the SAME jest.fn -- the existing assertions on
// `findUnique` / `update` therefore still describe the calls the service makes.
// Declared inside the factory because jest hoists `jest.mock` above any
// module-scope `const`.
jest.mock('@/lib/db', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  return {
    prisma: {
      memoryEntry: {
        findMany: jest.fn(),
        findUnique,
        findFirst: findUnique,
        update,
        updateMany: update,
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
    },
  };
});

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('searchMemories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return results sorted by relevance * strength', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Meeting about project alpha', context: 'work',
        strength: 0.5, lastAccessed: new Date(), createdAt: new Date(),
      },
      {
        id: 'm2', userId: 'u1', type: 'LONG_TERM',
        content: 'Project alpha launch plan', context: 'project alpha planning',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    const results = await searchMemories({
      userId: 'u1',
      query: 'project alpha',
    });

    expect(results.length).toBe(2);
    // m2 has higher strength and matches both words in content + context
    expect(results[0].entry.id).toBe('m2');
    // Verify sorted by relevanceScore desc
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
    }
  });

  it('should filter by memory type', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'EPISODIC',
        content: 'episode about quarterly review', context: 'review',
        strength: 0.8, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    const results = await searchMemories({
      userId: 'u1',
      query: 'quarterly review',
      types: ['EPISODIC'],
    });

    expect(results.length).toBe(1);
    expect(results[0].entry.type).toBe('EPISODIC');

    // Verify prisma was called with type filter
    expect(mockPrisma.memoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['EPISODIC'] },
        }),
      })
    );
  });

  it('should filter by minimum strength', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'strong memory test', context: 'test',
        strength: 0.8, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    await searchMemories({
      userId: 'u1',
      query: 'test',
      minStrength: 0.5,
    });

    expect(mockPrisma.memoryEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          strength: { gte: 0.5 },
        }),
      })
    );
  });

  it('should return matched terms', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Meeting notes from Nevada compliance review', context: 'legal',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    const results = await searchMemories({
      userId: 'u1',
      query: 'Nevada compliance',
    });

    expect(results[0].matchedTerms).toContain('nevada');
    expect(results[0].matchedTerms).toContain('compliance');
  });

  it('should respect limit parameter', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      { id: 'm1', userId: 'u1', type: 'WORKING', content: 'test one', context: 'c', strength: 0.9, lastAccessed: new Date(), createdAt: new Date() },
      { id: 'm2', userId: 'u1', type: 'WORKING', content: 'test two', context: 'c', strength: 0.8, lastAccessed: new Date(), createdAt: new Date() },
      { id: 'm3', userId: 'u1', type: 'WORKING', content: 'test three', context: 'c', strength: 0.7, lastAccessed: new Date(), createdAt: new Date() },
    ]);

    const results = await searchMemories({
      userId: 'u1',
      query: 'test',
      limit: 2,
    });

    expect(results).toHaveLength(2);
  });
});

describe('recallMemory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reinforce memory on access', async () => {
    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.5,
      lastAccessed: new Date('2024-01-01'), createdAt: new Date(),
    });
    (mockPrisma.memoryEntry.update as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'test', context: 'ctx', strength: data.strength,
        lastAccessed: data.lastAccessed, createdAt: new Date(),
      });
    });

    const result = await recallMemory('m1', 'u1');

    expect(result).not.toBeNull();
    expect(result!.strength).toBeGreaterThan(0.5);
    expect(mockPrisma.memoryEntry.update).toHaveBeenCalled();
  });

  it('should update lastAccessed timestamp', async () => {
    const oldDate = new Date('2024-01-01');

    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1', userId: 'u1', type: 'WORKING',
      content: 'test', context: 'ctx', strength: 0.5,
      lastAccessed: oldDate, createdAt: new Date(),
    });
    (mockPrisma.memoryEntry.update as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'test', context: 'ctx', strength: data.strength,
        lastAccessed: data.lastAccessed, createdAt: new Date(),
      });
    });

    const result = await recallMemory('m1', 'u1');

    expect(result!.lastAccessed.getTime()).toBeGreaterThan(oldDate.getTime());
  });

  it('should return null for non-existent memory', async () => {
    (mockPrisma.memoryEntry.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await recallMemory('nonexistent', 'u1');

    expect(result).toBeNull();
    expect(mockPrisma.memoryEntry.update).not.toHaveBeenCalled();
  });
});
