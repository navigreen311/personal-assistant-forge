'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TasksLayoutProps {
  children: React.ReactNode;
}

const TABS = [
  { label: 'Tasks', href: '/tasks' },
  { label: 'Priority Matrix', href: '/tasks?view=matrix' },
  { label: 'Dependencies', href: '/tasks?view=dependencies' },
];

export default function TasksLayout({ children }: TasksLayoutProps) {
  const pathname = usePathname();
  const [stats] = useState({
    totalOpen: 0,
    overdue: 0,
    blocked: 0,
    completedToday: 0,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-xl font-bold text-gray-900">Task Command Center</h1>

            {/* Quick stats */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-gray-600">{stats.totalOpen} open</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-gray-600">{stats.overdue} overdue</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-gray-600">{stats.blocked} blocked</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-600">{stats.completedToday} done today</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => {
              const isActive =
                tab.href === '/tasks'
                  ? pathname === '/tasks'
                  : pathname?.includes(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </div>
  );
}
