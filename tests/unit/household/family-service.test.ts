jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  addMember,
  getMembers,
  updateMemberPrivacy,
  getSharedItems,
} from '@/modules/household/services/family-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('family-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addMember', () => {
    it('should create Contact with family tag', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'user-1',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-1234',
        preferences: {
          relationship: 'Spouse',
          visibility: 'FULL',
          sharedCalendar: true,
          sharedTasks: true,
          sharedShopping: true,
        },
      });

      const result = await addMember('user-1', {
        userId: 'user-1',
        name: 'Jane Doe',
        relationship: 'Spouse',
        email: 'jane@example.com',
        phone: '555-1234',
        visibility: 'FULL',
        sharedCalendar: true,
        sharedTasks: true,
        sharedShopping: true,
      });

      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: ['family'],
          name: 'Jane Doe',
          entityId: 'user-1',
        }),
      });
      expect(result.id).toBe('member-1');
      expect(result.relationship).toBe('Spouse');
    });

    it('should store family-specific fields in preferences', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'member-2',
        entityId: 'user-1',
        name: 'Kid',
        email: null,
        phone: null,
        preferences: {
          relationship: 'Child',
          visibility: 'LIMITED',
          sharedCalendar: true,
          sharedTasks: false,
          sharedShopping: false,
        },
      });

      await addMember('user-1', {
        userId: 'user-1',
        name: 'Kid',
        relationship: 'Child',
        visibility: 'LIMITED',
        sharedCalendar: true,
        sharedTasks: false,
        sharedShopping: false,
      });

      const callArgs = (mockPrisma.contact.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.preferences).toEqual(
        expect.objectContaining({
          relationship: 'Child',
          visibility: 'LIMITED',
          sharedCalendar: true,
          sharedTasks: false,
          sharedShopping: false,
        })
      );
    });
  });

  describe('getMembers', () => {
    it('should query contacts with family tag', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await getMembers('user-1');

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          tags: { has: 'family' },
          deletedAt: null,
        },
      });
    });

    it('should return deserialized family members', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'member-1',
          entityId: 'user-1',
          name: 'Jane',
          email: 'jane@test.com',
          phone: null,
          preferences: {
            relationship: 'Spouse',
            visibility: 'FULL',
            sharedCalendar: true,
            sharedTasks: true,
            sharedShopping: true,
          },
        },
      ]);

      const result = await getMembers('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          name: 'Jane',
          relationship: 'Spouse',
          visibility: 'FULL',
          sharedCalendar: true,
        })
      );
    });
  });

  describe('updateMemberPrivacy', () => {
    it('should update visibility and shared settings in preferences', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'user-1',
        name: 'Jane',
        email: null,
        phone: null,
        preferences: {
          relationship: 'Spouse',
          visibility: 'FULL',
          sharedCalendar: true,
          sharedTasks: true,
          sharedShopping: true,
        },
      });

      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'user-1',
        name: 'Jane',
        email: null,
        phone: null,
        preferences: {
          relationship: 'Spouse',
          visibility: 'LIMITED',
          sharedCalendar: true,
          sharedTasks: false,
          sharedShopping: true,
        },
      });

      const result = await updateMemberPrivacy('member-1', 'LIMITED', { sharedTasks: false });

      expect(result.visibility).toBe('LIMITED');
      expect(result.sharedTasks).toBe(false);
      expect(result.sharedCalendar).toBe(true);
    });

    it('should throw if member not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        updateMemberPrivacy('bad-id', 'FULL', {})
      ).rejects.toThrow('Family member bad-id not found');
    });
  });

  describe('getSharedItems', () => {
    it('should return shared settings for a member', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'user-1',
        name: 'Jane',
        email: null,
        phone: null,
        preferences: {
          sharedCalendar: true,
          sharedTasks: false,
          sharedShopping: true,
        },
      });

      const result = await getSharedItems('user-1', 'member-1');

      expect(result).toEqual({
        tasks: false,
        calendar: true,
        shopping: true,
      });
    });

    it('should return all false if member not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSharedItems('user-1', 'bad-id');

      expect(result).toEqual({ tasks: false, calendar: false, shopping: false });
    });

    it('should return all false if member belongs to different user', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'other-user',
        name: 'Jane',
        email: null,
        phone: null,
        preferences: { sharedCalendar: true, sharedTasks: true, sharedShopping: true },
      });

      const result = await getSharedItems('user-1', 'member-1');

      expect(result).toEqual({ tasks: false, calendar: false, shopping: false });
    });
  });
});
