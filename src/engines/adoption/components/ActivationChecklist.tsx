'use client';

import { useState } from 'react';
import type { ActivationChecklist as ChecklistType } from '../types';

interface Props {
  checklist: ChecklistType;
}

export default function ActivationChecklist({ checklist }: Props) {
  const [expandedPhase, setExpandedPhase] = useState<string | null>(
    checklist.phases.find(p => p.status === 'IN_PROGRESS')?.name ?? checklist.phases[0]?.name ?? null
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">30-Day Activation Journey</h2>
        <span className="text-sm font-medium text-gray-500">Day {checklist.currentDay}/30</span>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Overall Progress</span>
          <span>{checklist.overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${checklist.overallProgress}%` }}
          />
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-3">
        {checklist.phases.map((phase) => {
          const isExpanded = expandedPhase === phase.name;
          const completedCount = phase.tasks.filter(t => t.isComplete).length;

          return (
            <div key={phase.name} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedPhase(isExpanded ? null : phase.name)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    phase.status === 'COMPLETE' ? 'bg-green-500' :
                    phase.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                    'bg-gray-300'
                  }`} />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{phase.name}</p>
                    <p className="text-xs text-gray-500">Days {phase.dayRange[0]}-{phase.dayRange[1]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{completedCount}/{phase.tasks.length}</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 p-4 space-y-3">
                  {phase.tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center ${
                        task.isComplete ? 'bg-green-100 text-green-600' : 'border border-gray-300'
                      }`}>
                        {task.isComplete && (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${task.isComplete ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {task.title}
                          </p>
                          {task.isAhaMoment && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">Key Moment</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
