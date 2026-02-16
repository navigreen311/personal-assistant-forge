'use client';

import { useMemo } from 'react';
import type { RunbookExecution, RunbookStepResult } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RunbookExecutionViewProps {
  execution: RunbookExecution;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onApproveStep?: (stepOrder: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StepStatus = RunbookStepResult['status'];

const STATUS_META: Record<StepStatus, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: {
    label: 'Pending',
    color: 'text-zinc-400 bg-zinc-100 dark:bg-zinc-700',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  RUNNING: {
    label: 'Running',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-spin"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    ),
  },
  COMPLETED: {
    label: 'Completed',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  FAILED: {
    label: 'Failed',
    color: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  SKIPPED: {
    label: 'Skipped',
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="5 4 15 12 5 20 5 4" />
        <line x1="19" y1="5" x2="19" y2="19" />
      </svg>
    ),
  },
  AWAITING_APPROVAL: {
    label: 'Awaiting Approval',
    color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
};

function formatDuration(startedAt?: Date, completedAt?: Date): string {
  if (!startedAt) return '--';
  const end = completedAt ?? new Date();
  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const finish = end instanceof Date ? end : new Date(end);
  const ms = finish.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(date?: Date): string {
  if (!date) return '--';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Execution status header badge
// ---------------------------------------------------------------------------

const EXECUTION_STATUS_STYLES: Record<RunbookExecution['status'], string> = {
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RunbookExecutionView({
  execution,
  onPause,
  onResume,
  onCancel,
  onApproveStep,
}: RunbookExecutionViewProps) {
  const isRunning = execution.status === 'RUNNING';
  const isPaused = execution.status === 'PAUSED';
  const isActive = isRunning || isPaused;

  const sortedSteps = useMemo(
    () => [...execution.stepResults].sort((a, b) => a.stepOrder - b.stepOrder),
    [execution.stepResults],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Execution {execution.id}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                EXECUTION_STATUS_STYLES[execution.status]
              }`}
            >
              {execution.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Started {formatTimestamp(execution.startedAt)}
            {execution.completedAt && <> &middot; Ended {formatTimestamp(execution.completedAt)}</>}
            {' '}&middot; Triggered by {execution.triggeredBy}
          </p>
        </div>

        {/* Control buttons */}
        {isActive && (
          <div className="flex gap-2">
            {isRunning && onPause && (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Pause
              </button>
            )}
            {isPaused && onResume && (
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Resume
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-600 dark:bg-red-900/20 dark:text-red-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vertical stepper */}
      <div className="relative ml-4">
        {/* Vertical connector line */}
        <div className="absolute left-[7px] top-0 h-full w-0.5 bg-zinc-200 dark:bg-zinc-700" />

        <ol className="relative space-y-6">
          {sortedSteps.map((step) => {
            const meta = STATUS_META[step.status];
            const duration = formatDuration(step.startedAt, step.completedAt);

            return (
              <li key={step.stepOrder} className="relative pl-8">
                {/* Status icon (overlays the vertical line) */}
                <span
                  className={`absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-zinc-900 ${meta.color}`}
                >
                  {meta.icon}
                </span>

                <div className="space-y-2">
                  {/* Step header */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {step.stepOrder}. {step.stepName}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {duration}
                    </span>
                  </div>

                  {/* Output preview */}
                  {step.output && Object.keys(step.output).length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">
                        Output
                      </summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-zinc-100 p-2 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Action link */}
                  {step.actionId && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Action:{' '}
                      <span className="font-mono text-blue-600 dark:text-blue-400">
                        {step.actionId}
                      </span>
                    </p>
                  )}

                  {/* Error details */}
                  {step.error && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400">Error</p>
                      <p className="mt-0.5 text-xs text-red-600 dark:text-red-300">{step.error}</p>
                    </div>
                  )}

                  {/* Approval prompt */}
                  {step.status === 'AWAITING_APPROVAL' && onApproveStep && (
                    <div className="flex items-center gap-3 rounded-md border border-violet-200 bg-violet-50 p-3 dark:border-violet-700 dark:bg-violet-900/20">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                          This step requires manual approval before it can proceed.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onApproveStep(step.stepOrder)}
                        className="shrink-0 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-violet-700"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
