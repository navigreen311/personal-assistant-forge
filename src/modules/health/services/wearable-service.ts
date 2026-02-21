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

// === Demo Data Generators ===

function generateDemoSleepData(source: string, days: number): HealthMetricInput[] {
  const metrics: HealthMetricInput[] = [];
  for (let i = 0; i < days; i++) {
    const date = subDays(new Date(), i);
    // Total sleep hours: realistic range 5.5–8.5
    const totalHours = Math.round((6 + Math.random() * 2.5) * 10) / 10;
    metrics.push({
      type: 'sleep',
      value: totalHours,
      unit: 'hours',
      source,
      metadata: {
        demo: true,
        deepSleepHours: Math.round((totalHours * 0.2 + Math.random() * 0.5) * 10) / 10,
        remSleepHours: Math.round((totalHours * 0.22 + Math.random() * 0.3) * 10) / 10,
        lightSleepHours: Math.round((totalHours * 0.45) * 10) / 10,
        awakeMinutes: Math.round(10 + Math.random() * 30),
        sleepScore: Math.round(60 + Math.random() * 35),
      },
      recordedAt: date,
    });
  }
  return metrics;
}

function generateDemoStressData(source: string, days: number): HealthMetricInput[] {
  const metrics: HealthMetricInput[] = [];
  for (let i = 0; i < days; i++) {
    const date = subDays(new Date(), i);
    // Stress level 1–100 (lower is calmer)
    metrics.push({
      type: 'stress',
      value: Math.round(20 + Math.random() * 60),
      unit: 'score',
      source,
      metadata: {
        demo: true,
        restingStress: Math.round(15 + Math.random() * 25),
        peakStress: Math.round(50 + Math.random() * 45),
        recoveryScore: Math.round(50 + Math.random() * 45),
      },
      recordedAt: date,
    });
  }
  return metrics;
}

function generateDemoHeartRateData(source: string, days: number): HealthMetricInput[] {
  const metrics: HealthMetricInput[] = [];
  for (let i = 0; i < days; i++) {
    const date = subDays(new Date(), i);
    const restingHR = Math.round(55 + Math.random() * 20);
    metrics.push({
      type: 'heart_rate',
      value: restingHR,
      unit: 'bpm',
      source,
      metadata: {
        demo: true,
        restingHeartRate: restingHR,
        maxHeartRate: Math.round(restingHR + 60 + Math.random() * 40),
        averageHeartRate: Math.round(restingHR + 10 + Math.random() * 15),
        hrvMs: Math.round(20 + Math.random() * 80),
      },
      recordedAt: date,
    });
  }
  return metrics;
}

// === Adapter Implementations ===

class AppleHealthAdapter implements WearableAdapter {
  private apiKey = process.env.APPLE_HEALTH_API_KEY;

  async fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoSleepData('apple_health:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.apple-healthkit.com/v1/users/${userId}/sleep?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Apple Health sleep API error: ${res.status}`);
    const data = await res.json() as { records: { date: string; totalSleepHours: number; deepSleepHours: number; remSleepHours: number; lightSleepHours: number; awakeMinutes: number; sleepScore: number }[] };
    return data.records.map((r) => ({
      type: 'sleep',
      value: r.totalSleepHours,
      unit: 'hours',
      source: 'apple_health',
      metadata: { deepSleepHours: r.deepSleepHours, remSleepHours: r.remSleepHours, lightSleepHours: r.lightSleepHours, awakeMinutes: r.awakeMinutes, sleepScore: r.sleepScore },
      recordedAt: new Date(r.date),
    }));
  }

  async fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoStressData('apple_health:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.apple-healthkit.com/v1/users/${userId}/stress?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Apple Health stress API error: ${res.status}`);
    const data = await res.json() as { records: { date: string; stressLevel: number; restingStress: number; peakStress: number; recoveryScore: number }[] };
    return data.records.map((r) => ({
      type: 'stress',
      value: r.stressLevel,
      unit: 'score',
      source: 'apple_health',
      metadata: { restingStress: r.restingStress, peakStress: r.peakStress, recoveryScore: r.recoveryScore },
      recordedAt: new Date(r.date),
    }));
  }

  async fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoHeartRateData('apple_health:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.apple-healthkit.com/v1/users/${userId}/heart-rate?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Apple Health heart rate API error: ${res.status}`);
    const data = await res.json() as { records: { date: string; restingHeartRate: number; maxHeartRate: number; averageHeartRate: number; hrvMs: number }[] };
    return data.records.map((r) => ({
      type: 'heart_rate',
      value: r.restingHeartRate,
      unit: 'bpm',
      source: 'apple_health',
      metadata: { restingHeartRate: r.restingHeartRate, maxHeartRate: r.maxHeartRate, averageHeartRate: r.averageHeartRate, hrvMs: r.hrvMs },
      recordedAt: new Date(r.date),
    }));
  }
}

