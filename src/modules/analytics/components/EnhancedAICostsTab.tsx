'use client';

import { useEffect, useState, useCallback } from 'react';
import type { LLMCostDashboard } from '../types';

// Extended types for enhanced data

interface ModelBreakdown {
  model: string;
  tokensUsed: number;
  cost: number;
  percentOfTotal: number;
}

interface EntityBreakdown {
  entityId: string;
  entityName: string;
  cost: number;
  percentOfTotal: number;
  budgetCapUsd: number;
  status: 'under' | 'warning' | 'over';
}

interface OptimizationSuggestion {
  id: string;
  text: string;
}

interface BudgetAlertConfig {
  threshold75: boolean;
  threshold90: boolean;
  threshold100: boolean;
  overageBehavior: 'warn' | 'throttle' | 'hard_stop';
}

interface EnhancedCostData {
  dashboard: LLMCostDashboard;
  modelBreakdown: ModelBreakdown[];
  entityBreakdown: EntityBreakdown[];
  optimizations: OptimizationSuggestion[];
  budgetAlertConfig: BudgetAlertConfig;
}

interface EnhancedAICostsTabProps {
  entityId?: string;
  period?: string;
}

// Color palette

const FEATURE_COLORS = [
  '#3b82f6', '#22c55e', '#a855f7', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899',
];

const MODEL_COLORS: Record<string, string> = {
  'Claude Opus': '#7c3aed',
  'Claude Sonnet': '#3b82f6',
  'Claude Haiku': '#22c55e',
  'Whisper (STT)': '#f59e0b',
};

// Skeleton components

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 h-3 w-20 rounded bg-gray-200" />
      <div className="h-7 w-24 rounded bg-gray-200" />
    </div>
  );
}

function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-40 rounded bg-gray-200" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 flex-1 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBar() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 h-5 w-48 rounded bg-gray-200" />
      <div className="h-6 w-full rounded-full bg-gray-100" />
      <div className="mt-3 flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="h-3 w-3 rounded bg-gray-200" />
            <div className="h-3 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Helpers

function fmtUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function fmtTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// Main component

