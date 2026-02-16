// ============================================================================
// Redis/BullMQ Connection
// Shared IORedis connection for all BullMQ queues and workers
// ============================================================================

import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const REDIS_OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, REDIS_OPTIONS);
  }
  return connection;
}

export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, REDIS_OPTIONS);
}

export function getRedisUrl(): string {
  return REDIS_URL;
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
