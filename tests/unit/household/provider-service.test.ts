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

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai';
import {
  addProvider,
  getProviders,
  updateProvider,
  logServiceCall,
  getRecommendedProvider,
} from '@/modules/household/services/provider-service';

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
const mockGenerateText = generateText as jest.Mock;

describe('provider-service', () => {
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

  describe('addProvider', () => {
    it('should create Contact with service_provider tag', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        entityId: 'entity-1',
        name: 'ABC Plumbing',
        phone: '555-1234',
        email: 'abc@plumbing.com',
        preferences: {
          category: 'PLUMBING',
          rating: 4.5,
          lastUsed: null,
          notes: undefined,
          costHistory: [],
        },
      });

      const result = await addProvider(entity('1'), 'user-1', {
        userId: 'user-1',
        name: 'ABC Plumbing',
        category: 'PLUMBING',
        phone: '555-1234',
        email: 'abc@plumbing.com',
        rating: 4.5,
      });

      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: ['service_provider'],
          name: 'ABC Plumbing',
          entityId: 'entity-1',
        }),
      });
      expect(result.id).toBe('provider-1');
    });

    it('should store category and rating in preferences', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'provider-2',
        entityId: 'entity-1',
        name: 'Quick Electric',
        phone: null,
        email: null,
        preferences: { category: 'ELECTRICAL', rating: 5, costHistory: [] },
      });

      await addProvider(entity('1'), 'user-1', {
        userId: 'user-1',
        name: 'Quick Electric',
        category: 'ELECTRICAL',
        rating: 5,
      });

      const callArgs = (mockPrisma.contact.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.preferences).toEqual(
        expect.objectContaining({
          category: 'ELECTRICAL',
          rating: 5,
        })
      );
    });
  });

  describe('getProviders', () => {
    it('should query contacts with service_provider tag', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await getProviders(entity('1'), 'user-1');

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          tags: { has: 'service_provider' },
          deletedAt: null,
        },
      });
    });

    it('should filter by category when provided', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'entity-1',
          name: 'Plumber',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
        {
          id: 'p-2',
          entityId: 'entity-1',
          name: 'Electrician',
          phone: null,
          email: null,
          preferences: { category: 'ELECTRICAL', rating: 5, costHistory: [] },
        },
      ]);

      const result = await getProviders(entity('1'), 'user-1', 'PLUMBING');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Plumber');
    });
  });

  describe('updateProvider', () => {
    it('should update provider fields', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'entity-1',
        name: 'Old Name',
        phone: '555-0000',
        email: null,
        preferences: { category: 'PLUMBING', rating: 3, costHistory: [] },
      });

      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'entity-1',
        name: 'New Name',
        phone: '555-0000',
        email: null,
        preferences: { category: 'PLUMBING', rating: 4.5, costHistory: [] },
      });

      const result = await updateProvider(entity('1'), 'user-1', 'p-1', { name: 'New Name', rating: 4.5 });

      expect(result.name).toBe('New Name');
      expect(result.rating).toBe(4.5);
    });

    it('should throw if provider not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(updateProvider(entity('1'), 'user-1', 'nonexistent', { name: 'X' })).rejects.toThrow(
        'Provider nonexistent not found'
      );
    });
  });

  describe('logServiceCall', () => {
    it('should append to cost history', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'entity-1',
        name: 'ABC Plumbing',
        phone: null,
        email: null,
        preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
      });

      const serviceDate = new Date('2026-01-15');
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'entity-1',
        name: 'ABC Plumbing',
        phone: null,
        email: null,
        preferences: {
          category: 'PLUMBING',
          rating: 4,
          costHistory: [{ date: serviceDate.toISOString(), amount: 150, service: 'Drain cleaning' }],
          lastUsed: serviceDate.toISOString(),
        },
      });

      const result = await logServiceCall(entity('1'), 'user-1', 'p-1', serviceDate, 150, 'Drain cleaning');

      expect(mockPrisma.contact.update).toHaveBeenCalled();
      expect(result.costHistory).toHaveLength(1);
    });

    it('should throw if provider not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(logServiceCall(entity('1'), 'user-1', 'bad-id', new Date(), 100, 'test')).rejects.toThrow(
        'Provider bad-id not found'
      );
    });
  });

  describe('getRecommendedProvider', () => {
    it('should sort by rating then last used', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'entity-1',
          name: 'Low Rating',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 3, costHistory: [], lastUsed: '2026-01-01T00:00:00Z' },
        },
        {
          id: 'p-2',
          entityId: 'entity-1',
          name: 'High Rating',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 5, costHistory: [], lastUsed: '2025-12-01T00:00:00Z' },
        },
      ]);

      mockGenerateText.mockResolvedValue('Great provider.');

      const result = await getRecommendedProvider(entity('1'), 'user-1', 'PLUMBING');

      expect(result).not.toBeNull();
      expect(result!.provider.name).toBe('High Rating');
    });

    it('should call generateText for recommendation rationale', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'entity-1',
          name: 'ABC Plumbing',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
      ]);

      mockGenerateText.mockResolvedValue('Excellent track record.');

      const result = await getRecommendedProvider(entity('1'), 'user-1', 'PLUMBING');

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(result!.rationale).toBe('Excellent track record.');
    });

    it('should fallback to default rationale on AI failure', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'entity-1',
          name: 'ABC Plumbing',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
      ]);

      mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

      const result = await getRecommendedProvider(entity('1'), 'user-1', 'PLUMBING');

      expect(result!.rationale).toContain('4/5 rating');
    });

    it('should return null if no providers exist', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getRecommendedProvider(entity('1'), 'user-1', 'PLUMBING');

      expect(result).toBeNull();
    });
  });
});
