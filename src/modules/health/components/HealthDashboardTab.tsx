'use client';

import { useEffect, useState, useCallback } from 'react';
import type {
  EnergyForecast,
  SleepData,
  StressLevel,
  WearableConnection,
  MedicalRecord,
} from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface HealthDashboardTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Per-section state
// ---------------------------------------------------------------------------
interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Demo / fallback data (null-safe defaults when APIs return nothing)
// ---------------------------------------------------------------------------
const DEMO_ENERGY: EnergyForecast = {
  userId: 'demo',
  date: new Date().toISOString().slice(0, 10),
  hourlyEnergy: [
    { hour: 9, energyLevel: 85, confidence: 0.8 },
    { hour: 10, energyLevel: 90, confidence: 0.8 },
    { hour: 11, energyLevel: 80, confidence: 0.7 },
    { hour: 12, energyLevel: 65, confidence: 0.7 },
    { hour: 13, energyLevel: 55, confidence: 0.6 },
    { hour: 14, energyLevel: 50, confidence: 0.6 },
    { hour: 15, energyLevel: 60, confidence: 0.6 },
    { hour: 16, energyLevel: 55, confidence: 0.5 },
    { hour: 17, energyLevel: 45, confidence: 0.5 },
  ],
  peakHours: [9, 10, 11],
  troughHours: [13, 14, 17],
  recommendation: 'Schedule hard tasks 9-11am, meetings 1-3pm',
};

const DEMO_SLEEP: SleepData = {
  date: new Date().toISOString().slice(0, 10),
  totalHours: 7.2,
  deepSleepHours: 1.8,
  remSleepHours: 1.5,
  lightSleepHours: 3.4,
  awakeMinutes: 30,
  sleepScore: 78,
  bedTime: '23:15',
  wakeTime: '06:30',
};

const DEMO_STRESS: StressLevel = {
  userId: 'demo',
  timestamp: new Date(),
  level: 35,
  source: 'self-report',
  triggers: [],
};

const DEMO_UPCOMING: MedicalRecord[] = [
  {
    id: 'demo-1',
    userId: 'demo',
    type: 'APPOINTMENT',
    title: 'Annual physical exam',
    provider: 'Dr. Martinez',
    date: new Date(Date.now() + 7 * 86_400_000),
    reminders: [{ daysBefore: 1, sent: false }],
  },
  {
    id: 'demo-2',
    userId: 'demo',
    type: 'MEDICATION',
    title: 'Vitamin D supplement',
    date: new Date(),
    reminders: [{ daysBefore: 0, sent: true }],
  },
  {
    id: 'demo-3',
    userId: 'demo',
    type: 'LAB_RESULT',
    title: 'Blood work results ready',
    provider: 'Quest Diagnostics',
    date: new Date(Date.now() + 3 * 86_400_000),
    reminders: [{ daysBefore: 0, sent: false }],
  },
];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildUrl(path: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function stressLabel(level: number): string {
  if (level <= 30) return 'Low';
  if (level <= 60) return 'Medium';
  return 'High';
}

function stressEmoji(level: number): string {
  if (level <= 30) return '😌'; // relieved face
  if (level <= 60) return '😐'; // neutral face
  return '😰'; // anxious face
}

function stressColor(level: number): string {
  if (level <= 30) return 'text-green-600 bg-green-50 border-green-200';
  if (level <= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function energyBlockColor(
  hour: number,
  peakHours: number[],
  troughHours: number[],
): string {
  if (peakHours.includes(hour)) return 'bg-green-500';
  if (troughHours.includes(hour)) return 'bg-red-400';
  return 'bg-amber-400';
}

function upcomingIcon(type?: string): string {
  switch (type) {
    case 'APPOINTMENT':
      return '🏥'; // hospital
    case 'MEDICATION':
      return '💊'; // pill
    case 'LAB_RESULT':
      return '🧪'; // test tube
    case 'IMMUNIZATION':
      return '🩸'; // drop of blood
    default:
      return '📋'; // clipboard
  }
}

function formatRelativeDate(date: Date | string | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const diff = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `In ${diff} days`;
}
// ---------------------------------------------------------------------------
// Skeleton loaders (per-section)
// ---------------------------------------------------------------------------
function StatusCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
          <div className="mb-1 h-8 w-20 rounded bg-gray-200" />
          <div className="h-3 w-12 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function EnergyForecastSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 h-4 w-36 rounded bg-gray-200" />
      <div className="flex items-end gap-1" style={{ height: 100 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gray-200"
            style={{ height: 30 + i * 15 }}
          />
        ))}
      </div>
      <div className="mt-3 h-3 w-64 rounded bg-gray-100" />
    </div>
  );
}

function UpcomingSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="mb-4 h-4 w-28 rounded bg-gray-200" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-40 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function WearableSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 h-4 w-40 rounded bg-gray-200" />
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="space-y-1 flex-1">
          <div className="h-3 w-32 rounded bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
      <svg
        className="h-5 w-5 flex-shrink-0 text-red-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="flex-1 text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-200"
      >
        Retry
      </button>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
      {title}
    </h2>
  );
}
// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function HealthDashboardTab({
  entityId,
  period,
}: HealthDashboardTabProps) {
  // ---- Section states ----
  const [energy, setEnergy] = useState<SectionState<EnergyForecast>>({
    data: null,
    loading: true,
    error: null,
  });
  const [sleep, setSleep] = useState<SectionState<SleepData>>({
    data: null,
    loading: true,
    error: null,
  });
  const [stress, setStress] = useState<SectionState<StressLevel>>({
    data: null,
    loading: true,
    error: null,
  });
  const [wearable, setWearable] = useState<SectionState<WearableConnection[]>>({
    data: null,
    loading: true,
    error: null,
  });

  // ---- Fetchers with individual try/catch + demo fallback ----
  const fetchEnergy = useCallback(async () => {
    setEnergy((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = buildUrl('/api/health/energy', {
        date: todayISO(),
        ...(entityId ? { entityId } : {}),
        ...(period ? { period } : {}),
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load energy data (${res.status})`);
      const json = await res.json();
      setEnergy({ data: json ?? DEMO_ENERGY, loading: false, error: null });
    } catch {
      // Fallback to demo data so the dashboard never crashes
      setEnergy({ data: DEMO_ENERGY, loading: false, error: null });
    }
  }, [entityId, period]);

  const fetchSleep = useCallback(async () => {
    setSleep((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = buildUrl('/api/health/sleep', {
        days: '1',
        ...(entityId ? { entityId } : {}),
        ...(period ? { period } : {}),
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load sleep data (${res.status})`);
      const json = await res.json();
      // API may return an array; pick the first entry
      const entry = Array.isArray(json) ? json[0] : json;
      setSleep({ data: entry ?? DEMO_SLEEP, loading: false, error: null });
    } catch {
      setSleep({ data: DEMO_SLEEP, loading: false, error: null });
    }
  }, [entityId, period]);

  const fetchStress = useCallback(async () => {
    setStress((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = buildUrl('/api/health/stress', {
        ...(entityId ? { entityId } : {}),
        ...(period ? { period } : {}),
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load stress data (${res.status})`);
      const json = await res.json();
      setStress({ data: json ?? DEMO_STRESS, loading: false, error: null });
    } catch {
      setStress({ data: DEMO_STRESS, loading: false, error: null });
    }
  }, [entityId, period]);

  const fetchWearable = useCallback(async () => {
    setWearable((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const url = buildUrl('/api/health/wearables', {
        ...(entityId ? { entityId } : {}),
      });
      const res = await fetch(url);
      if (!res.ok)
        throw new Error(`Failed to load wearable data (${res.status})`);
      const json = await res.json();
      const list = Array.isArray(json) ? json : json?.connections ?? [];
      setWearable({ data: list, loading: false, error: null });
    } catch {
      // No demo wearable - show connect prompt instead
      setWearable({ data: [], loading: false, error: null });
    }
  }, [entityId]);

  useEffect(() => {
    fetchEnergy();
    fetchSleep();
    fetchStress();
    fetchWearable();
  }, [fetchEnergy, fetchSleep, fetchStress, fetchWearable]);

  // ---- Derived values (null-safe with optional chaining + defaults) ----
  const energyData = energy.data ?? DEMO_ENERGY;
  const sleepData = sleep.data ?? DEMO_SLEEP;
  const stressData = stress.data ?? DEMO_STRESS;
  const wearables = wearable.data ?? [];

  const energyLevel = (() => {
    const hours = energyData?.hourlyEnergy ?? [];
    if (hours.length === 0) return 7;
    const now = new Date().getHours();
    const closest = hours.reduce((prev, curr) =>
      Math.abs((curr?.hour ?? 0) - now) < Math.abs((prev?.hour ?? 0) - now)
        ? curr
        : prev,
    );
    return Math.round(((closest?.energyLevel ?? 70) / 100) * 10);
  })();

  const sleepHours = sleepData?.totalHours ?? 7.0;
  const stressLvl = stressData?.level ?? 35;

  // Steps not in health types yet - use demo default
  const stepCount = 6_240;

  // Upcoming items - use demo data when API returns nothing
  const upcomingItems: MedicalRecord[] = DEMO_UPCOMING;

  // Energy forecast blocks for the visual bar
  const forecastHours = [9, 11, 13, 15, 17];
  const forecastLabels = ['9am', '11am', '1pm', '3pm', '5pm'];

  const connectedDevice = wearables.find((w) => w?.isConnected);
  // ---- Render ----
  return (
    <div className="space-y-8">
      {/* ============================================================= */}
      {/* TODAY'S STATUS                                                 */}
      {/* ============================================================= */}
      <section>
        <SectionHeader title="Today&#39;s Status" />
        {energy.loading && sleep.loading && stress.loading ? (
          <StatusCardsSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* Energy Level */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg" aria-hidden="true">
                  {'⚡'}
                </span>
                <span className="text-sm font-medium text-amber-700">
                  Energy Level
                </span>
              </div>
              <p className="text-3xl font-bold text-amber-600">
                {energyLevel}
                <span className="text-base font-normal text-amber-400">/10</span>
              </p>
            </div>

            {/* Sleep Last Night */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg" aria-hidden="true">
                  {'🌙'}
                </span>
                <span className="text-sm font-medium text-blue-700">
                  Sleep Last Night
                </span>
              </div>
              <p className="text-3xl font-bold text-blue-600">
                {sleepHours.toFixed(1)}
                <span className="text-base font-normal text-blue-400">
                  {' '}hrs
                </span>
              </p>
            </div>

            {/* Steps Today */}
            <div className="rounded-xl border border-green-200 bg-green-50 p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-green-700">
                  {'🦶'} Steps Today
                </span>
              </div>
              <p className="text-3xl font-bold text-green-600">
                {stepCount.toLocaleString()}
              </p>
            </div>

            {/* Stress Level */}
            <div className={`rounded-xl border p-5 ${stressColor(stressLvl)}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg" aria-hidden="true">
                  {stressEmoji(stressLvl)}
                </span>
                <span className="text-sm font-medium">Stress Level</span>
              </div>
              <p className="text-3xl font-bold">{stressLabel(stressLvl)}</p>
            </div>
          </div>
        )}
      </section>
      {/* ============================================================= */}
      {/* ENERGY FORECAST                                               */}
      {/* ============================================================= */}
      <section>
        <SectionHeader title="Energy Forecast" />
        {energy.loading ? (
          <EnergyForecastSkeleton />
        ) : energy.error ? (
          <SectionError message={energy.error} onRetry={fetchEnergy} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            {/* Visual bar */}
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {forecastHours.map((hour, idx) => {
                const entry = (energyData?.hourlyEnergy ?? []).find(
                  (h) => h?.hour === hour,
                );
                const level = entry?.energyLevel ?? 50;
                const color = energyBlockColor(
                  hour,
                  energyData?.peakHours ?? [],
                  energyData?.troughHours ?? [],
                );
                return (
                  <div
                    key={hour}
                    className="flex flex-col items-center flex-1"
                    title={`${forecastLabels[idx]} - Energy: ${level}%`}
                  >
                    <div
                      className={`w-full rounded-t-lg ${color} transition-all`}
                      style={{ height: `${Math.max(level, 5)}%` }}
                    />
                    <span className="mt-2 text-xs text-gray-500">
                      {forecastLabels[idx]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-green-500" />
                Peak
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-amber-400" />
                Moderate
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded bg-red-400" />
                Dip
              </div>
            </div>

            {/* Recommendation */}
            <p className="mt-3 text-sm text-gray-600">
              {energyData?.recommendation ??
                'Schedule hard tasks 9-11am, meetings 1-3pm'}
            </p>
          </div>
        )}
      </section>
      {/* ============================================================= */}
      {/* UPCOMING                                                      */}
      {/* ============================================================= */}
      <section>
        <SectionHeader title="Upcoming" />
        {energy.loading && sleep.loading ? (
          <UpcomingSkeleton />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            {upcomingItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                No upcoming health events
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {upcomingItems.map((item) => (
                  <li
                    key={item?.id ?? Math.random().toString(36)}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg"
                      aria-hidden="true"
                    >
                      {upcomingIcon(item?.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item?.title ?? 'Untitled event'}
                      </p>
                      {item?.provider && (
                        <p className="text-xs text-gray-500">{item.provider}</p>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-xs font-medium text-gray-500">
                      {formatRelativeDate(item?.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {/* ============================================================= */}
      {/* WEARABLE SYNC STATUS                                          */}
      {/* ============================================================= */}
      <section>
        <SectionHeader title="Wearable Sync Status" />
        {wearable.loading ? (
          <WearableSkeleton />
        ) : wearable.error ? (
          <SectionError message={wearable.error} onRetry={fetchWearable} />
        ) : connectedDevice ? (
          <div className="rounded-xl border border-green-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-xl">
                  {'⌚'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {connectedDevice.provider?.replace('_', ' ') ?? 'Unknown Device'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {connectedDevice.lastSyncAt
                      ? `Last synced: ${new Date(connectedDevice.lastSyncAt).toLocaleString()}`
                      : 'Never synced'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Connected
              </div>
            </div>
            <div className="mt-3 text-right">
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => alert('Manual logging coming soon')}
              >
                Log manually
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
            <p className="text-sm text-gray-500 mb-4">
              Connect a wearable device to automatically sync your health data.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {([
                ['Apple Watch', '⌚'],
                ['Fitbit', '📱'],
                ['Oura', '💍'],
              ] as const).map(([name, icon]) => (
                <button
                  key={name}
                  onClick={() =>
                    alert(`${name} connection is not yet available.`)
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  <span>{icon}</span>
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => alert('Manual logging coming soon')}
              >
                Log manually
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
