jest.mock('@/lib/db', () => ({
  prisma: {
    healthMetric: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
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
import { verifiedEntityIdForTest } from '../../helpers/factories';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

/**
 * The entity that owns the connections under test -- deliberately NOT a user id.
 *
 * The service used to take a parameter named `userId` and put it in the
 * `entityId` column.
 */
const entity = (n: string) => verifiedEntityIdForTest(`entity-${n}`);

/**
 * T-018 CHANGED WHAT THIS FILE CAN PROVE, AND THE OLD VERSION IS WHY.
 *
 * `connectionStore` was a module-level `Map`, so this file used to call
 * `connectWearable(...)` and then `getConnections(...)` and watch the value come
 * back -- without a database being involved at any point. Those assertions
 * passed for exactly the reason the feature was broken: the connection lived in
 * process memory, and the deployment target restarts.
 *
 * Connections are now rows. This file drives the mocked client, and
 * `tests/db/life-tenancy.test.ts` proves against a real Postgres that a
 * connection written by one client is visible to another -- which is the part a
 * mock can never show.
 */

/** A HealthMetric row as the connection store writes it. */
function connectionRow(overrides: Partial<{
  id: string;
  entityId: string;
  source: string;
  value: number;
  recordedAt: Date;
}> = {}) {
  return {
    id: 'conn-1',
    entityId: 'entity-1',
    type: 'wearable_connection',
    value: 1,
    unit: 'connection',
    source: 'FITBIT',
    metadata: null,
    recordedAt: new Date('2026-02-15T10:00:00Z'),
    createdAt: new Date('2026-02-15T10:00:00Z'),
    ...overrides,
  };
}

describe('wearable-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectWearable', () => {
    it('writes a connection row scoped to the entity', async () => {
      (mockPrisma.healthMetric.create as jest.Mock).mockResolvedValue(
        connectionRow({ source: 'APPLE_WATCH' })
      );

      const conn = await connectWearable(entity('1'), 'user-1', 'APPLE_WATCH');

      expect(mockPrisma.healthMetric.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityId: 'entity-1',
          type: 'wearable_connection',
          value: 1,
          unit: 'connection',
          source: 'APPLE_WATCH',
        }),
      });
      expect(conn).toEqual({
        id: 'conn-1',
        userId: 'user-1',
        provider: 'APPLE_WATCH',
        isConnected: true,
        lastSyncAt: expect.any(Date),
      });
    });

    it('records the provider it was given', async () => {
      (mockPrisma.healthMetric.create as jest.Mock).mockResolvedValue(
        connectionRow({ source: 'FITBIT' })
      );

      const conn = await connectWearable(entity('1'), 'user-1', 'FITBIT');
      expect(conn.provider).toBe('FITBIT');
    });
  });

  describe('disconnectWearable', () => {
    it('carries the entity in the WHERE, so a foreign id matches nothing', async () => {
      (mockPrisma.healthMetric.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await disconnectWearable(entity('1'), 'conn-owned-by-someone-else');

      expect(mockPrisma.healthMetric.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'conn-owned-by-someone-else',
          entityId: 'entity-1',
          type: 'wearable_connection',
        },
        data: { value: 0 },
      });
    });

    it('resolves for a connection that does not exist', async () => {
      (mockPrisma.healthMetric.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(disconnectWearable(entity('1'), 'non-existent')).resolves.toBeUndefined();
    });
  });

  describe('getConnections', () => {
    it('reads only the connection rows for the entity in scope', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([
        connectionRow({ id: 'conn-a', source: 'GARMIN' }),
        connectionRow({ id: 'conn-b', source: 'WHOOP', value: 0 }),
      ]);

      const connections = await getConnections(entity('1'), 'user-a');

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: { entityId: 'entity-1', type: 'wearable_connection' },
        orderBy: { recordedAt: 'desc' },
      });
      expect(connections.map((c) => c.id)).toEqual(['conn-a', 'conn-b']);
      expect(connections[0].isConnected).toBe(true);
      expect(connections[1].isConnected).toBe(false);
      expect(connections.every((c) => c.userId === 'user-a')).toBe(true);
    });

    it('returns an empty array when the entity has no connections', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);
      expect(await getConnections(entity('9'), 'user-9')).toEqual([]);
    });
  });

  describe('syncWearableData', () => {
    it('throws when the connection is not found in this entity', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(syncWearableData(entity('1'), 'non-existent')).rejects.toThrow(
        'Wearable not connected'
      );
      expect(mockPrisma.healthMetric.findFirst).toHaveBeenCalledWith({
        where: { id: 'non-existent', entityId: 'entity-1', type: 'wearable_connection' },
      });
    });

    it('throws for a disconnected wearable', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue(
        connectionRow({ value: 0 })
      );

      await expect(syncWearableData(entity('1'), 'conn-1')).rejects.toThrow(
        'Wearable not connected'
      );
    });

    it('returns demo data when no API keys are configured', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue(
        connectionRow({ source: 'APPLE_WATCH' })
      );
      (mockPrisma.healthMetric.createMany as jest.Mock).mockResolvedValue({ count: 21 });
      (mockPrisma.healthMetric.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await syncWearableData(entity('1'), 'conn-1');

      // Adapters generate demo data (7 days x 3 metric types = 21 entries)
      expect(result.length).toBe(21);
      expect(result.some((r) => r.type === 'sleep')).toBe(true);
      expect(result.some((r) => r.type === 'stress')).toBe(true);
      expect(result.some((r) => r.type === 'heart_rate')).toBe(true);
      expect(mockPrisma.healthMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ entityId: 'entity-1' })]),
      });
    });

    it('falls back to DB data scoped to the entity when createMany fails', async () => {
      (mockPrisma.healthMetric.findFirst as jest.Mock).mockResolvedValue(
        connectionRow({ source: 'GARMIN' })
      );
      (mockPrisma.healthMetric.createMany as jest.Mock).mockRejectedValue(
        new Error('DB write failed')
      );

      const mockDbData = [
        {
          id: 'hm-1',
          entityId: 'entity-1',
          type: 'sleep',
          value: 7.5,
          unit: 'hours',
          source: 'garmin',
          metadata: null,
          recordedAt: new Date(),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockDbData);

      const result = await syncWearableData(entity('1'), 'conn-1');

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityId: 'entity-1',
            // the connection rows themselves are never returned as readings
            type: { not: 'wearable_connection' },
          }),
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sleep');
    });
  });

  describe('getLatestMetrics', () => {
    it('queries DB with correct filters', async () => {
      const mockMetrics = [
        {
          id: 'hm-1',
          entityId: 'entity-1',
          type: 'sleep',
          value: 8,
          unit: 'hours',
          source: 'manual',
          metadata: null,
          recordedAt: new Date(),
          createdAt: new Date(),
        },
      ];
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue(mockMetrics);

      const result = await getLatestMetrics(entity('1'), 'sleep', 7);

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: {
          entityId: 'entity-1',
          type: 'sleep',
          recordedAt: { gte: expect.any(Date) },
        },
        orderBy: { recordedAt: 'desc' },
      });
      expect(result).toEqual(mockMetrics);
    });

    it('excludes connection rows when no type filter is given', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getLatestMetrics(entity('1'));

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: { entityId: 'entity-1', type: { not: 'wearable_connection' } },
        orderBy: { recordedAt: 'desc' },
      });
    });

    it('queries without date filter when days not provided', async () => {
      (mockPrisma.healthMetric.findMany as jest.Mock).mockResolvedValue([]);

      await getLatestMetrics(entity('1'), 'stress');

      expect(mockPrisma.healthMetric.findMany).toHaveBeenCalledWith({
        where: { entityId: 'entity-1', type: 'stress' },
        orderBy: { recordedAt: 'desc' },
      });
    });
  });
});
