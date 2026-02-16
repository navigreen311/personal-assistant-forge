'use client';

import { useEffect, useState } from 'react';
import FinancialSummaryCard from '@/modules/finance/components/FinancialSummaryCard';
import AlertBanner from '@/modules/finance/components/AlertBanner';
import type { UnifiedDashboard } from '@/modules/finance/types';

export default function FinanceOverviewPage() {
  const [dashboard, setDashboard] = useState<UnifiedDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();

    fetch(`/api/finance/dashboard?userId=current&startDate=${startDate}&endDate=${endDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDashboard(data.data);
        else setError(data.error?.message ?? 'Failed to load dashboard');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading financial dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Financial Overview</h1>

      {/* Aggregated Totals */}
      <div className="mb-6 grid grid-cols-5 gap-4 rounded-lg bg-gray-900 p-4 text-white">
        <div className="text-center">
          <p className="text-xs text-gray-400">Total Income</p>
          <p className="text-lg font-bold text-green-400">
            ${dashboard.aggregated.totalIncome.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Total Expenses</p>
          <p className="text-lg font-bold text-red-400">
            ${dashboard.aggregated.totalExpenses.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Net Cash Flow</p>
          <p className={`text-lg font-bold ${dashboard.aggregated.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${dashboard.aggregated.netCashFlow.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Pending AR</p>
          <p className="text-lg font-bold text-yellow-400">
            ${dashboard.aggregated.totalPendingAR.toLocaleString()}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Overdue AP</p>
          <p className="text-lg font-bold text-red-400">
            ${dashboard.aggregated.totalOverdueAP.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {dashboard.alerts.length > 0 && (
        <div className="mb-6">
          <AlertBanner alerts={dashboard.alerts} />
        </div>
      )}

      {/* Entity Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {dashboard.summaries.map((summary) => (
          <FinancialSummaryCard key={summary.entityId} summary={summary} />
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { href: '/finance/invoices', label: 'Invoices', desc: 'Manage invoices & aging' },
          { href: '/finance/expenses', label: 'Expenses', desc: 'Track & categorize expenses' },
          { href: '/finance/budget', label: 'Budget', desc: 'Budget planning & forecasts' },
          { href: '/finance/forecast', label: 'Forecast', desc: 'Cash flow & scenarios' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-lg border border-gray-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-md"
          >
            <p className="font-semibold text-gray-900">{link.label}</p>
            <p className="text-sm text-gray-500">{link.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
