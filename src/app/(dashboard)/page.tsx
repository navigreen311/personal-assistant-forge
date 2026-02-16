'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatCard {
  label: string;
  icon: React.ReactNode;
  endpoint: string;
  countKey: string;
  bgColor: string;
  textColor: string;
}

interface ActivityItem {
  id: string;
  timestamp: string;
  description: string;
  module: string;
}

// ---------------------------------------------------------------------------
// Stat card definitions
// ---------------------------------------------------------------------------

const STAT_CARDS: StatCard[] = [
  {
    label: 'Tasks Due Today',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    endpoint: '/api/tasks?dueToday=true',
    countKey: 'count',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  {
    label: 'Unread Messages',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <path d="M22 6l-10 7L2 6" />
      </svg>
    ),
    endpoint: '/api/inbox?unread=true',
    countKey: 'count',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
  },
  {
    label: 'Upcoming Events',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    ),
    endpoint: '/api/calendar/events?upcoming=true',
    countKey: 'count',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
  },
  {
    label: 'Pending Approvals',
    icon: (
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v12" />
        <path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
    endpoint: '/api/workflows?status=pending_approval',
    countKey: 'count',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
];

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    label: 'New Task',
    href: '/tasks?action=new',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    label: 'Compose',
    href: '/inbox?action=compose',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    label: 'Schedule',
    href: '/calendar?action=new',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    label: 'Quick Capture',
    href: '/capture',
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <path d="M12 19v4" />
        <path d="M8 23h8" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Helper: format date
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Helper: format relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardHome() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Record<string, number | null>>({});
  const [statsLoading, setStatsLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  // Fetch stat counts
  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setStatsLoading(true);
      const results: Record<string, number | null> = {};

      await Promise.allSettled(
        STAT_CARDS.map(async (card) => {
          try {
            const res = await fetch(card.endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            results[card.label] = typeof data[card.countKey] === 'number'
              ? data[card.countKey]
              : Array.isArray(data) ? data.length : 0;
          } catch {
            results[card.label] = null;
          }
        })
      );

      if (!cancelled) {
        setStats(results);
        setStatsLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  // Fetch recent activity
  useEffect(() => {
    let cancelled = false;

    async function fetchActivity() {
      setActivitiesLoading(true);
      try {
        const res = await fetch('/api/execution/timeline?limit=10');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setActivities(Array.isArray(data) ? data : data.items ?? []);
        }
      } catch {
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    }

    fetchActivity();
    return () => { cancelled = true; };
  }, []);

  const userName = session?.user?.name ?? 'there';

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {userName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatDate(new Date())}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => {
          const count = stats[card.label];
          const isLoading = statsLoading;

          return (
            <div
              key={card.label}
              className={`rounded-xl border border-gray-200 ${card.bgColor} p-5 transition-shadow hover:shadow-md`}
            >
              <div className={`${card.textColor} mb-3`}>{card.icon}</div>
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
              ) : (
                <p className={`text-3xl font-bold ${card.textColor}`}>
                  {count !== null && count !== undefined ? count : '--'}
                </p>
              )}
              <p className="mt-1 text-sm font-medium text-gray-600">
                {card.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all"
            >
              <span className="text-gray-500">{action.icon}</span>
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Recent Activity
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white">
          {activitiesLoading ? (
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <div className="h-2 w-2 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No recent activity.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {activities.map((item, i) => (
                <div key={item.id ?? i} className="flex items-start gap-4 p-4">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      {item.description}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                      {item.module && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {item.module}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
