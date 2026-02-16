'use client';

import type { EscalationStep } from '../types';

const statusIcons: Record<string, string> = {
  PENDING: '⏳',
  NOTIFIED: '📤',
  ACKNOWLEDGED: '✅',
  SKIPPED: '⏭',
};

const statusColors: Record<string, string> = {
  PENDING: 'border-gray-300 bg-gray-50',
  NOTIFIED: 'border-blue-300 bg-blue-50',
  ACKNOWLEDGED: 'border-green-300 bg-green-50',
  SKIPPED: 'border-gray-200 bg-gray-100',
};

export default function EscalationTimeline({ steps }: { steps: EscalationStep[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Escalation Chain</h3>
      <div className="space-y-0">
        {steps.map((step, idx) => (
          <div key={step.order} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm ${statusColors[step.status] ?? ''}`}>
                {statusIcons[step.status] ?? step.order}
              </div>
              {idx < steps.length - 1 && <div className="w-0.5 h-8 bg-gray-200" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{step.contactName}</span>
                <span className="text-xs text-gray-500">{step.contactMethod} | +{step.escalateAfterMinutes}min</span>
              </div>
              <div className="text-sm text-gray-500">
                {step.notifiedAt && <span>Notified: {new Date(step.notifiedAt).toLocaleTimeString()}</span>}
                {step.acknowledgedAt && <span className="ml-2 text-green-600">Ack: {new Date(step.acknowledgedAt).toLocaleTimeString()}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
