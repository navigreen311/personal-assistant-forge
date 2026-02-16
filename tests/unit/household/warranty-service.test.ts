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
  addWarranty,
  getWarranties,
  getExpiringWarranties,
  addSubscription,
  getSubscriptions,
  getMonthlySubscriptionCost,
  getUpcomingRenewals,
} from '@/modules/household/services/warranty-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('warranty-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addWarranty', () => {
    it('should create Document with type WARRANTY', async () => {
      const endDate = addDays(new Date(), 365);
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'warranty-1',
        entityId: 'user-1',
        type: 'WARRANTY',
        content: JSON.stringify({
          itemName: 'Samsung TV',
          purchaseDate: new Date().toISOString(),
          warrantyEndDate: endDate.toISOString(),
          provider: 'Samsung',
          claimPhone: '1-800-726-7864',
        }),
      });

      const result = await addWarranty('user-1', {
        userId: 'user-1',
        itemName: 'Samsung TV',
        purchaseDate: new Date(),
        warrantyEndDate: endDate,
        provider: 'Samsung',
        claimPhone: '1-800-726-7864',
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'WARRANTY',
          title: 'Samsung TV',
          entityId: 'user-1',
        }),
      });
      expect(result.itemName).toBe('Samsung TV');
    });

    it('should calculate isExpiring and isExpired on creation', async () => {
      const expiringDate = addDays(new Date(), 15);
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'warranty-2',
        entityId: 'user-1',
        content: JSON.stringify({
          itemName: 'Expiring Item',
          purchaseDate: new Date().toISOString(),
          warrantyEndDate: expiringDate.toISOString(),
          provider: 'Test',
        }),
      });

      const result = await addWarranty('user-1', {
        userId: 'user-1',
        itemName: 'Expiring Item',
        purchaseDate: new Date(),
        warrantyEndDate: expiringDate,
        provider: 'Test',
      });

      expect(result.isExpiring).toBe(true);
      expect(result.isExpired).toBe(false);
    });

    it('should mark expired warranties', async () => {
      const pastDate = addDays(new Date(), -10);
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'warranty-3',
        entityId: 'user-1',
        content: JSON.stringify({
          itemName: 'Expired Item',
          purchaseDate: new Date('2020-01-01').toISOString(),
          warrantyEndDate: pastDate.toISOString(),
          provider: 'Test',
        }),
      });

      const result = await addWarranty('user-1', {
        userId: 'user-1',
        itemName: 'Expired Item',
        purchaseDate: new Date('2020-01-01'),
        warrantyEndDate: pastDate,
        provider: 'Test',
      });

      expect(result.isExpired).toBe(true);
    });
  });

  describe('getWarranties', () => {
    it('should return warranties with computed expiry flags', async () => {
      const futureDate = addDays(new Date(), 365);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'w-1',
          entityId: 'user-1',
          content: JSON.stringify({
            itemName: 'TV',
            purchaseDate: new Date().toISOString(),
            warrantyEndDate: futureDate.toISOString(),
            provider: 'Samsung',
          }),
        },
      ]);

      const result = await getWarranties('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].isExpired).toBe(false);
      expect(result[0].isExpiring).toBe(false);
    });
  });

  describe('getExpiringWarranties', () => {
    it('should return warranties expiring within specified days', async () => {
      const expiringDate = addDays(new Date(), 15);
      const farDate = addDays(new Date(), 365);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'w-1',
          entityId: 'user-1',
          content: JSON.stringify({
            itemName: 'Expiring',
            purchaseDate: new Date().toISOString(),
            warrantyEndDate: expiringDate.toISOString(),
            provider: 'Test',
          }),
        },
        {
          id: 'w-2',
          entityId: 'user-1',
          content: JSON.stringify({
            itemName: 'Not Expiring',
            purchaseDate: new Date().toISOString(),
            warrantyEndDate: farDate.toISOString(),
            provider: 'Test',
          }),
        },
      ]);

      const result = await getExpiringWarranties('user-1', 30);

      expect(result).toHaveLength(1);
      expect(result[0].itemName).toBe('Expiring');
      expect(result[0].isExpiring).toBe(true);
    });
  });

  describe('addSubscription', () => {
    it('should create Document with type SUBSCRIPTION', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'sub-1',
        entityId: 'user-1',
        type: 'SUBSCRIPTION',
        content: JSON.stringify({
          name: 'Netflix',
          costPerMonth: 15.99,
          billingCycle: 'MONTHLY',
          renewalDate: new Date().toISOString(),
          category: 'Entertainment',
          isActive: true,
          autoRenew: true,
        }),
      });

      const result = await addSubscription('user-1', {
        userId: 'user-1',
        name: 'Netflix',
        costPerMonth: 15.99,
        billingCycle: 'MONTHLY',
        renewalDate: new Date(),
        category: 'Entertainment',
        isActive: true,
        autoRenew: true,
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SUBSCRIPTION',
          title: 'Netflix',
        }),
      });
      expect(result.name).toBe('Netflix');
    });
  });

  describe('getMonthlySubscriptionCost', () => {
    it('should sum monthly costs of active subscriptions', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Netflix', costPerMonth: 15.99, billingCycle: 'MONTHLY', renewalDate: new Date().toISOString(), category: 'Entertainment', isActive: true, autoRenew: true }),
        },
        {
          id: 's-2',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Gym', costPerMonth: 49.00, billingCycle: 'MONTHLY', renewalDate: new Date().toISOString(), category: 'Health', isActive: true, autoRenew: false }),
        },
      ]);

      const result = await getMonthlySubscriptionCost('user-1');

      expect(result).toBeCloseTo(64.99);
    });

    it('should prorate annual subscriptions to monthly', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Adobe CC', costPerMonth: 120, billingCycle: 'ANNUAL', renewalDate: new Date().toISOString(), category: 'Software', isActive: true, autoRenew: true }),
        },
      ]);

      const result = await getMonthlySubscriptionCost('user-1');

      expect(result).toBeCloseTo(10);
    });

    it('should exclude inactive subscriptions', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Cancelled', costPerMonth: 99, billingCycle: 'MONTHLY', renewalDate: new Date().toISOString(), category: 'Other', isActive: false, autoRenew: false }),
        },
      ]);

      const result = await getMonthlySubscriptionCost('user-1');

      expect(result).toBe(0);
    });
  });

  describe('getUpcomingRenewals', () => {
    it('should return active subscriptions renewing within days', async () => {
      const soonDate = addDays(new Date(), 10);
      const farDate = addDays(new Date(), 90);

      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 's-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Netflix', costPerMonth: 15.99, billingCycle: 'MONTHLY', renewalDate: soonDate.toISOString(), category: 'Entertainment', isActive: true, autoRenew: true }),
        },
        {
          id: 's-2',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Adobe', costPerMonth: 120, billingCycle: 'ANNUAL', renewalDate: farDate.toISOString(), category: 'Software', isActive: true, autoRenew: true }),
        },
      ]);

      const result = await getUpcomingRenewals('user-1', 30);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
    });
  });
});
