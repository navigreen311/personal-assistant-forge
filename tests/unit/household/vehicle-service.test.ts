import { addDays } from 'date-fns';

/**
 * These stand in for `document.findFirst`/`findFirstOrThrow`/`updateMany`.
 *
 * `jest.mock` factories are hoisted above imports, so the aliases inside the
 * factory must close over module-level `jest.fn()`s declared here. Each is wired
 * to the corresponding `findUnique`/`update` mock below in `beforeEach`, so a
 * test that sets `findUnique.mockResolvedValue(...)` still drives the scoped
 * finder the service now calls.
 */
const mockDocumentFindUnique = jest.fn();
const mockDocumentUpdateMany = jest.fn();
const mockDocumentReread = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      // The service moved from findUnique/update to scoped finders and
      // updateMany. A mock with no findFirst returns undefined and the test
      // passes for the wrong reason -- tenancy pattern, trap 1. Alias them onto
      // the same jest.fn so existing mockResolvedValue setups keep working.
      findFirst: (...a: unknown[]) => mockDocumentFindUnique(...a),
      findFirstOrThrow: (...a: unknown[]) => mockDocumentReread(...a),
      update: jest.fn(),
      updateMany: (...a: unknown[]) => mockDocumentUpdateMany(...a),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  addVehicle,
  getVehicles,
  logMaintenance,
  getUpcomingService,
  checkExpiringDocuments,
} from '@/modules/household/services/vehicle-service';

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

