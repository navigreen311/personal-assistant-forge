import { v4 as uuidv4 } from 'uuid';
import type { WearableConnection, WearableProvider, SleepData, StressLevel } from '../types';
import { subDays, format } from 'date-fns';

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

// TODO: Replace simulated data generation with real wearable API integration
// (Apple HealthKit, Fitbit Web API, Oura Cloud API, WHOOP API, Garmin Connect API)
export async function syncData(connectionId: string): Promise<{ sleepData: SleepData[]; stressLevels: StressLevel[] }> {
  const conn = connectionStore.get(connectionId);
  if (!conn || !conn.isConnected) {
    throw new Error('Wearable not connected');
  }

  const now = new Date();
  const sleepData: SleepData[] = [];
  const stressLevels: StressLevel[] = [];

  for (let i = 0; i < 7; i++) {
    const date = subDays(now, i);
    const dateStr = format(date, 'yyyy-MM-dd');

    const totalHours = 6 + Math.random() * 3;
    const deepPct = 0.15 + Math.random() * 0.1;
    const remPct = 0.2 + Math.random() * 0.1;
    const lightPct = 1 - deepPct - remPct;

    sleepData.push({
      date: dateStr,
      totalHours: Math.round(totalHours * 10) / 10,
      deepSleepHours: Math.round(totalHours * deepPct * 10) / 10,
      remSleepHours: Math.round(totalHours * remPct * 10) / 10,
      lightSleepHours: Math.round(totalHours * lightPct * 10) / 10,
      awakeMinutes: Math.floor(Math.random() * 30) + 5,
      sleepScore: Math.floor(60 + Math.random() * 40),
      bedTime: `${22 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      wakeTime: `${6 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
    });

    stressLevels.push({
      userId: conn.userId,
      timestamp: date,
      level: Math.floor(20 + Math.random() * 60),
      source: 'wearable',
      triggers: [],
    });
  }

  conn.lastSyncAt = now;
  connectionStore.set(connectionId, conn);

  return { sleepData, stressLevels };
}
