'use client';

import { useState, useEffect, use } from 'react';
import type { Project, Task, TaskStatus, Priority, ProjectHealth } from '@/shared/types';
import type { BurndownData, VelocityMetrics, ResourceAllocation } from '@/modules/tasks/types';
import ProjectDetailView from '@/modules/tasks/components/ProjectDetailView';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const [project] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [health] = useState<ProjectHealth>('GREEN');
  const [completionPercent, setCompletionPercent] = useState(0);
  const [burndown] = useState<BurndownData | undefined>();
  const [velocity] = useState<VelocityMetrics | undefined>();
  const [resources] = useState<ResourceAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch tasks for this project
        const tasksRes = await fetch(`/api/tasks?projectId=${id}`);
        const tasksJson = await tasksRes.json();
        if (tasksJson.success) {
          setTasks(tasksJson.data);

          // Calculate completion
          const total = tasksJson.data.length;
          const done = tasksJson.data.filter((t: Task) => t.status === 'DONE').length;
          setCompletionPercent(total > 0 ? Math.round((done / total) * 100) : 0);
        }

        // Fetch burndown data
        const burndownRes = await fetch(`/api/tasks/forecast?projectId=${id}`);
        const burndownJson = await burndownRes.json();
        if (burndownJson.success) {
          // Use forecast data
        }
      } catch {
        // Handle error
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    // Refetch tasks
    const res = await fetch(`/api/tasks?projectId=${id}`);
    const json = await res.json();
    if (json.success) setTasks(json.data);
  };

  const handlePriorityChange = async (taskId: string, priority: Priority) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    const res = await fetch(`/api/tasks?projectId=${id}`);
    const json = await res.json();
    if (json.success) setTasks(json.data);
  };

  const handleBulkAction = async (taskIds: string[], action: string, value: string) => {
    const updates: Record<string, string> = {};
    updates[action] = value;
    await fetch('/api/tasks/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds, updates }),
    });
    const res = await fetch(`/api/tasks?projectId=${id}`);
    const json = await res.json();
    if (json.success) setTasks(json.data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project && tasks.length === 0) {
    // Create a placeholder project from the tasks data
    const placeholder: Project = {
      id,
      name: 'Project',
      entityId: '',
      milestones: [],
      status: 'IN_PROGRESS',
      health: 'GREEN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ProjectDetailView
          project={project ?? placeholder}
          tasks={tasks}
          health={health}
          completionPercent={completionPercent}
          burndown={burndown}
          velocity={velocity}
          resources={resources}
          onStatusChange={handleStatusChange}
          onTaskClick={() => {}}
          onPriorityChange={handlePriorityChange}
          onBulkAction={handleBulkAction}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <ProjectDetailView
        project={project!}
        tasks={tasks}
        health={health}
        completionPercent={completionPercent}
        burndown={burndown}
        velocity={velocity}
        resources={resources}
        onStatusChange={handleStatusChange}
        onTaskClick={() => {}}
        onPriorityChange={handlePriorityChange}
        onBulkAction={handleBulkAction}
      />
    </div>
  );
}
