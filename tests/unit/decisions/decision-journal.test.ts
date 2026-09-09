// tenancy-pattern.md sec.8 trap 1: reviewEntry now reads with findFirst (scope in
// the WHERE) and writes with updateMany, so both are aliased onto the same
// jest.fn as the delegates the old suite stubbed.
jest.mock('@/lib/db', () => {
  const findUnique = jest.fn();
  const update = jest.fn();
  return {
    prisma: {
      document: {
        create: jest.fn(),
        findUnique,
        findFirst: (...a: unknown[]) => findUnique(...a),
        findMany: jest.fn(),
        update,
        updateMany: (...a: unknown[]) => {
          update(...a);
          return Promise.resolve({ count: 1 });
        },
      },
    },
  };
});

import { prisma } from '@/lib/db';
import {
  createEntry,
  reviewEntry,
  getUpcomingReviews,
  getDecisionAccuracy,
} from '@/modules/decisions/services/decision-journal';
import type { JournalEntry } from '@/modules/decisions/types';
import { verifiedEntityIdForTest } from '../../helpers/factories';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const ENTITY_E1 = verifiedEntityIdForTest('e1');

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

      // reviewEntry writes with updateMany (the scope must be in the WHERE) and
      // then re-reads the row, so the read has to observe the write.
      let written = JSON.stringify(content);

      (mockPrisma.document.findUnique as jest.Mock).mockImplementation(async () => ({
        id: 'journal-1',
        title: 'Decision',
        type: 'REPORT',
        content: written,
        createdAt: now,
        updatedAt: now,
      }));

      (mockPrisma.document.update as jest.Mock).mockImplementation(
        async ({ data }: { data: { content: string } }) => {
          written = data.content;
          return {
            id: 'journal-1',
            title: 'Decision',
            content: written,
            createdAt: now,
            updatedAt: now,
          };
        }
      );

      const result = await reviewEntry(
        'journal-1',
        ENTITY_E1,
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
        reviewEntry('nope', ENTITY_E1, ['x'], 'REVIEWED_CORRECT', 'lesson')
      ).rejects.toThrow('not found');
    });

    it("refuses an entry outside the caller's entity, and writes nothing", async () => {
      // The scope is in the WHERE, so another tenant's entry is simply absent.
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        reviewEntry(
          'journal-1',
          verifiedEntityIdForTest('someone-else'),
          ['x'],
          'REVIEWED_CORRECT',
          'lesson'
        )
      ).rejects.toThrow('not found');

      expect(mockPrisma.document.update as jest.Mock).not.toHaveBeenCalled();
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

      const results = await getUpcomingReviews(ENTITY_E1, 30);
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

      const results = await getUpcomingReviews(ENTITY_E1, 30);
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

      const result = await getDecisionAccuracy(ENTITY_E1);
      expect(result.total).toBe(4); // excludes PENDING
      expect(result.correct).toBe(2);
      expect(result.incorrect).toBe(1);
      expect(result.mixed).toBe(1);
      expect(result.accuracy).toBe(0.5);
    });

    it('should return 0 accuracy when no reviewed entries', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getDecisionAccuracy(ENTITY_E1);
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

      const result = await getDecisionAccuracy(ENTITY_E1);
      expect(result.accuracy).toBe(1);
    });
  });
});
