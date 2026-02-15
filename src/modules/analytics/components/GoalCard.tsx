'use client';

import type { GoalDefinition } from '../types';

interface Props {
  goal: GoalDefinition;
}

const statusColors = {
  ON_TRACK: 'bg-green-100 text-green-800',
  AT_RISK: 'bg-yellow-100 text-yellow-800',
  BEHIND: 'bg-red-100 text-red-800',
  COMPLETE: 'bg-blue-100 text-blue-800',
  ABANDONED: 'bg-gray-100 text-gray-800',
};

export default function GoalCard({ goal }: Props) {
  const progress =
    goal.targetValue > 0
      ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
      : 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">{goal.title}</h4>
          {goal.description && (
            <p className="mt-1 text-sm text-gray-500">{goal.description}</p>
          )}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[goal.status]}`}
        >
          {goal.status.replace('_', ' ')}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            {goal.currentValue} / {goal.targetValue} {goal.unit}
          </span>
          <span className="font-medium text-gray-900">{progress}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100">
          <div
            className="h-2 rounded-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {goal.milestones.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-medium uppercase text-gray-400">
            Milestones
          </p>
          {goal.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span
                className={`h-3 w-3 rounded-full ${
                  m.isComplete ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <span className={m.isComplete ? 'text-gray-400 line-through' : 'text-gray-700'}>
                {m.title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-3 text-xs text-gray-400">
        <span>{goal.framework}</span>
        <span>
          Due {new Date(goal.endDate).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
