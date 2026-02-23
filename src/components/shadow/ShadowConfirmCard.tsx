'use client';

import { useState, useEffect, useCallback } from 'react';

interface ShadowConfirmCardProps {
  message: string;
  canUndo: boolean;
  undoDeadlineSeconds?: number;
  onUndo?: () => void;
  receiptId?: string;
}

export function ShadowConfirmCard({
  message,
  canUndo,
  undoDeadlineSeconds = 10,
  onUndo,
  receiptId,
}: ShadowConfirmCardProps) {
  const [secondsLeft, setSecondsLeft] = useState(undoDeadlineSeconds);
  const [undone, setUndone] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!canUndo || undone || expired) return;

    if (secondsLeft <= 0) {
      setExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [canUndo, undone, expired, secondsLeft]);

  const handleUndo = useCallback(() => {
    if (undone || expired) return;
    setUndone(true);
    onUndo?.();
  }, [undone, expired, onUndo]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 bg-white dark:bg-gray-800 max-w-sm">
      <div className="flex items-start gap-2">
        {/* Green checkmark */}
        <div className="shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mt-0.5">
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600 dark:text-green-400"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-white">{message}</p>

          {canUndo && !undone && !expired && (
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={handleUndo}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
              >
                Undo ({secondsLeft}s)
              </button>
            </div>
          )}

          {undone && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
              Action undone
            </p>
          )}

          {canUndo && expired && !undone && (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Undo window expired
            </p>
          )}

          {receiptId && (
            <button
              onClick={() => {
                // Navigate to receipt or open receipt detail
                window.open(`/api/shadow/receipts/${receiptId}`, '_blank');
              }}
              className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
            >
              View receipt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
