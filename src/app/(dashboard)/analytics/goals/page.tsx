'use client';

import { useState } from 'react';
import GoalList from '@/modules/analytics/components/GoalList';
import type { GoalDefinition } from '@/modules/analytics/types';

const demoGoals: GoalDefinition[] = [
  {
    id: '1', userId: 'demo', title: 'Ship v2.0 Release', description: 'Complete all v2.0 features and deploy to production',
    framework: 'OKR', targetValue: 100, currentValue: 65, unit: '%',
    milestones: [
      { id: 'm1', title: 'Feature complete', targetValue: 80, targetDate: new Date('2026-02-28'), isComplete: false },
      { id: 'm2', title: 'QA passed', targetValue: 95, targetDate: new Date('2026-03-15'), isComplete: false },
    ],
    startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31'),
    status: 'ON_TRACK', autoProgress: true, linkedTaskIds: [], linkedWorkflowIds: [],
  },
  {
    id: '2', userId: 'demo', title: 'Reduce avg response time', description: 'Get average P0 response under 2 hours',
    framework: 'SMART', targetValue: 120, currentValue: 85, unit: 'min',
    milestones: [], startDate: new Date('2026-02-01'), endDate: new Date('2026-02-28'),
    status: 'AT_RISK', autoProgress: false, linkedTaskIds: [], linkedWorkflowIds: [],
  },
  {
    id: '3', userId: 'demo', title: 'Onboard 5 new clients', framework: 'OKR',
    targetValue: 5, currentValue: 2, unit: 'clients', milestones: [],
    startDate: new Date('2026-01-15'), endDate: new Date('2026-03-15'),
    status: 'BEHIND', autoProgress: false, linkedTaskIds: [], linkedWorkflowIds: [],
  },
];

export default function GoalsPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Goal Management</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Create Goal'}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-medium text-gray-900">New Goal</h3>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
            <input
              type="text"
              placeholder="Goal title"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="OKR">OKR</option>
              <option value="SMART">SMART</option>
              <option value="CUSTOM">Custom</option>
            </select>
            <input
              type="number"
              placeholder="Target value"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Unit (e.g., %, clients)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      <GoalList goals={demoGoals} />
    </div>
  );
}
