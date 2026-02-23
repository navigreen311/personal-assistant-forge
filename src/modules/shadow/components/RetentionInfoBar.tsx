'use client';

import Link from 'next/link';

export default function RetentionInfoBar() {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Data Retention
            </h4>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <span className="font-medium">Recordings:</span> 90 days
              <span className="mx-2 text-blue-400 dark:text-blue-600">|</span>
              <span className="font-medium">Transcripts:</span> 365 days
              <span className="mx-2 text-blue-400 dark:text-blue-600">|</span>
              <span className="font-medium">Receipts:</span> 7 years
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                Auto-redaction: ON
              </span>
              <span className="ml-1 text-blue-600 dark:text-blue-400">
                — PII/PHI/PCI scrubbed from transcripts
              </span>
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
          >
            Change retention settings
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
