// Services
export {
  forecastEnergy,
  getOptimalSchedule,
} from './services/energy-service';
export {
  addRecord,
  getRecords,
  getUpcomingAppointments,
  getMedicationReminders,
  checkOverdueAppointments,
} from './services/medical-service';
export {
  getSleepHistory,
  analyzeSleepPatterns,
  getSleepScore,
} from './services/sleep-service';
export {
  recordStressLevel,
  getStressHistory,
  suggestScheduleAdjustments,
  getStressTrend,
} from './services/stress-service';
export {
  connectWearable,
  disconnectWearable,
  getConnections,
  syncWearableData,
  syncData,
  getLatestMetrics,
} from './services/wearable-service';

// Types
export type {
  WearableProvider,
  WearableConnection,
  SleepData,
  SleepOptimization,
  EnergyForecast,
  StressLevel,
  StressAdjustment,
  MedicalRecord,
} from './types';
