'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Runbook, RunbookStep } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedRunbooksTabProps {
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'warning' | 'info';

interface RunbookCard {
  id: string;
  name: string;
  severity: Severity;
  description: string;
  steps: RunbookStep[];
  stepCount: number;
  lastUsed: Date | null;
  owner: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RUNBOOKS: RunbookCard[] = [
  {
    id: 'rb_default_1',
    name: 'Voice Latency Spike',
    severity: 'critical',
    description: 'When VoiceForge call latency exceeds 500ms',
    steps: [
      { order: 1, name: 'Check latency metrics', description: 'Pull current latency from monitoring', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 15 },
      { order: 2, name: 'Identify affected routes', description: 'Determine which call routes are impacted', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 30 },
      { order: 3, name: 'Enable fallback routing', description: 'Switch to backup voice provider', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 10 },
      { order: 4, name: 'Notify engineering', description: 'Alert on-call engineer via PagerDuty', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
      { order: 5, name: 'Monitor recovery', description: 'Watch metrics for 15 minutes post-switch', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 900 },
    ],
    stepCount: 5,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_2',
    name: 'Calendar Sync Drift',
    severity: 'warning',
    description: "When calendar events don't match source of truth",
    steps: [
      { order: 1, name: 'Diff calendar sources', description: 'Compare primary and secondary calendars', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 30 },
      { order: 2, name: 'Generate drift report', description: 'List all mismatched events', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 60 },
      { order: 3, name: 'Reconcile events', description: 'Sync events from source of truth', actionType: 'SYNC_DATA', parameters: {}, requiresApproval: true, maxBlastRadius: 'MEDIUM', continueOnFailure: false, timeout: 120 },
      { order: 4, name: 'Notify affected users', description: 'Send drift summary to calendar owners', actionType: 'SEND_EMAIL', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 15 },
    ],
    stepCount: 4,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_3',
    name: 'LLM Provider Outage',
    severity: 'critical',
    description: 'When primary LLM provider is unavailable',
    steps: [
      { order: 1, name: 'Verify outage', description: 'Confirm provider is down via health check', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 10 },
      { order: 2, name: 'Switch to fallback', description: 'Route traffic to secondary LLM provider', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 15 },
      { order: 3, name: 'Alert stakeholders', description: 'Notify team of provider switch', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
    ],
    stepCount: 3,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_4',
    name: 'Webhook Storms',
    severity: 'warning',
    description: 'When webhook rate exceeds threshold',
    steps: [
      { order: 1, name: 'Detect storm pattern', description: 'Analyze incoming webhook rate vs threshold', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 10 },
      { order: 2, name: 'Enable rate limiting', description: 'Throttle incoming webhooks to safe rate', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'MEDIUM', continueOnFailure: false, timeout: 5 },
      { order: 3, name: 'Queue overflow events', description: 'Buffer excess webhooks for later processing', actionType: 'SYNC_DATA', parameters: {}, requiresApproval: false, maxBlastRadius: 'MEDIUM', continueOnFailure: false, timeout: 30 },
      { order: 4, name: 'Notify ops team', description: 'Alert operations about the storm event', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
    ],
    stepCount: 4,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_5',
    name: 'Database Failover',
    severity: 'critical',
    description: 'When primary database is unreachable',
    steps: [
      { order: 1, name: 'Confirm primary down', description: 'Run connectivity checks against primary DB', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 10 },
      { order: 2, name: 'Check replica health', description: 'Verify read replicas are in sync', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 15 },
      { order: 3, name: 'Promote replica', description: 'Promote healthiest replica to primary', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'CRITICAL', continueOnFailure: false, timeout: 30 },
      { order: 4, name: 'Update connection strings', description: 'Point all services to new primary', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 20 },
      { order: 5, name: 'Run integrity checks', description: 'Verify data consistency post-failover', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 120 },
      { order: 6, name: 'Notify all teams', description: 'Send incident summary to engineering and ops', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
    ],
    stepCount: 6,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_6',
    name: 'Payment Failure',
    severity: 'warning',
    description: 'When payment processing fails',
    steps: [
      { order: 1, name: 'Check payment provider', description: 'Verify payment gateway status', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 10 },
      { order: 2, name: 'Retry failed transactions', description: 'Attempt to reprocess failed payments', actionType: 'CALL_API', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 60 },
      { order: 3, name: 'Notify billing team', description: 'Alert billing team of payment failures', actionType: 'SEND_EMAIL', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
    ],
    stepCount: 3,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_7',
    name: 'Data Breach Response',
    severity: 'critical',
    description: 'Security incident response procedure',
    steps: [
      { order: 1, name: 'Isolate affected systems', description: 'Quarantine compromised services', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'CRITICAL', continueOnFailure: false, timeout: 5 },
      { order: 2, name: 'Capture forensic data', description: 'Snapshot logs, memory, and network state', actionType: 'CALL_API', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 60 },
      { order: 3, name: 'Revoke compromised credentials', description: 'Rotate all potentially exposed keys and tokens', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 30 },
      { order: 4, name: 'Notify security team', description: 'Page security on-call immediately', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 5 },
      { order: 5, name: 'Notify legal', description: 'Inform legal team for compliance assessment', actionType: 'SEND_EMAIL', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
      { order: 6, name: 'Begin impact assessment', description: 'Determine scope of data exposure', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 120 },
      { order: 7, name: 'Prepare incident report', description: 'Draft initial incident report for stakeholders', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 60 },
      { order: 8, name: 'Notify affected users', description: 'Send breach notification if required', actionType: 'SEND_EMAIL', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 30 },
    ],
    stepCount: 8,
    lastUsed: null,
    owner: 'System',
  },
  {
    id: 'rb_default_8',
    name: 'HIPAA Incident',
    severity: 'critical',
    description: 'HIPAA compliance violation detected',
    steps: [
      { order: 1, name: 'Lock affected records', description: 'Restrict access to potentially exposed PHI', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'HIGH', continueOnFailure: false, timeout: 5 },
      { order: 2, name: 'Document the incident', description: 'Record all known details of the violation', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 30 },
      { order: 3, name: 'Notify compliance officer', description: 'Alert HIPAA compliance officer immediately', actionType: 'NOTIFY_TEAM', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 5 },
      { order: 4, name: 'Conduct risk assessment', description: 'Assess likelihood of PHI compromise', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: false, timeout: 120 },
      { order: 5, name: 'Notify legal counsel', description: 'Engage legal for breach notification requirements', actionType: 'SEND_EMAIL', parameters: {}, requiresApproval: false, maxBlastRadius: 'LOW', continueOnFailure: true, timeout: 10 },
      { order: 6, name: 'Prepare HHS notification', description: 'Draft notification for Dept. of Health & Human Services', actionType: 'GENERATE_REPORT', parameters: {}, requiresApproval: true, maxBlastRadius: 'MEDIUM', continueOnFailure: false, timeout: 60 },
      { order: 7, name: 'Implement remediation', description: 'Apply fixes to prevent recurrence', actionType: 'UPDATE_RECORD', parameters: {}, requiresApproval: true, maxBlastRadius: 'MEDIUM', continueOnFailure: false, timeout: 120 },
    ],
    stepCount: 7,
    lastUsed: null,
    owner: 'System',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<Severity, { border: string; dot: string; label: string }> = {
  critical: {
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    label: 'Critical',
  },
  warning: {
    border: 'border-l-amber-500',
    dot: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    border: 'border-l-green-500',
    dot: 'bg-green-500',
    label: 'Info',
  },
};

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function mapRunbookToCard(runbook: Runbook): RunbookCard {
  return {
    id: runbook.id,
    name: runbook.name,
    severity: inferSeverity(runbook),
    description: runbook.description,
    steps: runbook.steps,
    stepCount: runbook.steps.length,
    lastUsed: runbook.lastRunAt ? new Date(runbook.lastRunAt) : null,
    owner: runbook.createdBy,
  };
}

function inferSeverity(runbook: Runbook): Severity {
  const hasCriticalStep = runbook.steps.some(
    (s) => s.maxBlastRadius === 'CRITICAL' || s.maxBlastRadius === 'HIGH',
  );
  if (hasCriticalStep) return 'critical';
  const hasApprovalStep = runbook.steps.some((s) => s.requiresApproval);
  if (hasApprovalStep) return 'warning';
  return 'info';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedRunbooksTab({ entityId }: EnhancedRunbooksTabProps) {
  const [runbooks, setRunbooks] = useState<RunbookCard[]>(DEFAULT_RUNBOOKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // --- Fetch runbooks from API ---

  useEffect(() => {
    if (!entityId) return;

    let cancelled = false;

    async function fetchRunbooks() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/execution/runbooks?entityId=${encodeURIComponent(entityId!)}`);
        if (!res.ok) throw new Error(`Failed to fetch runbooks: ${res.status}`);
        const data: Runbook[] = await res.json();
        if (!cancelled) {
          if (data.length > 0) {
            setRunbooks(data.map(mapRunbookToCard));
          } else {
            setRunbooks(DEFAULT_RUNBOOKS);
          }
        }
      } catch {
        // Fallback to defaults on any error
        if (!cancelled) {
          setRunbooks(DEFAULT_RUNBOOKS);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchRunbooks();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  // --- Handlers ---

  const handleNewRunbook = useCallback(() => {
    alert('New Runbook creation is coming soon. This feature is under development.');
  }, []);

  const handleView = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleEdit = useCallback((id: string) => {
    alert(`Edit functionality for runbook "${id}" is coming soon.`);
  }, []);

  const handleRun = useCallback(async (card: RunbookCard) => {
    const confirmed = window.confirm(
      `Are you sure you want to execute the "${card.name}" runbook?\n\nThis will run ${card.stepCount} step(s). Steps requiring approval will pause for confirmation.`,
    );
    if (!confirmed) return;

    setExecutingId(card.id);
    try {
      const res = await fetch(`/api/execution/runbooks/${encodeURIComponent(card.id)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'manual' }),
      });
      if (!res.ok) throw new Error(`Execution failed: ${res.status}`);
      alert(`Runbook "${card.name}" has been triggered successfully.`);
    } catch {
      alert(`Failed to execute runbook "${card.name}". The API may not be available yet.`);
    } finally {
      setExecutingId(null);
    }
  }, []);

  // --- Filtered list ---

  const filteredRunbooks = searchQuery.trim()
    ? runbooks.filter((rb) =>
        rb.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : runbooks;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Runbooks
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Documented procedures for common scenarios.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewRunbook}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          + New Runbook
        </button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search runbooks by name..."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
          <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
            Loading runbooks...
          </span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredRunbooks.length === 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {searchQuery.trim()
              ? `No runbooks match "${searchQuery}".`
              : 'No runbooks available.'}
          </p>
        </div>
      )}

      {/* Runbook cards */}
      {!isLoading && filteredRunbooks.length > 0 && (
        <div className="space-y-3">
          {filteredRunbooks.map((card) => {
            const config = SEVERITY_CONFIG[card.severity];
            const isExpanded = expandedId === card.id;
            const isExecuting = executingId === card.id;

            return (
              <div
                key={card.id}
                className={`rounded-lg border border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900 ${config.border} ${
                  isExpanded
                    ? 'border-zinc-300 dark:border-zinc-600'
                    : 'border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {/* Card content */}
                <div className="p-4">
                  {/* Title row */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${config.dot}`}
                        title={config.label}
                      />
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {card.name}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        card.severity === 'critical'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          : card.severity === 'warning'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {card.description}
                  </p>

                  {/* Meta row */}
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>
                      Steps: <span className="font-medium text-zinc-600 dark:text-zinc-300">{card.stepCount}</span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">|</span>
                    <span>
                      Last used:{' '}
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        {formatRelativeTime(card.lastUsed)}
                      </span>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">|</span>
                    <span>
                      Owner: <span className="font-medium text-zinc-600 dark:text-zinc-300">{card.owner}</span>
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleView(card.id)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        isExpanded
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {isExpanded ? 'Hide' : 'View'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRun(card)}
                      disabled={isExecuting}
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                    >
                      {isExecuting ? 'Running...' : 'Run'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(card.id)}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Expanded step list */}
                {isExpanded && (
                  <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Steps
                    </h4>
                    <ol className="space-y-2">
                      {card.steps.map((step) => (
                        <li
                          key={`${card.id}-step-${step.order}`}
                          className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {step.order}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {step.name}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {step.description}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                {step.actionType.replace(/_/g, ' ')}
                              </span>
                              {step.requiresApproval && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                  Requires Approval
                                </span>
                              )}
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                Blast: {step.maxBlastRadius}
                              </span>
                              {step.timeout && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  Timeout: {step.timeout}s
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
