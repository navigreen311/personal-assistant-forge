'use client';

import { useState } from 'react';
import type { Project, TaskStatus, ProjectHealth, Task } from '@/shared/types';
import type { ProjectView, BurndownData, VelocityMetrics, ResourceAllocation } from '../types';
import TaskKanbanView from './TaskKanbanView';
import TaskListView from './TaskListView';

interface ProjectDetailViewProps {
  project: Project;
  tasks: Task[];
  health: ProjectHealth;
  completionPercent: number;
  burndown?: BurndownData;
  velocity?: VelocityMetrics;
  resources?: ResourceAllocation[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onPriorityChange: (taskId: string, priority: Task['priority']) => void;
  onBulkAction: (taskIds: string[], action: string, value: string) => void;
}

const HEALTH_BADGE: Record<ProjectHealth, { label: string; class: string }> = {
  GREEN: { label: 'On Track', class: 'bg-green-100 text-green-700' },
  YELLOW: { label: 'Warning', class: 'bg-yellow-100 text-yellow-700' },
  RED: { label: 'At Risk', class: 'bg-red-100 text-red-700' },
};

const VIEW_OPTIONS: { value: ProjectView; label: string }[] = [
  { value: 'KANBAN', label: 'Kanban' },
  { value: 'LIST', label: 'List' },
  { value: 'GANTT', label: 'Gantt' },
  { value: 'TIMELINE', label: 'Timeline' },
];

export default function ProjectDetailView({
  project,
  tasks,
  health,
  completionPercent,
  burndown,
  velocity,
  resources,
  onStatusChange,
  onTaskClick,
  onPriorityChange,
  onBulkAction,
}: ProjectDetailViewProps) {
  const [view, setView] = useState<ProjectView>('KANBAN');

  const milestones = project.milestones ?? [];
  const healthBadge = HEALTH_BADGE[health];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-600 mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 text-xs font-bold rounded-full ${healthBadge.class}`}>
              {healthBadge.label}
            </span>
            <span className="text-sm font-medium text-gray-700">{completionPercent}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${
                health === 'RED' ? 'bg-red-500' :
                health === 'YELLOW' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Milestone tracker */}
      {milestones.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Milestones</h3>
          <div className="relative">
            <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200" />
            <div className="relative flex justify-between">
              {milestones.map((milestone) => {
                const isCompleted = milestone.status === 'DONE';
                const isOverdue = !isCompleted && new Date(milestone.dueDate) < new Date();

                return (
                  <div key={milestone.id} className="flex flex-col items-center z-10">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isOverdue ? 'bg-red-500 text-white' :
                      'bg-white border-2 border-gray-300 text-gray-400'
                    }`}>
                      {isCompleted ? '✓' : '·'}
                    </div>
                    <p className="text-[10px] font-medium text-gray-700 mt-1 text-center max-w-[100px] truncate">
                      {milestone.title}
                    </p>
                    <p className={`text-[9px] ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>
                      {new Date(milestone.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Burndown */}
        {burndown && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-500 mb-2">Burndown</h4>
            <svg viewBox="0 0 200 100" className="w-full h-24">
              {/* Ideal line */}
              <line
                x1="10" y1="10" x2="190" y2="90"
                stroke="#D1D5DB" strokeWidth="1" strokeDasharray="4 2"
              />
              {/* Actual line */}
              {burndown.dataPoints.length > 1 && (
                <polyline
                  points={burndown.dataPoints.map((dp, i) => {
                    const x = 10 + (i / (burndown.dataPoints.length - 1)) * 180;
                    const y = 10 + (1 - dp.actualRemaining / Math.max(burndown.totalTasks, 1)) * 80;
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2"
                />
              )}
            </svg>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{burndown.completedTasks}/{burndown.totalTasks} done</span>
              <span>Target: {new Date(burndown.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        )}

        {/* Velocity */}
        {velocity && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-500 mb-2">Velocity</h4>
            <div className="flex items-end gap-1 h-24">
              {velocity.weeklyData.map((w, i) => {
                const maxCompleted = Math.max(...velocity.weeklyData.map((d) => d.completed), 1);
                const height = (w.completed / maxCompleted) * 80;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className="w-full bg-blue-400 rounded-t"
                      style={{ height: `${Math.max(height, 2)}px` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{velocity.currentVelocity} tasks/wk</span>
              <span className={
                velocity.trend === 'INCREASING' ? 'text-green-600' :
                velocity.trend === 'DECREASING' ? 'text-red-600' : 'text-gray-500'
              }>
                {velocity.trend === 'INCREASING' ? '↑' : velocity.trend === 'DECREASING' ? '↓' : '→'} {velocity.trend.toLowerCase()}
              </span>
            </div>
          </div>
        )}

        {/* Resource allocation */}
        {resources && resources.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-500 mb-2">Resource Allocation</h4>
            <div className="space-y-2">
              {resources.slice(0, 4).map((r) => (
                <div key={r.userId}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-medium text-gray-700 truncate max-w-[100px]">
                      {r.userName}
                    </span>
                    <span className={`text-[10px] font-medium ${r.isOvercommitted ? 'text-red-600' : 'text-gray-500'}`}>
                      {r.utilizationPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        r.isOvercommitted ? 'bg-red-500' :
                        r.utilizationPercent > 80 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(r.utilizationPercent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* View switcher + Tasks */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded ${
                view === opt.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {view === 'KANBAN' && (
            <TaskKanbanView
              tasks={tasks}
              onStatusChange={onStatusChange}
              onTaskClick={onTaskClick}
            />
          )}
          {view === 'LIST' && (
            <TaskListView
              tasks={tasks}
              onTaskClick={onTaskClick}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
              onBulkAction={onBulkAction}
            />
          )}
          {view === 'GANTT' && (
            <div className="py-12 text-center text-gray-400 text-sm">
              Gantt view coming soon
            </div>
          )}
          {view === 'TIMELINE' && (
            <div className="py-12 text-center text-gray-400 text-sm">
              Timeline view coming soon
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
