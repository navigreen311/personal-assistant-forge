'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ExecutionTimeline from '@/modules/workflows/components/ExecutionTimeline';
import type { WorkflowExecution } from '@/modules/workflows/types';

// ============================================================================
// Execution History Page — List of executions with detail view
// ============================================================================

export default function ExecutionHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const workflowId = params.id as string;

  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchExecutions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/workflows/${workflowId}/executions?page=1&pageSize=50`
      );
      const data = await response.json();
      if (data.success && data.data) {
        setExecutions(data.data.data ?? []);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const filteredExecutions = executions.filter(
    (exec) => !statusFilter || exec.status === statusFilter
  );

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      COMPLETED: 'bg-green-100 text-green-800',
      RUNNING: 'bg-blue-100 text-blue-800',
      PAUSED: 'bg-yellow-100 text-yellow-800',
      FAILED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
      PENDING: 'bg-gray-100 text-gray-600',
      ROLLED_BACK: 'bg-orange-100 text-orange-800',
    };
    return colors[status] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/workflows/${workflowId}`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Designer
          </button>
          <h2 className="text-lg font-semibold text-gray-900">Execution History</h2>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {['', 'COMPLETED', 'RUNNING', 'FAILED', 'PAUSED', 'CANCELLED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === status
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Execution List */}
        <div className="col-span-1 bg-white rounded-lg shadow overflow-y-auto max-h-[calc(100vh-16rem)]">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredExecutions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No executions found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredExecutions.map((exec) => (
                <button
                  key={exec.id}
                  onClick={() => setSelectedExecution(exec)}
                  className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                    selectedExecution?.id === exec.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {exec.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(
                        exec.status
                      )}`}
                    >
                      {exec.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{exec.triggerType}</span>
                    <span>&middot;</span>
                    <span>{new Date(exec.startedAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {exec.stepResults.length} step(s)
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Execution Detail */}
        <div className="col-span-2">
          {selectedExecution ? (
            <ExecutionTimeline execution={selectedExecution} />
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-sm text-gray-500">
                Select an execution to view its timeline
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
