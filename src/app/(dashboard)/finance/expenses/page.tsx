'use client';

import { useEffect, useState } from 'react';
import ExpenseList from '@/modules/finance/components/ExpenseList';
import ExpenseForm from '@/modules/finance/components/ExpenseForm';
import CategoryBreakdown from '@/modules/finance/components/CategoryBreakdown';
import type { Expense, ExpenseByCategory } from '@/modules/finance/types';

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseByCategory[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const entityId = 'default-entity';

  useEffect(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();

    Promise.all([
      fetch(`/api/finance/expenses?entityId=${entityId}&page=1&pageSize=50`).then((r) => r.json()),
      fetch(
        `/api/finance/expenses/categories?entityId=${entityId}&startDate=${startDate}&endDate=${endDate}`
      ).then((r) => r.json()),
    ])
      .then(([expData, catData]) => {
        if (expData.success) setExpenses(expData.data ?? []);
        if (catData.success) setCategories(catData.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (data: Record<string, unknown>) => {
    const res = await fetch('/api/finance/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      setExpenses([result.data, ...expenses]);
      setShowForm(false);
      setDuplicateWarning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading expenses...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Expense'}
        </button>
      </div>

      {/* Duplicate Warning */}
      {duplicateWarning && (
        <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          {duplicateWarning}
          <button
            onClick={() => setDuplicateWarning(null)}
            className="ml-2 text-yellow-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">New Expense</h2>
          <ExpenseForm
            entityId={entityId}
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Expense List */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Expenses</h2>
            <ExpenseList expenses={expenses} />
          </div>
        </div>

        {/* Category Breakdown */}
        <div>
          <CategoryBreakdown categories={categories} />
        </div>
      </div>
    </div>
  );
}
