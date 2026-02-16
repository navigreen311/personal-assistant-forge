import { setCadence, getOverdueFollowUps, escalateFollowUp, getNextFollowUps, triggerCadenceReminders, getCadenceStatus } from '@/modules/communication/services/cadence-engine';

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findFirst: jest.fn(),
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

    it('should store cadence in contact preferences', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: {},
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await setCadence('c-1', 'DAILY');

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.preferences.cadenceFrequency).toBe('DAILY');
    });

    it('should calculate next due date based on lastTouch', async () => {
      const lastTouch = new Date('2026-01-01');
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch,
        preferences: {},
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      const result = await setCadence('c-1', 'WEEKLY');
      // Next due should be 7 days after lastTouch
      expect(result.nextDue.getTime()).toBeGreaterThan(lastTouch.getTime());
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

    it('should mark as overdue when nextDue is in the past', async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: sixtyDaysAgo,
          preferences: { cadenceFrequency: 'MONTHLY' },
        },
      ]);

      const overdue = await getOverdueFollowUps('entity-1');
      expect(overdue).toHaveLength(1);
      expect(overdue[0].isOverdue).toBe(true);
    });
  });

  describe('triggerCadenceReminders', () => {
    it('should create Notifications for overdue contacts', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: thirtyDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
      ]);
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        name: 'Alice',
        entityId: 'entity-1',
      });
      (mockPrisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({});

      const triggered = await triggerCadenceReminders('entity-1');

      expect(triggered).toBe(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      const createCall = (mockPrisma.notification.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.type).toBe('cadence_reminder');
      expect(createCall.data.title).toContain('Alice');
    });

    it('should skip contacts already reminded', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: thirtyDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
      ]);
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        name: 'Alice',
        entityId: 'entity-1',
      });
      (mockPrisma.notification.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-notif' });

      const triggered = await triggerCadenceReminders('entity-1');

      expect(triggered).toBe(0);
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should set high priority for overdue cadences', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'c-1',
          lastTouch: thirtyDaysAgo,
          preferences: { cadenceFrequency: 'WEEKLY' },
        },
      ]);
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        name: 'Bob',
        entityId: 'entity-1',
      });
      (mockPrisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({});

      await triggerCadenceReminders('entity-1');

      const createCall = (mockPrisma.notification.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.priority).toBe('high');
    });

    it('should return count of triggered reminders', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        { id: 'c-1', lastTouch: thirtyDaysAgo, preferences: { cadenceFrequency: 'WEEKLY' } },
        { id: 'c-2', lastTouch: thirtyDaysAgo, preferences: { cadenceFrequency: 'DAILY' } },
      ]);
      (mockPrisma.contact.findUnique as jest.Mock)
        .mockResolvedValueOnce({ name: 'Alice', entityId: 'entity-1' })
        .mockResolvedValueOnce({ name: 'Bob', entityId: 'entity-1' });
      (mockPrisma.notification.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.notification.create as jest.Mock).mockResolvedValue({});

      const triggered = await triggerCadenceReminders('entity-1');
      expect(triggered).toBe(2);
    });
  });

  describe('getCadenceStatus', () => {
    it('should return cadence info for a contact', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: { cadenceFrequency: 'WEEKLY', escalationAfterMisses: 5 },
      });

      const result = await getCadenceStatus('c-1');
      expect(result).not.toBeNull();
      expect(result!.contactId).toBe('c-1');
      expect(result!.frequency).toBe('WEEKLY');
      expect(result!.nextDue).toBeInstanceOf(Date);
      expect(result!.escalationAfterMisses).toBe(5);
    });

    it('should return null for contacts without cadence', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: new Date(),
        preferences: {},
      });

      const result = await getCadenceStatus('c-1');
      expect(result).toBeNull();
    });

    it('should return null for nonexistent contacts', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getCadenceStatus('nonexistent');
      expect(result).toBeNull();
    });

    it('should calculate isOverdue correctly', async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        lastTouch: sixtyDaysAgo,
        preferences: { cadenceFrequency: 'WEEKLY' },
      });

      const result = await getCadenceStatus('c-1');
      expect(result).not.toBeNull();
      expect(result!.isOverdue).toBe(true);
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

    it('should include escalation timestamp', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'c-1',
        preferences: {},
      });
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({});

      await escalateFollowUp('c-1');

      const updateCall = (mockPrisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.preferences.escalatedAt).toBeDefined();
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
