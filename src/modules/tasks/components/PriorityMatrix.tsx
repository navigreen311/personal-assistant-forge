'use client';

import { useState } from 'react';
import type { Task } from '@/shared/types';
import type { PrioritizationScore, EisenhowerQuadrant } from '../types';

interface PriorityMatrixProps {
  scores: PrioritizationScore[];
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onQuadrantChange?: (taskId: string, quadrant: EisenhowerQuadrant) => void;
}

const QUADRANT_CONFIG: Record<EisenhowerQuadrant, { label: string; color: string; bg: string; position: string }> = {
  DO_FIRST: { label: 'Do First', color: 'text-red-700', bg: 'bg-red-50 border-red-200', position: 'col-start-1 row-start-1' },
  SCHEDULE: { label: 'Schedule', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', position: 'col-start-2 row-start-1' },
  DELEGATE: { label: 'Delegate', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', position: 'col-start-1 row-start-2' },
  ELIMINATE: { label: 'Eliminate', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', position: 'col-start-2 row-start-2' },
};

export default function PriorityMatrix({
  scores,
  tasks,
  onTaskClick,
}: PriorityMatrixProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const tasksByQuadrant = (quadrant: EisenhowerQuadrant) =>
    scores
      .filter((s) => s.quadrant === quadrant)
      .map((s) => {
        const task = tasks.find((t) => t.id === s.taskId);
        return task ? { task, score: s } : null;
      })
      .filter((item): item is { task: Task; score: PrioritizationScore } => item !== null);

  return (
    <div>
      {/* Axis labels */}
      <div className="flex items-center justify-center mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Urgent ← → Not Urgent
        </span>
      </div>

      <div className="flex">
        <div className="flex flex-col items-center justify-center mr-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider writing-mode-vertical"
            style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
            Important ↑ ↓ Not Important
          </span>
        </div>

        <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1">
          {(Object.entries(QUADRANT_CONFIG) as [EisenhowerQuadrant, typeof QUADRANT_CONFIG[EisenhowerQuadrant]][]).map(
            ([quadrant, config]) => {
              const items = tasksByQuadrant(quadrant);
              return (
                <div
                  key={quadrant}
                  className={`${config.position} ${config.bg} border rounded-lg p-3 min-h-[200px]`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggedTaskId) setDraggedTaskId(null);
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-sm font-bold ${config.color}`}>{config.label}</h4>
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>

                  <div className="space-y-2">
                    {items.map(({ task, score }) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDraggedTaskId(task.id)}
                        onClick={() => onTaskClick(task)}
                        className="bg-white rounded-md p-2 border border-gray-200 cursor-pointer hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium text-gray-800 line-clamp-2">
                            {task.title}
                          </p>
                          <span className="text-[10px] font-bold text-gray-500 flex-shrink-0">
                            {score.overallScore}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`px-1 py-0.5 text-[9px] font-bold rounded ${
                            task.priority === 'P0' ? 'bg-red-100 text-red-700' :
                            task.priority === 'P1' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {task.priority}
                          </span>
                          {task.dueDate && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {items.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">No tasks</p>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
