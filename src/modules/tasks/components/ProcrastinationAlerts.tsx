'use client';

import { useState } from 'react';
import type { ProcrastinationAlert } from '../types';

interface ProcrastinationAlertsProps {
  alerts: ProcrastinationAlert[];
  onBreakDown: (taskId: string) => void;
  onDelegate: (taskId: string) => void;
  onEliminate: (taskId: string) => void;
  onScheduleNow: (taskId: string) => void;
  onDismiss: (taskId: string) => void;
}

const SUGGESTION_CONFIG: Record<ProcrastinationAlert['suggestion'], { icon: string; label: string; color: string }> = {
  BREAK_DOWN: { icon: '✂️', label: 'Break Down', color: 'bg-blue-600 hover:bg-blue-700' },
  DELEGATE: { icon: '👤', label: 'Delegate', color: 'bg-purple-600 hover:bg-purple-700' },
  ELIMINATE: { icon: '🗑', label: 'Eliminate', color: 'bg-red-600 hover:bg-red-700' },
  SCHEDULE_NOW: { icon: '📅', label: 'Schedule Now', color: 'bg-green-600 hover:bg-green-700' },
};

export default function ProcrastinationAlerts({
  alerts,
  onBreakDown,
  onDelegate,
  onEliminate,
  onScheduleNow,
  onDismiss,
}: ProcrastinationAlertsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.taskId));

  if (visibleAlerts.length === 0) return null;

  const handleDismiss = (taskId: string) => {
    setDismissed((prev) => new Set(prev).add(taskId));
    onDismiss(taskId);
  };

  const handleAction = (alert: ProcrastinationAlert) => {
    switch (alert.suggestion) {
      case 'BREAK_DOWN': onBreakDown(alert.taskId); break;
      case 'DELEGATE': onDelegate(alert.taskId); break;
      case 'ELIMINATE': onEliminate(alert.taskId); break;
      case 'SCHEDULE_NOW': onScheduleNow(alert.taskId); break;
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <h4 className="text-sm font-semibold text-amber-800">
            Procrastination Alerts ({visibleAlerts.length})
          </h4>
        </div>
      </div>

      <div className="divide-y divide-amber-200">
        {visibleAlerts.map((alert) => {
          const config = SUGGESTION_CONFIG[alert.suggestion];
          return (
            <div key={alert.taskId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-medium text-gray-900 truncate">
                    {alert.taskTitle}
                  </h5>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {alert.deferrals > 0 && (
                      <span>Deferred {alert.deferrals}x</span>
                    )}
                    <span>{alert.daysSinceCreation} days old</span>
                    {alert.currentDueDate && (
                      <span>Due: {new Date(alert.currentDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    )}
                  </div>
                  <p className="text-xs text-amber-700 mt-1.5">{alert.reason}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => handleAction(alert)}
                      className={`px-3 py-1 text-xs font-medium text-white rounded ${config.color}`}
                    >
                      {config.icon} {config.label}
                    </button>
                    <button
                      onClick={() => handleDismiss(alert.taskId)}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
