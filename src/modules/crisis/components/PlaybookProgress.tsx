'use client';

import type { CrisisPlaybook } from '../types';

export default function PlaybookProgress({ playbook }: { playbook: CrisisPlaybook }) {
  const completedCount = playbook.steps.filter(s => s.isComplete).length;
  const progressPct = (completedCount / playbook.steps.length) * 100;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">{playbook.name}</h3>
        <span className="text-sm text-gray-500">Est. {playbook.estimatedResolutionHours}h</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="text-sm text-gray-500">{completedCount}/{playbook.steps.length} steps completed</div>
      <div className="space-y-2">
        {playbook.steps.map(step => (
          <div key={step.order} className={`flex items-start gap-3 p-3 border rounded-lg ${step.isComplete ? 'bg-green-50 border-green-200' : 'border-gray-200'}`}>
            <input type="checkbox" checked={step.isComplete} readOnly className="mt-1 rounded" />
            <div className="flex-1">
              <div className="font-medium text-sm">{step.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{step.description}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{step.actionType}</span>
                {step.isAutomatable && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Automatable</span>}
              </div>
            </div>
            {step.completedAt && (
              <span className="text-xs text-gray-400">{new Date(step.completedAt).toLocaleString()}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