class FitbitAdapter implements WearableAdapter {
  private clientId = process.env.FITBIT_CLIENT_ID;
  private clientSecret = process.env.FITBIT_CLIENT_SECRET;

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  async fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.clientId) {
      return generateDemoSleepData('fitbit:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.fitbit.com/1.2/user/${userId}/sleep/date/${startDate}/${endDate}.json`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Fitbit sleep API error: ${res.status}`);
    const data = await res.json() as { sleep: { dateOfSleep: string; minutesAsleep: number; levels: { summary: { deep: { minutes: number }; rem: { minutes: number }; light: { minutes: number }; wake: { minutes: number } } }; efficiency: number }[] };
    return data.sleep.map((r) => ({
      type: 'sleep',
      value: Math.round((r.minutesAsleep / 60) * 10) / 10,
      unit: 'hours',
      source: 'fitbit',
      metadata: {
        deepSleepHours: Math.round((r.levels.summary.deep.minutes / 60) * 10) / 10,
        remSleepHours: Math.round((r.levels.summary.rem.minutes / 60) * 10) / 10,
        lightSleepHours: Math.round((r.levels.summary.light.minutes / 60) * 10) / 10,
        awakeMinutes: r.levels.summary.wake.minutes,
        sleepScore: r.efficiency,
      },
      recordedAt: new Date(r.dateOfSleep),
    }));
  }

  async fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.clientId) {
      return generateDemoStressData('fitbit:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.fitbit.com/1/user/${userId}/hrv/date/${startDate}/${endDate}.json`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Fitbit stress/HRV API error: ${res.status}`);
    const data = await res.json() as { hrv: { dateTime: string; value: { dailyRmssd: number; deepRmssd: number } }[] };
    // Fitbit doesn't have a direct stress endpoint; derive stress score from HRV (inverse relationship)
    return data.hrv.map((r) => ({
      type: 'stress',
      value: Math.max(1, Math.min(100, Math.round(100 - r.value.dailyRmssd))),
      unit: 'score',
      source: 'fitbit',
      metadata: { dailyRmssd: r.value.dailyRmssd, deepRmssd: r.value.deepRmssd, derivedFromHrv: true },
      recordedAt: new Date(r.dateTime),
    }));
  }

  async fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.clientId) {
      return generateDemoHeartRateData('fitbit:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.fitbit.com/1/user/${userId}/activities/heart/date/${startDate}/${endDate}.json`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Fitbit heart rate API error: ${res.status}`);
    const data = await res.json() as { 'activities-heart': { dateTime: string; value: { restingHeartRate: number; heartRateZones: { max: number }[] } }[] };
    return data['activities-heart'].map((r) => ({
      type: 'heart_rate',
      value: r.value.restingHeartRate,
      unit: 'bpm',
      source: 'fitbit',
      metadata: {
        restingHeartRate: r.value.restingHeartRate,
        maxHeartRate: r.value.heartRateZones.length > 0
          ? Math.max(...r.value.heartRateZones.map(z => z.max))
          : undefined,
      },
      recordedAt: new Date(r.dateTime),
    }));
  }
}

class OuraAdapter implements WearableAdapter {
  private apiKey = process.env.OURA_API_KEY;

