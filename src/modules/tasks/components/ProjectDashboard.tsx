'use client';

import { useState } from 'react';
import type { Project, TaskStatus, ProjectHealth } from '@/shared/types';

interface ProjectSummary {
  project: Project;
  taskCounts: Record<TaskStatus, number>;
  completionPercent: number;
  health: ProjectHealth;
}

interface ProjectDashboardProps {
  projects: ProjectSummary[];
  onProjectClick: (projectId: string) => void;
  onCreateProject?: () => void;
  entityFilter?: string;
}

type SortKey = 'health' | 'completion' | 'name' | 'updated';

const HEALTH_CONFIG: Record<ProjectHealth, { label: string; color: string; bg: string; order: number }> = {
  RED: { label: 'At Risk', color: 'text-red-700', bg: 'bg-red-100', order: 0 },
  YELLOW: { label: 'Warning', color: 'text-yellow-700', bg: 'bg-yellow-100', order: 1 },
  GREEN: { label: 'On Track', color: 'text-green-700', bg: 'bg-green-100', order: 2 },
};

export default function ProjectDashboard({
  projects,
  onProjectClick,
  onCreateProject,
}: ProjectDashboardProps) {
  const [sortBy, setSortBy] = useState<SortKey>('health');

  const sortedProjects = [...projects].sort((a, b) => {
    switch (sortBy) {
      case 'health':
        return HEALTH_CONFIG[a.health].order - HEALTH_CONFIG[b.health].order;
      case 'completion':
        return b.completionPercent - a.completionPercent;
      case 'name':
        return a.project.name.localeCompare(b.project.name);
      case 'updated':
        return new Date(b.project.updatedAt).getTime() - new Date(a.project.updatedAt).getTime();
      default:
        return 0;
    }
  });

  const totalTasks = (counts: Record<TaskStatus, number>) =>
    Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">Projects</h2>
          <span className="text-sm text-gray-500">({projects.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1"
          >
            <option value="health">Sort: Health</option>
            <option value="completion">Sort: Completion</option>
            <option value="name">Sort: Name</option>
            <option value="updated">Sort: Last Updated</option>
          </select>
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              New Project
            </button>
          )}
        </div>
      </div>

      {/* Project cards */}
      {sortedProjects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No projects yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedProjects.map((item) => {
            const { project, taskCounts, completionPercent, health } = item;
            const healthConfig = HEALTH_CONFIG[health];
            const total = totalTasks(taskCounts);
            const nextMilestone = (project.milestones ?? []).find(
              (m) => m.status !== 'DONE'
            );

            return (
              <div
                key={project.id}
                onClick={() => onProjectClick(project.id)}
                className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">
                    {project.name}
                  </h3>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${healthConfig.bg} ${healthConfig.color}`}>
                    {healthConfig.label}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Completion</span>
                    <span className="text-xs font-medium text-gray-700">{completionPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        health === 'RED' ? 'bg-red-500' :
                        health === 'YELLOW' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                </div>

                {/* Task counts */}
                <div className="flex items-center gap-2 mb-3 text-[10px]">
                  <span className="text-gray-500">{total} tasks</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-green-600">{taskCounts.DONE} done</span>
                  <span className="text-blue-600">{taskCounts.IN_PROGRESS} active</span>
                  {taskCounts.BLOCKED > 0 && (
                    <span className="text-red-600">{taskCounts.BLOCKED} blocked</span>
                  )}
                </div>

                {/* Next milestone */}
                {nextMilestone && (
                  <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
                    Next: <span className="font-medium">{nextMilestone.title}</span>
                    <span className="ml-1 text-gray-400">
                      ({new Date(nextMilestone.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                    </span>
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