export default function EnhancedAICostsTab({
  entityId,
  period,
}: EnhancedAICostsTabProps) {
  const [data, setData] = useState<EnhancedCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [alertConfig, setAlertConfig] = useState<BudgetAlertConfig>({
    threshold75: true,
    threshold90: true,
    threshold100: true,
    overageBehavior: 'warn',
  });
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertSaveSuccess, setAlertSaveSuccess] = useState(false);

  // Fetch data

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);

      const res = await fetch(`/api/analytics/llm-costs?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load cost data (${res.status})`);

      const json: EnhancedCostData = await res.json();
      setData(json);
      setAlertConfig(
        json?.budgetAlertConfig ?? {
          threshold75: true,
          threshold90: true,
          threshold100: true,
          overageBehavior: 'warn',
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save budget alert config (placeholder POST)

  async function handleSaveAlerts() {
    setSavingAlerts(true);
    setAlertSaveSuccess(false);
    try {
      const res = await fetch('/api/analytics/llm-costs/budget-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, config: alertConfig }),
      });
      if (!res.ok) throw new Error('Save failed');
      setAlertSaveSuccess(true);
      setTimeout(() => setAlertSaveSuccess(false), 3000);
    } catch {
      // Silently handle for placeholder endpoint
    } finally {
      setSavingAlerts(false);
    }
  }

  // Error state

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">
          Failed to load AI cost data
        </p>
        <p className="mt-1 text-xs text-red-600">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // Derived values (safe with optional chaining)

  const dashboard = data?.dashboard;
  const totalCost = dashboard?.totalCostUsd ?? 0;
  const budgetCap = dashboard?.budgetCapUsd ?? 0;
  const percentUsed = dashboard?.percentUsed ?? 0;
  const projected = dashboard?.projectedMonthEnd ?? 0;
  const byFeature = dashboard?.byFeature ?? [];
  const modelBreakdown = data?.modelBreakdown ?? [];
  const entityBreakdown = data?.entityBreakdown ?? [];
  const optimizations = data?.optimizations ?? [];
  const alerts = dashboard?.alerts ?? [];

  const totalFeatureCost = byFeature.reduce((s, f) => s + (f?.cost ?? 0), 0) || 1;

  return (
    <div className="space-y-6">
      {/* Cost Breakdown Bar */}
      {loading ? (
        <SkeletonBar />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-1 text-lg font-semibold text-gray-900">
            LLM Cost Breakdown
          </h3>
          <p className="mb-4 text-sm text-gray-500">
            {dashboard?.period ?? 'Current Period'}
          </p>

          {/* Colored bar segments */}
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100">
            {byFeature.map((f, idx) => {
              const widthPct = ((f?.cost ?? 0) / totalFeatureCost) * 100;
              if (widthPct < 0.5) return null;
              return (
                <div
                  key={f?.feature ?? idx}
                  className="relative transition-all"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor:
                      FEATURE_COLORS[idx % FEATURE_COLORS.length],
                  }}
                  title={`${f?.feature}: ${fmtUsd(f?.cost ?? 0)}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4">
            {byFeature.map((f, idx) => (
              <div key={f?.feature ?? idx} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{
                    backgroundColor:
                      FEATURE_COLORS[idx % FEATURE_COLORS.length],
                  }}
                />
                <span className="text-xs text-gray-600">
                  {f?.feature ?? 'Unknown'} ({fmtUsd(f?.cost ?? 0)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Row (4 Cards) */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500">Total Cost</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {fmtUsd(totalCost)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500">Budget</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {fmtUsd(budgetCap)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500">Used %</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                percentUsed > 90
                  ? 'text-red-600'
                  : percentUsed > 75
                    ? 'text-amber-600'
                    : 'text-green-600'
              }`}
            >
              {percentUsed.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium text-gray-500">
              Projected End-of-Month
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                projected > budgetCap ? 'text-red-600' : 'text-gray-900'
              }`}
            >
              {fmtUsd(projected)}
            </p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {!loading && alerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h4 className="mb-2 text-sm font-semibold text-red-800">Alerts</h4>
          <ul className="space-y-1">
            {alerts.map((alert, i) => (
              <li key={i} className="text-sm text-red-700">
                {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Feature Breakdown Table */}
      {loading ? (
        <SkeletonTable rows={5} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Feature Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Feature</th>
                  <th className="pb-3 pr-4 text-right">Tokens</th>
                  <th className="pb-3 pr-4 text-right">Cost</th>
                  <th className="pb-3 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {byFeature.map((f, idx) => {
                  const pct =
                    totalCost > 0
                      ? (((f?.cost ?? 0) / totalCost) * 100).toFixed(1)
                      : '0.0';
                  return (
                    <tr key={f?.feature ?? idx} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                FEATURE_COLORS[idx % FEATURE_COLORS.length],
                            }}
                          />
                          {f?.feature ?? 'Unknown'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {fmtTokens(f?.tokenCount ?? 0)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium text-gray-900">
                        {fmtUsd(f?.cost ?? 0)}
                      </td>
                      <td className="py-2.5 text-right text-gray-600">
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
                {byFeature.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 text-center text-gray-400"
                    >
                      No feature data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model Breakdown Table (NEW) */}
      {loading ? (
        <SkeletonTable rows={4} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Model Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Model</th>
                  <th className="pb-3 pr-4 text-right">Tokens Used</th>
                  <th className="pb-3 pr-4 text-right">Cost</th>
                  <th className="pb-3 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {modelBreakdown.map((m) => {
                  const barColor =
                    MODEL_COLORS[m?.model ?? ''] ?? '#94a3b8';
                  const barWidth = Math.max(
                    2,
                    m?.percentOfTotal ?? 0
                  );
                  return (
                    <tr
                      key={m?.model ?? 'unknown'}
                      className="hover:bg-gray-50"
                    >
                      <td className="py-2.5 pr-4 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: barColor }}
                          />
                          {m?.model ?? 'Unknown'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {fmtTokens(m?.tokensUsed ?? 0)}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${barWidth}%`,
                                backgroundColor: barColor,
                              }}
                            />
                          </div>
                          <span className="min-w-[60px] text-right font-medium text-gray-900">
                            {fmtUsd(m?.cost ?? 0)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-gray-600">
                        {(m?.percentOfTotal ?? 0).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                {modelBreakdown.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-6 text-center text-gray-400"
                    >
                      No model data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entity Breakdown Table (NEW) */}
      {loading ? (
        <SkeletonTable rows={4} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Entity Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="pb-3 pr-4">Entity</th>
                  <th className="pb-3 pr-4 text-right">Cost</th>
                  <th className="pb-3 pr-4 text-right">%</th>
                  <th className="pb-3 pr-4 text-right">Budget</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entityBreakdown.map((e) => {
                  const statusLabel =
                    e?.status === 'over'
                      ? 'Over'
                      : e?.status === 'warning'
                        ? 'Warning'
                        : 'Under';
                  const statusClasses =
                    e?.status === 'over'
                      ? 'bg-red-100 text-red-700'
                      : e?.status === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700';
                  return (
                    <tr
                      key={e?.entityId ?? 'unknown'}
                      className="hover:bg-gray-50"
                    >
                      <td className="py-2.5 pr-4 font-medium text-gray-900">
                        {e?.entityName ?? e?.entityId ?? 'Unknown'}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-medium text-gray-900">
                        {fmtUsd(e?.cost ?? 0)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {(e?.percentOfTotal ?? 0).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">
                        {fmtUsd(e?.budgetCapUsd ?? 0)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {entityBreakdown.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-gray-400"
                    >
                      No entity data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Cost Optimization Suggestions (NEW) */}
      {loading ? (
        <SkeletonTable rows={2} />
      ) : optimizations.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h3 className="mb-3 text-lg font-semibold text-amber-900">
            AI Cost Optimization Suggestions
          </h3>
          <ul className="space-y-3">
            {optimizations.map((opt) => (
              <li
                key={opt?.id ?? Math.random()}
                className="flex items-start gap-3"
              >
                {/* Lightbulb icon */}
                <svg
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
                  />
                </svg>
                <p className="text-sm text-amber-800">
                  {opt?.text ?? 'No suggestion text'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Budget Alerts Configuration (NEW) */}
      {loading ? (
        <SkeletonTable rows={3} />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Budget Alerts Configuration
          </h3>

          <div className="space-y-4">
            {/* Alert thresholds */}
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                Alert Thresholds
              </p>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={alertConfig.threshold75}
                    onChange={(e) =>
                      setAlertConfig((prev) => ({
                        ...prev,
                        threshold75: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  75% of budget
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={alertConfig.threshold90}
                    onChange={(e) =>
                      setAlertConfig((prev) => ({
                        ...prev,
                        threshold90: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  90% of budget
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={alertConfig.threshold100}
                    onChange={(e) =>
                      setAlertConfig((prev) => ({
                        ...prev,
                        threshold100: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  100% of budget
                </label>
              </div>
            </div>

            {/* Overage behavior */}
            <div>
              <label
                htmlFor="overage-behavior"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Overage Behavior
              </label>
              <select
                id="overage-behavior"
                value={alertConfig.overageBehavior}
                onChange={(e) =>
                  setAlertConfig((prev) => ({
                    ...prev,
                    overageBehavior: e.target.value as
                      | 'warn'
                      | 'throttle'
                      | 'hard_stop',
                  }))
                }
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="warn">Warn</option>
                <option value="throttle">Throttle</option>
                <option value="hard_stop">Hard Stop</option>
              </select>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveAlerts}
                disabled={savingAlerts}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingAlerts ? 'Saving...' : 'Save Alert Settings'}
              </button>
              {alertSaveSuccess && (
                <span className="text-sm text-green-600">
                  Settings saved successfully
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

