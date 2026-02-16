'use client';

import { useEffect, useState } from 'react';
import BudgetProgressBar from '@/modules/finance/components/BudgetProgressBar';
import BudgetForecastRow from '@/modules/finance/components/BudgetForecastRow';
import type { Budget } from '@/modules/finance/types';

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const entityId = 'default-entity';

  useEffect(() => {
    fetch(`/api/finance/budget?entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setBudgets(data.data ?? []);
          if (data.data?.length > 0) {
            // Fetch first budget with actuals
            fetch(`/api/finance/budget/${data.data[0].id}`)
              .then((r) => r.json())
              .then((budgetData) => {
                if (budgetData.success) setSelectedBudget(budgetData.data);
              });
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading budgets...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Budget</h1>
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          onChange={(e) => {
            const budget = budgets.find((b) => b.id === e.target.value);
            if (budget) {
              fetch(`/api/finance/budget/${budget.id}`)
                .then((r) => r.json())
                .then((data) => {
                  if (data.success) setSelectedBudget(data.data);
                });
            }
          }}
        >
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          {budgets.length === 0 && <option>No budgets found</option>}
        </select>
      </div>

      {selectedBudget && (
        <>
          {/* Summary Bar */}
          <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg bg-white p-4 shadow-sm">
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Budgeted</p>
              <p className="text-xl font-bold text-gray-900">
                ${selectedBudget.totalBudgeted.toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-xl font-bold text-red-600">
                ${selectedBudget.totalSpent.toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Remaining</p>
              <p className={`text-xl font-bold ${selectedBudget.remainingBudget >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${selectedBudget.remainingBudget.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Progress Bars */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Category Progress</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {selectedBudget.categories.map((cat) => (
                <BudgetProgressBar key={cat.category} category={cat} />
              ))}
            </div>
          </div>

          {/* Forecast Table */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <h2 className="border-b border-gray-200 p-4 text-lg font-semibold text-gray-900">
              AI Forecast
            </h2>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Budgeted</th>
                  <th className="px-4 py-3 text-right">Spent</th>
                  <th className="px-4 py-3 text-right">Remaining</th>
                  <th className="px-4 py-3 text-right">Forecast</th>
                </tr>
              </thead>
              <tbody>
                {selectedBudget.categories.map((cat) => (
                  <BudgetForecastRow key={cat.category} category={cat} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!selectedBudget && budgets.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No budgets created yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Create a budget via the API to get started.
          </p>
        </div>
      )}
    </div>
  );
}
