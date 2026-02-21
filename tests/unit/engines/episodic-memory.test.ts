import { storeEpisode, recallEpisode, getTimeline } from '@/engines/memory/episodic-memory';

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('1. Semantically relevant because it mentions the project\n2. Related to quarterly review'),
  generateJSON: jest.fn().mockResolvedValue({
    who: ['Alice', 'Bob'],
    what: 'Discussed project roadmap',
    when: 'Monday morning',
    where: 'Zoom call',
    why: 'Sprint planning',
  }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    memoryEntry: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateJSON, generateText } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;
const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

describe('storeEpisode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create an episodic memory entry with AI-enriched context', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.create as jest.Mock).mockResolvedValue({
      id: 'ep1',
      userId: 'u1',
      type: 'EPISODIC',
      content: 'Had a meeting with Alice about the roadmap',
      context: 'work meeting [who: Alice, Bob] [what: Discussed project roadmap] [when: Monday morning] [where: Zoom call] [why: Sprint planning]',
      strength: 1.0,
      lastAccessed: now,
      createdAt: now,
    });

    const result = await storeEpisode(
      'u1',
      'Had a meeting with Alice about the roadmap',
      'work meeting'
    );

    expect(mockPrisma.memoryEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'EPISODIC',
        content: 'Had a meeting with Alice about the roadmap',
        strength: 1.0,
      }),
    });
    expect(result.id).toBe('ep1');
    expect(result.type).toBe('EPISODIC');
    expect(mockGenerateJSON).toHaveBeenCalled();
  });

  it('should include tags in context when provided', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.create as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'ep2',
        userId: data.userId,
        type: data.type,
        content: data.content,
        context: data.context,
        strength: data.strength,
        lastAccessed: data.lastAccessed,
        createdAt: now,
      });
    });

    const result = await storeEpisode(
      'u1',
      'Quarterly review discussion',
      'finance',
      ['Q1', 'review', 'budget']
    );

    // The context should contain the tags
    const createCall = (mockPrisma.memoryEntry.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.context).toContain('[tags: Q1, review, budget]');
    expect(result.type).toBe('EPISODIC');
  });

  it('should gracefully handle AI enrichment failure and use basic context', async () => {
    mockGenerateJSON.mockRejectedValueOnce(new Error('AI unavailable'));

    const now = new Date();
    (mockPrisma.memoryEntry.create as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'ep3',
        userId: data.userId,
        type: data.type,
        content: data.content,
        context: data.context,
        strength: data.strength,
        lastAccessed: data.lastAccessed,
        createdAt: now,
      });
    });

    const result = await storeEpisode(
      'u1',
      'Meeting notes from standup',
      'daily standup'
    );

    // Should still create the entry with basic context
    const createCall = (mockPrisma.memoryEntry.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.context).toBe('daily standup');
    expect(result.id).toBe('ep3');
  });

  it('should set initial strength to 1.0 and record current timestamp', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.create as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'ep4',
        userId: data.userId,
        type: data.type,
        content: data.content,
        context: data.context,
        strength: data.strength,
        lastAccessed: data.lastAccessed,
        createdAt: now,
      });
    });

    await storeEpisode('u1', 'Test content', 'test context');

    const createCall = (mockPrisma.memoryEntry.create as jest.Mock).mock.calls[0][0];
    expect(createCall.data.strength).toBe(1.0);
    expect(createCall.data.lastAccessed).toBeInstanceOf(Date);
  });

  it('should skip unspecified enrichment fields in context', async () => {
    mockGenerateJSON.mockResolvedValueOnce({
      who: ['Alice'],
      what: 'Quick chat',
      when: 'unspecified',
      where: 'unspecified',
      why: 'unspecified',
    });

    const now = new Date();
    (mockPrisma.memoryEntry.create as jest.Mock).mockImplementation(({ data }) => {
      return Promise.resolve({
        id: 'ep5',
        userId: data.userId,
        type: data.type,
        content: data.content,
        context: data.context,
        strength: data.strength,
        lastAccessed: data.lastAccessed,
        createdAt: now,
      });
    });

    await storeEpisode('u1', 'Quick chat with Alice', 'casual');

    const createCall = (mockPrisma.memoryEntry.create as jest.Mock).mock.calls[0][0];
    const ctx = createCall.data.context as string;
    expect(ctx).toContain('[who: Alice]');
    expect(ctx).toContain('[what: Quick chat]');
    expect(ctx).not.toContain('[when:');
    expect(ctx).not.toContain('[where:');
    expect(ctx).not.toContain('[why:');
  });
});

