'use client';

import { useState, useEffect, use } from 'react';
import type { Task } from '@/shared/types';
import type { TaskContext, DependencyGraph } from '@/modules/tasks/types';
import TaskDetailPanel from '@/modules/tasks/components/TaskDetailPanel';
import DependencyGraphView from '@/modules/tasks/components/DependencyGraphView';

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

export default function TaskPage({ params }: TaskPageProps) {
  const { id } = use(params);
  const [task, setTask] = useState<Task | null>(null);
  const [context] = useState<TaskContext | undefined>();
  const [depGraph, setDepGraph] = useState<DependencyGraph | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        const json = await res.json();
        if (json.success) {
          setTask(json.data);

          // Fetch dependency graph if task has a project
          if (json.data.projectId) {
            const depRes = await fetch(`/api/tasks/dependencies?projectId=${json.data.projectId}`);
            const depJson = await depRes.json();
            if (depJson.success) setDepGraph(depJson.data);
          }
        }
      } catch {
        // Handle error
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const handleUpdate = async (updates: Partial<Task>) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    // Refetch task
    const res = await fetch(`/api/tasks/${id}`);
    const json = await res.json();
    if (json.success) setTask(json.data);
  };

  const handleDelete = async () => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    window.history.back();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">Task not found</p>
      </div>
    );
  }

  // Filter dependency graph to show immediate neighbors only
  const filteredGraph = depGraph
    ? {
        ...depGraph,
        nodes: depGraph.nodes.filter(
          (n) =>
            n.taskId === id ||
            depGraph.edges.some(
              (e) =>
                (e.fromTaskId === id && e.toTaskId === n.taskId) ||
                (e.toTaskId === id && e.fromTaskId === n.taskId)
            )
        ),
        edges: depGraph.edges.filter(
          (e) => e.fromTaskId === id || e.toTaskId === id
        ),
      }
    : null;

  return (
    <div className="space-y-6">
      <TaskDetailPanel
        task={task}
        context={context}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        isSlideOut={false}
      />

      {/* Dependency sub-graph */}
      {filteredGraph && filteredGraph.nodes.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Dependencies</h3>
          <DependencyGraphView
            tasks={filteredGraph?.nodes?.map((n: { taskId: string; taskTitle: string; status: string; priority: string; dueDate?: Date }) => ({
              id: n.taskId,
              title: n.taskTitle,
              status: n.status as Task['status'],
              priority: n.priority as Task['priority'],
              entityId: '',
              dependencies: [] as string[],
              tags: [] as string[],
              dueDate: n.dueDate,
              createdAt: new Date(),
              updatedAt: new Date(),
            })) ?? []}
            onTaskClick={(t) => {
              if (t.id !== id) {
                window.location.href = `/tasks/${t.id}`;
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
