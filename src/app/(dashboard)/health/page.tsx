'use client';

import { useState, useEffect } from 'react';
import SleepChart from '@/modules/health/components/SleepChart';
import SleepScoreCard from '@/modules/health/components/SleepScoreCard';
import EnergyTimeline from '@/modules/health/components/EnergyTimeline';
import StressGauge from '@/modules/health/components/StressGauge';
import StressTrendChart from '@/modules/health/components/StressTrendChart';
import MedicalRecordList from '@/modules/health/components/MedicalRecordList';
import WearableConnectionCard from '@/modules/health/components/WearableConnectionCard';
import type { SleepData, EnergyForecast, StressLevel, MedicalRecord, WearableConnection } from '@/modules/health/types';

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-32 bg-gray-200 rounded" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-gray-500">
      <p>{message}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
      <p>{message}</p>
    </div>
  );
}

export default function HealthDashboard() {
  const [sleepData, setSleepData] = useState<SleepData[] | null>(null);
  const [energyForecast, setEnergyForecast] = useState<EnergyForecast | null>(null);
  const [currentStress, setCurrentStress] = useState<StressLevel | null>(null);
  const [stressTrend, setStressTrend] = useState<{ date: string; average: number }[] | null>(null);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[] | null>(null);
  const [wearableConnection, setWearableConnection] = useState<WearableConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.allSettled([
          fetch('/api/health/sleep?days=14').then(r => r.ok ? r.json() : null),
          fetch(`/api/health/energy?date=${new Date().toISOString().split('T')[0]}`).then(r => r.ok ? r.json() : null),
          fetch('/api/health/stress/current').then(r => r.ok ? r.json() : null),
          fetch('/api/health/stress/trend?days=7').then(r => r.ok ? r.json() : null),
          fetch('/api/health/medical/records').then(r => r.ok ? r.json() : null),
          fetch('/api/health/wearables/connections').then(r => r.ok ? r.json() : null),
        ]);

        if (results[0].status === 'fulfilled') setSleepData(results[0].value ?? []);
        if (results[1].status === 'fulfilled') setEnergyForecast(results[1].value);
        if (results[2].status === 'fulfilled') setCurrentStress(results[2].value);
        if (results[3].status === 'fulfilled') setStressTrend(results[3].value ?? []);
        if (results[4].status === 'fulfilled') setMedicalRecords(results[4].value ?? []);
        if (results[5].status === 'fulfilled') setWearableConnection(results[5].value);
      } catch {
        setError('Failed to load health data. Please try again later.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Health & Wellness</h1>
        <ErrorMessage message={error} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Health & Wellness</h1>

      {/* Wearable Connection */}
      <div className="bg-white rounded-lg shadow p-6">
        {loading ? (
          <LoadingSkeleton />
        ) : wearableConnection ? (
          <WearableConnectionCard connection={wearableConnection} />
        ) : (
          <EmptyState message="Connect a wearable device to start tracking your health metrics." />
        )}
      </div>

      {/* Sleep Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          {loading ? (
            <LoadingSkeleton />
          ) : sleepData && sleepData.length > 0 ? (
            <SleepScoreCard score={sleepData[0].sleepScore} date={sleepData[0].date} />
          ) : (
            <EmptyState message="No sleep data yet." />
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
          {loading ? (
            <LoadingSkeleton />
          ) : sleepData && sleepData.length > 0 ? (
            <SleepChart data={sleepData} />
          ) : (
            <EmptyState message="Start tracking your sleep to see charts." />
          )}
        </div>
      </div>

      {/* Energy & Stress Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          {loading ? (
            <LoadingSkeleton />
          ) : energyForecast ? (
            <EnergyTimeline forecast={energyForecast} />
          ) : (
            <EmptyState message="No energy forecast available." />
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          {loading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {currentStress ? (
                <StressGauge level={currentStress} />
              ) : (
                <EmptyState message="No stress data recorded yet." />
              )}
              <div className="mt-4">
                {stressTrend && stressTrend.length > 0 ? (
                  <StressTrendChart data={stressTrend} />
                ) : !loading && (
                  <EmptyState message="No stress trend data available." />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Medical Records */}
      <div className="bg-white rounded-lg shadow p-6">
        {loading ? (
          <LoadingSkeleton />
        ) : medicalRecords && medicalRecords.length > 0 ? (
          <MedicalRecordList records={medicalRecords} />
        ) : (
          <EmptyState message="No medical records. Add your appointments and medications to get reminders." />
        )}
      </div>
    </div>
  );
}
