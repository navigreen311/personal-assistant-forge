'use client';

import React, { useState, useCallback } from 'react';

// ============================================================================
// WorkflowCard — Card-based display for a single workflow
// Shows entity pill, status dot, trigger icons, meta stats, and action buttons
// ============================================================================

// --- Types ---

interface WorkflowCardProps {
  workflow: {
    id: string;
    name: string;
    description?: string;
    entityId: string;
    entityName?: string;
    status: string;
    triggers?: { type: string; config?: Record<string, unknown> }[];
    steps?: { id: string; type: string; config?: Record<string, unknown> }[];
    lastRun?: string;
    successRate?: number;
    costPerRun?: number;
  };
  onRunNow?: (id: string) => void;
  onTogglePause?: (id: string) => void;
  onEdit?: (id: string) => void;
  onViewHistory?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

// --- Constants ---

const STATUS_CONFIG: Record<string, { dot: string; label: string; badge: string }> = {
  ACTIVE: {
    dot: 'bg-green-500',
    label: 'Active',
    badge: 'bg-green-50 text-green-700 border-green-200',
  },
  PAUSED: {
    dot: 'bg-gray-400',
    label: 'Paused',
    badge: 'bg-gray-50 text-gray-600 border-gray-200',
  },
  DRAFT: {
    dot: 'bg-blue-400',
    label: 'Draft',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  ARCHIVED: {
    dot: 'bg-red-400',
    label: 'Archived',
    badge: 'bg-red-50 text-red-600 border-red-200',
  },
};

const TRIGGER_CONFIG: Record<string, { icon: string; label: string }> = {
  TIME: { icon: '\u23F0', label: 'Schedule' },
  EVENT: { icon: '\u2709\uFE0F', label: 'Event' },
  CONDITION: { icon: '\uD83C\uDFAF', label: 'Condition' },
  MANUAL: { icon: '\u270B', label: 'Manual' },
  VOICE: { icon: '\uD83C\uDF99\uFE0F', label: 'Voice' },
  WEBHOOK: { icon: '\uD83D\uDD17', label: 'Webhook' },
};

// --- Helpers ---

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (diffDay > 0) {
    return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
  }
  if (diffHour > 0) {
    return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  }
  if (diffMin > 0) {
    return diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
  }
  return 'Just now';
}

function formatSuccessRate(rate: number | undefined): string | null {
  if (rate === undefined || rate === null) return null;
  // Handle both 0-1 and 0-100 formats
  const pct = rate <= 1 ? Math.round(rate * 100) : Math.round(rate);
  return `${pct}%`;
}

function formatCost(cost: number | undefined): string | null {
  if (cost === undefined || cost === null) return null;
  return `~$${cost.toFixed(2)}`;
}

// --- MoreDropdown (inline) ---

interface MoreDropdownProps {
  workflowId: string;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

function MoreDropdown({ workflowId, onDuplicate, onDelete }: MoreDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleAction = useCallback(
    (action: ((id: string) => void) | undefined) => {
      setIsOpen(false);
      action?.(workflowId);
    },
    [workflowId]
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        title="More actions"
        aria-label="More actions"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            {onDuplicate && (
              <button
                onClick={() => handleAction(onDuplicate)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="text-gray-400 w-4 text-center">
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
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </span>
                Duplicate
              </button>
            )}
            <button
              onClick={() => handleAction(() => {
                // Export stub — consumers can add their own export logic
              })}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="text-gray-400 w-4 text-center">
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
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </span>
              Export
            </button>
            <div className="border-t border-gray-100 my-1" />
            {onDelete && (
              <button
                onClick={() => handleAction(onDelete)}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <span className="w-4 text-center">
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
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </span>
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main Component ---

export default function WorkflowCard({
  workflow,
  onRunNow,
  onTogglePause,
  onEdit,
  onViewHistory,
  onDelete,
  onDuplicate,
}: WorkflowCardProps) {
  const statusConf = STATUS_CONFIG[workflow.status] ?? STATUS_CONFIG.DRAFT;
  const isPaused = workflow.status === 'PAUSED';
  const isArchived = workflow.status === 'ARCHIVED';
  const stepCount = workflow.steps?.length ?? 0;
  const successRateStr = formatSuccessRate(workflow.successRate);
  const costStr = formatCost(workflow.costPerRun);
  const lastRunStr = workflow.lastRun ? formatRelativeTime(workflow.lastRun) : null;
  const entityLabel = workflow.entityName ?? workflow.entityId;

  // Gather trigger display info
  const triggerDisplay = (workflow.triggers ?? []).map((t) => {
    const conf = TRIGGER_CONFIG[t.type] ?? { icon: '\u2699\uFE0F', label: t.type };
    return conf;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
      {/* Header Row: Entity pill + Status badge */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
          {entityLabel}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConf.badge}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
          {statusConf.label}
        </span>
      </div>

      {/* Name + Description */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 leading-tight">
          {workflow.name}
        </h3>
        {workflow.description && (
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">
            {workflow.description}
          </p>
        )}
      </div>

      {/* Trigger line */}
      {triggerDisplay.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {triggerDisplay.map((trigger, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 text-sm text-gray-700"
            >
              <span className="text-base">{trigger.icon}</span>
              <span>{trigger.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Meta stats line */}
      <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
        <span className="font-medium text-gray-600">
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>

        {lastRunStr && (
          <>
            <span className="text-gray-300">|</span>
            <span>Last run: {lastRunStr}</span>
          </>
        )}

        {successRateStr && (
          <>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1">
              Success:
              <span
                className={`font-medium ${
                  (workflow.successRate ?? 0) >= 0.9
                    ? 'text-green-600'
                    : (workflow.successRate ?? 0) >= 0.7
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {successRateStr}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Cost per run */}
      {costStr && (
        <div className="text-xs text-gray-500">
          Cost/run: <span className="font-medium text-gray-700">{costStr}</span>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {onRunNow && !isArchived && (
          <button
            onClick={() => onRunNow(workflow.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
            title="Run workflow now"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run Now
          </button>
        )}

        {onTogglePause && !isArchived && (
          <button
            onClick={() => onTogglePause(workflow.id)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isPaused
                ? 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
                : 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200'
            }`}
            title={isPaused ? 'Resume workflow' : 'Pause workflow'}
          >
            {isPaused ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}

        {onEdit && (
          <button
            onClick={() => onEdit(workflow.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
            title="Edit workflow"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
        )}

        {onViewHistory && (
          <button
            onClick={() => onViewHistory(workflow.id)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
            title="View run history"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            History
          </button>
        )}

        {/* More dropdown (duplicate, export, delete) */}
        <div className="ml-auto">
          <MoreDropdown
            workflowId={workflow.id}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WorkflowCardGrid — Grid wrapper for rendering multiple WorkflowCards
// ============================================================================

interface WorkflowCardGridProps {
  workflows: WorkflowCardProps['workflow'][];
  onRunNow?: (id: string) => void;
  onTogglePause?: (id: string) => void;
  onEdit?: (id: string) => void;
  onViewHistory?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

export function WorkflowCardGrid({
  workflows,
  onRunNow,
  onTogglePause,
  onEdit,
  onViewHistory,
  onDelete,
  onDuplicate,
}: WorkflowCardGridProps) {
  if (workflows.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No workflows to display</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {workflows.map((wf) => (
        <WorkflowCard
          key={wf.id}
          workflow={wf}
          onRunNow={onRunNow}
          onTogglePause={onTogglePause}
          onEdit={onEdit}
          onViewHistory={onViewHistory}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}
