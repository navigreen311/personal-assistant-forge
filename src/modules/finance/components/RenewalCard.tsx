'use client';

import type { Renewal } from '@/modules/finance/types';

interface Props {
  renewal: Renewal;
}

export default function RenewalCard({ renewal }: Props) {
  const isUrgent = renewal.daysUntilRenewal <= 7;
  const isSoon = renewal.daysUntilRenewal <= 30;

  return (
    <div className={`rounded-lg border p-4 ${isUrgent ? 'border-red-200 bg-red-50' : isSoon ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{renewal.name}</h4>
          <p className="text-xs text-gray-500">{renewal.vendor}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${isUrgent ? 'bg-red-100 text-red-700' : isSoon ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
          {renewal.daysUntilRenewal} days
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Amount:</span>{' '}
          <span className="font-medium">${renewal.amount.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-gray-500">Frequency:</span>{' '}
          <span className="font-medium">{renewal.frequency}</span>
        </div>
        <div>
          <span className="text-gray-500">Renewal:</span>{' '}
          <span className="font-medium">
            {new Date(renewal.nextRenewalDate).toLocaleDateString()}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Auto-renew:</span>{' '}
          <span className="font-medium">{renewal.autoRenew ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {renewal.cancelDeadline && (
        <p className="mt-2 text-xs text-orange-600">
          Cancel by: {new Date(renewal.cancelDeadline).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
