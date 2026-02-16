import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db';
import { subDays } from 'date-fns';
import type { WearableConnection, WearableProvider } from '../types';

// === Adapter Interface ===

export interface HealthMetricInput {
  type: string;
  value: number;
  unit: string;
  source: string;
  metadata?: Record<string, unknown>;
  recordedAt: Date;
}

export interface WearableAdapter {
  fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]>;
  fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]>;
  fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]>;
}

// === Stub Adapters ===

class AppleHealthAdapter implements WearableAdapter {
  async fetchSleepData(): Promise<HealthMetricInput[]> {
    throw new Error('Apple Health integration not yet implemented');
  }
  async fetchStressData(): Promise<HealthMetricInput[]> {
    throw new Error('Apple Health integration not yet implemented');
  }
  async fetchHeartRate(): Promise<HealthMetricInput[]> {
    throw new Error('Apple Health integration not yet implemented');
  }
}

class FitbitAdapter implements WearableAdapter {
  async fetchSleepData(): Promise<HealthMetricInput[]> {
    throw new Error('Fitbit integration not yet implemented');
  }
  async fetchStressData(): Promise<HealthMetricInput[]> {
    throw new Error('Fitbit integration not yet implemented');
  }
  async fetchHeartRate(): Promise<HealthMetricInput[]> {
    throw new Error('Fitbit integration not yet implemented');
  }
}

class OuraAdapter implements WearableAdapter {
  async fetchSleepData(): Promise<HealthMetricInput[]> {
    throw new Error('Oura integration not yet implemented');
  }
  async fetchStressData(): Promise<HealthMetricInput[]> {
    throw new Error('Oura integration not yet implemented');
  }
  async fetchHeartRate(): Promise<HealthMetricInput[]> {
    throw new Error('Oura integration not yet implemented');
  }
}

class WHOOPAdapter implements WearableAdapter {
  async fetchSleepData(): Promise<HealthMetricInput[]> {
    throw new Error('WHOOP integration not yet implemented');
  }
  async fetchStressData(): Promise<HealthMetricInput[]> {
    throw new Error('WHOOP integration not yet implemented');
  }
  async fetchHeartRate(): Promise<HealthMetricInput[]> {
    throw new Error('WHOOP integration not yet implemented');
  }
}

class GarminAdapter implements WearableAdapter {
  async fetchSleepData(): Promise<HealthMetricInput[]> {
    throw new Error('Garmin integration not yet implemented');
  }
  async fetchStressData(): Promise<HealthMetricInput[]> {
    throw new Error('Garmin integration not yet implemented');
  }
  async fetchHeartRate(): Promise<HealthMetricInput[]> {
    throw new Error('Garmin integration not yet implemented');
  }
}

// === Adapter Registry ===

const adapterRegistry = new Map<string, WearableAdapter>([
  ['APPLE_WATCH', new AppleHealthAdapter()],
  ['FITBIT', new FitbitAdapter()],
  ['OURA', new OuraAdapter()],
  ['WHOOP', new WHOOPAdapter()],
  ['GARMIN', new GarminAdapter()],
]);

// === Connection Management (transient sessions) ===

const connectionStore = new Map<string, WearableConnection>();

export async function connectWearable(
  userId: string,
  provider: WearableProvider
): Promise<WearableConnection> {
  const connection: WearableConnection = {
    id: uuidv4(),
    userId,
    provider,
    isConnected: true,
    lastSyncAt: new Date(),
  };
  connectionStore.set(connection.id, connection);
  return connection;
}

export async function disconnectWearable(connectionId: string): Promise<void> {
  const conn = connectionStore.get(connectionId);
  if (conn) {
    conn.isConnected = false;
    connectionStore.set(connectionId, conn);
  }
}

export async function getConnections(userId: string): Promise<WearableConnection[]> {
  return Array.from(connectionStore.values()).filter(c => c.userId === userId);
}

// === Data Sync ===

export async function syncWearableData(
  connectionId: string
): Promise<HealthMetricInput[]> {
  const conn = connectionStore.get(connectionId);
  if (!conn || !conn.isConnected) {
    throw new Error('Wearable not connected');
  }

  const adapter = adapterRegistry.get(conn.provider);
  if (!adapter) {
    throw new Error(`No adapter registered for provider: ${conn.provider}`);
  }

  let metrics: HealthMetricInput[] = [];

  try {
    const [sleepData, stressData, heartRateData] = await Promise.all([
      adapter.fetchSleepData(conn.userId, 7),
      adapter.fetchStressData(conn.userId, 7),
      adapter.fetchHeartRate(conn.userId, 7),
    ]);

    metrics = [...sleepData, ...stressData, ...heartRateData];

    if (metrics.length > 0) {
      await prisma.healthMetric.createMany({
        data: metrics.map(m => ({
          entityId: conn.userId,
          type: m.type,
          value: m.value,
          unit: m.unit,
          source: m.source,
          metadata: (m.metadata ?? undefined) as import('@prisma/client').Prisma.InputJsonValue | undefined,
          recordedAt: m.recordedAt,
        })),
      });
    }

    conn.lastSyncAt = new Date();
    connectionStore.set(connectionId, conn);
  } catch {
    // Adapter not yet integrated or API failure — fall back to existing DB data
    const dbMetrics = await prisma.healthMetric.findMany({
      where: {
        entityId: conn.userId,
        recordedAt: { gte: subDays(new Date(), 7) },
      },
      orderBy: { recordedAt: 'desc' },
    });

    metrics = dbMetrics.map((m: { type: string; value: number; unit: string; source: string; metadata: unknown; recordedAt: Date }) => ({
      type: m.type,
      value: m.value,
      unit: m.unit,
      source: m.source,
      metadata: (m.metadata as Record<string, unknown>) ?? undefined,
      recordedAt: m.recordedAt,
    }));
  }

  return metrics;
}

/** @deprecated Use syncWearableData instead */
export async function syncData(connectionId: string) {
  return syncWearableData(connectionId);
}

// === Query Helpers ===

export async function getLatestMetrics(
  entityId: string,
  type?: string,
  days?: number
) {
  const where: Record<string, unknown> = { entityId };
  if (type) where.type = type;
  if (days) {
    where.recordedAt = { gte: subDays(new Date(), days) };
  }

  return prisma.healthMetric.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
  });
}
