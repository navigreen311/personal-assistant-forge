'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { WorkflowExecution, StepExecutionResult } from '@/modules/workflows/types';

// ============================================================================
// WorkflowRunHistory — Table of execution runs with expandable step-by-step logs
// Fetches from /api/workflows/{workflowId}/executions, shows run details + costs
// ============================================================================

interface WorkflowRunHistoryProps {
  workflowId: string;
  workflowName?: string;
}

// --- Status badge styling ---

type RunStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RUNNING';

const STATUS_BADGE: Record<RunStatus, { bg: string; text: string; label: string }> = {
  SUCCESS: { bg: 'bg-green-100', text: 'text-green-700', label: 'Success' },
  PARTIAL: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Partial' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  RUNNING: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Running' },
};

const STEP_STATUS_ICON: Record<string, string> = {
  COMPLETED: '\u2705',  // green check
  FAILED: '\u274C',     // red cross
  SKIPPED: '\u26A0\uFE0F', // warning
  RUNNING: '\u25B6\uFE0F', // play
  PENDING: '\u25CB',    // circle
};

// --- Derived run type for display ---

interface RunEntry {
  execution: WorkflowExecution;
  runNumber: number;
  status: RunStatus;
  durationMs: number;
  completedSteps: number;
  totalSteps: number;
  estimatedCost: number;
}

// --- Helpers ---

function deriveRunStatus(execution: WorkflowExecution): RunStatus {
  if (execution.status === 'RUNNING') return 'RUNNING';
  if (execution.status === 'FAILED' || execution.status === 'CANCELLED') return 'FAILED';

  const completedCount = execution.stepResults.filter(
    (s) => s.status === 'COMPLETED'
  ).length;
  const totalCount = execution.stepResults.length;

  if (totalCount === 0) return 'FAILED';
  if (completedCount === totalCount) return 'SUCCESS';
  return 'PARTIAL';
}

