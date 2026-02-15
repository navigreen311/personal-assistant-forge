import { calculateNextReview, addLearningItem, updateProgress, getDueForReview, recordReview } from '@/modules/knowledge/services/learning-tracker';

jest.mock('@/lib/db', () => ({
  prisma: {
    knowledgeEntry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockCreate = prisma.knowledgeEntry.create as jest.Mock;
const mockFindUnique = prisma.knowledgeEntry.findUnique as jest.Mock;
const mockFindMany = prisma.knowledgeEntry.findMany as jest.Mock;
const mockUpdate = prisma.knowledgeEntry.update as jest.Mock;

function makeLearningEntry(overrides: Record<string, unknown> = {}) {
  const data = {
    title: overrides.title || 'Test Book',
    type: overrides.type || 'BOOK',
    status: overrides.status || 'QUEUED',
    progress: overrides.progress || 0,
    notes: overrides.notes || [],
    keyTakeaways: overrides.keyTakeaways || [],
    startedAt: null,
    completedAt: null,
    nextReviewDate: overrides.nextReviewDate || null,
    reviewCount: overrides.reviewCount || 0,
    easeFactor: overrides.easeFactor || 2.5,
    interval: overrides.interval || 0,
    url: null,
  };

  return {
    id: overrides.id || 'learn-1',
    content: JSON.stringify(data),
    tags: overrides.tags || ['learning'],
    entityId: overrides.entityId || 'entity-1',
    source: `learning://${(overrides.type as string || 'book').toLowerCase()}`,
    linkedEntities: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('learning-tracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateNextReview (SM-2 algorithm)', () => {
    it('should set interval=1 and update EF for first review quality=5', () => {
      const schedule = calculateNextReview(0, 2.5, 5);
      expect(schedule.interval).toBe(1);
      // EF = 2.5 + 0.1 - (5-5) * (0.08 + (5-5) * 0.02) = 2.5 + 0.1 = 2.6
      expect(schedule.easeFactor).toBeCloseTo(2.6, 1);
    });

    it('should set interval=6 for second review quality=5', () => {
      const schedule = calculateNextReview(1, 2.6, 5);
      expect(schedule.interval).toBe(6);
      // EF = 2.6 + 0.1 - 0 = 2.7
      expect(schedule.easeFactor).toBeCloseTo(2.7, 1);
    });

    it('should multiply by ease factor for third+ review quality=5', () => {
      const schedule = calculateNextReview(2, 2.7, 5);
      // interval = 6 * 2.8 = 16.8 -> 17
      expect(schedule.interval).toBeGreaterThan(6);
      expect(schedule.easeFactor).toBeCloseTo(2.8, 1);
    });

    it('should reset interval to 1 when quality < 3', () => {
      const schedule = calculateNextReview(5, 2.5, 2);
      expect(schedule.interval).toBe(1);
    });

    it('should decrease ease factor for low quality', () => {
      const schedule = calculateNextReview(1, 2.5, 2);
      expect(schedule.easeFactor).toBeLessThan(2.5);
    });

    it('should never drop ease factor below 1.3', () => {
      const schedule = calculateNextReview(1, 1.3, 0);
      expect(schedule.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should handle quality=0 (complete blackout)', () => {
      const schedule = calculateNextReview(3, 2.5, 0);
      expect(schedule.interval).toBe(1);
      // EF = 2.5 + 0.1 - 5 * (0.08 + 5 * 0.02) = 2.5 + 0.1 - 5 * 0.18 = 2.6 - 0.9 = 1.7
      expect(schedule.easeFactor).toBeCloseTo(1.7, 1);
    });

    it('should handle quality=3 (correct with difficulty)', () => {
      const schedule = calculateNextReview(0, 2.5, 3);
      expect(schedule.interval).toBe(1);
      // EF = 2.5 + 0.1 - 2 * (0.08 + 2 * 0.02) = 2.5 + 0.1 - 2 * 0.12 = 2.6 - 0.24 = 2.36
      expect(schedule.easeFactor).toBeCloseTo(2.36, 1);
    });

    it('should set a future nextReviewDate', () => {
      const before = new Date();
      const schedule = calculateNextReview(0, 2.5, 5);
      expect(schedule.nextReviewDate.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('addLearningItem', () => {
    it('should create a learning entry with reviewCount 0', async () => {
      mockCreate.mockResolvedValue(makeLearningEntry());

      const item = await addLearningItem({
        entityId: 'entity-1',
        title: 'Test Book',
        type: 'BOOK',
        status: 'QUEUED',
        progress: 0,
        notes: [],
        keyTakeaways: [],
        tags: ['learning'],
      });

      expect(item.reviewCount).toBe(0);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callData = mockCreate.mock.calls[0][0].data;
      expect(callData.source).toBe('learning://book');
    });
  });

  describe('updateProgress', () => {
    it('should auto-complete when progress reaches 100', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', progress: 50, status: 'IN_PROGRESS' });
      mockFindUnique.mockResolvedValue(entry);
      mockUpdate.mockImplementation(async ({ data }: { data: { content: string } }) => ({
        ...entry,
        content: data.content,
      }));

      const item = await updateProgress('learn-1', 100);
      expect(item.status).toBe('COMPLETED');
      expect(item.progress).toBe(100);
    });

    it('should transition QUEUED to IN_PROGRESS when progress > 0', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', progress: 0, status: 'QUEUED' });
      mockFindUnique.mockResolvedValue(entry);
      mockUpdate.mockImplementation(async ({ data }: { data: { content: string } }) => ({
        ...entry,
        content: data.content,
      }));

      const item = await updateProgress('learn-1', 25);
      expect(item.status).toBe('IN_PROGRESS');
    });

    it('should throw for non-existent item', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(updateProgress('nonexistent', 50)).rejects.toThrow();
    });
  });

  describe('getDueForReview', () => {
    it('should return items where nextReviewDate <= now', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow

      mockFindMany.mockResolvedValue([
        makeLearningEntry({ id: 'learn-1', nextReviewDate: pastDate }),
        makeLearningEntry({ id: 'learn-2', nextReviewDate: futureDate }),
      ]);

      const due = await getDueForReview('entity-1');
      const ids = due.map((i) => i.id);
      expect(ids).toContain('learn-1');
      expect(ids).not.toContain('learn-2');
    });

    it('should return empty for no items due', async () => {
      mockFindMany.mockResolvedValue([]);
      const due = await getDueForReview('entity-1');
      expect(due).toEqual([]);
    });
  });

  describe('recordReview', () => {
    it('should update reviewCount and schedule', async () => {
      const entry = makeLearningEntry({ id: 'learn-1', reviewCount: 0, easeFactor: 2.5 });
      mockFindUnique.mockResolvedValue(entry);
      mockUpdate.mockResolvedValue(entry);

      const schedule = await recordReview('learn-1', 5);

      expect(schedule.itemId).toBe('learn-1');
      expect(schedule.interval).toBe(1);
      expect(schedule.easeFactor).toBeCloseTo(2.6, 1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);

      const updateContent = JSON.parse(mockUpdate.mock.calls[0][0].data.content);
      expect(updateContent.reviewCount).toBe(1);
    });

    it('should throw for non-existent item', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(recordReview('nonexistent', 5)).rejects.toThrow();
    });
  });
});
