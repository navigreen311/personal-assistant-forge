// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _adoptionStore = new Map<string, any>();

jest.mock('@/lib/db', () => {
  return {
    prisma: {
      adoptionProgress: {
        upsert: jest.fn().mockImplementation((args: { where: { userId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const existing = _adoptionStore.get(args.where.userId);
          if (existing) {
            const updated = { ...existing, ...args.update, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          const record = {
            id: 'adoption-' + args.where.userId,
            ...args.create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          _adoptionStore.set(args.where.userId, record);
          return Promise.resolve({ ...record });
        }),
        findUnique: jest.fn().mockImplementation((args: { where: { userId: string } }) => {
          const rec = _adoptionStore.get(args.where.userId);
          return Promise.resolve(rec ? { ...rec } : null);
        }),
        update: jest.fn().mockImplementation((args: { where: { userId: string }; data: Record<string, unknown> }) => {
          const rec = _adoptionStore.get(args.where.userId);
          if (rec) {
            const updated = { ...rec, ...args.data, updatedAt: new Date() };
            _adoptionStore.set(args.where.userId, updated);
            return Promise.resolve({ ...updated });
          }
          return Promise.resolve(null);
        }),
      },
    },
  };
});

import { generateRecommendations, getWeeklyReview } from '@/engines/adoption/coaching-service';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('Personalized tip: Try enabling smart triage to save 15 minutes daily.'),
  generateJSON: jest.fn().mockResolvedValue({}),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

import { generateText } from '@/lib/ai';

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;

describe('coaching recommendations (AI-powered)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _adoptionStore.clear();
    mockGenerateText.mockResolvedValue(
      '- Try enabling smart triage to save 15 minutes daily.\n- Automate meeting prep to reclaim 50 minutes per week.\n- Consolidate notifications for fewer interruptions.\n- Set up a weekly review to stay on track.'
    );
  });

  it('should call generateText with usage patterns', async () => {
    // First call generates defaults, second call has pending recs for AI enhancement
    await generateRecommendations('user-coaching-1');
    mockGenerateText.mockClear();

    const recs = await generateRecommendations('user-coaching-1');

    expect(mockGenerateText).toHaveBeenCalled();
    const prompt = mockGenerateText.mock.calls[0][0];
    expect(prompt).toContain('coaching tips');
    expect(prompt).toContain('FEATURE_DISCOVERY');
  });

  it('should produce personalized coaching tips', async () => {
    // First call to seed recommendations
    await generateRecommendations('user-coaching-2');
    mockGenerateText.mockClear();

    mockGenerateText.mockResolvedValueOnce(
      '- Smart triage can auto-categorize your inbox, saving 15 minutes each morning.\n- Meeting prep packets generated before each meeting save 10 minutes.\n- Consolidating 3 notification channels reduces context switching.\n- A 10-minute weekly review helps track optimization opportunities.'
    );

    const recs = await generateRecommendations('user-coaching-2');

    expect(recs.length).toBeGreaterThan(0);
    // AI-enhanced descriptions should replace defaults
    expect(mockGenerateText).toHaveBeenCalled();
  });

  it('should handle AI failure with generic tips', async () => {
    // First call to seed recommendations
    await generateRecommendations('user-coaching-3');
    mockGenerateText.mockClear();

    mockGenerateText.mockRejectedValueOnce(new Error('AI unavailable'));

    const recs = await generateRecommendations('user-coaching-3');

    // Should still return recommendations (defaults)
    expect(recs.length).toBeGreaterThan(0);
    // Descriptions should contain default content
    expect(recs[0].title).toBeTruthy();
  });

  it('should return weekly review with recommendations', async () => {
    const review = await getWeeklyReview('user-coaching-4');

    expect(review.recommendations).toBeDefined();
    expect(review.weeklyTimeSaved).toBeGreaterThan(0);
    expect(review.topWin).toBeTruthy();
    expect(review.improvementArea).toBeTruthy();
  });
});
