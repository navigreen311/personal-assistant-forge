'use client';

import type { MaintenanceTask } from '../types';

const statusColors: Record<string, string> = {
  UPCOMING: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-green-100 text-green-800',
  SKIPPED: 'bg-gray-100 text-gray-800',
};

export default function MaintenanceTaskCard({ task }: { task: MaintenanceTask }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">{task.title}</div>
          <div className="text-xs text-gray-500 mt-1">{task.category} | {task.frequency}</div>
        </div>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[task.status] ?? ''}`}>
          {task.status}
        </span>
      </div>
      <div className="mt-3 text-sm text-gray-600">
        <div>Due: {new Date(task.nextDueDate).toLocaleDateString()}</div>
        {task.season && task.season !== 'ANY' && <div>Season: {task.season}</div>}
        {task.estimatedCostUsd && <div>Est. Cost: ${task.estimatedCostUsd}</div>}
      </div>
      {task.description && <div className="text-sm text-gray-500 mt-2">{task.description}</div>}
    </div>
  );
}
