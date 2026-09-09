jest.mock('@/lib/db', () => ({
  prisma: {
    healthMetric: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { prisma } from '@/lib/db';
import {
  addRecord,
  getRecords,
  getUpcomingAppointments,
  getMedicationReminders,
  checkOverdueAppointments,
} from '@/modules/health/services/medical-service';

import { verifiedEntityIdForTest } from '../../helpers/factories';

/**
 * The entity that owns the rows under test -- deliberately NOT a user id.
 *
 * These services used to take a parameter named `userId` and write it straight
 * into the `entityId` column, and this file asserted a user id in the
 * `entityId` column,
 * which encoded that confusion as the expected behaviour. The scope is now a
 * `VerifiedEntityId`, which a plain string is not assignable to, so a call site
 * handing a service an unverified value no longer compiles.
 */
const entity = (n: string) => verifiedEntityIdForTest(`entity-${n}`);


const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('medical-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addRecord', () => {
    it('creates Document with type=MEDICAL', async () => {
      const recordDate = new Date('2026-02-15');
      const nextDate = new Date('2026-08-15');

      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        entityId: 'entity-1',
        type: 'MEDICAL',
        title: 'Annual Physical',
        status: 'APPOINTMENT',
        citations: {
          provider: 'Dr. Smith',
          date: recordDate.toISOString(),
          nextDate: nextDate.toISOString(),
          notes: 'Routine checkup',
          reminders: [{ daysBefore: 7, sent: false }],
        },
        version: 1,
        templateId: null,
        content: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await addRecord(entity('1'), 'user-1', {
        userId: 'user-1',
        type: 'APPOINTMENT',
        title: 'Annual Physical',
        provider: 'Dr. Smith',
        date: recordDate,
        nextDate: nextDate,
        notes: 'Routine checkup',
        reminders: [{ daysBefore: 7, sent: false }],
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: {
          entityId: 'entity-1',
          type: 'MEDICAL',
          title: 'Annual Physical',
          status: 'APPOINTMENT',
          citations: expect.objectContaining({
            provider: 'Dr. Smith',
            notes: 'Routine checkup',
          }),
        },
      });

      expect(result.id).toBe('doc-1');
      expect(result.type).toBe('APPOINTMENT');
      expect(result.title).toBe('Annual Physical');
    });
  });

  describe('getRecords', () => {
    it('queries documents by entityId and type MEDICAL', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      await getRecords(entity('1'), 'user-1');

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          type: 'MEDICAL',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters by sub-type when provided', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      await getRecords(entity('1'), 'user-1', 'MEDICATION');

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          type: 'MEDICAL',
          deletedAt: null,
          status: 'MEDICATION',
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('maps documents to MedicalRecord type', async () => {
      const date = new Date('2026-01-15');
      const nextDate = new Date('2027-01-15');

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-1',
          entityId: 'entity-1',
          type: 'MEDICAL',
          title: 'Annual Physical',
          status: 'APPOINTMENT',
          citations: {
            provider: 'Dr. Smith',
            date: date.toISOString(),
            nextDate: nextDate.toISOString(),
            notes: 'All clear',
            reminders: [{ daysBefore: 7, sent: false }],
          },
          version: 1,
          templateId: null,
          content: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await getRecords(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'doc-1',
        userId: 'user-1',
        type: 'APPOINTMENT',
        title: 'Annual Physical',
        provider: 'Dr. Smith',
        date: expect.any(Date),
        nextDate: expect.any(Date),
        notes: 'All clear',
        reminders: [{ daysBefore: 7, sent: false }],
      });
    });
  });

  describe('getUpcomingAppointments', () => {
    it('returns appointments within date range', async () => {
      const now = new Date();
      const inThreeDays = new Date(now.getTime() + 3 * 86400000);
      const inTenDays = new Date(now.getTime() + 10 * 86400000);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-soon', entityId: 'entity-1', type: 'MEDICAL', title: 'Checkup',
          status: 'APPOINTMENT',
          citations: {
            provider: 'Dr. A', date: now.toISOString(),
            nextDate: inThreeDays.toISOString(),
            reminders: [],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'doc-far', entityId: 'entity-1', type: 'MEDICAL', title: 'Follow-up',
          status: 'APPOINTMENT',
          citations: {
            provider: 'Dr. B', date: now.toISOString(),
            nextDate: inTenDays.toISOString(),
            reminders: [],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const result = await getUpcomingAppointments(entity('1'), 'user-1', 7);

      // Only the appointment within 7 days should be returned
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Checkup');
    });
  });

  describe('getMedicationReminders', () => {
    it('returns medications needing refill within 7 days', async () => {
      const now = new Date();
      const inFiveDays = new Date(now.getTime() + 5 * 86400000);
      const inTwentyDays = new Date(now.getTime() + 20 * 86400000);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-refill-soon', entityId: 'entity-1', type: 'MEDICAL', title: 'Vitamin D',
          status: 'MEDICATION',
          citations: {
            date: now.toISOString(),
            nextDate: inFiveDays.toISOString(),
            notes: 'Take daily',
            reminders: [{ daysBefore: 7, sent: false }],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'doc-refill-later', entityId: 'entity-1', type: 'MEDICAL', title: 'Multivitamin',
          status: 'MEDICATION',
          citations: {
            date: now.toISOString(),
            nextDate: inTwentyDays.toISOString(),
            reminders: [],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const result = await getMedicationReminders(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Vitamin D');
    });
  });

  describe('checkOverdueAppointments', () => {
    it('returns overdue appointments', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const tomorrow = new Date(now.getTime() + 86400000);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'doc-overdue', entityId: 'entity-1', type: 'MEDICAL', title: 'Overdue Checkup',
          status: 'APPOINTMENT',
          citations: {
            provider: 'Dr. A', date: new Date('2025-06-01').toISOString(),
            nextDate: yesterday.toISOString(),
            reminders: [],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'doc-upcoming', entityId: 'entity-1', type: 'MEDICAL', title: 'Upcoming Checkup',
          status: 'APPOINTMENT',
          citations: {
            provider: 'Dr. B', date: new Date('2025-12-01').toISOString(),
            nextDate: tomorrow.toISOString(),
            reminders: [],
          },
          version: 1, templateId: null, content: null, deletedAt: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const result = await checkOverdueAppointments(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Overdue Checkup');
    });
  });
});
