'use client';

import type { SOP } from '@/modules/knowledge/types';

interface SOPDetailViewProps {
  sop: SOP;
  onBack: () => void;
}

export default function SOPDetailView({ sop, onBack }: SOPDetailViewProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-blue-600 hover:text-blue-800">
          &larr; Back
        </button>
        <span className="text-xs text-gray-500">v{sop.version}</span>
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-2">{sop.title}</h2>
      <p className="text-sm text-gray-600 mb-4">{sop.description}</p>

      <div className="space-y-3 mb-4">
        {sop.steps
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <div
              key={step.order}
              className={`flex gap-3 p-3 rounded-lg ${step.isOptional ? 'bg-gray-50' : 'bg-blue-50'}`}
            >
              <span className="text-sm font-bold text-blue-600 shrink-0">
                {step.order}.
              </span>
              <div className="flex-1">
                <p className="text-sm text-gray-900">{step.instruction}</p>
                {step.notes && <p className="text-xs text-gray-500 mt-1">{step.notes}</p>}
                <div className="flex gap-2 mt-1">
                  {step.estimatedMinutes && (
                    <span className="text-xs text-gray-500">{step.estimatedMinutes} min</span>
                  )}
                  {step.isOptional && (
                    <span className="text-xs text-yellow-600">(optional)</span>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>

      {sop.triggerConditions.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-1">Trigger Conditions</h4>
          <div className="flex flex-wrap gap-1">
            {sop.triggerConditions.map((tc, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded">
                {tc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
