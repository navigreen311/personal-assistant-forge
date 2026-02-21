'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Workflow, Entity } from '@/shared/types';
import type { ApprovalRequest } from '@/modules/workflows/types';

// ============================================================================
// Workflows Page — Full-featured workflow management with stats, tabs, and
// view toggle. Supports All Workflows, Approvals, and Integrations tabs.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'workflows' | 'approvals' | 'integrations';
type ViewMode = 'list' | 'cards';
type WorkflowStatus = 'ALL' | 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED';

interface WorkflowStats {
  activeWorkflows: number;
  totalWorkflows: number;
  avgSuccessRate: number;
  pendingApprovals: number;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'workflows', label: 'All Workflows' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'integrations', label: 'Integrations' },
];

const STATUS_FILTERS: { key: WorkflowStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PAUSED', label: 'Paused' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ARCHIVED', label: 'Archived' },
];

// ---------------------------------------------------------------------------
// Dynamic imports — lazy-load heavy components with fallbacks
// ---------------------------------------------------------------------------

const WorkflowList = dynamic(
  () => import('@/modules/workflows/components/WorkflowList'),
  { ssr: false, loading: () => <TabLoadingPlaceholder label="Workflow List" /> }
);

const WorkflowCard = dynamic(
  () => import('@/modules/workflows/components/WorkflowCard').catch(() => ({
    default: () => null,
  })),
  { ssr: false }
);

const EnhancedApprovalPanel = dynamic(
  () => import('@/modules/workflows/components/EnhancedApprovalPanel').catch(() => ({
    default: () => null,
  })),
  { ssr: false }
);

const ApprovalPanel = dynamic(
  () => import('@/modules/workflows/components/ApprovalPanel'),
  { ssr: false, loading: () => <TabLoadingPlaceholder label="Approvals" /> }
);

const IntegrationsTab = dynamic(
  () => import('@/modules/workflows/components/IntegrationsTab').catch(() => ({
    default: () => null,
  })),
  { ssr: false }
);