function computeDurationMs(execution: WorkflowExecution): number {
  const start = new Date(execution.startedAt).getTime();
  const end = execution.completedAt
    ? new Date(execution.completedAt).getTime()
    : Date.now();
  return end - start;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function estimateCost(execution: WorkflowExecution): number {
  // Heuristic cost model: base per step + extra for AI decision nodes
  let cost = 0;
  for (const step of execution.stepResults) {
    cost += 0.05; // base cost per step
    if (step.output?.decision !== undefined || step.output?.confidence !== undefined) {
      // AI decision step — higher token cost
      cost += 0.25;
    }
    if (step.output?.actionType === 'CALL_API') {
      cost += 0.02;
    }
  }
  return Math.round(cost * 100) / 100;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function getStepDurationMs(step: StepExecutionResult): number {
  if (!step.completedAt || !step.startedAt) return 0;
  return new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
}

function getStepSummary(step: StepExecutionResult): string {
  const output = step.output;
  if (!output || Object.keys(output).length === 0) return 'completed';

  // Try to build a meaningful summary from output
  if (output.triggered) return 'triggered';
  if (output.decision) return String(output.decision);
  if (output.result !== undefined) return `result: ${output.result}`;
  if (output.delayed) return 'delayed';
  if (output.approvalId) return `approval requested (${output.status})`;
  if (output.iterations !== undefined) return `${output.iterations} iterations`;
  if (output.handled) return 'error handled';
  if (output.subWorkflowId) return `sub-workflow ${output.status}`;

  // Generic: pick first meaningful string value
  for (const value of Object.values(output)) {
    if (typeof value === 'string' && value.length > 0 && value.length < 80) {
      return value;
    }
  }

  return 'completed';
}

function getStepStatusIcon(status: string): string {
  return STEP_STATUS_ICON[status] ?? '\u25CB';
}

// --- API response shape (matches api-response.ts success wrapper) ---

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  total?: number;
  page?: number;
  pageSize?: number;
}

interface ExecutionsPayload {
  data: WorkflowExecution[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Main Component
// ============================================================================

export default function WorkflowRunHistory({
  workflowId,
  workflowName,
}: WorkflowRunHistoryProps) {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [totalRuns, setTotalRuns] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/workflows/${workflowId}/executions?page=${page}&pageSize=${pageSize}`
      );

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const json = (await res.json()) as ApiSuccessResponse<ExecutionsPayload>;

      if (!json.success) {
        throw new Error('Failed to load executions');
      }

      const payload = json.data;
      const executions = payload.data ?? [];
      const total = payload.total ?? executions.length;

      // Convert to RunEntry with sequential run numbers
      // Runs are sorted newest-first from API; run numbers count from oldest
      const entries: RunEntry[] = executions.map(
        (execution: WorkflowExecution, index: number) => {
          const runNumber = total - ((page - 1) * pageSize + index);
          const completedSteps = execution.stepResults.filter(
            (s) => s.status === 'COMPLETED'
          ).length;

          return {
            execution,
            runNumber,
            status: deriveRunStatus(execution),
            durationMs: computeDurationMs(execution),
            completedSteps,
            totalSteps: execution.stepResults.length,
            estimatedCost: estimateCost(execution),
          };
        }
      );

      setRuns(entries);
      setTotalRuns(total);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load run history');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [workflowId, page, pageSize]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const toggleLog = (executionId: string) => {
    setExpandedRunId((prev) => (prev === executionId ? null : executionId));
  };

  const totalPages = Math.max(1, Math.ceil(totalRuns / pageSize));

  // --- Render ---

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Run History</h2>
          {workflowName && (
            <p className="text-sm text-gray-500 mt-0.5">{workflowName}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {totalRuns > 0 && (
            <span className="text-xs text-gray-500">
              {totalRuns} {totalRuns === 1 ? 'run' : 'runs'} total
            </span>
          )}
          <button
            onClick={fetchExecutions}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="px-4 py-12 text-center">
          <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 mt-3">Loading run history...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && errorMsg && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-red-600">{errorMsg}</p>
          <button
            onClick={fetchExecutions}
            className="mt-3 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !errorMsg && runs.length === 0 && (
        <div className="px-4 py-12 text-center">
          <div className="text-3xl text-gray-300 mb-3">{'\u23F3'}</div>
          <p className="text-sm text-gray-500">
            No runs yet. This workflow hasn&apos;t been executed.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !errorMsg && runs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Run #
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Started
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Duration
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Steps
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Cost
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const badge = STATUS_BADGE[run.status];
                const isExpanded = expandedRunId === run.execution.id;

                return (
                  <React.Fragment key={run.execution.id}>
                    {/* Main row */}
                    <tr
                      className={`border-b transition-colors ${
                        isExpanded
                          ? 'border-blue-200 bg-blue-50/30'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        #{run.runNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDateTime(run.execution.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {run.completedSteps}/{run.totalSteps}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatCost(run.estimatedCost)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleLog(run.execution.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                            isExpanded
                              ? 'text-blue-700 bg-blue-100 hover:bg-blue-200'
                              : 'text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          {isExpanded ? 'Hide log' : 'View log'}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded log row */}
                    {isExpanded && (
                      <tr className="border-b border-blue-200">
                        <td colSpan={7} className="px-4 py-0">
                          <ExpandedLog
                            execution={run.execution}
                            estimatedCost={run.estimatedCost}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !errorMsg && totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ExpandedLog — Step-by-step execution log shown when a row is expanded
// ============================================================================

interface ExpandedLogProps {
  execution: WorkflowExecution;
  estimatedCost: number;
}

function ExpandedLog({ execution, estimatedCost }: ExpandedLogProps) {
  const totalTokenEstimate = Math.round(estimatedCost * 900);
  const apiCallCount = execution.stepResults.filter(
    (s) =>
      s.output?.actionType === 'CALL_API' ||
      s.output?.decision !== undefined ||
      s.output?.approvalId !== undefined
  ).length;

  return (
    <div className="py-3 space-y-1.5">
      {/* Step list */}
      {execution.stepResults.map((step, index) => {
        const stepDuration = getStepDurationMs(step);
        const icon = getStepStatusIcon(step.status);
        const summary = getStepSummary(step);

        return (
          <div
            key={`${step.nodeId}-${index}`}
            className="flex items-start gap-2 py-1.5 px-3 rounded-md bg-gray-50 text-sm"
          >
            <span className="font-medium text-gray-500 whitespace-nowrap shrink-0">
              Step {index + 1}:
            </span>
            <span className="text-gray-800 font-medium shrink-0">
              {step.nodeId}
            </span>
            <span className="text-gray-400 shrink-0">{'\u2192'}</span>
            <span className="text-gray-600 truncate min-w-0">
              {summary}
            </span>
            <span className="shrink-0 ml-auto flex items-center gap-2">
              <span>{icon}</span>
              {stepDuration > 0 && (
                <span className="text-xs text-gray-400">
                  ({formatDuration(stepDuration)})
                </span>
              )}
            </span>
          </div>
        );
      })}

      {/* Error message */}
      {execution.error && (
        <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs font-medium text-red-700">Error</p>
          <p className="text-xs text-red-600 mt-0.5">{execution.error}</p>
        </div>
      )}

      {/* Cost summary */}
      <div className="pt-2 mt-1 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Total cost: {formatCost(estimatedCost)}
          <span className="text-gray-400 ml-1">
            ({totalTokenEstimate.toLocaleString()} tokens
            {apiCallCount > 0 && ` + ${apiCallCount} API call${apiCallCount !== 1 ? 's' : ''}`})
          </span>
        </p>
      </div>
    </div>
  );
}