  async fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId; // Oura API uses the token owner, not an arbitrary userId
    if (!this.apiKey) {
      return generateDemoSleepData('oura:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.ouraring.com/v2/usercollection/sleep?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!res.ok) throw new Error(`Oura sleep API error: ${res.status}`);
    const data = await res.json() as { data: { day: string; total_sleep_duration: number; deep_sleep_duration: number; rem_sleep_duration: number; light_sleep_duration: number; awake_time: number; score: number }[] };
    return data.data.map((r) => ({
      type: 'sleep',
      value: Math.round((r.total_sleep_duration / 3600) * 10) / 10,
      unit: 'hours',
      source: 'oura',
      metadata: {
        deepSleepHours: Math.round((r.deep_sleep_duration / 3600) * 10) / 10,
        remSleepHours: Math.round((r.rem_sleep_duration / 3600) * 10) / 10,
        lightSleepHours: Math.round((r.light_sleep_duration / 3600) * 10) / 10,
        awakeMinutes: Math.round(r.awake_time / 60),
        sleepScore: r.score,
      },
      recordedAt: new Date(r.day),
    }));
  }

  async fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId;
    if (!this.apiKey) {
      return generateDemoStressData('oura:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.ouraring.com/v2/usercollection/daily_stress?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!res.ok) throw new Error(`Oura stress API error: ${res.status}`);
    const data = await res.json() as { data: { day: string; stress_high: number; recovery_high: number; day_summary: string }[] };
    return data.data.map((r) => ({
      type: 'stress',
      value: r.stress_high,
      unit: 'score',
      source: 'oura',
      metadata: { recoveryHigh: r.recovery_high, daySummary: r.day_summary },
      recordedAt: new Date(r.day),
    }));
  }

  async fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId;
    if (!this.apiKey) {
      return generateDemoHeartRateData('oura:demo', days);
    }
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];
    const res = await fetch(
      `https://api.ouraring.com/v2/usercollection/heartrate?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!res.ok) throw new Error(`Oura heart rate API error: ${res.status}`);
    const data = await res.json() as { data: { timestamp: string; bpm: number; source: string }[] };
    // Oura returns granular readings; aggregate by day
    const byDay = new Map<string, number[]>();
    for (const r of data.data) {
      const day = r.timestamp.split('T')[0];
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(r.bpm);
    }
    return Array.from(byDay.entries()).map(([day, bpms]) => {
      const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
      const min = Math.min(...bpms);
      const max = Math.max(...bpms);
      return {
        type: 'heart_rate',
        value: min, // resting approximation = daily minimum
        unit: 'bpm',
        source: 'oura',
        metadata: { restingHeartRate: min, maxHeartRate: max, averageHeartRate: avg },
        recordedAt: new Date(day),
      };
    });
  }
}

class WHOOPAdapter implements WearableAdapter {
  private clientId = process.env.WHOOP_CLIENT_ID;
  private clientSecret = process.env.WHOOP_CLIENT_SECRET;

  private get authHeader(): string {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  async fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId;
    if (!this.clientId) {
      return generateDemoSleepData('whoop:demo', days);
    }
    const endDate = new Date().toISOString();
    const startDate = subDays(new Date(), days).toISOString();
    const res = await fetch(
      `https://api.prod.whoop.com/developer/v1/activity/sleep?start=${startDate}&end=${endDate}`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`WHOOP sleep API error: ${res.status}`);
    const data = await res.json() as { records: { created_at: string; score: { stage_summary: { total_in_bed_time_milli: number; total_slow_wave_sleep_time_milli: number; total_rem_sleep_time_milli: number; total_light_sleep_time_milli: number; total_awake_time_milli: number }; sleep_performance_percentage: number } }[] };
    return data.records.map((r) => {
      const s = r.score.stage_summary;
      return {
        type: 'sleep',
        value: Math.round((s.total_in_bed_time_milli / 3_600_000) * 10) / 10,
        unit: 'hours',
        source: 'whoop',
        metadata: {
          deepSleepHours: Math.round((s.total_slow_wave_sleep_time_milli / 3_600_000) * 10) / 10,
          remSleepHours: Math.round((s.total_rem_sleep_time_milli / 3_600_000) * 10) / 10,
          lightSleepHours: Math.round((s.total_light_sleep_time_milli / 3_600_000) * 10) / 10,
          awakeMinutes: Math.round(s.total_awake_time_milli / 60_000),
          sleepScore: r.score.sleep_performance_percentage,
        },
        recordedAt: new Date(r.created_at),
      };
    });
  }

  async fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId;
    if (!this.clientId) {
      return generateDemoStressData('whoop:demo', days);
    }
    const endDate = new Date().toISOString();
    const startDate = subDays(new Date(), days).toISOString();
    const res = await fetch(
      `https://api.prod.whoop.com/developer/v1/recovery?start=${startDate}&end=${endDate}`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`WHOOP recovery/stress API error: ${res.status}`);
    const data = await res.json() as { records: { created_at: string; score: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number } }[] };
    // WHOOP provides recovery; derive stress as inverse of recovery
    return data.records.map((r) => ({
      type: 'stress',
      value: Math.max(1, Math.min(100, 100 - r.score.recovery_score)),
      unit: 'score',
      source: 'whoop',
      metadata: {
        recoveryScore: r.score.recovery_score,
        restingHeartRate: r.score.resting_heart_rate,
        hrvRmssd: r.score.hrv_rmssd_milli,
        derivedFromRecovery: true,
      },
      recordedAt: new Date(r.created_at),
    }));
  }

  async fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]> {
    void userId;
    if (!this.clientId) {
      return generateDemoHeartRateData('whoop:demo', days);
    }
    const endDate = new Date().toISOString();
    const startDate = subDays(new Date(), days).toISOString();
    const res = await fetch(
      `https://api.prod.whoop.com/developer/v1/recovery?start=${startDate}&end=${endDate}`,
      { headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`WHOOP heart rate API error: ${res.status}`);
    const data = await res.json() as { records: { created_at: string; score: { resting_heart_rate: number; hrv_rmssd_milli: number } }[] };
    return data.records.map((r) => ({
      type: 'heart_rate',
      value: r.score.resting_heart_rate,
      unit: 'bpm',
      source: 'whoop',
      metadata: {
        restingHeartRate: r.score.resting_heart_rate,
        hrvMs: r.score.hrv_rmssd_milli,
      },
      recordedAt: new Date(r.created_at),
    }));
  }
}

