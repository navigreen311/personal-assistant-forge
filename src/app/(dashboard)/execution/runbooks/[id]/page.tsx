'use client';

import { useState, useEffect, useCallback, use } from 'react';
import RunbookEditor from '@/modules/execution/components/RunbookEditor';
import RunbookExecutionView from '@/modules/execution/components/RunbookExecutionView';
import type { Runbook, RunbookExecution } from '@/modules/execution/types';

interface RunbookDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function RunbookDetailPage({ params }: RunbookDetailPageProps) {
  const { id } = use(params);
  const [runbook, setRunbook] = useState<Runbook | null>(null);
  const [executions, setExecutions] = useState<RunbookExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRunbook = useCallback(async () => {
    try {
      const [runbookRes, executionsRes] = await Promise.all([
        fetch(`/api/execution/runbooks/${id}`),
        fetch(`/api/execution/runbooks/${id}/executions`),
      ]);

      if (runbookRes.ok) {
        const json = await runbookRes.json();
        setRunbook(json.data);
      }
      if (executionsRes.ok) {
        const json = await executionsRes.json();
        setExecutions(json.data ?? []);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRunbook();
  }, [fetchRunbook]);

  async function handleSave(updated: Runbook) {
    try {
      await fetch(`/api/execution/runbooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      await fetchRunbook();
    } catch {
      // Error handling
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading runbook...
      </div>
    );
  }

  if (!runbook) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Runbook not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {runbook.name}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {runbook.description}
        </p>
      </div>

      <RunbookEditor
        runbook={runbook}
        entityId={runbook.entityId}
        onSave={handleSave}
      />

      {executions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Execution History
          </h3>
          {executions.map((execution) => (
            <div
              key={execution.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
            >
              <RunbookExecutionView execution={execution} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
