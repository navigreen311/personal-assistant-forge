'use client';

import React, { useState, useEffect, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { WorkflowGraph, WorkflowNode, WorkflowExecution } from '@/modules/workflows/types';
import type { Workflow } from '@/shared/types';

// ============================================================================
// Workflow Builder Page — Visual editor with designer, palette, config & history
// Dynamic route: /workflows/[id]
// ============================================================================

// --- Dynamic imports (ssr: false for canvas/drag-drop components) ---

const WorkflowDesigner = dynamic(
  () => import('@/modules/workflows/components/WorkflowDesigner'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-400">Loading designer...</p>
        </div>
      </div>
    ),
  }
);

const NodePalette = dynamic(
  () => import('@/modules/workflows/components/NodePalette'),
  {
    ssr: false,
    loading: () => (
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    ),
  }
);

const NodeConfigPanel = dynamic(
  () => import('@/modules/workflows/components/NodeConfigPanel'),
  {
    ssr: false,
    loading: () => (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="space-y-4">
          <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    ),
  }
);

// --- Types ---

interface WorkflowBuilderPageProps {
  params: Promise<{ id: string }>;
}

interface ExecutionRow {
  id: string;
  runNumber: number;
  startedAt: string;
  duration: string;
  status: string;
  stepCount: number;
  cost: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SimulateState = 'idle' | 'simulating' | 'done' | 'error';

// --- Helpers ---

function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return 'Never';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(startedAt: Date | string, completedAt?: Date | string): string {
  if (!completedAt) return 'Running...';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  if (diffMs < 60000) return `${(diffMs / 1000).toFixed(1)}s`;
  return `${(diffMs / 60000).toFixed(1)}m`;
}

function executionToRow(exec: WorkflowExecution, index: number): ExecutionRow {
  return {
    id: exec.id,
    runNumber: index + 1,
    startedAt: new Date(exec.startedAt).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    duration: formatDuration(exec.startedAt, exec.completedAt),
    status: exec.status,
    stepCount: exec.stepResults?.length ?? 0,
    cost: '$0.00', // Cost tracking placeholder
  };
}

// --- Status color mappings ---

const WORKFLOW_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-300',
  PAUSED: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
  ARCHIVED: 'bg-red-100 text-red-700 border-red-300',
};

const EXECUTION_STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-gray-100 text-gray-700',
  FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-yellow-100 text-yellow-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  ROLLED_BACK: 'bg-purple-100 text-purple-800',
};

// ============================================================================
// Main Page Component
// ============================================================================

