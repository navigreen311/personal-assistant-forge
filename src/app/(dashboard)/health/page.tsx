'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TabId = 'dashboard' | 'energy' | 'medical' | 'medications' | 'appointments' | 'fitness';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

type Period = 'today' | '7d' | '30d' | '90d';

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
  { id: 'energy', label: 'Energy', icon: '\u26A1' },
  { id: 'medical', label: 'Medical', icon: '\u{1F3E5}' },
  { id: 'medications', label: 'Medications', icon: '\u{1F48A}' },
  { id: 'appointments', label: 'Appointments', icon: '\u{1F4C5}' },
  { id: 'fitness', label: 'Fitness', icon: '\u{1F3C3}' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

/* ------------------------------------------------------------------ */
/*  Dynamic imports with crash-safe fallbacks                          */
/* ------------------------------------------------------------------ */

const HealthDashboardTab: any = dynamic(
  () =>
    import('@/modules/health/components/HealthDashboardTab').catch(() => ({
      default: SafeDashboardFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const EnergyTab: any = dynamic(
  () =>
    import('@/modules/health/components/EnergyTab').catch(() => ({
      default: EnergyTabFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const MedicalTab: any = dynamic(
  () =>
    import('@/modules/health/components/MedicalTab').catch(() => ({
      default: MedicalTabFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const MedicationsTab: any = dynamic(
  () =>
    import('@/modules/health/components/MedicationsTab').catch(() => ({
      default: MedicationsTabFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const AppointmentsTab: any = dynamic(
  () =>
    import('@/modules/health/components/AppointmentsTab').catch(() => ({
      default: AppointmentsTabFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

const FitnessTab: any = dynamic(
  () =>
    import('@/modules/health/components/FitnessTab').catch(() => ({
      default: FitnessTabFallback,
    })) as any,
  { ssr: false, loading: () => <TabLoadingSkeleton /> },
);

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function TabLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        ))}
      </div>
      <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error boundary wrapper                                             */
/* ------------------------------------------------------------------ */

function TabErrorBoundary({
  children,
  tabName,
}: {
  children: React.ReactNode;
  tabName: string;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [tabName]);

  if (hasError) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
        <p className="text-red-700 dark:text-red-400 font-medium">
          Failed to load {tabName} tab
        </p>
        <button
          onClick={() => setHasError(false)}
          className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/60 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

/* ------------------------------------------------------------------ */
/*  Safe Dashboard Fallback (inline, no API calls)                     */
/* ------------------------------------------------------------------ */

function SafeDashboardFallback({ period }: { entityId?: string; period?: string }) {
  const cards = [
    {
      title: 'Sleep Score',
      value: '82',
      unit: '/100',
      trend: '+3',
      color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300',
      icon: '\u{1F634}',
    },
    {
      title: 'Energy Level',
      value: '71',
      unit: '%',
      trend: '+5',
      color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
      icon: '\u26A1',
    },
    {
      title: 'Stress Level',
      value: '34',
      unit: '/100',
      trend: '-8',
      color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
      icon: '\u{1F9D8}',
    },
    {
      title: 'Active Minutes',
      value: '45',
      unit: 'min',
      trend: '+12',
      color: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300',
      icon: '\u{1F3C3}',
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Overview for period: {period ?? 'today'} (demo data)
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`rounded-lg p-4 ${card.color}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{card.icon}</span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  (card.trend ?? '').startsWith('+')
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}
              >
                {card.trend ?? '--'}
              </span>
            </div>
            <div className="text-2xl font-bold">
              {card.value ?? '--'}
              <span className="text-sm font-normal ml-1">{card.unit ?? ''}</span>
            </div>
            <div className="text-sm mt-1 opacity-80">{card.title ?? 'Metric'}</div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="font-semibold mb-3">Quick Summary</h3>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>Your sleep quality has been improving over the past week.</p>
          <p>Energy peaks expected between 9-11 AM and 2-4 PM.</p>
          <p>Stress levels are below your weekly average -- keep it up!</p>
          <p>You have met your daily active minutes goal 5 out of the last 7 days.</p>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        Connect a wearable device or log your metrics manually to see personalized data here.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Energy Tab Fallback                                                */
/* ------------------------------------------------------------------ */

function EnergyTabFallback({ period }: { entityId?: string; period?: string }) {
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const date = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/health/energy?date=${date}`);
        if (!res?.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) setForecast(data ?? null);
      } catch {
        if (!cancelled) setError('Unable to load energy data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  if (loading) return <TabLoadingSkeleton />;
  if (error) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-yellow-700 dark:text-yellow-300 text-sm">
        {error}
      </div>
    );
  }

  const hourlyEnergy = forecast?.hourlyEnergy ?? [];
  const peakHours = forecast?.peakHours ?? [];
  const troughHours = forecast?.troughHours ?? [];
  const recommendation = forecast?.recommendation ?? 'No recommendation available.';
  const forecastDate = forecast?.date ?? new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Energy Forecast</h3>
      <div className="text-sm text-gray-500 dark:text-gray-400">{forecastDate}</div>

      {hourlyEnergy.length > 0 ? (
        <>
          <div className="flex items-end gap-0.5 h-40">
            {hourlyEnergy
              .filter((h: any) => (h?.hour ?? 0) >= 6 && (h?.hour ?? 0) <= 22)
              .map((entry: any) => {
                const hour = entry?.hour ?? 0;
                const energyLevel = entry?.energyLevel ?? 0;
                const isPeak = peakHours.includes(hour);
                const isTrough = troughHours.includes(hour);
                return (
                  <div
                    key={hour}
                    className="flex flex-col items-center flex-1"
                    title={`${hour}:00 - Energy: ${energyLevel}%`}
                  >
                    <div
                      className={`w-full rounded-t ${
                        isPeak ? 'bg-green-500' : isTrough ? 'bg-red-400' : 'bg-blue-400'
                      }`}
                      style={{ height: `${energyLevel}%` }}
                    />
                    <div className="text-[10px] text-gray-400 mt-1">{hour}</div>
                  </div>
                );
              })}
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded" /> Peak
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-400 rounded" /> Normal
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-400 rounded" /> Trough
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No energy data available for this period.
        </div>
      )}

      <p className="text-sm text-gray-600 dark:text-gray-400">{recommendation}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Medical Tab Fallback                                               */
/* ------------------------------------------------------------------ */

function MedicalTabFallback({ period }: { entityId?: string; period?: string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/health/medical');
        if (!res?.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) setRecords(Array.isArray(data) ? data : data?.records ?? []);
      } catch {
        if (!cancelled) setError('Unable to load medical records.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  if (loading) return <TabLoadingSkeleton />;
  if (error) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-yellow-700 dark:text-yellow-300 text-sm">
        {error}
      </div>
    );
  }

  if (!records?.length) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg font-medium mb-2">No Medical Records</p>
        <p className="text-sm">Add your medical records to track appointments, medications, and more.</p>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    APPOINTMENT: 'Appointments',
    MEDICATION: 'Medications',
    PRESCRIPTION: 'Prescriptions',
    LAB_RESULT: 'Lab Results',
    IMMUNIZATION: 'Immunizations',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Medical Records</h3>
      <div className="space-y-2">
        {records.map((record: any, idx: number) => (
          <div key={record?.id ?? idx} className="border dark:border-gray-700 rounded-lg p-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{record?.title ?? 'Untitled Record'}</div>
                {record?.provider && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {record.provider}
                  </div>
                )}
              </div>
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                {typeLabels[record?.type ?? ''] ?? record?.type ?? 'Unknown'}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Date: {record?.date ? new Date(record.date).toLocaleDateString() : 'N/A'}
              {record?.nextDate && (
                <span className="ml-3">
                  Next: {new Date(record.nextDate).toLocaleDateString()}
                </span>
              )}
            </div>
            {record?.notes && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {record.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Medications Tab Fallback (inline placeholder)                      */
/* ------------------------------------------------------------------ */

function MedicationsTabFallback({ period }: { entityId?: string; period?: string }) {
  const demoMedications = [
    { name: 'Vitamin D3', dosage: '2000 IU', frequency: 'Daily', status: 'Active' },
    { name: 'Omega-3', dosage: '1000 mg', frequency: 'Daily', status: 'Active' },
    { name: 'Magnesium', dosage: '400 mg', frequency: 'Nightly', status: 'Active' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Medications &amp; Supplements</h3>
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + Add Medication
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        Track your medications and supplements. Set reminders for refills and dosage schedules.
      </div>

      <div className="space-y-3">
        {demoMedications.map((med) => (
          <div
            key={med?.name ?? 'unknown'}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">{med?.name ?? 'Unknown'}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {med?.dosage ?? '--'} &middot; {med?.frequency ?? '--'}
              </div>
            </div>
            <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
              {med?.status ?? 'Unknown'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Showing demo data. Connect your pharmacy or add medications manually.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Appointments Tab Fallback (inline placeholder)                     */
/* ------------------------------------------------------------------ */

function AppointmentsTabFallback({ period }: { entityId?: string; period?: string }) {
  const demoAppointments = [
    { title: 'Annual Physical', provider: 'Dr. Smith', date: '2026-03-15', type: 'Check-up' },
    { title: 'Dental Cleaning', provider: 'Dr. Johnson', date: '2026-04-02', type: 'Dental' },
    { title: 'Eye Exam', provider: 'Dr. Lee', date: '2026-05-10', type: 'Vision' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Appointments</h3>
        <button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          + Schedule Appointment
        </button>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        Keep track of your upcoming medical appointments and set reminders.
      </div>

      <div className="space-y-3">
        {demoAppointments.map((appt, idx) => (
          <div
            key={appt?.title ?? idx}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{appt?.title ?? 'Untitled'}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {appt?.provider ?? 'Unknown provider'}
                </div>
              </div>
              <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                {appt?.type ?? 'General'}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {appt?.date ? new Date(appt.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }) : 'Date TBD'}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Showing demo data. Sync your calendar or add appointments manually.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fitness Tab Fallback (inline placeholder)                          */
/* ------------------------------------------------------------------ */

function FitnessTabFallback({ period }: { entityId?: string; period?: string }) {
  const demoStats = [
    { label: 'Steps Today', value: '8,432', target: '10,000', pct: 84 },
    { label: 'Calories Burned', value: '1,847', target: '2,200', pct: 84 },
    { label: 'Active Minutes', value: '45', target: '60', pct: 75 },
    { label: 'Distance', value: '3.8', target: '5.0 mi', pct: 76 },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Fitness Tracker</h3>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-700 dark:text-blue-300">
        Connect a fitness tracker or log workouts manually to see your activity data.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {demoStats.map((stat) => (
          <div
            key={stat?.label ?? 'unknown'}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {stat?.label ?? 'Metric'}
              </span>
              <span className="text-xs text-gray-400">
                Target: {stat?.target ?? '--'}
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {stat?.value ?? '0'}
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 rounded-full h-2 transition-all"
                style={{ width: `${Math.min(stat?.pct ?? 0, 100)}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1 text-right">
              {stat?.pct ?? 0}%
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-3">No workout history yet</p>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          Log a Workout
        </button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Showing demo data. Connect a wearable to see real-time fitness metrics.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function HealthPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [period, setPeriod] = useState<Period>('7d');

  const renderTabContent = useCallback(() => {
    const tabProps = { entityId: undefined, period };

    switch (activeTab) {
      case 'dashboard':
        return (
          <TabErrorBoundary tabName="Dashboard">
            <HealthDashboardTab {...tabProps} />
          </TabErrorBoundary>
        );
      case 'energy':
        return (
          <TabErrorBoundary tabName="Energy">
            <EnergyTab {...tabProps} />
          </TabErrorBoundary>
        );
      case 'medical':
        return (
          <TabErrorBoundary tabName="Medical">
            <MedicalTab {...tabProps} />
          </TabErrorBoundary>
        );
      case 'medications':
        return (
          <TabErrorBoundary tabName="Medications">
            <MedicationsTab {...tabProps} />
          </TabErrorBoundary>
        );
      case 'appointments':
        return (
          <TabErrorBoundary tabName="Appointments">
            <AppointmentsTab {...tabProps} />
          </TabErrorBoundary>
        );
      case 'fitness':
        return (
          <TabErrorBoundary tabName="Fitness">
            <FitnessTab {...tabProps} />
          </TabErrorBoundary>
        );
      default:
        return (
          <TabErrorBoundary tabName="Dashboard">
            <HealthDashboardTab {...tabProps} />
          </TabErrorBoundary>
        );
    }
  }, [activeTab, period]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Health &amp; Wellness
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track energy, health metrics, and medical records.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto pb-px -mb-px" aria-label="Health tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">{renderTabContent()}</div>
    </div>
  );
}