describe('recallEpisode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return episodes matching query tokens ranked by relevance', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'Meeting about project alpha launch', context: 'work',
        strength: 0.8, lastAccessed: now, createdAt: now,
      },
      {
        id: 'ep2', userId: 'u1', type: 'EPISODIC',
        content: 'Lunch with Bob', context: 'social',
        strength: 0.9, lastAccessed: now, createdAt: now,
      },
    ]);

    const results = await recallEpisode('u1', 'project alpha');

    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('ep1');
    expect(results[0].matchedTerms).toContain('project');
    expect(results[0].matchedTerms).toContain('alpha');
  });

  it('should return empty array when no episodes match', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'Meeting about finances', context: 'work',
        strength: 0.8, lastAccessed: new Date(), createdAt: new Date(),
      },
    ]);

    const results = await recallEpisode('u1', 'zzz nonexistent xyz');

    expect(results).toHaveLength(0);
  });

  it('should boost score for quarter-based date matches', async () => {
    // Create an episode from Q1 (January)
    const q1Date = new Date(2025, 0, 15); // January 15
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'Review meeting about budget', context: 'finance',
        strength: 0.8, lastAccessed: q1Date, createdAt: q1Date,
      },
      {
        id: 'ep2', userId: 'u1', type: 'EPISODIC',
        content: 'Review meeting about hiring', context: 'hr',
        strength: 0.8, lastAccessed: new Date(2025, 5, 15), createdAt: new Date(2025, 5, 15), // June (Q2)
      },
    ]);

    const results = await recallEpisode('u1', 'Q1 review meeting');

    // Both have "review" and "meeting" matches, but ep1 gets Q1 date boost
    expect(results.length).toBe(2);
    expect(results[0].entry.id).toBe('ep1');
    expect(results[0].matchedTerms).toContain('Q1');
  });

  it('should use AI to add semantic explanations to results', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'Discussed roadmap priorities', context: 'planning session',
        strength: 0.9, lastAccessed: now, createdAt: now,
      },
    ]);

    const results = await recallEpisode('u1', 'roadmap priorities');

    expect(mockGenerateText).toHaveBeenCalled();
    // AI should add an explanation to matchedTerms
    const aiTerms = results[0].matchedTerms.filter((t) => t.startsWith('ai:'));
    expect(aiTerms.length).toBeGreaterThanOrEqual(1);
  });

  it('should continue with keyword-only results when AI semantic matching fails', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

    const now = new Date();
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'Budget planning session', context: 'finance',
        strength: 0.8, lastAccessed: now, createdAt: now,
      },
    ]);

    const results = await recallEpisode('u1', 'budget planning');

    expect(results.length).toBe(1);
    expect(results[0].entry.id).toBe('ep1');
    expect(results[0].matchedTerms).toContain('budget');
    expect(results[0].matchedTerms).toContain('planning');
  });

  it('should filter out very short query tokens (length <= 2)', async () => {
    const now = new Date();
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'An important meeting', context: 'at the office',
        strength: 0.8, lastAccessed: now, createdAt: now,
      },
    ]);

    // "an" and "at" should be filtered out; only "important" should match
    const results = await recallEpisode('u1', 'an important');

    expect(results.length).toBe(1);
    expect(results[0].matchedTerms).toContain('important');
    // "an" is length 2, should be filtered
    expect(results[0].matchedTerms).not.toContain('an');
  });
});

describe('getTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return episodic memories within the date range ordered by createdAt', async () => {
    const start = new Date('2025-01-01');
    const end = new Date('2025-03-31');
    const jan = new Date('2025-01-15');
    const feb = new Date('2025-02-20');

    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ep1', userId: 'u1', type: 'EPISODIC',
        content: 'January event', context: 'ctx',
        strength: 0.9, lastAccessed: jan, createdAt: jan,
      },
      {
        id: 'ep2', userId: 'u1', type: 'EPISODIC',
        content: 'February event', context: 'ctx',
        strength: 0.8, lastAccessed: feb, createdAt: feb,
      },
    ]);

    const results = await getTimeline('u1', start, end);

    expect(mockPrisma.memoryEntry.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        type: 'EPISODIC',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('ep1');
    expect(results[1].id).toBe('ep2');
  });

  it('should return empty array when no episodes exist in the date range', async () => {
    (mockPrisma.memoryEntry.findMany as jest.Mock).mockResolvedValue([]);

    const results = await getTimeline(
      'u1',
      new Date('2020-01-01'),
      new Date('2020-12-31')
    );

    expect(results).toHaveLength(0);
  });
});
