'use client';

import type { DailyTop3 as DailyTop3Type } from '../types';

interface DailyTop3Props {
  data: DailyTop3Type;
  onStartWorking: (taskId: string) => void;
  onDismiss: (taskId: string) => void;
}

const RANK_COLORS = [
  'bg-yellow-500 text-white',
  'bg-gray-400 text-white',
  'bg-orange-600 text-white',
];

export default function DailyTop3({
  data,
  onStartWorking,
  onDismiss,
}: DailyTop3Props) {
  const formatDate = (date: Date) =>
    new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  const formatDuration = (minutes?: number) => {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  if (data.tasks.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-500 text-sm">No prioritized tasks for today</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Today&apos;s Top 3</h3>
          <span className="text-xs text-blue-200">{formatDate(data.date)}</span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {data.tasks.map((item, idx) => (
          <div key={item.task.id} className="px-5 py-4">
            <div className="flex items-start gap-3">
              {/* Rank */}
              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${RANK_COLORS[idx]}`}>
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                {/* Task title & score */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-gray-900 truncate">
                    {item.task.title}
                  </h4>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0">
                    {item.score.overallScore}/100
                  </span>
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    item.task.priority === 'P0' ? 'bg-red-100 text-red-700' :
                    item.task.priority === 'P1' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {item.task.priority}
                  </span>

                  {item.task.dueDate && (
                    <span className={`text-[11px] ${
                      new Date(item.task.dueDate) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'
                    }`}>
                      Due: {new Date(item.task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}

                  {item.estimatedDuration && (
                    <span className="text-[11px] text-gray-400">
                      ~{formatDuration(item.estimatedDuration)}
                    </span>
                  )}
                </div>

                {/* Reasoning */}
                <p className="text-xs text-gray-500 mt-1.5">
                  {item.score.recommendation}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onStartWorking(item.task.id)}
                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Start Working
                  </button>
                  <button
                    onClick={() => onDismiss(item.task.id)}
                    className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {data.reasoning && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500 whitespace-pre-line">{data.reasoning}</p>
        </div>
      )}
    </div>
  );
}
