'use client';

import { useEffect } from 'react';
import type { ExplainResponse } from '../types';

interface ExplainModalProps {
  explanation: ExplainResponse;
  onClose: () => void;
}

export default function ExplainModal({ explanation, onClose }: ExplainModalProps) {
  const confidencePercent = Math.round(explanation.confidence * 100);

  const confidenceColor =
    confidencePercent >= 80
      ? 'bg-green-500'
      : confidencePercent >= 50
        ? 'bg-yellow-500'
        : 'bg-red-500';

  const formattedDate =
    explanation.timestamp instanceof Date
      ? explanation.timestamp.toLocaleString()
      : new Date(explanation.timestamp).toLocaleString();

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Action Explanation"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal content */}
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <h2 className="mb-1 pr-8 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Action Explanation
        </h2>
        <p className="mb-5 text-xs text-zinc-400 dark:text-zinc-500">{formattedDate}</p>

        {/* Action description */}
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Description
          </h3>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {explanation.actionDescription}
          </p>
        </div>

        {/* Confidence bar */}
        <div className="mb-5">
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

        {/* Rules applied */}
        {explanation.rulesApplied.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Rules Applied
            </h3>
            <ul className="flex flex-col gap-2">
              {explanation.rulesApplied.map((rule) => (
                <li
                  key={rule.ruleId}
                  className="rounded-md border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/50"
                >
                  <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {rule.ruleName}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                    {rule.matchReason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Data sources */}
        {explanation.dataSources.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Data Sources
            </h3>
            <ul className="flex flex-col gap-1.5">
              {explanation.dataSources.map((source) => (
                <li
                  key={source.id}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                >
                  <span className="mt-0.5 inline-block rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-mono text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                    {source.type}
                  </span>
                  <span>{source.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Alternatives */}
        {explanation.alternatives.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              Alternatives
            </h3>
            <ul className="flex flex-col gap-1.5">
              {explanation.alternatives.map((alt, idx) => (
                <li
                  key={alt.ruleId ?? idx}
                  className="text-sm text-zinc-600 dark:text-zinc-400"
                >
                  <span className="mr-1.5 inline-block text-zinc-400 dark:text-zinc-600">
                    &bull;
                  </span>
                  {alt.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer action */}
        <div className="flex justify-end border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
