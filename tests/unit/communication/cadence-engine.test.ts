import { setCadence, getOverdueFollowUps, escalateFollowUp, getNextFollowUps } from '@/modules/communication/services/cadence-engine';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('cadence-engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setCadence', () => {
    it('should set follow-up cadence for a contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: {},
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      const result = await setCadence('c-1', 'WEEKLY');
      expect(result.contactId).toBe('c-1');
      expect(result.frequency).toBe('WEEKLY');
      expect(result.nextDue).toBeInstanceOf(Date);
      expect(result.escalationAfterMisses).toBe(3);
      expect(typeof result.isOverdue).toBe('boolean');
    });

    it('should throw for invalid frequency', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: {},
      });

      await expect(setCadence('c-1', 'HOURLY')).rejects.toThrow('Invalid frequency');
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(setCadence('nonexistent', 'WEEKLY')).rejects.toThrow('Contact not found');
    });

    it('should preserve existing preferences', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: { preferredTone: 'WARM', preferredChannel: 'EMAIL' },
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await setCadence('c-1', 'MONTHLY');

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      const updatedPrefs = updateCall.data.preferences;
      expect(updatedPrefs.preferredTone).toBe('WARM');
      expect(updatedPrefs.cadenceFrequency).toBe('MONTHLY');
    });
  });

  describe('getOverdueFollowUps', () => {
    it('should return overdue contacts', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: thirtyDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
        {
          id: 'c-2',
          lastTouch: new Date(),
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
      ]);

      const overdue = await getOverdueFollowUps('entity-1');
      expect(overdue.some((c) => c.contactId === 'c-1')).toBe(true);
      expect(overdue.every((c) => c.isOverdue)).toBe(true);
    });

    it('should skip contacts without cadence set', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: new Date('2024-01-01'),
          preferences: {},
        },
      ]);

      const overdue = await getOverdueFollowUps('entity-1');
      expect(overdue).toHaveLength(0);
    });
  });

  describe('escalateFollowUp', () => {
    it('should mark contact as escalated', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        preferences: { cadenceFrequency: 'WEEKLY' },
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await escalateFollowUp('c-1');

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.preferences.escalated).toBe(true);
      expect(updateCall.data.preferences.escalationReason).toContain('human review');
    });

    it('should throw for nonexistent contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(escalateFollowUp('nonexistent')).rejects.toThrow('Contact not found');
    });
  });

  describe('getNextFollowUps', () => {
    it('should return follow-ups within the given day window', async () => {
      const recentTouch = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: recentTouch,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
        {
          id: 'c-2',
          lastTouch: recentTouch,
          preferences: { cadenceFrequency: 'QUARTERLY' },
        },
      ]);

      const upcoming = await getNextFollowUps('entity-1', 14);
      // WEEKLY contact should be in the list (due in ~4 days from recentTouch)
      expect(upcoming.some((c) => c.contactId === 'c-1')).toBe(true);
    });

    it('should sort by nextDue ascending', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: threeDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
        {
          id: 'c-2',
          lastTouch: fiveDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
      ]);

      const upcoming = await getNextFollowUps('entity-1', 30);
      if (upcoming.length >= 2) {
        expect(upcoming[0].nextDue.getTime()).toBeLessThanOrEqual(upcoming[1].nextDue.getTime());
      }
    });

    it('should return empty array when no cadences configured', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', lastTouch: new Date(), preferences: {} },
      ]);

      const upcoming = await getNextFollowUps('entity-1', 7);
      expect(upcoming).toHaveLength(0);
    });
  });
});
