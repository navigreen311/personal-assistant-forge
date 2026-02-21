'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Enhanced Approval Panel — Table of pending human-in-the-loop approvals
// with approve, edit, reject actions, expandable rows, and auto-refresh
// ============================================================================

// --- Types ---

interface EnhancedApprovalPanelProps {
  entityId?: string;
}

interface PendingApproval {
  id: string;
  workflowName: string;
  stepLabel: string;
  action: string;
  context: string;
  fullContext: string;
  workflowDescription: string;
  approvalReason: string;
  requestedAt: string;
  executionId: string;
}

// --- Helpers ---

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// --- Loading Skeleton ---

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded w-28" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded w-20" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded w-36" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded w-32" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 bg-gray-200 rounded w-14" />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <div className="h-8 bg-gray-200 rounded w-16" />
          <div className="h-8 bg-gray-200 rounded w-12" />
          <div className="h-8 bg-gray-200 rounded w-14" />
        </div>
      </td>
    </tr>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </>
  );
}

// --- Inline Editor ---

interface InlineEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

function InlineEditor({ initialContent, onSave, onCancel }: InlineEditorProps) {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium text-gray-600">
        Edit action content
      </label>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={5}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(content)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// --- Expanded Row Detail ---

interface ExpandedDetailProps {
  approval: PendingApproval;
}

function ExpandedDetail({ approval }: ExpandedDetailProps) {
  return (
    <div className="px-4 py-3 space-y-3 bg-gray-50/50">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Workflow Description
        </p>
        <p className="text-sm text-gray-800">{approval.workflowDescription}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Why Approval is Needed
        </p>
        <p className="text-sm text-gray-800">{approval.approvalReason}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Full Content
        </p>
        <pre className="text-sm text-gray-800 bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
          {approval.fullContext}
        </pre>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function EnhancedApprovalPanel({ entityId }: EnhancedApprovalPanelProps) {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch approvals ---

  const fetchApprovals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      const url = `/api/workflows/approvals${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch approvals: ${response.statusText}`);
      }

      const data = await response.json();
      setApprovals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // --- Auto-refresh ---

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchApprovals();
      }, 30000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, fetchApprovals]);

  // --- Action helpers ---

  const setActionLoadingFor = (id: string, isLoading: boolean) => {
    setActionLoading((prev) => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  // --- Approve ---

  const handleApprove = useCallback(
    async (id: string) => {
      setActionLoadingFor(id, true);
      try {
        const response = await fetch('/api/workflows/approvals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'approve' }),
        });

        if (!response.ok) {
          throw new Error('Failed to approve');
        }

        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approve failed');
      } finally {
        setActionLoadingFor(id, false);
      }
    },
    []
  );

  // --- Reject ---

  const handleReject = useCallback(
    async (id: string) => {
      const confirmed = window.confirm(
        'Are you sure you want to reject this approval? This action cannot be undone.'
      );
      if (!confirmed) return;

      setActionLoadingFor(id, true);
      try {
        const response = await fetch('/api/workflows/approvals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'reject' }),
        });

        if (!response.ok) {
          throw new Error('Failed to reject');
        }

        setApprovals((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reject failed');
      } finally {
        setActionLoadingFor(id, false);
      }
    },
    []
  );

  // --- Edit (save) ---

  const handleEditSave = useCallback(
    async (id: string, updatedContent: string) => {
      setActionLoadingFor(id, true);
      try {
        const response = await fetch('/api/workflows/approvals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'edit', content: updatedContent }),
        });

        if (!response.ok) {
          throw new Error('Failed to save edit');
        }

        // Update local state with edited content
        setApprovals((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  fullContext: updatedContent,
                  context: truncate(updatedContent, 50),
                }
              : a
          )
        );
        setEditingId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Edit save failed');
      } finally {
        setActionLoadingFor(id, false);
      }
    },
    []
  );

  // --- Row expansion ---

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // --- Render ---

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
          {!loading && approvals.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold text-white bg-orange-500 rounded-full">
              {approvals.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-gray-500">Auto-refresh</span>
            <button
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                autoRefresh ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoRefresh ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
          <button
            onClick={() => {
              setLoading(true);
              fetchApprovals();
            }}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
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
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 text-sm font-medium ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Workflow
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Step
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Action
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Context
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Requested
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Loading skeleton */}
            {loading && <LoadingSkeleton />}

            {/* Empty state */}
            {!loading && approvals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-300"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <p className="text-sm text-gray-500">
                      No pending approvals. Workflows are running smoothly.
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {/* Approval rows */}
            {!loading &&
              approvals.map((approval) => {
                const isExpanded = expandedRows.has(approval.id);
                const isEditing = editingId === approval.id;
                const isActionLoading = actionLoading.has(approval.id);

                return (
                  <React.Fragment key={approval.id}>
                    {/* Main row */}
                    <tr
                      className={`transition-colors cursor-pointer ${
                        isExpanded
                          ? 'bg-blue-50/30'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => toggleRow(approval.id)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {approval.workflowName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {approval.stepLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {approval.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500" title={approval.fullContext}>
                          {truncate(approval.context, 40)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatRelativeTime(approval.requestedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Approve */}
                          <button
                            onClick={() => handleApprove(approval.id)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                          >
                            {isActionLoading ? '...' : 'Approve'}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() =>
                              setEditingId(isEditing ? null : approval.id)
                            }
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                          >
                            Edit
                          </button>

                          {/* Reject */}
                          <button
                            onClick={() => handleReject(approval.id)}
                            disabled={isActionLoading}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <ExpandedDetail approval={approval} />
                        </td>
                      </tr>
                    )}

                    {/* Inline editor row */}
                    {isEditing && (
                      <tr>
                        <td colSpan={6} className="px-4 py-0 pb-3 bg-yellow-50/30">
                          <InlineEditor
                            initialContent={approval.fullContext}
                            onSave={(content) => handleEditSave(approval.id, content)}
                            onCancel={() => setEditingId(null)}
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
    </div>
  );
}
