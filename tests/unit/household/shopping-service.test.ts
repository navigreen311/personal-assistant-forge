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

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import {
  addItem,
  getList,
  markPurchased,
  getSmartSuggestions,
  groupByStore,
} from '@/modules/household/services/shopping-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.Mock;

describe('shopping-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addItem', () => {
    it('should create Document with type SHOPPING_LIST', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'item-1',
        entityId: 'user-1',
        type: 'SHOPPING_LIST',
        content: JSON.stringify({
          name: 'Milk',
          category: 'Dairy',
          quantity: 1,
          unit: 'gallon',
          store: 'Kroger',
          estimatedPrice: 3.99,
          isPurchased: false,
          isRecurring: true,
          recurringFrequency: 'weekly',
          addedAt: new Date().toISOString(),
        }),
      });

      const result = await addItem('user-1', {
        userId: 'user-1',
        name: 'Milk',
        category: 'Dairy',
        quantity: 1,
        unit: 'gallon',
        store: 'Kroger',
        estimatedPrice: 3.99,
        isRecurring: true,
        recurringFrequency: 'weekly',
      });

      expect(mockPrisma.document.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'SHOPPING_LIST',
          title: 'Milk',
          entityId: 'user-1',
        }),
      });
      expect(result.name).toBe('Milk');
      expect(result.isPurchased).toBe(false);
    });

    it('should store item data in content JSON', async () => {
      (mockPrisma.document.create as jest.Mock).mockResolvedValue({
        id: 'item-2',
        entityId: 'user-1',
        content: JSON.stringify({
          name: 'Bread',
          category: 'Bakery',
          quantity: 2,
          isPurchased: false,
          isRecurring: false,
          addedAt: new Date().toISOString(),
        }),
      });

      await addItem('user-1', {
        userId: 'user-1',
        name: 'Bread',
        category: 'Bakery',
        quantity: 2,
        isRecurring: false,
      });

      const callArgs = (mockPrisma.document.create as jest.Mock).mock.calls[0][0];
      const content = JSON.parse(callArgs.data.content);
      expect(content.name).toBe('Bread');
      expect(content.category).toBe('Bakery');
      expect(content.quantity).toBe(2);
    });
  });

  describe('getList', () => {
    it('should return unpurchased items by default', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'item-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: false, isRecurring: false, addedAt: new Date().toISOString() }),
        },
        {
          id: 'item-2',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Eggs', category: 'Dairy', quantity: 1, isPurchased: true, isRecurring: false, addedAt: new Date().toISOString() }),
        },
      ]);

      const result = await getList('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Milk');
    });

    it('should include purchased items when flag set', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'item-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: false, isRecurring: false, addedAt: new Date().toISOString() }),
        },
        {
          id: 'item-2',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Eggs', category: 'Dairy', quantity: 1, isPurchased: true, isRecurring: false, addedAt: new Date().toISOString() }),
        },
      ]);

      const result = await getList('user-1', true);

      expect(result).toHaveLength(2);
    });
  });

  describe('markPurchased', () => {
    it('should update content to mark item as purchased', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'item-1',
        entityId: 'user-1',
        content: JSON.stringify({ name: 'Milk', isPurchased: false, isRecurring: false, addedAt: new Date().toISOString() }),
      });

      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: 'item-1',
        entityId: 'user-1',
        content: JSON.stringify({ name: 'Milk', isPurchased: true, isRecurring: false, addedAt: new Date().toISOString() }),
      });

      const result = await markPurchased('item-1');

      expect(result.isPurchased).toBe(true);
      const updateCall = (mockPrisma.document.update as jest.Mock).mock.calls[0][0];
      const content = JSON.parse(updateCall.data.content);
      expect(content.isPurchased).toBe(true);
    });

    it('should throw if item not found', async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(markPurchased('bad-id')).rejects.toThrow('Shopping item bad-id not found');
    });
  });

  describe('getSmartSuggestions', () => {
    it('should suggest recurring items that need repurchasing', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'item-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: true, isRecurring: true, addedAt: new Date().toISOString() }),
        },
      ]);

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await getSmartSuggestions('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Milk');
      expect(result[0].isPurchased).toBe(false);
    });

    it('should call generateJSON for AI suggestions', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'item-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: false, isRecurring: false, addedAt: new Date().toISOString() }),
        },
      ]);

      mockGenerateJSON.mockResolvedValue({ items: [] });

      await getSmartSuggestions('user-1');

      expect(mockGenerateJSON).toHaveBeenCalledTimes(1);
    });

    it('should not suggest items already on the active list', async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'item-1',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: false, isRecurring: true, addedAt: new Date().toISOString() }),
        },
        {
          id: 'item-2',
          entityId: 'user-1',
          content: JSON.stringify({ name: 'Milk', category: 'Dairy', quantity: 1, isPurchased: true, isRecurring: true, addedAt: new Date().toISOString() }),
        },
      ]);

      mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

      const result = await getSmartSuggestions('user-1');

      // Milk is still on active list, so shouldn't be suggested
      expect(result).toHaveLength(0);
    });
  });

  describe('groupByStore', () => {
    it('should group items by store', () => {
      const items = [
        { id: '1', userId: 'u', name: 'Milk', category: 'Dairy', quantity: 1, store: 'Kroger', isPurchased: false, isRecurring: false, addedAt: new Date() },
        { id: '2', userId: 'u', name: 'Bread', category: 'Bakery', quantity: 1, store: 'Kroger', isPurchased: false, isRecurring: false, addedAt: new Date() },
        { id: '3', userId: 'u', name: 'Nails', category: 'Hardware', quantity: 1, store: 'Home Depot', isPurchased: false, isRecurring: false, addedAt: new Date() },
      ];

      const result = groupByStore(items);

      expect(Object.keys(result)).toHaveLength(2);
      expect(result['Kroger']).toHaveLength(2);
      expect(result['Home Depot']).toHaveLength(1);
    });

    it('should use "Unspecified" for items without store', () => {
      const items = [
        { id: '1', userId: 'u', name: 'Item', category: 'General', quantity: 1, isPurchased: false, isRecurring: false, addedAt: new Date() },
      ];

      const result = groupByStore(items);

      expect(result['Unspecified']).toHaveLength(1);
    });

    it('should exclude purchased items', () => {
      const items = [
        { id: '1', userId: 'u', name: 'Bought', category: 'X', quantity: 1, store: 'A', isPurchased: true, isRecurring: false, addedAt: new Date() },
        { id: '2', userId: 'u', name: 'Active', category: 'X', quantity: 1, store: 'A', isPurchased: false, isRecurring: false, addedAt: new Date() },
      ];

      const result = groupByStore(items);

      expect(result['A']).toHaveLength(1);
      expect(result['A'][0].name).toBe('Active');
    });
  });
});
