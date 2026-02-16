export type WearableProvider = 'APPLE_WATCH' | 'FITBIT' | 'OURA' | 'WHOOP' | 'GARMIN';

export interface WearableConnection {
  id: string;
  userId: string;
  provider: WearableProvider;
  isConnected: boolean;
  lastSyncAt?: Date;
  accessToken?: string;
}

export interface SleepData {
  date: string;
  totalHours: number;
  deepSleepHours: number;
  remSleepHours: number;
  lightSleepHours: number;
  awakeMinutes: number;
  sleepScore: number;
  bedTime: string;
  wakeTime: string;
}

export interface SleepOptimization {
  userId: string;
  averageSleepScore: number;
  idealBedTime: string;
  idealWakeTime: string;
  correlations: { factor: string; correlation: number; suggestion: string }[];
  recommendations: string[];
}

export interface EnergyForecast {
  userId: string;
  date: string;
  hourlyEnergy: { hour: number; energyLevel: number; confidence: number }[];
  peakHours: number[];
  troughHours: number[];
  recommendation: string;
}

export interface StressLevel {
  userId: string;
  timestamp: Date;
  level: number;
  source: string;
  triggers: string[];
}

export interface StressAdjustment {
  suggestion: string;
  adjustmentType: 'RESCHEDULE' | 'CANCEL' | 'DELEGATE' | 'BREAK' | 'LIGHTEN';
  targetEventId?: string;
  reason: string;
}

export interface MedicalRecord {
  id: string;
  userId: string;
  type: 'APPOINTMENT' | 'MEDICATION' | 'PRESCRIPTION' | 'LAB_RESULT' | 'IMMUNIZATION';
  title: string;
  provider?: string;
  date: Date;
  nextDate?: Date;
  notes?: string;
  reminders: { daysBefore: number; sent: boolean }[];
}
