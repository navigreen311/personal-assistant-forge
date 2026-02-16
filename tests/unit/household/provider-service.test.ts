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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateText = generateText as jest.Mock;

describe('provider-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addProvider', () => {
    it('should create Contact with service_provider tag', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        entityId: 'user-1',
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

      const result = await addProvider('user-1', {
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
          entityId: 'user-1',
        }),
      });
      expect(result.id).toBe('provider-1');
    });

    it('should store category and rating in preferences', async () => {
      (mockPrisma.contact.create as jest.Mock).mockResolvedValue({
        id: 'provider-2',
        entityId: 'user-1',
        name: 'Quick Electric',
        phone: null,
        email: null,
        preferences: { category: 'ELECTRICAL', rating: 5, costHistory: [] },
      });

      await addProvider('user-1', {
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

      await getProviders('user-1');

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          tags: { has: 'service_provider' },
          deletedAt: null,
        },
      });
    });

    it('should filter by category when provided', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'user-1',
          name: 'Plumber',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
        {
          id: 'p-2',
          entityId: 'user-1',
          name: 'Electrician',
          phone: null,
          email: null,
          preferences: { category: 'ELECTRICAL', rating: 5, costHistory: [] },
        },
      ]);

      const result = await getProviders('user-1', 'PLUMBING');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Plumber');
    });
  });

  describe('updateProvider', () => {
    it('should update provider fields', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'user-1',
        name: 'Old Name',
        phone: '555-0000',
        email: null,
        preferences: { category: 'PLUMBING', rating: 3, costHistory: [] },
      });

      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'user-1',
        name: 'New Name',
        phone: '555-0000',
        email: null,
        preferences: { category: 'PLUMBING', rating: 4.5, costHistory: [] },
      });

      const result = await updateProvider('p-1', { name: 'New Name', rating: 4.5 });

      expect(result.name).toBe('New Name');
      expect(result.rating).toBe(4.5);
    });

    it('should throw if provider not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(updateProvider('nonexistent', { name: 'X' })).rejects.toThrow(
        'Provider nonexistent not found'
      );
    });
  });

  describe('logServiceCall', () => {
    it('should append to cost history', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'user-1',
        name: 'ABC Plumbing',
        phone: null,
        email: null,
        preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
      });

      const serviceDate = new Date('2026-01-15');
      (mockPrisma.contact.update as jest.Mock).mockResolvedValue({
        id: 'p-1',
        entityId: 'user-1',
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

      const result = await logServiceCall('p-1', serviceDate, 150, 'Drain cleaning');

      expect(mockPrisma.contact.update).toHaveBeenCalled();
      expect(result.costHistory).toHaveLength(1);
    });

    it('should throw if provider not found', async () => {
      (mockPrisma.contact.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(logServiceCall('bad-id', new Date(), 100, 'test')).rejects.toThrow(
        'Provider bad-id not found'
      );
    });
  });

  describe('getRecommendedProvider', () => {
    it('should sort by rating then last used', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'user-1',
          name: 'Low Rating',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 3, costHistory: [], lastUsed: '2026-01-01T00:00:00Z' },
        },
        {
          id: 'p-2',
          entityId: 'user-1',
          name: 'High Rating',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 5, costHistory: [], lastUsed: '2025-12-01T00:00:00Z' },
        },
      ]);

      mockGenerateText.mockResolvedValue('Great provider.');

      const result = await getRecommendedProvider('user-1', 'PLUMBING');

      expect(result).not.toBeNull();
      expect(result!.provider.name).toBe('High Rating');
    });

    it('should call generateText for recommendation rationale', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'user-1',
          name: 'ABC Plumbing',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
      ]);

      mockGenerateText.mockResolvedValue('Excellent track record.');

      const result = await getRecommendedProvider('user-1', 'PLUMBING');

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(result!.rationale).toBe('Excellent track record.');
    });

    it('should fallback to default rationale on AI failure', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'p-1',
          entityId: 'user-1',
          name: 'ABC Plumbing',
          phone: null,
          email: null,
          preferences: { category: 'PLUMBING', rating: 4, costHistory: [] },
        },
      ]);

      mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

      const result = await getRecommendedProvider('user-1', 'PLUMBING');

      expect(result!.rationale).toContain('4/5 rating');
    });

    it('should return null if no providers exist', async () => {
      (mockPrisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getRecommendedProvider('user-1', 'PLUMBING');

      expect(result).toBeNull();
    });
  });
});
