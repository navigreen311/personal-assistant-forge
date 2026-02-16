'use client';

import React, { useState, useCallback } from 'react';
import type { Workflow } from '@/shared/types';

// ============================================================================
// Workflow List — Table of all workflows with filters and actions
// ============================================================================

interface WorkflowListProps {
  workflows: Workflow[];
  onEdit: (workflowId: string) => void;
  onDuplicate: (workflowId: string) => void;
  onToggleStatus: (workflowId: string, newStatus: string) => void;
  onDelete: (workflowId: string) => void;
  onViewExecutions: (workflowId: string) => void;
}

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  DRAFT: 'bg-gray-100 text-gray-800',
  ARCHIVED: 'bg-red-100 text-red-800',
};

const TRIGGER_ICONS: Record<string, string> = {
  TIME: '\u23F0',
  EVENT: '\u26A1',
  CONDITION: '\u2B29',
  MANUAL: '\u270B',
  VOICE: '\uD83C\uDF99',
};

export default function WorkflowList({
  workflows,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete,
  onViewExecutions,
}: WorkflowListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkflows = workflows.filter((wf) => {
    const matchesStatus = !statusFilter || wf.status === statusFilter;
    const matchesSearch =
      !searchQuery || wf.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleToggle = useCallback(
    (wf: Workflow) => {
      const newStatus = wf.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      onToggleStatus(wf.id, newStatus);
    },
    [onToggleStatus]
  );

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 flex items-center gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full max-w-sm px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {['', 'ACTIVE', 'PAUSED', 'DRAFT', 'ARCHIVED'].map((status) => (
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Trigger</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Last Run</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Success Rate
              </th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkflows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No workflows found
                </td>
              </tr>
            ) : (
              filteredWorkflows.map((wf) => (
                <tr
                  key={wf.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{wf.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        STATUS_BADGES[wf.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {wf.triggers.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 mr-2">
                        <span>{TRIGGER_ICONS[t.type] ?? ''}</span>
                        <span className="text-gray-600">{t.type}</span>
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {wf.lastRun
                      ? new Date(wf.lastRun).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${wf.successRate * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">
                        {Math.round(wf.successRate * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(wf.id)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDuplicate(wf.id)}
                        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        title="Duplicate"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleToggle(wf)}
                        className="px-2 py-1 text-xs text-yellow-600 hover:bg-yellow-50 rounded"
                        title={wf.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                      >
                        {wf.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => onViewExecutions(wf.id)}
                        className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                        title="View Executions"
                      >
                        Runs
                      </button>
                      <button
                        onClick={() => onDelete(wf.id)}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                        title="Archive"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
