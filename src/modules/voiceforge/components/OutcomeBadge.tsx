'use client';

import type { CallOutcome } from '@/shared/types';

const OUTCOME_STYLES: Record<string, string> = {
  CONNECTED: 'bg-green-100 text-green-800',
  VOICEMAIL: 'bg-yellow-100 text-yellow-800',
  NO_ANSWER: 'bg-gray-100 text-gray-800',
  BUSY: 'bg-orange-100 text-orange-800',
  CALLBACK_REQUESTED: 'bg-blue-100 text-blue-800',
  INTERESTED: 'bg-emerald-100 text-emerald-800',
  NOT_INTERESTED: 'bg-red-100 text-red-800',
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  const style = OUTCOME_STYLES[outcome] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {outcome.replace(/_/g, ' ')}
    </span>
  );
}