const CreateWorkflowModal = dynamic(
  () => import('@/modules/workflows/components/CreateWorkflowModal').catch(() => ({
    default: () => null,
  })),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TabLoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-sm text-gray-400">Loading {label}...</p>
    </div>
  );
}

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Skeleton loader — matches page layout
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-40 bg-gray-200 rounded-lg" />
          <div className="h-10 w-40 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
            <div className="h-8 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Tab bar skeleton */}
      <div className="flex gap-4 border-b border-gray-200 pb-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 bg-gray-200 rounded-t" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-10 w-64 bg-gray-200 rounded-lg" />
          <div className="flex gap-2 ml-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 w-16 bg-gray-200 rounded-md" />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 py-4 border-b border-gray-100"
          >
            <div className="h-5 w-48 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-5 w-16 bg-gray-200 rounded" />
            <div className="h-5 w-24 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: 'green' | 'gray' | 'blue' | 'amber';
  icon: React.ReactNode;
}) {
  const accentMap = {
    green: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
    },
    gray: {
      bg: 'bg-white',
      text: 'text-gray-700',
      iconBg: 'bg-gray-100',
      iconText: 'text-gray-600',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      iconBg: 'bg-blue-100',
      iconText: 'text-blue-600',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
    },
  };

  const colors = accentMap[accent];

  return (
    <div
      className={`${colors.bg} border border-gray-200 rounded-xl p-5 flex items-start gap-4`}
    >
      <div
        className={`${colors.iconBg} ${colors.iconText} w-10 h-10 rounded-lg flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className={`text-2xl font-bold ${colors.text} mt-1`}>{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Create Workflow Modal (fallback when CreateWorkflowModal not found)
// ---------------------------------------------------------------------------

function InlineCreateWorkflowModal({
  entities,
  selectedEntityId,
  onClose,
  onCreated,
}: {
  entities: Entity[];
  selectedEntityId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityId, setEntityId] = useState(selectedEntityId || '');
  const [triggerType, setTriggerType] = useState<string>('MANUAL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workflow name is required');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          entityId: entityId || 'default-entity',
          triggers: [{ type: triggerType, config: {} }],
          graph: { nodes: [], edges: [] },
          status: 'DRAFT',
        }),
      });
      const json = await res.json();
      if (json.success || res.ok) {
        onCreated();
        onClose();
      } else {
        setError(json.error || 'Failed to create workflow');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Create Workflow
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., New Client Onboarding"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entity
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Default Entity</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Trigger Type
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="MANUAL">Manual</option>
                <option value="TIME">Scheduled (Time)</option>
                <option value="EVENT">Event-Driven</option>
                <option value="CONDITION">Condition-Based</option>
                <option value="VOICE">Voice Trigger</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Workflow Cards View (fallback when WorkflowCard not found)
// ---------------------------------------------------------------------------

function InlineWorkflowCards({
  workflows,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete,
  onViewExecutions,
}: {
  workflows: Workflow[];
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onViewExecutions: (id: string) => void;
}) {
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    PAUSED: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    DRAFT: 'bg-gray-100 text-gray-800 border-gray-200',
    ARCHIVED: 'bg-red-100 text-red-800 border-red-200',
  };

  const triggerIcons: Record<string, string> = {
    TIME: 'clock',
    EVENT: 'bolt',
    CONDITION: 'filter',
    MANUAL: 'hand',
    VOICE: 'mic',
  };

  if (workflows.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">No workflows found</h3>
        <p className="text-sm text-gray-500">
          Create your first workflow to automate multi-step processes.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {workflows.map((wf) => (
        <div
          key={wf.id}
          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
        >
          {/* Card Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {wf.name}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${
                    statusColors[wf.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {wf.status}
                </span>
                {wf.triggers.map((t, i) => (
                  <span
                    key={i}
                    className="text-xs text-gray-500"
                    title={t.type}
                  >
                    {t.type}
                  </span>
                ))}
              </div>
            </div>
            {/* Quick action menu */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => onEdit(wf.id)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={() => onDuplicate(wf.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title="Duplicate"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Success Rate */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Success Rate</span>
              <span className="font-medium text-gray-700">
                {Math.round(wf.successRate * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${wf.successRate * 100}%` }}
              />
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
            <span>
              Last run: {wf.lastRun ? timeAgo(wf.lastRun) : 'Never'}
            </span>
            <span>{wf.steps?.length ?? 0} steps</span>
          </div>

          {/* Card Footer Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            <button
              onClick={() =>
                onToggleStatus(
                  wf.id,
                  wf.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
                )
              }
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                wf.status === 'ACTIVE'
                  ? 'text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200'
                  : 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200'
              }`}
            >
              {wf.status === 'ACTIVE' ? 'Pause' : 'Activate'}
            </button>
            <button
              onClick={() => onViewExecutions(wf.id)}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              View Runs
            </button>
            <button
              onClick={() => onDelete(wf.id)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Integrations Placeholder
// ---------------------------------------------------------------------------

function InlineIntegrationsPlaceholder() {
  const integrations = [
    { name: 'Google Workspace', desc: 'Gmail, Calendar, Drive', status: 'available' },
    { name: 'Slack', desc: 'Channels, messages, notifications', status: 'available' },
    { name: 'Notion', desc: 'Pages, databases, wikis', status: 'available' },
    { name: 'QuickBooks', desc: 'Invoices, expenses, reports', status: 'coming' },
    { name: 'Custom REST API', desc: 'Connect any REST endpoint', status: 'available' },
    { name: 'Custom Webhook', desc: 'Receive and send webhooks', status: 'available' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Available Integrations
        </h3>
        <p className="text-sm text-gray-500">
          Connect external services to power your workflow actions and triggers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {integrations.map((integ) => (
          <div
            key={integ.name}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {integ.name}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">{integ.desc}</p>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  integ.status === 'available'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {integ.status === 'available' ? 'Available' : 'Coming Soon'}
              </span>
            </div>
            <button
              disabled={integ.status !== 'available'}
              className="mt-3 w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed border border-blue-200 rounded-lg transition-colors"
            >
              {integ.status === 'available' ? 'Configure' : 'Coming Soon'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const router = useRouter();

  // -----------------------------------------------------------------------
  // Data state
  // -----------------------------------------------------------------------
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // -----------------------------------------------------------------------
  // UI state
  // -----------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabKey>('workflows');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Track whether dynamic components loaded successfully
  const [hasWorkflowCard, setHasWorkflowCard] = useState<boolean | null>(null);
  const [hasEnhancedApproval, setHasEnhancedApproval] = useState<boolean | null>(null);
  const [hasIntegrationsTab, setHasIntegrationsTab] = useState<boolean | null>(null);
  const [hasCreateModal, setHasCreateModal] = useState<boolean | null>(null);

  // -----------------------------------------------------------------------
  // Dynamic component availability check
  // -----------------------------------------------------------------------
  useEffect(() => {
    import('@/modules/workflows/components/WorkflowCard')
      .then(() => setHasWorkflowCard(true))
      .catch(() => setHasWorkflowCard(false));

    import('@/modules/workflows/components/EnhancedApprovalPanel')
      .then(() => setHasEnhancedApproval(true))
      .catch(() => setHasEnhancedApproval(false));

    import('@/modules/workflows/components/IntegrationsTab')
      .then(() => setHasIntegrationsTab(true))
      .catch(() => setHasIntegrationsTab(false));

    import('@/modules/workflows/components/CreateWorkflowModal')
      .then(() => setHasCreateModal(true))
      .catch(() => setHasCreateModal(false));
  }, []);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities');
      const json = await res.json();
      if (json.data) {
        setEntities(json.data);
      }
    } catch {
      // Entities are optional — filter dropdown won't populate
    }
  }, []);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const entityParam = selectedEntityId
        ? `entityId=${selectedEntityId}`
        : 'entityId=default-entity';
      const res = await fetch(
        `/api/workflows?${entityParam}&page=1&pageSize=100`
      );
      const json = await res.json();
      if (json.success || json.data) {
        setWorkflows(json.data ?? []);
      }
    } catch {
      // Silently handle — UI shows empty state
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId]);

  const fetchApprovals = useCallback(async () => {
    try {
      const entityParam = selectedEntityId
        ? `entityId=${selectedEntityId}`
        : 'entityId=default-entity';
      const res = await fetch(`/api/workflows/approvals?${entityParam}`);
      const json = await res.json();
      if (json.data) {
        setApprovals(json.data);
      }
    } catch {
      // Approvals endpoint may not exist yet — graceful fallback
      setApprovals([]);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    fetchWorkflows();
    fetchApprovals();
  }, [fetchWorkflows, fetchApprovals]);

  // -----------------------------------------------------------------------
  // Computed stats
  // -----------------------------------------------------------------------

  const stats: WorkflowStats = useMemo(() => {
    const activeWorkflows = workflows.filter(
      (wf) => wf.status === 'ACTIVE'
    ).length;
    const totalWorkflows = workflows.length;
    const avgSuccessRate =
      totalWorkflows > 0
        ? workflows.reduce((sum, wf) => sum + wf.successRate, 0) /
          totalWorkflows
        : 0;
    const pendingApprovals = approvals.length;

    return { activeWorkflows, totalWorkflows, avgSuccessRate, pendingApprovals };
  }, [workflows, approvals]);

  // -----------------------------------------------------------------------
  // Filtered workflows
  // -----------------------------------------------------------------------

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      const matchesStatus =
        statusFilter === 'ALL' || wf.status === statusFilter;
      const matchesSearch =
        !searchQuery ||
        wf.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [workflows, statusFilter, searchQuery]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleEdit = useCallback(
    (workflowId: string) => {
      router.push(`/workflows/${workflowId}`);
    },
    [router]
  );

  const handleDuplicate = useCallback(
    async (workflowId: string) => {
      try {
        const original = workflows.find((wf) => wf.id === workflowId);
        await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Copy of ${original?.name ?? 'workflow'}`,
            entityId: selectedEntityId || 'default-entity',
            graph: { nodes: [], edges: [] },
            triggers: original?.triggers ?? [],
            status: 'DRAFT',
          }),
        });
        await fetchWorkflows();
      } catch {
        // Handle error silently
      }
    },
    [workflows, selectedEntityId, fetchWorkflows]
  );

  const handleToggleStatus = useCallback(
    async (workflowId: string, newStatus: string) => {
      try {
        await fetch(`/api/workflows/${workflowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        await fetchWorkflows();
      } catch {
        // Handle error silently
      }
    },
    [fetchWorkflows]
  );

  const handleDelete = useCallback(
    async (workflowId: string) => {
      try {
        await fetch(`/api/workflows/${workflowId}`, {
          method: 'DELETE',
        });
        await fetchWorkflows();
      } catch {
        // Handle error silently
      }
    },
    [fetchWorkflows]
  );

  const handleViewExecutions = useCallback(
    (workflowId: string) => {
      router.push(`/workflows/${workflowId}/executions`);
    },
    [router]
  );

  const handleApprove = useCallback(
    async (approvalId: string, comment?: string) => {
      try {
        await fetch(`/api/workflows/approvals/${approvalId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: true, comment }),
        });
        await fetchApprovals();
      } catch {
        // Handle error silently
      }
    },
    [fetchApprovals]
  );

  const handleReject = useCallback(
    async (approvalId: string, comment?: string) => {
      try {
        await fetch(`/api/workflows/approvals/${approvalId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: false, comment }),
        });
        await fetchApprovals();
      } catch {
        // Handle error silently
      }
    },
    [fetchApprovals]
  );

  const handleWorkflowCreated = useCallback(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return <PageSkeleton />;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* Page Header                                                        */}
      {/* ================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automate multi-step processes with AI-powered decision nodes and
            human-in-the-loop approvals.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Entity Selector */}
          <select
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="">All Entities</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>

          {/* Create Button */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Workflow
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Stats Bar                                                          */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Workflows"
          value={String(stats.activeWorkflows)}
          accent="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          label="Total Workflows"
          value={String(stats.totalWorkflows)}
          accent="gray"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <StatCard
          label="Avg Success Rate"
          value={`${Math.round(stats.avgSuccessRate * 100)}%`}
          accent="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Pending Approvals"
          value={String(stats.pendingApprovals)}
          accent="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* ================================================================= */}
      {/* Tab Bar                                                            */}
      {/* ================================================================= */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const badge =
              tab.key === 'approvals' && stats.pendingApprovals > 0
                ? stats.pendingApprovals
                : null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {badge !== null && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-amber-500 rounded-full">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Tab Content                                                        */}
      {/* ================================================================= */}

      {/* --- All Workflows Tab --- */}
      {activeTab === 'workflows' && (
        <div className="space-y-4">
          {/* Toolbar: Search, Status Filters, View Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workflows..."
                className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-2">
              {STATUS_FILTERS.map((sf) => (
                <button
                  key={sf.key}
                  onClick={() => setStatusFilter(sf.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    statusFilter === sf.key
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-auto shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="List view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Card view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Results count */}
          <div className="text-xs text-gray-500">
            {filteredWorkflows.length} workflow{filteredWorkflows.length !== 1 ? 's' : ''} found
            {statusFilter !== 'ALL' && (
              <span className="ml-1">
                (filtered by {statusFilter.toLowerCase()})
              </span>
            )}
          </div>

          {/* Workflow List / Cards */}
          {viewMode === 'list' ? (
            <WorkflowList
              workflows={filteredWorkflows}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              onViewExecutions={handleViewExecutions}
            />
          ) : hasWorkflowCard ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWorkflows.length === 0 ? (
                <div className="col-span-full text-center py-16">
                  <p className="text-sm text-gray-500">No workflows found</p>
                </div>
              ) : (
                filteredWorkflows.map((wf) => (
                  <WorkflowCard
                    key={wf.id}
                    workflow={{
                      ...wf,
                      lastRun: wf.lastRun
                        ? new Date(wf.lastRun).toISOString()
                        : undefined,
                    }}
                    onEdit={() => handleEdit(wf.id)}
                    onDuplicate={() => handleDuplicate(wf.id)}
                    onTogglePause={() =>
                      handleToggleStatus(
                        wf.id,
                        wf.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
                      )
                    }
                    onDelete={() => handleDelete(wf.id)}
                    onViewHistory={() => handleViewExecutions(wf.id)}
                  />
                ))
              )}
            </div>
          ) : (
            <InlineWorkflowCards
              workflows={filteredWorkflows}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              onViewExecutions={handleViewExecutions}
            />
          )}
        </div>
      )}

      {/* --- Approvals Tab --- */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          {hasEnhancedApproval ? (
            <EnhancedApprovalPanel
              entityId={selectedEntityId || 'default-entity'}
            />
          ) : (
            <ApprovalPanel
              approvals={approvals}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}

          {approvals.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                All caught up!
              </h3>
              <p className="text-sm text-gray-500">
                No pending approvals at this time. Workflows with human-in-the-loop
                approval steps will appear here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* --- Integrations Tab --- */}
      {activeTab === 'integrations' && (
        <div>
          {hasIntegrationsTab ? (
            <IntegrationsTab entityId={selectedEntityId || 'default-entity'} />
          ) : (
            <InlineIntegrationsPlaceholder />
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Create Workflow Modal                                               */}
      {/* ================================================================= */}
      {showCreateModal && (
        hasCreateModal ? (
          <CreateWorkflowModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleWorkflowCreated}
          />
        ) : (
          <InlineCreateWorkflowModal
            entities={entities}
            selectedEntityId={selectedEntityId}
            onClose={() => setShowCreateModal(false)}
            onCreated={handleWorkflowCreated}
          />
        )
      )}
    </div>
  );
}
