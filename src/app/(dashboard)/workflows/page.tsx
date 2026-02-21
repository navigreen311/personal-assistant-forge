'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import WorkflowList from '@/modules/workflows/components/WorkflowList';
import type { Workflow } from '@/shared/types';

// ============================================================================
// Workflow List Page — Main view for all workflows with stats
// ============================================================================

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);

  // In production, this would come from auth context
  const entityId = 'default-entity';

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/workflows?entityId=${entityId}&page=1&pageSize=50`
      );
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.data ?? []);
      }
    } catch {
      // Handle error silently in UI
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleEdit = useCallback(
    (workflowId: string) => {
      router.push(`/workflows/${workflowId}`);
    },
    [router]
  );

  const handleDuplicate = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (workflowId: string) => {
      try {
        await fetch(`/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `Copy of workflow`,
            entityId,
            graph: { nodes: [], edges: [] },
            triggers: [],
          }),
        });
        await fetchWorkflows();
      } catch {
        // Handle error
      }
    },
    [entityId, fetchWorkflows]
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
        // Handle error
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
        // Handle error
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

  const handleCreate = useCallback(() => {
    router.push(`/workflows/new`);
  }, [router]);

  // Stats
  const activeCount = workflows.filter((wf) => wf.status === 'ACTIVE').length;
  const avgSuccessRate =
    workflows.length > 0
      ? workflows.reduce((sum, wf) => sum + wf.successRate, 0) / workflows.length
      : 0;

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Workflows" value={String(activeCount)} />
        <StatCard label="Total Workflows" value={String(workflows.length)} />
        <StatCard label="Avg Success Rate" value={`${Math.round(avgSuccessRate * 100)}%`} />
        <StatCard label="Pending Approvals" value="0" />
      </div>

      {/* Create Button */}
      <div className="flex justify-end">
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          Create Workflow
        </button>
      </div>

      {/* Workflow List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading workflows...</div>
      ) : (
        <WorkflowList
          workflows={workflows}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDelete}
          onViewExecutions={handleViewExecutions}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
