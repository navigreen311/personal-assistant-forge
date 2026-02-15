'use client';

import type { Expense } from '@/modules/finance/types';

interface Props {
  expenses: Expense[];
  onSelect?: (expense: Expense) => void;
}

export default function ExpenseList({ expenses, onSelect }: Props) {
  const grouped = new Map<string, Expense[]>();
  for (const exp of expenses) {
    const list = grouped.get(exp.category) ?? [];
    list.push(exp);
    grouped.set(exp.category, list);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category}>
          <h4 className="mb-2 flex items-center justify-between border-b border-gray-200 pb-1 text-sm font-semibold text-gray-700">
            <span>{category}</span>
            <span className="text-gray-500">
              ${items.reduce((s, e) => s + e.amount, 0).toLocaleString()}
            </span>
          </h4>
          <div className="space-y-1">
            {items.map((expense) => (
              <div
                key={expense.id}
                onClick={() => onSelect?.(expense)}
                className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{expense.vendor}</p>
                  <p className="text-xs text-gray-500">{expense.description}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${expense.amount.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(expense.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {expenses.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">No expenses found</p>
      )}
    </div>
  );
}
