jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  createEntry,
  reviewEntry,
  getUpcomingReviews,
  getDecisionAccuracy,
} from '@/modules/decisions/services/decision-journal';
import type { JournalEntry } from '@/modules/decisions/types';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Decision Journal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEntry', () => {
    it('should create a journal entry and return it', async () => {
      const now = new Date();
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'journal-1',
        title: 'My Decision',
        content: JSON.stringify({
          entityId: 'entity-1',
          context: 'We needed to choose a vendor',
          optionsConsidered: ['A', 'B', 'C'],
          chosenOption: 'B',
          rationale: 'Best value',
          expectedOutcomes: ['Cost savings'],
          reviewDate: now.toISOString(),
          status: 'PENDING_REVIEW',
        }),
        createdAt: now,
        updatedAt: now,
      });

      const entry = await createEntry({
        entityId: 'entity-1',
        title: 'My Decision',
        context: 'We needed to choose a vendor',
        optionsConsidered: ['A', 'B', 'C'],
        chosenOption: 'B',
        rationale: 'Best value',
        expectedOutcomes: ['Cost savings'],
        reviewDate: now,
        status: 'PENDING_REVIEW',
      });

      expect(entry.id).toBe('journal-1');
      expect(entry.title).toBe('My Decision');
      expect(entry.status).toBe('PENDING_REVIEW');
    });
  });

  describe('reviewEntry', () => {
    it('should update entry with actual outcomes and status', async () => {
      const now = new Date();
      const content = {
        entityId: 'entity-1',
        context: 'Context',
        optionsConsidered: ['A'],
        chosenOption: 'A',
        rationale: 'Reason',
        expectedOutcomes: ['Good'],
        reviewDate: now.toISOString(),
        status: 'PENDING_REVIEW',
      };

      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'journal-1',
        title: 'Decision',
        content: JSON.stringify(content),
        createdAt: now,
        updatedAt: now,
      });

      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: 'journal-1',
        title: 'Decision',
        content: JSON.stringify({
          ...content,
          actualOutcomes: ['It worked'],
          status: 'REVIEWED_CORRECT',
          lessonsLearned: 'Trust the data',
        }),
        createdAt: now,
        updatedAt: now,
      });

      const result = await reviewEntry(
        'journal-1',
        ['It worked'],
        'REVIEWED_CORRECT',
        'Trust the data'
      );

      expect(result.status).toBe('REVIEWED_CORRECT');
      expect(result.actualOutcomes).toEqual(['It worked']);
      expect(result.lessonsLearned).toBe('Trust the data');
    });

    it('should throw for non-existent entry', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewEntry('nope', ['x'], 'REVIEWED_CORRECT', 'lesson')
      ).rejects.toThrow('not found');
    });
  });

  describe('getUpcomingReviews', () => {
    it('should return entries with review dates within N days', async () => {
      const now = new Date();
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const inSixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'j1',
          title: 'Soon',
          content: JSON.stringify({
            entityId: 'e1',
            reviewDate: inFiveDays.toISOString(),
            status: 'PENDING_REVIEW',
            context: '',
            optionsConsidered: [],
            chosenOption: '',
            rationale: '',
            expectedOutcomes: [],
          }),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'j2',
          title: 'Later',
          content: JSON.stringify({
            entityId: 'e1',
            reviewDate: inSixtyDays.toISOString(),
            status: 'PENDING_REVIEW',
            context: '',
            optionsConsidered: [],
            chosenOption: '',
            rationale: '',
            expectedOutcomes: [],
          }),
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const results = await getUpcomingReviews('e1', 30);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('j1');
    });

    it('should exclude already-reviewed entries', async () => {
      const now = new Date();
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'j1',
          title: 'Reviewed',
          content: JSON.stringify({
            entityId: 'e1',
            reviewDate: inFiveDays.toISOString(),
            status: 'REVIEWED_CORRECT',
            context: '',
            optionsConsidered: [],
            chosenOption: '',
            rationale: '',
            expectedOutcomes: [],
          }),
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const results = await getUpcomingReviews('e1', 30);
      expect(results).toHaveLength(0);
    });
  });

  describe('getDecisionAccuracy', () => {
    it('should calculate correct accuracy stats', async () => {
      const now = new Date();
      const makeDoc = (id: string, status: string) => ({
        id,
        title: id,
        content: JSON.stringify({
          entityId: 'e1',
          status,
          reviewDate: now.toISOString(),
          context: '',
          optionsConsidered: [],
          chosenOption: '',
          rationale: '',
          expectedOutcomes: [],
        }),
        createdAt: now,
        updatedAt: now,
      });

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        makeDoc('j1', 'REVIEWED_CORRECT'),
        makeDoc('j2', 'REVIEWED_CORRECT'),
        makeDoc('j3', 'REVIEWED_INCORRECT'),
        makeDoc('j4', 'REVIEWED_MIXED'),
        makeDoc('j5', 'PENDING_REVIEW'),
      ]);

      const result = await getDecisionAccuracy('e1');
      expect(result.total).toBe(4); // excludes PENDING
      expect(result.correct).toBe(2);
      expect(result.incorrect).toBe(1);
      expect(result.mixed).toBe(1);
      expect(result.accuracy).toBe(0.5);
    });

    it('should return 0 accuracy when no reviewed entries', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getDecisionAccuracy('e1');
      expect(result.total).toBe(0);
      expect(result.accuracy).toBe(0);
    });

    it('should return 1.0 accuracy when all correct', async () => {
      const now = new Date();
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'j1',
          title: 'j1',
          content: JSON.stringify({ entityId: 'e1', status: 'REVIEWED_CORRECT', reviewDate: now.toISOString(), context: '', optionsConsidered: [], chosenOption: '', rationale: '', expectedOutcomes: [] }),
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await getDecisionAccuracy('e1');
      expect(result.accuracy).toBe(1);
    });
  });
});
