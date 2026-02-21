'use client';

import Link from 'next/link';

interface QuickStatsProps {
  stats: {
    openTasks: number;
    overdueTasks: number;
    meetingsToday: number;
    unreadMessages: number;
    focusTimeToday: number;
    focusTimeGoal: number;
    completedToday: number;
  };
}

export default function QuickStats({ stats }: QuickStatsProps) {
  const focusPercent =
    stats.focusTimeGoal > 0
      ? Math.min(100, Math.round((stats.focusTimeToday / stats.focusTimeGoal) * 100))
      : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Quick Stats</h2>

      <div className="grid grid-cols-2 gap-3">
        {/* 1. Open Tasks */}
        <Link
          href="/tasks"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Open Tasks</span>
          <span className="text-xl font-bold text-gray-900">{stats.openTasks}</span>
        </Link>

        {/* 2. Overdue */}
        <Link
          href="/tasks?status=overdue"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Overdue</span>
          <span className={`text-xl font-bold ${stats.overdueTasks > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.overdueTasks}
          </span>
        </Link>

        {/* 3. Meetings Today */}
        <Link
          href="/calendar"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Meetings Today</span>
          <span className="text-xl font-bold text-gray-900">{stats.meetingsToday}</span>
        </Link>

        {/* 4. Unread Messages */}
        <Link
          href="/inbox"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Unread Messages</span>
          <span className="text-xl font-bold text-gray-900">{stats.unreadMessages}</span>
        </Link>

        {/* 5. Focus Time (with progress bar) */}
        <Link
          href="/calendar"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-2 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Focus Time</span>
          <span className="text-xl font-bold text-gray-900">
            {stats.focusTimeToday}h / {stats.focusTimeGoal}h
          </span>
          <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${focusPercent}%` }}
            />
          </div>
        </Link>

        {/* 6. Completed Today */}
        <Link
          href="/tasks"
          className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1 hover:bg-gray-100 transition"
        >
          <span className="text-xs text-gray-500 uppercase tracking-wide">Completed Today</span>
          <span className="text-xl font-bold text-green-600">{stats.completedToday}</span>
        </Link>
      </div>
    </div>
  );
}