export default function WorkflowBuilderPage({ params }: WorkflowBuilderPageProps) {
  const { id: workflowId } = use(params);
  const router = useRouter();

  // --- Core workflow state ---
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [graph, setGraph] = useState<WorkflowGraph>({ nodes: [], edges: [] });
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowStatus, setWorkflowStatus] = useState<string>('DRAFT');
  const [entityName, setEntityName] = useState<string>('');
  const [lastRunAt, setLastRunAt] = useState<Date | undefined>();

  // --- UI state ---
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [simulateState, setSimulateState] = useState<SimulateState>('idle');
  const [simulationWarnings, setSimulationWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);

  // --- Run history state ---
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // --- Dirty tracking ---
  const [isDirty, setIsDirty] = useState(false);

  const isNew = workflowId === 'new';

  // ---- Data Fetching ----

  const fetchWorkflow = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/workflows/${workflowId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Workflow not found. It may have been deleted.');
        } else {
          setError(`Failed to load workflow (HTTP ${response.status}).`);
        }
        return;
      }

      const data = await response.json();
      if (data.success && data.data) {
        const wf = data.data as Workflow;
        setWorkflow(wf);
        setWorkflowName(wf.name);
        setWorkflowStatus(wf.status);
        setLastRunAt(wf.lastRun ? new Date(wf.lastRun) : undefined);

        // Parse graph from steps field (may be stored as WorkflowGraph)
        if (wf.steps && 'nodes' in (wf.steps as unknown as Record<string, unknown>)) {
          setGraph(wf.steps as unknown as WorkflowGraph);
        }

        // Fetch entity name if entityId is present
        if (wf.entityId) {
          try {
            const entityRes = await fetch(`/api/entities/${wf.entityId}`);
            const entityData = await entityRes.json();
            if (entityData.success && entityData.data) {
              setEntityName(entityData.data.name);
            }
          } catch {
            setEntityName(wf.entityId);
          }
        }
      } else {
        setError(data.error ?? 'Failed to load workflow.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [workflowId, isNew]);

  const fetchExecutions = useCallback(async () => {
    if (isNew) return;
    try {
      setExecutionsLoading(true);
      const response = await fetch(
        `/api/workflows/${workflowId}/executions?page=1&pageSize=20`
      );
      const data = await response.json();
      if (data.success && data.data) {
        // API may return { data: [...] } or just [...]
        const execs = Array.isArray(data.data) ? data.data : (data.data.data ?? []);
        setExecutions(execs);
      }
    } catch {
      // Silently handle -- run history is secondary content
    } finally {
      setExecutionsLoading(false);
    }
  }, [workflowId, isNew]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  useEffect(() => {
    if (historyExpanded && executions.length === 0 && !executionsLoading) {
      fetchExecutions();
    }
  }, [historyExpanded, executions.length, executionsLoading, fetchExecutions]);

  // ---- Graph change handler (tracks dirty state) ----

  const handleGraphChange = useCallback((newGraph: WorkflowGraph) => {
    setGraph(newGraph);
    setIsDirty(true);
  }, []);

  // ---- Node selection / update ----

  const handleNodeSelect = useCallback((node: WorkflowNode | null) => {
    setSelectedNode(node);
  }, []);

  const handleNodeUpdate = useCallback((updatedNode: WorkflowNode) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)),
    }));
    setSelectedNode(updatedNode);
    setIsDirty(true);
  }, []);

  // ---- Save ----

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/workflows' : `/api/workflows/${workflowId}`;

      const body = isNew
        ? {
            name: workflowName,
            entityId: 'default-entity',
            graph,
            triggers: [],
          }
        : { name: workflowName, graph };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        setSaveState('saved');
        setIsDirty(false);

        // Auto-clear "saved" indicator after 2s
        setTimeout(() => setSaveState('idle'), 2000);

        // Redirect if we just created a new workflow
        if (isNew && data.data?.id) {
          router.replace(`/workflows/${data.data.id}`);
        }
      } else {
        setSaveState('error');
        setTimeout(() => setSaveState('idle'), 3000);
      }
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [isNew, workflowId, workflowName, graph, router]);

  // ---- Simulate / Test ----

  const handleSimulate = useCallback(async () => {
    if (isNew) return;
    setSimulateState('simulating');
    setSimulationWarnings([]);
    try {
      const response = await fetch(`/api/workflows/${workflowId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: {} }),
      });
      const data = await response.json();
      if (data.success && data.data) {
        setSimulateState('done');
        setSimulationWarnings(data.data.warnings ?? []);
        setTimeout(() => setSimulateState('idle'), 4000);
      } else {
        setSimulateState('error');
        setTimeout(() => setSimulateState('idle'), 3000);
      }
    } catch {
      setSimulateState('error');
      setTimeout(() => setSimulateState('idle'), 3000);
    }
  }, [workflowId, isNew]);

  // ---- Trigger / Run Now ----

  const handleTrigger = useCallback(async () => {
    if (isNew) return;
    try {
      const response = await fetch(`/api/workflows/${workflowId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'USER', variables: {} }),
      });
      const data = await response.json();
      if (data.success) {
        setLastRunAt(new Date());
        // Refresh executions if history is visible
        if (historyExpanded) {
          fetchExecutions();
        }
      }
    } catch {
      // Handle error silently
    }
  }, [workflowId, isNew, historyExpanded, fetchExecutions]);

  // ---- Toggle workflow status ----

  const handleToggleStatus = useCallback(async () => {
    if (isNew) return;
    const newStatus = workflowStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setWorkflowStatus(newStatus);
    } catch {
      // Handle error
    }
  }, [workflowId, workflowStatus, isNew]);

  // ---- Inline name editing ----

  const handleNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (!workflowName.trim()) {
      setWorkflowName('Untitled Workflow');
    }
    setIsDirty(true);
  }, [workflowName]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
      if (e.key === 'Escape') {
        setWorkflowName(workflow?.name ?? 'Untitled Workflow');
        setIsEditingName(false);
      }
    },
    [workflow?.name]
  );

  // ---- Execution rows for run history table ----

  const executionRows: ExecutionRow[] = useMemo(
    () => executions.map((exec, i) => executionToRow(exec, i)),
    [executions]
  );

  // ---- Save button label & style ----

  const saveButtonLabel = useMemo(() => {
    switch (saveState) {
      case 'saving': return 'Saving...';
      case 'saved': return 'Saved';
      case 'error': return 'Save Failed';
      default: return isDirty ? 'Save *' : 'Save';
    }
  }, [saveState, isDirty]);

  const saveButtonClass = useMemo(() => {
    const base = 'px-4 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50';
    switch (saveState) {
      case 'saved': return `${base} text-white bg-green-600`;
      case 'error': return `${base} text-white bg-red-600`;
      default: return `${base} text-white bg-blue-600 hover:bg-blue-700`;
    }
  }, [saveState]);

  // ---- Test button label ----

  const testButtonLabel = useMemo(() => {
    switch (simulateState) {
      case 'simulating': return 'Testing...';
      case 'done': return 'Test Passed';
      case 'error': return 'Test Failed';
      default: return 'Test';
    }
  }, [simulateState]);

  // ============================================================================
  // Loading State
  // ============================================================================

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        {/* Top bar skeleton */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-5 w-12 bg-gray-200 rounded animate-pulse" />
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Info bar skeleton */}
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-4">
          <div className="h-5 w-24 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
        </div>

        {/* Main area skeleton */}
        <div className="flex-1 flex overflow-hidden">
          <div className="w-64 bg-white border-r border-gray-200 p-4">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-md animate-pulse" />
              ))}
            </div>
          </div>
          <div className="flex-1 bg-gray-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-400">Loading workflow...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Error State
  // ============================================================================

  if (error) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Unable to Load Workflow</h2>
          <p className="text-sm text-gray-600">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push('/workflows')}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Back to Workflows
            </button>
            <button
              onClick={fetchWorkflow}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* ---- Top Bar ---- */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => router.push('/workflows')}
            className="text-sm text-gray-500 hover:text-gray-700 shrink-0 transition-colors"
            title="Back to workflows"
          >
            &larr; Back
          </button>

          {/* Inline-editable workflow name */}
          {isEditingName ? (
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              autoFocus
              className="text-lg font-semibold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent px-1 py-0 min-w-0"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-lg font-semibold text-gray-900 hover:text-blue-700 truncate min-w-0 transition-colors text-left"
              title="Click to rename"
            >
              {workflowName}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className={saveButtonClass}
          >
            {saveButtonLabel}
          </button>

          {/* Test / Simulate */}
          <button
            onClick={handleSimulate}
            disabled={simulateState === 'simulating' || isNew}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
              simulateState === 'done'
                ? 'text-white bg-green-600'
                : simulateState === 'error'
                  ? 'text-white bg-red-600'
                  : 'text-green-700 bg-green-100 hover:bg-green-200'
            }`}
          >
            {testButtonLabel}
          </button>

          {/* Run Now */}
          <button
            onClick={handleTrigger}
            disabled={isNew || workflowStatus !== 'ACTIVE'}
            className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50"
            title={workflowStatus !== 'ACTIVE' ? 'Workflow must be active to run' : 'Run workflow now'}
          >
            Run Now
          </button>
        </div>
      </div>

      {/* ---- Info Bar ---- */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-4 text-sm shrink-0">
        {/* Entity pill */}
        {entityName && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" clipRule="evenodd" />
            </svg>
            {entityName}
          </span>
        )}

        {/* Status badge (clickable to toggle) */}
        <button
          onClick={handleToggleStatus}
          disabled={isNew}
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors disabled:cursor-default ${
            WORKFLOW_STATUS_STYLES[workflowStatus] ?? 'bg-gray-100 text-gray-600 border-gray-300'
          }`}
          title={isNew ? 'Save workflow first' : `Click to ${workflowStatus === 'ACTIVE' ? 'pause' : 'activate'}`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
              workflowStatus === 'ACTIVE' ? 'bg-green-500' : workflowStatus === 'PAUSED' ? 'bg-yellow-500' : 'bg-gray-400'
            }`}
          />
          {workflowStatus}
        </button>

        {/* Last run */}
        <span className="text-gray-500 text-xs">
          Last run: {formatRelativeTime(lastRunAt)}
        </span>

        {/* Node count */}
        <span className="text-gray-400 text-xs ml-auto">
          {graph.nodes.length} node{graph.nodes.length !== 1 ? 's' : ''} &middot; {graph.edges.length} edge{graph.edges.length !== 1 ? 's' : ''}
        </span>

        {/* Dirty indicator */}
        {isDirty && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
      </div>

      {/* ---- Simulation warnings banner ---- */}
      {simulationWarnings.length > 0 && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 shrink-0">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-xs font-medium text-yellow-800">Simulation Warnings</p>
              <ul className="mt-1 space-y-0.5">
                {simulationWarnings.map((warning, i) => (
                  <li key={i} className="text-xs text-yellow-700">{warning}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setSimulationWarnings([])}
              className="text-yellow-600 hover:text-yellow-800 text-sm leading-none"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* ---- Main Content: Palette + Designer + Config ---- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette (left sidebar) */}
        <NodePalette />

        {/* Designer Canvas (center) */}
        <div className="flex-1 relative flex flex-col min-w-0">
          <div className="flex-1 relative">
            <WorkflowDesigner
              graph={graph}
              onChange={handleGraphChange}
              onNodeSelect={handleNodeSelect}
              selectedNodeId={selectedNode?.id ?? null}
            />
          </div>

          {/* ---- Run History (bottom collapsible) ---- */}
          <div className="shrink-0 border-t border-gray-200 bg-white">
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 transition-transform ${historyExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Run History
                {executions.length > 0 && (
                  <span className="text-xs text-gray-400 font-normal">
                    ({executions.length} run{executions.length !== 1 ? 's' : ''})
                  </span>
                )}
              </span>
              {executionsLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              )}
            </button>

            {historyExpanded && (
              <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                {executionsLoading && executions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Loading run history...
                  </div>
                ) : executions.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    No runs yet. Use &quot;Run Now&quot; or &quot;Test&quot; to execute this workflow.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Run #</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Steps</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {executionRows.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2 text-gray-900 font-medium">#{row.runNumber}</td>
                          <td className="px-4 py-2 text-gray-600">{row.startedAt}</td>
                          <td className="px-4 py-2 text-gray-600">{row.duration}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                EXECUTION_STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-600">{row.stepCount}</td>
                          <td className="px-4 py-2 text-gray-600">{row.cost}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => router.push(`/workflows/${workflowId}/executions`)}
                              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                            >
                              View log
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Refresh + View All bar */}
                {executions.length > 0 && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={fetchExecutions}
                      disabled={executionsLoading}
                      className="text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={() => router.push(`/workflows/${workflowId}/executions`)}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      View all executions &rarr;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Config Panel (right sidebar, when node selected) */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
