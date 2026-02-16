'use client';

import { useState } from 'react';
import type { ScenarioAdjustment } from '@/modules/finance/types';

interface Props {
  onSubmit: (data: { name: string; adjustments: ScenarioAdjustment[] }) => void;
  onCancel?: () => void;
}

export default function ScenarioForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [adjustments, setAdjustments] = useState<
    { type: ScenarioAdjustment['type']; description: string; monthlyAmount: number }[]
  >([{ type: 'REVENUE_LOSS', description: '', monthlyAmount: 0 }]);

  const addAdjustment = () => {
    setAdjustments([
      ...adjustments,
      { type: 'REVENUE_LOSS', description: '', monthlyAmount: 0 },
    ]);
  };

  const updateAdjustment = (index: number, field: string, value: string | number) => {
    const updated = [...adjustments];
    updated[index] = { ...updated[index], [field]: value };
    setAdjustments(updated);
  };

  const removeAdjustment = (index: number) => {
    setAdjustments(adjustments.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      adjustments: adjustments.map((a) => ({
        ...a,
        startDate: new Date(),
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-gray-600">Scenario Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder='e.g., "Lose Client X"'
          required
        />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-700">Adjustments</h4>
        {adjustments.map((adj, index) => (
          <div key={index} className="mb-2 flex gap-2">
            <select
              value={adj.type}
              onChange={(e) => updateAdjustment(index, 'type', e.target.value)}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            >
              <option value="REVENUE_LOSS">Revenue Loss</option>
              <option value="REVENUE_GAIN">Revenue Gain</option>
              <option value="EXPENSE_INCREASE">Expense Increase</option>
              <option value="EXPENSE_DECREASE">Expense Decrease</option>
            </select>
            <input
              type="text"
              placeholder="Description"
              value={adj.description}
              onChange={(e) => updateAdjustment(index, 'description', e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              placeholder="$/month"
              value={adj.monthlyAmount}
              onChange={(e) => updateAdjustment(index, 'monthlyAmount', Number(e.target.value))}
              className="w-28 rounded border border-gray-300 px-3 py-2 text-sm"
              min="0"
              step="0.01"
              required
            />
            {adjustments.length > 1 && (
              <button
                type="button"
                onClick={() => removeAdjustment(index)}
                className="text-red-500 hover:text-red-700"
              >
                X
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addAdjustment}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add adjustment
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Run Scenario
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
