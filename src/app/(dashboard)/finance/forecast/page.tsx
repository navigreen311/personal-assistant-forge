'use client';

import { useEffect, useState } from 'react';
import CashFlowTimeline from '@/modules/finance/components/CashFlowTimeline';
import ScenarioForm from '@/modules/finance/components/ScenarioForm';
import ScenarioResultPanel from '@/modules/finance/components/ScenarioResultPanel';
import RenewalCard from '@/modules/finance/components/RenewalCard';
import type { CashFlowForecast, ScenarioModel, Renewal } from '@/modules/finance/types';

export default function ForecastPage() {
  const [forecast, setForecast] = useState<CashFlowForecast | null>(null);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [scenarioResult, setScenarioResult] = useState<ScenarioModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showScenario, setShowScenario] = useState(false);

  const entityId = 'default-entity';

  useEffect(() => {
    Promise.all([
      fetch(`/api/finance/forecast?entityId=${entityId}&days=90&startingBalance=50000`).then((r) =>
        r.json()
      ),
      fetch(`/api/finance/renewals?entityId=${entityId}&daysAhead=90`).then((r) => r.json()),
    ])
      .then(([forecastData, renewalData]) => {
        if (forecastData.success) setForecast(forecastData.data);
        if (renewalData.success) setRenewals(renewalData.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRunScenario = async (data: { name: string; adjustments: { type: string; description: string; monthlyAmount: number; startDate: Date }[] }) => {
    const res = await fetch('/api/finance/forecast/scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityId,
        name: data.name,
        adjustments: data.adjustments.map((a) => ({
          ...a,
          startDate: a.startDate.toISOString(),
        })),
      }),
    });
    const result = await res.json();
    if (result.success) {
      setScenarioResult(result.data);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading forecast...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Cash Flow Forecast</h1>

      {/* Summary Cards */}
      {forecast && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: '30-Day', data: forecast.summary.thirtyDay },
            { label: '60-Day', data: forecast.summary.sixtyDay },
            { label: '90-Day', data: forecast.summary.ninetyDay },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">{item.label} Outlook</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Inflows</p>
                  <p className="font-medium text-green-600">${item.data.inflow.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Outflows</p>
                  <p className="font-medium text-red-600">${item.data.outflow.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net</p>
                  <p className={`font-medium ${item.data.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${item.data.net.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">End Balance</p>
                  <p className="font-medium text-gray-900">${item.data.endBalance.toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerts */}
      {forecast && forecast.alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {forecast.alerts.map((alert, i) => (
            <div key={i} className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {alert}
            </div>
          ))}
        </div>
      )}

      {/* Cash Flow Timeline */}
      {forecast && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white">
          <h2 className="border-b border-gray-200 p-4 text-lg font-semibold text-gray-900">
            Daily Projections
          </h2>
          <CashFlowTimeline projections={forecast.projections.slice(0, 30)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Scenario Modeling */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Scenario Modeling</h2>
            <button
              onClick={() => setShowScenario(!showScenario)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showScenario ? 'Hide' : 'New Scenario'}
            </button>
          </div>
          {showScenario && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <ScenarioForm
                onSubmit={handleRunScenario}
                onCancel={() => setShowScenario(false)}
              />
            </div>
          )}
          {scenarioResult && <ScenarioResultPanel scenario={scenarioResult} />}
        </div>

        {/* Upcoming Renewals */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Upcoming Renewals</h2>
          <div className="space-y-3">
            {renewals.map((renewal) => (
              <RenewalCard key={renewal.id} renewal={renewal} />
            ))}
            {renewals.length === 0 && (
              <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-400">
                No upcoming renewals
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
