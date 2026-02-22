'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CashFlowTimeline from '@/modules/finance/components/CashFlowTimeline';
import type { CashFlowForecast, ScenarioModel, CashFlowProjection } from '@/modules/finance/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Entity {
  id: string;
  name: string;
}

interface ScenarioFormData {
  name: string;
  description: string;
  revenueImpact: number;
  expenseImpact: number;
}

interface SavedScenario {
  id: string;
  name: string;
  description: string;
  revenueImpact: number;
  expenseImpact: number;
  result: ScenarioModel | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupProjectionsByWeek(
  projections: CashFlowProjection[]
): { week: number; avgBalance: number }[] {
  const weeks: { week: number; avgBalance: number }[] = [];
  for (let w = 0; w < 13; w++) {
    const start = w * 7;
    const end = Math.min(start + 7, projections.length);
    if (start >= projections.length) break;
    const slice = projections.slice(start, end);
    const avg = slice.reduce((sum, p) => sum + p.runningBalance, 0) / slice.length;
    weeks.push({ week: w + 1, avgBalance: Math.round(avg) });
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-gray-200 rounded-lg" />
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <p className="text-red-600 font-medium mb-2">Error loading forecast</p>
      <p className="text-red-500 text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
      >
        Try Again
      </button>
    </div>
  );
}

function BurnRateAlert({ runwayMonths }: { runwayMonths: number }) {
  if (runwayMonths >= 3) return null;
  return (
    <div className="bg-red-600 text-white px-4 py-3 rounded-lg flex items-center gap-3 mb-6">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="font-medium">
        Warning: Runway is only {runwayMonths.toFixed(1)} months. Consider reducing expenses or
        increasing revenue.
      </span>
    </div>
  );
}

function OutlookCard({
  label,
  projection,
}: {
  label: string;
  projection: { inflow: number; outflow: number; net: number; endBalance: number };
}) {
  const isPositive = projection.net >= 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <h3 className="text-sm font-medium text-gray-500 mb-3">{label}</h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Inflows</span>
          <span className="text-green-600 font-medium">
            ${projection.inflow.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Outflows</span>
          <span className="text-red-600 font-medium">
            ${projection.outflow.toLocaleString()}
          </span>
        </div>
        <hr className="my-1" />
        <div className="flex justify-between text-sm font-semibold">
          <span className="text-gray-700">Net Cash Flow</span>
          <span className={isPositive ? 'text-green-700' : 'text-red-700'}>
            {isPositive ? '+' : ''}${projection.net.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function CashFlowChart({ projections }: { projections: CashFlowProjection[] }) {
  const weeks = groupProjectionsByWeek(projections);
  if (weeks.length === 0) return null;

  const maxAbs = Math.max(...weeks.map((w) => Math.abs(w.avgBalance)), 1);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Cash Flow Chart</h2>
      <div className="flex items-end gap-2 h-48">
        {weeks.map((w) => {
          const pct = Math.round((Math.abs(w.avgBalance) / maxAbs) * 100);
          const isPositive = w.avgBalance >= 0;
          return (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">${(w.avgBalance / 1000).toFixed(0)}k</span>
              <div className="w-full flex items-end justify-center" style={{ height: '160px' }}>
                <div
                  className={`w-full max-w-[40px] rounded-t ${
                    isPositive ? 'bg-green-500' : 'bg-red-500'
                  }`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`Week ${w.week}: $${w.avgBalance.toLocaleString()}`}
                />
              </div>
              <span className="text-xs text-gray-400">W{w.week}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineScenarioForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (data: ScenarioFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [form, setForm] = useState<ScenarioFormData>({
    name: '',
    description: '',
    revenueImpact: 0,
    expenseImpact: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Lose biggest client"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monthly Revenue Impact ($)
          </label>
          <input
            type="number"
            value={form.revenueImpact}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, revenueImpact: parseFloat(e.target.value) || 0 }))
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Positive = gain, Negative = loss"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monthly Expense Impact ($)
          </label>
          <input
            type="number"
            value={form.expenseImpact}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, expenseImpact: parseFloat(e.target.value) || 0 }))
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Positive = increase, Negative = decrease"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !form.name.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {isSubmitting ? 'Creating...' : 'Create Scenario'}
        </button>
      </div>
    </form>
  );
}

function ScenarioCard({
  scenario,
  onRemove,
}: {
  scenario: SavedScenario;
  onRemove: (id: string) => void;
}) {
  const result = scenario.result;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-medium text-gray-800">{scenario.name}</h4>
          {scenario.description && (
            <p className="text-sm text-gray-500 mt-0.5">{scenario.description}</p>
          )}
        </div>
        <button
          onClick={() => onRemove(scenario.id)}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Remove scenario"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Revenue Impact</span>
          <p className={scenario.revenueImpact >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {scenario.revenueImpact >= 0 ? '+' : ''}${scenario.revenueImpact.toLocaleString()}/mo
          </p>
        </div>
        <div>
          <span className="text-gray-500">Expense Impact</span>
          <p className={scenario.expenseImpact <= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
            {scenario.expenseImpact >= 0 ? '+' : ''}${scenario.expenseImpact.toLocaleString()}/mo
          </p>
        </div>
        {result && (
          <>
            <div>
              <span className="text-gray-500">New Burn Rate</span>
              <p className="text-gray-800 font-medium">${result.projectedImpact.newBurnRate.toLocaleString()}/mo</p>
            </div>
            <div>
              <span className="text-gray-500">Runway</span>
              <p
                className={
                  result.projectedImpact.newRunwayMonths < 3
                    ? 'text-red-600 font-medium'
                    : 'text-gray-800 font-medium'
                }
              >
                {result.projectedImpact.newRunwayMonths.toFixed(1)} months
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ForecastPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scenario state
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [scenarioSubmitting, setScenarioSubmitting] = useState(false);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);

  // Fetch entities on mount
  useEffect(() => {
    async function loadEntities() {
      try {
        const res = await fetch('/api/entities?pageSize=100');
        if (!res.ok) throw new Error('Failed to fetch entities');
        const json = await res.json();
        const list: Entity[] = json.data || [];
        setEntities(list);
        if (list.length > 0 && !selectedEntityId) {
          setSelectedEntityId(list[0].id);
        }
      } catch {
        // Entities are optional; forecast can still load without filter
      }
    }
    loadEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch forecast when entity changes
  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: '90' });
      if (selectedEntityId) params.set('entityId', selectedEntityId);
      const res = await fetch('/api/finance/forecast?' + params.toString());
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || 'HTTP ' + res.status);
      }
      const json = await res.json();
      setForecast(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Scenario handlers
  const handleCreateScenario = async (data: ScenarioFormData) => {
    if (!selectedEntityId) return;
    setScenarioSubmitting(true);
    try {
      const adjustments = [];
      if (data.revenueImpact !== 0) {
        adjustments.push({
          type: data.revenueImpact > 0 ? 'REVENUE_GAIN' : 'REVENUE_LOSS',
          description: data.description || data.name,
          monthlyAmount: Math.abs(data.revenueImpact),
          startDate: new Date().toISOString().split('T')[0],
        });
      }
      if (data.expenseImpact !== 0) {
        adjustments.push({
          type: data.expenseImpact > 0 ? 'EXPENSE_INCREASE' : 'EXPENSE_DECREASE',
          description: data.description || data.name,
          monthlyAmount: Math.abs(data.expenseImpact),
          startDate: new Date().toISOString().split('T')[0],
        });
      }
      const res = await fetch('/api/finance/forecast/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntityId,
          name: data.name,
          adjustments,
        }),
      });
      if (!res.ok) throw new Error('Failed to create scenario');
      const json = await res.json();
      const newScenario: SavedScenario = {
        id: json.data?.id || crypto.randomUUID(),
        name: data.name,
        description: data.description,
        revenueImpact: data.revenueImpact,
        expenseImpact: data.expenseImpact,
        result: json.data || null,
      };
      setSavedScenarios((prev) => [...prev, newScenario]);
      setShowScenarioForm(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create scenario');
    } finally {
      setScenarioSubmitting(false);
    }
  };

  const handleRemoveScenario = (id: string) => {
    setSavedScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  // Derived data
  const summary = forecast?.summary;
  const projections = forecast?.projections || [];
  const burnRateAlert = forecast?.alerts?.find(
    (a: string) => a.toLowerCase().includes('runway') || a.toLowerCase().includes('burn')
  );
  const runwayMonths = savedScenarios.length > 0 && savedScenarios[savedScenarios.length - 1].result
    ? savedScenarios[savedScenarios.length - 1].result!.projectedImpact.newRunwayMonths
    : (burnRateAlert ? 2 : 12);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link
        href="/finance"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Finance
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow Forecast</h1>
          <p className="text-gray-500 text-sm mt-1">
            90-day projection of inflows, outflows, and running balance
          </p>
        </div>

        {/* Entity filter */}
        {entities.length > 0 && (
          <select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Burn rate alert */}
      <BurnRateAlert runwayMonths={runwayMonths} />

      {/* Loading / Error / Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchForecast} />
      ) : (
        <>
          {/* 30/60/90-day outlook cards */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <OutlookCard label="30-Day Outlook" projection={summary.thirtyDay} />
              <OutlookCard label="60-Day Outlook" projection={summary.sixtyDay} />
              <OutlookCard label="90-Day Outlook" projection={summary.ninetyDay} />
            </div>
          )}

          {/* Cash Flow Chart */}
          {projections.length > 0 && <CashFlowChart projections={projections} />}

          {/* Daily Projections */}
          {projections.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Daily Projections</h2>
              <CashFlowTimeline projections={projections} />
            </div>
          )}

          {/* Scenario Modeling Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-yellow-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <h2 className="text-lg font-semibold text-gray-800">Scenario Modeling</h2>
              </div>
              {!showScenarioForm && (
                <button
                  onClick={() => setShowScenarioForm(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add Scenario
                </button>
              )}
            </div>

            {/* Inline scenario form */}
            {showScenarioForm && (
              <div className="mb-4">
                <InlineScenarioForm
                  onSubmit={handleCreateScenario}
                  onCancel={() => setShowScenarioForm(false)}
                  isSubmitting={scenarioSubmitting}
                />
              </div>
            )}

            {/* Scenario cards */}
            {savedScenarios.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedScenarios.map((s) => (
                    <ScenarioCard key={s.id} scenario={s} onRemove={handleRemoveScenario} />
                  ))}
                </div>
                {savedScenarios.length >= 2 && (
                  <button
                    className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors"
                    onClick={() => alert('Visual comparison coming soon!')}
                  >
                    Compare scenarios visually
                  </button>
                )}
              </div>
            ) : (
              !showScenarioForm && (
                <p className="text-gray-400 text-sm text-center py-6">
                  No scenarios yet. Click &quot;+ Add Scenario&quot; to model what-if situations.
                </p>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

