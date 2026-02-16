'use client';

import type { ConsentReceipt } from '@/shared/types';

interface ConsentReceiptCardProps {
  receipt: ConsentReceipt;
}

export default function ConsentReceiptCard({ receipt }: ConsentReceiptCardProps) {
  const confidencePercent = Math.round(receipt.confidence * 100);

  const confidenceColor =
    confidencePercent >= 80
      ? 'bg-green-500'
      : confidencePercent >= 50
        ? 'bg-yellow-500'
        : 'bg-red-500';

  const formattedDate =
    receipt.timestamp instanceof Date
      ? receipt.timestamp.toLocaleString()
      : new Date(receipt.timestamp).toLocaleString();

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {receipt.description}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            receipt.reversible
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {receipt.reversible ? 'Reversible' : 'Irreversible'}
        </span>
      </div>

      {/* Reason */}
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        {receipt.reason}
      </p>

      {/* Impacted entities */}
      {receipt.impacted.length > 0 && (
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Impacted
          </span>
          <div className="flex flex-wrap gap-1.5">
            {receipt.impacted.map((item) => (
              <span
                key={item}
                className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Confidence bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Confidence
          </span>
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {confidencePercent}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className={`h-full rounded-full transition-all ${confidenceColor}`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>

      {/* Footer: timestamp + rollback */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {formattedDate}
        </span>
        {receipt.reversible && receipt.rollbackLink && (
          <a
            href={receipt.rollbackLink}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
          >
            Rollback
          </a>
        )}
      </div>
    </div>
  );
}
