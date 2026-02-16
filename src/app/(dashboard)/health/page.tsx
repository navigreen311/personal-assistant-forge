'use client';

import SleepChart from '@/modules/health/components/SleepChart';
import SleepScoreCard from '@/modules/health/components/SleepScoreCard';
import EnergyTimeline from '@/modules/health/components/EnergyTimeline';
import StressGauge from '@/modules/health/components/StressGauge';
import StressTrendChart from '@/modules/health/components/StressTrendChart';
import MedicalRecordList from '@/modules/health/components/MedicalRecordList';
import WearableConnectionCard from '@/modules/health/components/WearableConnectionCard';
import type { SleepData, EnergyForecast, StressLevel, MedicalRecord, WearableConnection } from '@/modules/health/types';

const sampleSleepData: SleepData[] = Array.from({ length: 14 }, (_, i) => ({
  date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
  totalHours: 6.5 + Math.random() * 2.5,
  deepSleepHours: 1 + Math.random() * 0.8,
  remSleepHours: 1.2 + Math.random() * 0.6,
  lightSleepHours: 3.5 + Math.random() * 1,
  awakeMinutes: 5 + Math.floor(Math.random() * 25),
  sleepScore: 60 + Math.floor(Math.random() * 35),
  bedTime: '22:30',
  wakeTime: '06:45',
}));

const sampleEnergyForecast: EnergyForecast = {
  userId: 'user-1',
  date: new Date().toISOString().split('T')[0],
  hourlyEnergy: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    energyLevel: hour >= 6 && hour <= 22
      ? Math.round(30 + Math.sin((hour - 6) * Math.PI / 16) * 60 + Math.random() * 10)
      : Math.round(10 + Math.random() * 10),
    confidence: 0.7 + Math.random() * 0.3,
  })),
  peakHours: [10, 11, 15, 16],
  troughHours: [13, 14],
  recommendation: 'Schedule deep work at 10-12 AM. Take a break at 1-2 PM.',
};

const sampleStress: StressLevel = {
  userId: 'user-1', timestamp: new Date(), level: 55, source: 'wearable', triggers: ['meetings', 'deadline'],
};

const sampleStressTrend = Array.from({ length: 7 }, (_, i) => ({
  date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
  average: 30 + Math.floor(Math.random() * 40),
}));

const sampleMedicalRecords: MedicalRecord[] = [
  { id: 'med-1', userId: 'user-1', type: 'APPOINTMENT', title: 'Annual Physical', provider: 'Dr. Smith', date: new Date('2026-01-15'), nextDate: new Date('2027-01-15'), reminders: [{ daysBefore: 7, sent: false }] },
  { id: 'med-2', userId: 'user-1', type: 'MEDICATION', title: 'Vitamin D 5000 IU', date: new Date('2026-01-01'), nextDate: new Date('2026-03-01'), notes: 'Take daily with food', reminders: [{ daysBefore: 14, sent: false }] },
];

const sampleWearable: WearableConnection = {
  id: 'wc-1', userId: 'user-1', provider: 'APPLE_WATCH', isConnected: true, lastSyncAt: new Date(),
};

export default function HealthDashboard() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Health & Wellness</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <WearableConnectionCard connection={sampleWearable} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <SleepScoreCard score={sampleSleepData[0].sleepScore} date={sampleSleepData[0].date} />
        </div>
        <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
          <SleepChart data={sampleSleepData} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <EnergyTimeline forecast={sampleEnergyForecast} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <StressGauge level={sampleStress} />
          <div className="mt-4">
            <StressTrendChart data={sampleStressTrend} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <MedicalRecordList records={sampleMedicalRecords} />
      </div>
    </div>
  );
}
