jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-conn-id'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    healthMetric: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { prisma } from '@/lib/db';
import {
  connectWearable,
  disconnectWearable,
  getConnections,
  syncWearableData,
  getLatestMetrics,
} from '@/modules/health/services/wearable-service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('wearable-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectWearable', () => {
    it('creates connection with correct provider', async () => {
      const conn = await connectWearable('user-1', 'APPLE_WATCH');

      expect(conn).toEqual({
        id: 'test-conn-id',
        userId: 'user-1',
        provider: 'APPLE_WATCH',
        isConnected: true,
        lastSyncAt: expect.any(Date),
      });
    });

    it('creates connection for different providers', async () => {
      const conn = await connectWearable('user-1', 'FITBIT');
      expect(conn.provider).toBe('FITBIT');
    });
  });

  describe('disconnectWearable', () => {
    it('sets isConnected to false', async () => {
      const conn = await connectWearable('user-2', 'OURA');
      await disconnectWearable(conn.id);

      const connections = await getConnections('user-2');
      const disconnected = connections.find(c => c.id === conn.id);
      expect(disconnected?.isConnected).toBe(false);
    });

    it('does nothing for non-existent connection', async () => {
      await expect(disconnectWearable('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getConnections', () => {
    it('filters by userId', async () => {
      await connectWearable('user-a', 'GARMIN');
      await connectWearable('user-b', 'WHOOP');

      const connections = await getConnections('user-a');
      expect(connections.every(c => c.userId === 'user-a')).toBe(true);
    });

    it('returns empty array for unknown user', async () => {
      const connections = await getConnections('unknown-user-xyz');
      expect(connections).toEqual([]);
    });
  });

  describe('syncWearableData', () => {
    it('throws for non-connected wearable', async () => {
      await expect(syncWearableData('non-existent')).rejects.toThrow('Wearable not connected');
    });

    it('throws for disconnected wearable', async () => {
      const conn = await connectWearable('user-sync-1', 'FITBIT');
      await disconnectWearable(conn.id);
      await expect(syncWearableData(conn.id)).rejects.toThrow('Wearable not connected');
    });

    it('falls back to DB data when adapter fails (stub adapters)', async () => {
      const conn = await connectWearable('user-sync-2', 'APPLE_WATCH');

      const mockDbData = [
        {
          id: 'hm-1',
          entityId: 'user-sync-2',
          type: 'sleep',
          value: 7.5,
          unit: 'hours',
          source: 'apple_health',
          metadata: null,
          recordedAt: new Date(),
          createdAt: new Date(),
        },
      ];

      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockDbData);

      const result = await syncWearableData(conn.id);

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'user-sync-2',
          }),
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sleep');
      expect(result[0].value).toBe(7.5);
    });

    it('returns empty array when adapter fails and no DB data exists', async () => {
      const conn = await connectWearable('user-sync-3', 'GARMIN');

      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      const result = await syncWearableData(conn.id);
      expect(result).toEqual([]);
    });
  });

  describe('getLatestMetrics', () => {
    it('queries DB with correct filters', async () => {
      const mockMetrics = [
        { id: 'hm-1', entityId: 'user-1', type: 'sleep', value: 8, unit: 'hours', source: 'manual', metadata: null, recordedAt: new Date(), createdAt: new Date() },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await getLatestMetrics('user-1', 'sleep', 7);

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'user-1',
          type: 'sleep',
          recordedAt: { gte: expect.any(Date) },
        },
        orderBy: { recordedAt: 'desc' },
      });
      expect(result).toEqual(mockMetrics);
    });

    it('queries without type filter when not provided', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getLatestMetrics('user-1');

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: { entityId: 'user-1' },
        orderBy: { recordedAt: 'desc' },
      });
    });

    it('queries without date filter when days not provided', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getLatestMetrics('user-1', 'stress');

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: { entityId: 'user-1', type: 'stress' },
        orderBy: { recordedAt: 'desc' },
      });
    });
  });
});
