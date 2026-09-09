/**
 * These stand in for `contact.findFirst`/`findFirstOrThrow`/`updateMany`.
 *
 * `jest.mock` factories are hoisted above imports, so the aliases inside the
 * factory must close over module-level `jest.fn()`s declared here. Each is wired
 * to the corresponding `findUnique`/`update` mock below in `beforeEach`, so a
 * test that sets `findUnique.mockResolvedValue(...)` still drives the scoped
 * finder the service now calls.
 */
const mockContactFindUnique = jest.fn();
const mockContactUpdateMany = jest.fn();
const mockContactReread = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      // The service moved from findUnique/update to scoped finders and
      // updateMany. A mock with no findFirst returns undefined and the test
      // passes for the wrong reason -- tenancy pattern, trap 1. Alias them onto
      // the same jest.fn so existing mockResolvedValue setups keep working.
      findFirst: (...a: unknown[]) => mockContactFindUnique(...a),
      findFirstOrThrow: (...a: unknown[]) => mockContactReread(...a),
      update: jest.fn(),
      updateMany: (...a: unknown[]) => mockContactUpdateMany(...a),
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

describe('family-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

  // Route the scoped finders at the same fixtures the unscoped ones use, and
  // make updateMany report a row changed so the service's `count === 0` guard
  // reads as "found".
  // `findFirst` answers from the same fixture `findUnique` used to, so a test
  // that stubs `findUnique` still drives the scoped read the service now does.
  mockContactFindUnique.mockImplementation((...a: unknown[]) =>
    (mockPrisma.contact.findUnique as jest.Mock)(...a)
  );
  // `updateMany` performs the stubbed `update` and reports `count` from whether
  // the row was there, which is how the service distinguishes not-found.
  let lastContactWrite: unknown = null;
  mockContactUpdateMany.mockImplementation(async (...a: unknown[]) => {
    const before = await (mockPrisma.contact.findUnique as jest.Mock)(...a);
    if (!before) return { count: 0 };
    lastContactWrite = await (mockPrisma.contact.update as jest.Mock)(...a);
    return { count: 1 };
  });
  // The service re-reads the row after writing; hand back what the write produced.
  mockContactReread.mockImplementation(async () => lastContactWrite);
  });

  describe('addMember', () => {
    it('should create Contact with family tag', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'entity-1',
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

      const result = await addMember(entity('1'), 'user-1', {
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
          entityId: 'entity-1',
        }),
      });
      expect(result.id).toBe('member-1');
      expect(result.relationship).toBe('Spouse');
    });

    it('should store family-specific fields in preferences', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'member-2',
        entityId: 'entity-1',
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

      await addMember(entity('1'), 'user-1', {
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

      await getMembers(entity('1'), 'user-1');

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          tags: { has: 'family' },
          deletedAt: null,
        },
      });
    });

    it('should return deserialized family members', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'member-1',
          entityId: 'entity-1',
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

      const result = await getMembers(entity('1'), 'user-1');

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
        entityId: 'entity-1',
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
        entityId: 'entity-1',
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

      const result = await updateMemberPrivacy(entity('1'), 'user-1', 'member-1', 'LIMITED', { sharedTasks: false });

      expect(result.visibility).toBe('LIMITED');
      expect(result.sharedTasks).toBe(false);
      expect(result.sharedCalendar).toBe(true);
    });

    it('should throw if member not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        updateMemberPrivacy(entity('1'), 'user-1', 'bad-id', 'FULL', {})
      ).rejects.toThrow('Family member bad-id not found');
    });
  });

  describe('getSharedItems', () => {
    it('should return shared settings for a member', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'member-1',
        entityId: 'entity-1',
        name: 'Jane',
        email: null,
        phone: null,
        preferences: {
          sharedCalendar: true,
          sharedTasks: false,
          sharedShopping: true,
        },
      });

      const result = await getSharedItems(entity('1'), 'member-1');

      expect(result).toEqual({
        tasks: false,
        calendar: true,
        shopping: true,
      });
    });

    it('should return all false if member not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSharedItems(entity('1'), 'bad-id');

      expect(result).toEqual({ tasks: false, calendar: false, shopping: false });
    });

    it("does not find a member belonging to another entity", async () => {
      // The scope is in the WHERE clause now, so a foreign row is simply not
      // found -- there is no post-hoc `contact.entityId !== userId` comparison
      // left to forget. This asserts the query the service issues, then the
      // refusal that follows from it.
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getSharedItems(entity('1'), 'member-1');

      expect(mockPrisma.contact.findUnique).toHaveBeenCalledWith({
        where: { id: 'member-1', entityId: 'entity-1' },
      });
      expect(result).toEqual({ tasks: false, calendar: false, shopping: false });
    });
  });
});
