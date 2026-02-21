'use client';

import React, { useState } from 'react';
import type { WorkflowExecution } from '@/modules/workflows/types';

// ============================================================================
// Execution Timeline — Vertical timeline showing execution progress
// ============================================================================

interface ExecutionTimelineProps {
  execution: WorkflowExecution;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', icon: '\u2713' },
  RUNNING: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '\u25B6' },
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-500', icon: '\u25CB' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-700', icon: '\u2717' },
  SKIPPED: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '\u21B7' },
};

const EXEC_STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-gray-100 text-gray-600',
  ROLLED_BACK: 'bg-orange-100 text-orange-800',
};

export default function ExecutionTimeline({ execution }: ExecutionTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (nodeId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const [now] = useState(() => Date.now());
  const duration = execution.completedAt
    ? execution.completedAt.getTime() - execution.startedAt.getTime()
    : now - execution.startedAt.getTime();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      {/* Execution Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Execution {execution.id}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Triggered by {execution.triggeredBy} via {execution.triggerType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {formatDuration(duration)}
          </span>
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              EXEC_STATUS_STYLES[execution.status] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {execution.status}
          </span>
        </div>
      </div>

      {/* Error */}
      {execution.error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs text-red-700 font-medium">Error</p>
          <p className="text-xs text-red-600 mt-1">{execution.error}</p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

        {execution.stepResults.map((step, index) => {
          const style = STATUS_STYLES[step.status] ?? STATUS_STYLES.PENDING;
          const isExpanded = expandedSteps.has(step.nodeId);
          const stepDuration =
            step.completedAt && step.startedAt
              ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
              : 0;

          return (
            <div key={`${step.nodeId}-${index}`} className="relative pl-10 pb-6 last:pb-0">
              {/* Timeline dot */}
              <div
                className={`absolute left-2.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${style.bg} ${style.text} border-2 border-white shadow-sm`}
              >
                {style.icon}
              </div>

              {/* Step card */}
              <div
                className={`border rounded-md transition-colors cursor-pointer ${
                  isExpanded ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => toggleStep(step.nodeId)}
              >
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${style.text}`}>
                      {step.status}
                    </span>
                    <span className="text-sm text-gray-900">{step.nodeId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stepDuration > 0 && (
                      <span className="text-xs text-gray-500">
                        {formatDuration(stepDuration)}
                      </span>
                    )}
                    {step.retryCount > 0 && (
                      <span className="text-xs text-orange-600">
                        {step.retryCount} retries
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {isExpanded ? '\u25B2' : '\u25BC'}
                    </span>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 p-3 space-y-2">
                    {step.error && (
                      <div className="p-2 bg-red-50 rounded text-xs text-red-600">
                        {step.error}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">Input</p>
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">Output</p>
                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(step.output, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {execution.stepResults.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">
          No steps executed yet
        </p>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