class GarminAdapter implements WearableAdapter {
  private apiKey = process.env.GARMIN_API_KEY;
  private apiSecret = process.env.GARMIN_API_SECRET;

  async fetchSleepData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoSleepData('garmin:demo', days);
    }
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = Math.floor(subDays(new Date(), days).getTime() / 1000);
    const res = await fetch(
      `https://apis.garmin.com/wellness-api/rest/epochs?uploadStartTimeInSeconds=${startDate}&uploadEndTimeInSeconds=${endDate}&userAccessToken=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Api-Key': this.apiSecret ?? '',
          'Content-Type': 'application/json',
        },
      }
    );
    if (!res.ok) throw new Error(`Garmin sleep API error: ${res.status}`);
    const data = await res.json() as { sleepDTOs: { calendarDate: string; sleepTimeInSeconds: number; deepSleepDurationInSeconds: number; remSleepInSeconds: number; lightSleepDurationInSeconds: number; awakeDurationInSeconds: number; sleepScores: { overall: { value: number } } }[] };
    return (data.sleepDTOs ?? []).map((r) => ({
      type: 'sleep',
      value: Math.round((r.sleepTimeInSeconds / 3600) * 10) / 10,
      unit: 'hours',
      source: 'garmin',
      metadata: {
        deepSleepHours: Math.round((r.deepSleepDurationInSeconds / 3600) * 10) / 10,
        remSleepHours: Math.round((r.remSleepInSeconds / 3600) * 10) / 10,
        lightSleepHours: Math.round((r.lightSleepDurationInSeconds / 3600) * 10) / 10,
        awakeMinutes: Math.round(r.awakeDurationInSeconds / 60),
        sleepScore: r.sleepScores?.overall?.value,
      },
      recordedAt: new Date(r.calendarDate),
    }));
  }

  async fetchStressData(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoStressData('garmin:demo', days);
    }
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = Math.floor(subDays(new Date(), days).getTime() / 1000);
    const res = await fetch(
      `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${startDate}&uploadEndTimeInSeconds=${endDate}&userAccessToken=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Api-Key': this.apiSecret ?? '',
          'Content-Type': 'application/json',
        },
      }
    );
    if (!res.ok) throw new Error(`Garmin stress API error: ${res.status}`);
    const data = await res.json() as { allDayStress: { calendarDate: string; averageStressLevel: number; maxStressLevel: number; restStressDuration: number; highStressDuration: number }[] };
    return (data.allDayStress ?? []).map((r) => ({
      type: 'stress',
      value: r.averageStressLevel,
      unit: 'score',
      source: 'garmin',
      metadata: {
        maxStressLevel: r.maxStressLevel,
        restStressDuration: r.restStressDuration,
        highStressDuration: r.highStressDuration,
      },
      recordedAt: new Date(r.calendarDate),
    }));
  }

  async fetchHeartRate(userId: string, days: number): Promise<HealthMetricInput[]> {
    if (!this.apiKey) {
      return generateDemoHeartRateData('garmin:demo', days);
    }
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = Math.floor(subDays(new Date(), days).getTime() / 1000);
    const res = await fetch(
      `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${startDate}&uploadEndTimeInSeconds=${endDate}&userAccessToken=${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Api-Key': this.apiSecret ?? '',
          'Content-Type': 'application/json',
        },
      }
    );
    if (!res.ok) throw new Error(`Garmin heart rate API error: ${res.status}`);
    const data = await res.json() as { dailies: { calendarDate: string; restingHeartRateInBeatsPerMinute: number; maxHeartRateInBeatsPerMinute: number; averageHeartRateInBeatsPerMinute: number }[] };
    return (data.dailies ?? []).map((r) => ({
      type: 'heart_rate',
      value: r.restingHeartRateInBeatsPerMinute,
      unit: 'bpm',
      source: 'garmin',
      metadata: {
        restingHeartRate: r.restingHeartRateInBeatsPerMinute,
        maxHeartRate: r.maxHeartRateInBeatsPerMinute,
        averageHeartRate: r.averageHeartRateInBeatsPerMinute,
      },
      recordedAt: new Date(r.calendarDate),
    }));
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