describe('vehicle-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

  // Route the scoped finders at the same fixtures the unscoped ones use, and
  // make updateMany report a row changed so the service's `count === 0` guard
  // reads as "found".
  // `findFirst` answers from the same fixture `findUnique` used to, so a test
  // that stubs `findUnique` still drives the scoped read the service now does.
  mockDocumentFindUnique.mockImplementation((...a: unknown[]) =>
    (mockPrisma.document.findUnique as jest.Mock)(...a)
  );
  // `updateMany` performs the stubbed `update` and reports `count` from whether
  // the row was there, which is how the service distinguishes not-found.
  let lastDocumentWrite: unknown = null;
  mockDocumentUpdateMany.mockImplementation(async (...a: unknown[]) => {
    const before = await (mockPrisma.document.findUnique as jest.Mock)(...a);
    if (!before) return { count: 0 };
    lastDocumentWrite = await (mockPrisma.document.update as jest.Mock)(...a);
    return { count: 1 };
  });
  // The service re-reads the row after writing; hand back what the write produced.
  mockDocumentReread.mockImplementation(async () => lastDocumentWrite);
  });

  describe('addVehicle', () => {
    it('should create Document with type VEHICLE', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'entity-1',
        type: 'VEHICLE',
        title: 'Tesla Model 3 2024',
        content: JSON.stringify({
          make: 'Tesla',
          model: 'Model 3',
          year: 2024,
          mileage: 15000,
          maintenanceHistory: [],
        }),
      });

      const result = await addVehicle(entity('1'), 'user-1', {
        userId: 'user-1',
        make: 'Tesla',
        model: 'Model 3',
        year: 2024,
        mileage: 15000,
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'VEHICLE',
          entityId: 'entity-1',
        }),
      });
      expect(result.make).toBe('Tesla');
      expect(result.maintenanceHistory).toEqual([]);
    });

    it('should set title to make model year', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'vehicle-2',
        entityId: 'entity-1',
        title: 'Honda Civic 2023',
        content: JSON.stringify({ make: 'Honda', model: 'Civic', year: 2023, mileage: 5000, maintenanceHistory: [] }),
      });

      await addVehicle(entity('1'), 'user-1', {
        userId: 'user-1',
        make: 'Honda',
        model: 'Civic',
        year: 2023,
        mileage: 5000,
      });

      const callArgs = (mockPrisma.document.create as jest.Mock).mock.calls[0][0];
      expect(callArgs.data.title).toBe('Honda Civic 2023');
    });
  });

  describe('getVehicles', () => {
    it('should query documents with type VEHICLE', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      await getVehicles(entity('1'), 'user-1');

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          type: 'VEHICLE',
          deletedAt: null,
        },
      });
    });
  });

  describe('logMaintenance', () => {
    it('should append entry to maintenance history in content', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          make: 'Tesla',
          model: 'Model 3',
          year: 2024,
          mileage: 15000,
          maintenanceHistory: [],
        }),
      });

      const entryDate = new Date('2026-02-01');
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'entity-1',
        content: JSON.stringify({
          make: 'Tesla',
          model: 'Model 3',
          year: 2024,
          mileage: 16000,
          maintenanceHistory: [
            { date: entryDate.toISOString(), type: 'Oil Change', cost: 75, mileage: 16000, provider: 'Tesla Service' },
          ],
        }),
      });

      const result = await logMaintenance(entity('1'), 'user-1', 'vehicle-1', {
        date: entryDate,
        type: 'Oil Change',
        cost: 75,
        mileage: 16000,
        provider: 'Tesla Service',
      });

      expect(result.maintenanceHistory).toHaveLength(1);
      expect(result.maintenanceHistory[0].type).toBe('Oil Change');
    });

    it('should update mileage', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'entity-1',
        content: JSON.stringify({ make: 'Tesla', model: 'Model 3', year: 2024, mileage: 15000, maintenanceHistory: [] }),
      });

      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'entity-1',
        content: JSON.stringify({ make: 'Tesla', model: 'Model 3', year: 2024, mileage: 20000, maintenanceHistory: [{ date: new Date().toISOString(), type: 'Service', cost: 100, mileage: 20000, provider: 'Test' }] }),
      });

      const result = await logMaintenance(entity('1'), 'user-1', 'vehicle-1', {
        date: new Date(),
        type: 'Service',
        cost: 100,
        mileage: 20000,
        provider: 'Test',
      });

      expect(result.mileage).toBe(20000);
    });

    it('should throw if vehicle not found', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        logMaintenance(entity('1'), 'user-1', 'bad-id', { date: new Date(), type: 'Test', cost: 0, mileage: 0, provider: 'X' })
      ).rejects.toThrow('Vehicle bad-id not found');
    });
  });

  describe('getUpcomingService', () => {
    it('should return vehicles with upcoming service', async () => {
      const soonDate = addDays(new Date(), 10);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'entity-1',
          content: JSON.stringify({
            make: 'Tesla',
            model: 'Model 3',
            year: 2024,
            mileage: 15000,
            nextServiceDate: soonDate.toISOString(),
            nextServiceType: 'Tire Rotation',
            maintenanceHistory: [],
          }),
        },
      ]);

      const result = await getUpcomingService(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].nextServiceType).toBe('Tire Rotation');
    });
  });

  describe('checkExpiringDocuments', () => {
    it('should detect expiring insurance', async () => {
      const expiringDate = addDays(new Date(), 15);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'entity-1',
          content: JSON.stringify({
            make: 'Tesla',
            model: 'Model 3',
            year: 2024,
            mileage: 15000,
            insuranceExpiry: expiringDate.toISOString(),
            maintenanceHistory: [],
          }),
        },
      ]);

      const result = await checkExpiringDocuments(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('insurance');
    });

    it('should detect expiring registration', async () => {
      const expiringDate = addDays(new Date(), 20);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'entity-1',
          content: JSON.stringify({
            make: 'Honda',
            model: 'Civic',
            year: 2023,
            mileage: 5000,
            registrationExpiry: expiringDate.toISOString(),
            maintenanceHistory: [],
          }),
        },
      ]);

      const result = await checkExpiringDocuments(entity('1'), 'user-1');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('registration');
    });

    it('should not flag non-expiring documents', async () => {
      const farFuture = addDays(new Date(), 120);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'entity-1',
          content: JSON.stringify({
            make: 'Tesla',
            model: 'Model 3',
            year: 2024,
            mileage: 15000,
            insuranceExpiry: farFuture.toISOString(),
            registrationExpiry: farFuture.toISOString(),
            maintenanceHistory: [],
          }),
        },
      ]);

      const result = await checkExpiringDocuments(entity('1'), 'user-1');

      expect(result).toHaveLength(0);
    });
  });
});
