'use client';

import { useState, useCallback } from 'react';
import type { ExplainResponse } from '../types';
import ExplainModal from './ExplainModal';

interface ExplainButtonProps {
  actionId: string;
}

export default function ExplainButton({ actionId }: ExplainButtonProps) {
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleClick = useCallback(async () => {
    // If we already have the explanation cached, just show the modal
    if (explanation) {
      setShowModal(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/explain?actionId=${encodeURIComponent(actionId)}`
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch explanation: ${res.status}`);
      }

      const data = await res.json();
      const result: ExplainResponse = data.data ?? data;
      setExplanation(result);
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [actionId, explanation]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:focus:ring-offset-zinc-900"
      >
        {loading ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
        ) : (
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {loading ? 'Loading...' : 'Explain this'}
      </button>

      {error && (
        <span className="ml-2 text-xs text-red-500 dark:text-red-400">
          {error}
        </span>
      )}

      {showModal && explanation && (
        <ExplainModal explanation={explanation} onClose={handleCloseModal} />
      )}
    </>
  );
}
