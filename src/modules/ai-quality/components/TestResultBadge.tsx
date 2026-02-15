'use client';

import type { GoldenTestResult } from '../types';

interface Props {
  result: GoldenTestResult;
}

export default function TestResultBadge({ result }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          result.passed
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        {result.passed ? 'PASS' : 'FAIL'}
      </span>
      {result.deviation !== undefined && (
        <span className="text-xs text-gray-500">
          deviation: {result.deviation.toFixed(4)}
        </span>
      )}
      <span className="text-xs text-gray-400">
        {result.runDuration}ms | {result.modelVersion}
      </span>
    </div>
  );
}
