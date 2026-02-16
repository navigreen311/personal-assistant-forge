import { addDays } from 'date-fns';

jest.mock('@/lib/db', () => ({
  prisma: {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('vehicle-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addVehicle', () => {
    it('should create Document with type VEHICLE', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'user-1',
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

      const result = await addVehicle('user-1', {
        userId: 'user-1',
        make: 'Tesla',
        model: 'Model 3',
        year: 2024,
        mileage: 15000,
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'VEHICLE',
          entityId: 'user-1',
        }),
      });
      expect(result.make).toBe('Tesla');
      expect(result.maintenanceHistory).toEqual([]);
    });

    it('should set title to make model year', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'vehicle-2',
        entityId: 'user-1',
        title: 'Honda Civic 2023',
        content: JSON.stringify({ make: 'Honda', model: 'Civic', year: 2023, mileage: 5000, maintenanceHistory: [] }),
      });

      await addVehicle('user-1', {
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

      await getVehicles('user-1');

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
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
        entityId: 'user-1',
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
        entityId: 'user-1',
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

      const result = await logMaintenance('vehicle-1', {
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
        entityId: 'user-1',
        content: JSON.stringify({ make: 'Tesla', model: 'Model 3', year: 2024, mileage: 15000, maintenanceHistory: [] }),
      });

      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: 'vehicle-1',
        entityId: 'user-1',
        content: JSON.stringify({ make: 'Tesla', model: 'Model 3', year: 2024, mileage: 20000, maintenanceHistory: [{ date: new Date().toISOString(), type: 'Service', cost: 100, mileage: 20000, provider: 'Test' }] }),
      });

      const result = await logMaintenance('vehicle-1', {
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
        logMaintenance('bad-id', { date: new Date(), type: 'Test', cost: 0, mileage: 0, provider: 'X' })
      ).rejects.toThrow('Vehicle bad-id not found');
    });
  });

  describe('getUpcomingService', () => {
    it('should return vehicles with upcoming service', async () => {
      const soonDate = addDays(new Date(), 10);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'user-1',
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

      const result = await getUpcomingService('user-1');

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
          entityId: 'user-1',
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

      const result = await checkExpiringDocuments('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('insurance');
    });

    it('should detect expiring registration', async () => {
      const expiringDate = addDays(new Date(), 20);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'user-1',
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

      const result = await checkExpiringDocuments('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('registration');
    });

    it('should not flag non-expiring documents', async () => {
      const farFuture = addDays(new Date(), 120);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'v-1',
          entityId: 'user-1',
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

      const result = await checkExpiringDocuments('user-1');

      expect(result).toHaveLength(0);
    });
  });
});
