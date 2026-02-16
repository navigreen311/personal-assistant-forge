import { searchMemories } from '@/engines/memory/memory-service';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated explanation'),
  generateJSON: jest.fn().mockResolvedValue({ rankedIds: ['m2', 'm1'] }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    memoryEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('searchMemories (AI-enhanced)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateJSON.mockResolvedValue({ rankedIds: ['m2', 'm1'] });
  });

  it('should call generateJSON for semantic re-ranking', async () => {
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

    await searchMemories({ userId: 'u1', query: 'project alpha' });

    expect(mockGenerateJSON).toHaveBeenCalled();
  });

  it('should pass top keyword results to AI', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Meeting about alpha project', context: 'work',
        strength: 0.8, lastAccessed: new Date(), createdAt: new Date(),
      },
      {
        id: 'm2', userId: 'u1', type: 'LONG_TERM',
        content: 'Alpha launch details', context: 'planning',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    await searchMemories({ userId: 'u1', query: 'alpha project' });

    const prompt = mockGenerateJSON.mock.calls[0][0];
    expect(prompt).toContain('alpha project');
    expect(prompt).toContain('m1');
    expect(prompt).toContain('m2');
  });

  it('should return AI-reranked results', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Meeting about alpha', context: 'work',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
      {
        id: 'm2', userId: 'u1', type: 'LONG_TERM',
        content: 'Alpha launch plan', context: 'alpha planning',
        strength: 0.5, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    // AI says m2 is more relevant
    mockGenerateJSON.mockResolvedValueOnce({ rankedIds: ['m2', 'm1'] });

    const results = await searchMemories({ userId: 'u1', query: 'alpha' });

    // m2 should be first because AI re-ranked it
    expect(results[0].entry.id).toBe('m2');
    expect(results[1].entry.id).toBe('m1');
  });

  it('should fall back to keyword ranking if AI fails', async () => {
    mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Meeting about project beta', context: 'work',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
      {
        id: 'm2', userId: 'u1', type: 'LONG_TERM',
        content: 'Project beta details', context: 'project beta notes',
        strength: 0.5, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    const results = await searchMemories({ userId: 'u1', query: 'project beta' });

    // Should still return results (keyword-based order)
    expect(results.length).toBe(2);
    // m1 has higher strength (0.9) so keyword relevanceScore is higher
    expect(results[0].entry.id).toBe('m1');
  });

  it('should not call AI when only one result', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'm1', userId: 'u1', type: 'WORKING',
        content: 'Single result for query', context: 'work',
        strength: 0.9, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    await searchMemories({ userId: 'u1', query: 'single' });

    expect(mockGenerateJSON).not.toHaveBeenCalled();
  });
});
