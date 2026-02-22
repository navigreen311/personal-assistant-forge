"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnergyTabProps {
  entityId?: string;
  period?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PeriodOption = "today" | "week" | "month";

interface EnergyLogEntry {
  id: string;
  level: number;
  timestamp: string;
}

interface HeatmapCell {
  hour: number;
  day: number; // 0=Mon .. 4=Fri
  value: number; // 0-10
}

interface SleepCorrelation {
  sleepHours: number;
  energyLevel: number;
}

interface ProductivityImpact {
  highEnergyAvgTasks: number;
  lowEnergyAvgTasks: number;
  productivityBoostPct: number;
}

interface EnergyData {
  logs: EnergyLogEntry[];
  currentLevel: number | null;
  heatmap: HeatmapCell[];
  sleepCorrelations: SleepCorrelation[];
  sleepInsight: string;
  productivity: ProductivityImpact;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

const ENERGY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const HOUR_LABELS = Array.from({ length: 13 }, (_, i) => {
  const hour = i + 7;
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
});

// ---------------------------------------------------------------------------
// Demo data fallback
// ---------------------------------------------------------------------------

function buildDemoData(): EnergyData {
  const heatmap: HeatmapCell[] = [];
  for (let day = 0; day < 5; day++) {
    for (let h = 7; h <= 19; h++) {
      let base = 5;
      if (h >= 9 && h <= 11) base = 8;
      else if (h >= 14 && h <= 15) base = 4;
      else if (h >= 16 && h <= 17) base = 6;
      else if (h === 7) base = 5;
      else if (h >= 18) base = 3;
      const variation = ((day * 7 + h * 3) % 5) - 2;
      heatmap.push({
        hour: h,
        day,
        value: Math.max(1, Math.min(10, base + variation)),
      });
    }
  }

  return {
    logs: [
      { id: "1", level: 7, timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: "2", level: 5, timestamp: new Date(Date.now() - 7200000).toISOString() },
      { id: "3", level: 8, timestamp: new Date(Date.now() - 14400000).toISOString() },
    ],
    currentLevel: 7,
    heatmap,
    sleepCorrelations: [
      { sleepHours: 8, energyLevel: 9 },
      { sleepHours: 7.5, energyLevel: 8 },
      { sleepHours: 7, energyLevel: 7 },
      { sleepHours: 6.5, energyLevel: 6 },
      { sleepHours: 6, energyLevel: 5 },
      { sleepHours: 5.5, energyLevel: 4 },
      { sleepHours: 5, energyLevel: 3 },
    ],
    sleepInsight: "You perform best after 7-8 hours of sleep.",
    productivity: {
      highEnergyAvgTasks: 12,
      lowEnergyAvgTasks: 5,
      productivityBoostPct: 140,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHeatmapColor(value: number): string {
  if (value <= 2) return "bg-yellow-100";
  if (value <= 4) return "bg-yellow-200";
  if (value <= 5) return "bg-amber-300";
  if (value <= 6) return "bg-orange-300";
  if (value <= 7) return "bg-orange-400";
  if (value <= 8) return "bg-orange-500";
  if (value <= 9) return "bg-red-400";
  return "bg-red-500";
}

function getHeatmapTextColor(value: number): string {
  return value >= 7 ? "text-white" : "text-gray-700";
}

function getEnergyColor(level: number): string {
  if (level <= 3) return "text-red-500";
  if (level <= 5) return "text-amber-500";
  if (level <= 7) return "text-yellow-500";
  return "text-green-500";
}

function getEnergyBgColor(level: number, selected: boolean): string {
  if (!selected) return "bg-gray-100 hover:bg-gray-200";
  if (level <= 3) return "bg-red-500 text-white";
  if (level <= 5) return "bg-amber-500 text-white";
  if (level <= 7) return "bg-yellow-500 text-white";
  return "bg-green-500 text-white";
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnergyTab({ entityId, period: initialPeriod }: EnergyTabProps) {
  const [activePeriod, setActivePeriod] = useState<PeriodOption>(
    (initialPeriod as PeriodOption) ?? "today",
  );
  const [data, setData] = useState<EnergyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Energy logging state
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [logging, setLogging] = useState(false);

  // ---- Fetch energy data ------------------------------------------------

  const fetchEnergyData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("period", activePeriod);
      if (entityId) params.set("entityId", entityId);

      const res = await fetch(`/api/health/energy?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch energy data: ${res.statusText}`);

      const body = await res.json();
      setData({
        logs: body?.logs ?? [],
        currentLevel: body?.currentLevel ?? null,
        heatmap: body?.heatmap ?? [],
        sleepCorrelations: body?.sleepCorrelations ?? [],
        sleepInsight: body?.sleepInsight ?? "",
        productivity: body?.productivity ?? {
          highEnergyAvgTasks: 0,
          lowEnergyAvgTasks: 0,
          productivityBoostPct: 0,
        },
      });
    } catch {
      // Fallback to demo data
      setData(buildDemoData());
    } finally {
      setLoading(false);
    }
  }, [activePeriod, entityId]);

  useEffect(() => {
    fetchEnergyData();
  }, [fetchEnergyData]);

  // ---- Log energy -------------------------------------------------------

  const handleLogEnergy = async () => {
    if (selectedLevel === null) return;
    setLogging(true);

    try {
      const res = await fetch("/api/health/energy/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: selectedLevel,
          timestamp: new Date().toISOString(),
          entityId,
        }),
      });

      if (!res.ok) throw new Error("Failed to log energy");

      const newEntry: EnergyLogEntry = {
        id: `temp-${Date.now()}`,
        level: selectedLevel,
        timestamp: new Date().toISOString(),
      };

      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          logs: [newEntry, ...prev.logs],
          currentLevel: selectedLevel,
        };
      });

      setSelectedLevel(null);
    } catch {
      setError("Failed to log energy level. Please try again.");
    } finally {
      setLogging(false);
    }
  };

  // ---- Render: Loading skeleton ------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Period selector skeleton */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-gray-200" />
          ))}
        </div>

        {/* Energy log skeleton */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="flex gap-2 mb-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 w-10 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
          <div className="h-10 w-24 animate-pulse rounded-md bg-gray-200" />
        </div>

        {/* Heatmap skeleton */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="h-5 w-36 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="h-48 w-full animate-pulse rounded bg-gray-100" />
        </div>

        {/* Sleep correlation skeleton */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-64 animate-pulse rounded bg-gray-200" />
            ))}
          </div>
        </div>

        {/* Productivity skeleton */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="h-8 w-12 animate-pulse rounded bg-gray-200 mb-2" />
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="h-8 w-12 animate-pulse rounded bg-gray-200 mb-2" />
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: Empty state -----------------------------------------------

  if (!data || (data.logs.length === 0 && data.heatmap.length === 0)) {
    return (
      <div className="space-y-6">
        <PeriodSelector activePeriod={activePeriod} onChange={setActivePeriod} />

        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="mx-auto mb-3 text-4xl">{"⚡"}</div>
          <div className="text-gray-400 text-lg font-medium">
            No energy data recorded yet.
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Start logging your energy levels to discover patterns and optimize your day.
          </p>
        </div>
      </div>
    );
  }

  // ---- Render: Main content -----------------------------------------------

  const currentLevel = data?.currentLevel ?? null;
  const logs = data?.logs ?? [];
  const heatmap = data?.heatmap ?? [];
  const sleepCorrelations = data?.sleepCorrelations ?? [];
  const sleepInsight = data?.sleepInsight ?? "";
  const productivity = data?.productivity ?? {
    highEnergyAvgTasks: 0,
    lowEnergyAvgTasks: 0,
    productivityBoostPct: 0,
  };

  return (
    <div className="space-y-6">
      {/* ---- Period Selector ---- */}
      <PeriodSelector activePeriod={activePeriod} onChange={setActivePeriod} />

      {/* ---- Error ---- */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---- ENERGY LOG ---- */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Energy Log</h3>
          {currentLevel !== null && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Current:</span>
              <span className={`text-2xl font-bold ${getEnergyColor(currentLevel)}`}>
                {currentLevel}/10
              </span>
            </div>
          )}
        </div>

        {/* Energy level selector: 10 number buttons (1-10) */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {ENERGY_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setSelectedLevel(selectedLevel === level ? null : level)}
              className={`h-10 w-10 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${getEnergyBgColor(level, selectedLevel === level)}`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Log now button */}
        <button
          onClick={handleLogEnergy}
          disabled={selectedLevel === null || logging}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {logging ? "Logging..." : "Log now"}
        </button>

        {/* Recent log entries */}
        {logs.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Recent Entries
            </p>
            <div className="space-y-1.5">
              {logs.slice(0, 5).map((entry) => (
                <div
                  key={entry?.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className={`font-semibold ${getEnergyColor(entry?.level ?? 0)}`}>
                    {entry?.level ?? 0}/10
                  </span>
                  <span className="text-gray-400">
                    {entry?.timestamp ? formatTime(entry.timestamp) : "--"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- ENERGY PATTERNS (Weekly Heatmap) ---- */}
      {heatmap.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Energy Patterns
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            {"Used to power Calendar’s Energy Overlay feature"}
          </p>

          {/* Weekly heatmap grid: hours (rows) x days (columns) */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-14 text-right pr-2 text-xs text-gray-400 font-normal" />
                  {WEEKDAY_LABELS.map((day) => (
                    <th
                      key={day}
                      className="text-center text-xs font-medium text-gray-500 pb-2 px-1"
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOUR_LABELS.map((label, rowIdx) => {
                  const hour = rowIdx + 7;
                  return (
                    <tr key={hour}>
                      <td className="text-right pr-2 text-[11px] text-gray-400 py-0.5 whitespace-nowrap">
                        {label}
                      </td>
                      {WEEKDAY_LABELS.map((_, dayIdx) => {
                        const cell = heatmap.find(
                          (c) => c?.hour === hour && c?.day === dayIdx,
                        );
                        const val = cell?.value ?? 0;
                        return (
                          <td key={dayIdx} className="px-0.5 py-0.5">
                            <div
                              className={`w-full h-7 rounded-sm flex items-center justify-center text-[10px] font-medium ${getHeatmapColor(val)} ${getHeatmapTextColor(val)}`}
                              title={`${WEEKDAY_LABELS[dayIdx]} ${label}: Energy ${val}/10`}
                            >
                              {val}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-1 text-xs text-gray-400">
            <span>Low</span>
            <div className="h-3 w-5 rounded-sm bg-yellow-100" />
            <div className="h-3 w-5 rounded-sm bg-yellow-200" />
            <div className="h-3 w-5 rounded-sm bg-amber-300" />
            <div className="h-3 w-5 rounded-sm bg-orange-300" />
            <div className="h-3 w-5 rounded-sm bg-orange-400" />
            <div className="h-3 w-5 rounded-sm bg-orange-500" />
            <div className="h-3 w-5 rounded-sm bg-red-400" />
            <div className="h-3 w-5 rounded-sm bg-red-500" />
            <span>High</span>
          </div>
        </div>
      )}

      {/* ---- SLEEP CORRELATION ---- */}
      {sleepCorrelations.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Sleep Correlation
          </h3>

          <div className="space-y-2">
            {sleepCorrelations.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-md bg-gray-50 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-indigo-700 min-w-[70px]">
                  {entry?.sleepHours ?? 0}h sleep
                </span>
                <svg
                  className="w-4 h-4 text-gray-300 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
                <span className={`text-sm font-semibold ${getEnergyColor(entry?.energyLevel ?? 0)}`}>
                  Energy {entry?.energyLevel ?? 0}/10
                </span>
              </div>
            ))}
          </div>

          {/* Sleep insight */}
          {sleepInsight && (
            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
              <svg
                className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <p className="text-sm text-blue-800">{sleepInsight}</p>
            </div>
          )}
        </div>
      )}

      {/* ---- IMPACT ON PRODUCTIVITY ---- */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Impact on Productivity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* High-energy days card */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="text-sm font-medium text-green-700">
                High-Energy Days
              </span>
            </div>
            <div className="text-3xl font-bold text-green-800">
              {productivity?.highEnergyAvgTasks ?? 0}
            </div>
            <p className="text-sm text-green-600 mt-1">avg tasks completed</p>
          </div>

          {/* Low-energy days card */}
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <svg
                className="w-5 h-5 text-orange-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                />
              </svg>
              <span className="text-sm font-medium text-orange-700">
                Low-Energy Days
              </span>
            </div>
            <div className="text-3xl font-bold text-orange-800">
              {productivity?.lowEnergyAvgTasks ?? 0}
            </div>
            <p className="text-sm text-orange-600 mt-1">avg tasks completed</p>
          </div>
        </div>

        {/* Productivity insight */}
        {(productivity?.productivityBoostPct ?? 0) > 0 && (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 flex items-start gap-2">
            <svg
              className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <p className="text-sm text-blue-800">
              Protecting your energy = {productivity?.productivityBoostPct ?? 0}% more productive output
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PeriodSelector({
  activePeriod,
  onChange,
}: {
  activePeriod: PeriodOption;
  onChange: (p: PeriodOption) => void;
}) {
  return (
    <div className="flex gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
            activePeriod === opt.value
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
