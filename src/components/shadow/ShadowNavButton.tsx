'use client';

import { useState, useEffect } from 'react';

type SessionStatus = 'none' | 'active' | 'sidekick' | 'paused';

interface ShadowNavButtonProps {
  sessionStatus: SessionStatus;
  sessionDuration?: number; // seconds elapsed since session start
  entityName?: string;
  pendingCount?: number;
  onClick: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ShadowNavButton({
  sessionStatus,
  sessionDuration = 0,
  entityName,
  pendingCount = 0,
  onClick,
}: ShadowNavButtonProps) {
  const [elapsed, setElapsed] = useState(sessionDuration);

  // Auto-update timer every second when session is active
  useEffect(() => {
    setElapsed(sessionDuration);
  }, [sessionDuration]);

  useEffect(() => {
    if (sessionStatus !== 'active') return;

    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionStatus]);

  const statusDot: Record<SessionStatus, string> = {
    none: '',
    active: 'bg-green-500',
    sidekick: 'bg-blue-500',
    paused: 'bg-yellow-500',
  };

  const statusLabel: Record<SessionStatus, string | null> = {
    none: null,
    active: null,
    sidekick: null,
    paused: 'paused',
  };

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
      aria-label="Shadow voice assistant"
    >
      {/* Robot icon */}
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-indigo-500"
      >
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>

      <span className={sessionStatus === 'none' ? 'text-gray-500' : 'text-gray-900 dark:text-white'}>
        Shadow
      </span>

      {/* Status dot */}
      {sessionStatus !== 'none' && (
        <span
          className={`w-2 h-2 rounded-full ${statusDot[sessionStatus]}`}
          aria-label={`Status: ${sessionStatus}`}
        />
      )}

      {/* Timer for active session */}
      {sessionStatus === 'active' && (
        <span className="text-xs text-gray-500 font-mono">
          {formatDuration(elapsed)}
        </span>
      )}

      {/* Paused label */}
      {statusLabel[sessionStatus] && (
        <span className="text-xs text-yellow-600 dark:text-yellow-400">
          {statusLabel[sessionStatus]}
        </span>
      )}

      {/* Entity name separator + name */}
      {sessionStatus === 'active' && entityName && (
        <>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-600 dark:text-gray-400 max-w-[80px] truncate">
            {entityName}
          </span>
        </>
      )}

      {/* Pending count badge */}
      {pendingCount > 0 && (
        <>
          {sessionStatus === 'active' && entityName && (
            <span className="text-gray-300 dark:text-gray-600">|</span>
          )}
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        </>
      )}
    </button>
  );
}
