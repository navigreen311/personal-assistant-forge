'use client';

import { useState, useEffect, useCallback } from 'react';
import RunbookEditor from '@/modules/execution/components/RunbookEditor';
import RunbookExecutionView from '@/modules/execution/components/RunbookExecutionView';
import type { Runbook, RunbookExecution } from '@/modules/execution/types';

export default function RunbooksPage() {
  const entityId = 'default-entity';
  const [runbooks, setRunbooks] = useState<Runbook[]>([]);
  const [activeExecutions, setActiveExecutions] = useState<RunbookExecution[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingRunbook, setEditingRunbook] = useState<Runbook | undefined>();
  const [loading, setLoading] = useState(true);

  const fetchRunbooks = useCallback(async () => {
    try {
      const res = await fetch(`/api/execution/runbooks?entityId=${entityId}`);
      if (res.ok) {
        const json = await res.json();
        setRunbooks(json.data ?? []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchRunbooks();
  }, [fetchRunbooks]);

  async function handleSave(runbook: Runbook) {
    try {
      if (editingRunbook) {
        await fetch(`/api/execution/runbooks/${runbook.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(runbook),
        });
      } else {
        await fetch('/api/execution/runbooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: runbook.name,
            description: runbook.description,
            entityId,
            steps: runbook.steps,
            tags: runbook.tags,
            isActive: runbook.isActive,
            createdBy: 'current-user',
            schedule: runbook.schedule,
          }),
        });
      }
      setShowEditor(false);
      setEditingRunbook(undefined);
      await fetchRunbooks();
    } catch {
      // Error handling
    }
  }

  async function handleExecute(runbookId: string) {
    try {
      const res = await fetch(`/api/execution/runbooks/${runbookId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'current-user' }),
      });
      if (res.ok) {
        const json = await res.json();
        setActiveExecutions((prev) => [json.data, ...prev]);
      }
    } catch {
      // Error handling
    }
  }

  async function handleDelete(runbookId: string) {
    try {
      await fetch(`/api/execution/runbooks/${runbookId}`, { method: 'DELETE' });
      await fetchRunbooks();
    } catch {
      // Error handling
    }
  }

  if (showEditor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {editingRunbook ? 'Edit Runbook' : 'Create Runbook'}
          </h2>
        </div>
        <RunbookEditor
          runbook={editingRunbook}
          entityId={entityId}
          onSave={handleSave}
          onCancel={() => {
            setShowEditor(false);
            setEditingRunbook(undefined);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Runbooks
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Automate multi-step workflows with approval gates and blast radius controls.
          </p>
        </div>
        <button
          onClick={() => setShowEditor(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Runbook
        </button>
      </div>

      {/* Active Executions */}
      {activeExecutions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Active Executions
          </h3>
          {activeExecutions.map((execution) => (
            <div
              key={execution.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
            >
              <RunbookExecutionView execution={execution} />
            </div>
          ))}
        </div>
      )}

      {/* Runbook List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading runbooks...</div>
      ) : runbooks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            No runbooks yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {runbooks.map((runbook) => (
            <div
              key={runbook.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {runbook.name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {runbook.description}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                    runbook.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {runbook.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                <span>{runbook.steps.length} steps</span>
                {runbook.schedule && <span>Scheduled</span>}
                {runbook.lastRunStatus && (
                  <span
                    className={
                      runbook.lastRunStatus === 'SUCCESS'
                        ? 'text-green-600'
                        : runbook.lastRunStatus === 'FAILED'
                          ? 'text-red-600'
                          : 'text-yellow-600'
                    }
                  >
                    Last: {runbook.lastRunStatus}
                  </span>
                )}
              </div>

              {runbook.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {runbook.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center space-x-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => handleExecute(runbook.id)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                >
                  Run
                </button>
                <button
                  onClick={() => {
                    setEditingRunbook(runbook);
                    setShowEditor(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(runbook.id)}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
