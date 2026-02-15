'use client';

import { useState } from 'react';
import type { GoalDefinition } from '../types';
import GoalCard from './GoalCard';

interface Props {
  goals: GoalDefinition[];
}

const statuses = ['ALL', 'ON_TRACK', 'AT_RISK', 'BEHIND', 'COMPLETE', 'ABANDONED'] as const;

export default function GoalList({ goals }: Props) {
  const [filter, setFilter] = useState<string>('ALL');

  const filtered =
    filter === 'ALL' ? goals : goals.filter((g) => g.status === filter);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">Filter:</span>
        {statuses.map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400">
            No goals matching filter.
          </p>
        )}
      </div>
    </div>
  );
}
