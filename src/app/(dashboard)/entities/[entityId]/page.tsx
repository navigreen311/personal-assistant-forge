'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import type { EntityDashboardData } from '@/modules/entities/entity.types';
import { EntityHealthBadge } from '@/modules/entities/components/EntityHealthBadge';

type Tab = 'overview' | 'tasks' | 'messages' | 'calendar' | 'financial' | 'compliance';

interface QuickLink {
  label: string;
  href: string;
  icon: React.ReactNode;
  description: string;
}

interface RecentActivity {
  id: string;
  actor: string;
  actionType: string;
  target: string;
  reason: string;
  timestamp: string;
}

export default function EntityDashboardPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<EntityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      try {
        const res = await fetch(`/api/entities/${entityId}/dashboard`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, [entityId]);

  // Fetch recent activity from ActionLog
  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch(`/api/action-logs?target=${entityId}&limit=10`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setRecentActivity(json.data);
          }
        }
      } catch {
        // Activity fetch is optional
      }
    }
    fetchActivity();
  }, [entityId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-gray-500">Entity not found.</p>
      </div>
    );
  }

  const { entity, health, recentTasks, recentMessages, upcomingEvents, financialSummary, topContacts } = data;

  const quickLinks: QuickLink[] = [
    {
      label: 'Inbox',
      href: `/inbox?entityId=${entityId}`,
      description: 'Messages & communications',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: 'Calendar',
      href: `/calendar?entityId=${entityId}`,
      description: 'Events & scheduling',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: 'Tasks',
      href: `/tasks?entityId=${entityId}`,
      description: 'To-dos & projects',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: 'Contacts',
      href: `/contacts?entityId=${entityId}`,
      description: 'People & relationships',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Documents',
      href: `/documents?entityId=${entityId}`,
      description: 'Files & records',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      label: 'Finance',
      href: `/finance?entityId=${entityId}`,
      description: 'Invoices & expenses',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'messages', label: 'Messages' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'financial', label: 'Financial' },
    { id: 'compliance', label: 'Compliance' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{entity.name}</h1>
            <EntityHealthBadge health={health.overallHealth} showLabel />
          </div>
          <p className="mt-1 text-sm text-gray-500">{entity.type}</p>
        </div>
        <button
          onClick={() => router.push(`/entities/${entityId}/edit`)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit Entity
        </button>
      </div>

      {/* Quick Links */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((link) => (
            <button
              key={link.label}
              onClick={() => router.push(link.href)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-center"
            >
              <span className="text-indigo-600">{link.icon}</span>
              <span className="text-sm font-medium text-gray-900">{link.label}</span>
              <span className="text-xs text-gray-500 hidden sm:block">{link.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Metrics cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Open Tasks" value={health.metrics.openTasks} />
            <MetricCard
              label="Overdue Tasks"
              value={health.metrics.overdueTasks}
              warn={health.metrics.overdueTasks > 0}
            />
            <MetricCard label="Active Projects" value={health.metrics.activeProjects} />
            <MetricCard label="Pending Messages" value={health.metrics.pendingMessages} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Recent Tasks */}
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Tasks</h3>
              {recentTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No open tasks</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {recentTasks.slice(0, 5).map((task) => (
                    <li key={task.id} className="py-2 flex items-center justify-between">
                      <span className="text-sm text-gray-700">{task.title}</span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          task.priority === 'P0'
                            ? 'bg-red-100 text-red-700'
                            : task.priority === 'P1'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Top Contacts */}
            <section className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Contacts</h3>
              {topContacts.length === 0 ? (
                <p className="text-sm text-gray-500">No contacts yet</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {topContacts.map((contact) => (
                    <li key={contact.id} className="py-2 flex items-center justify-between">
                      <span className="text-sm text-gray-700">{contact.name}</span>
                      <span className="text-xs text-gray-500">
                        Score: {contact.relationshipScore}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Recent Activity */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-500">No recent activity recorded</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentActivity.map((activity) => (
                  <li key={activity.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">{activity.actor}</span>
                        {' '}
                        <span className="text-gray-500">{activity.actionType}</span>
                        {' '}
                        <span className="text-gray-700">{activity.target}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{activity.reason}</p>
                    </div>
                    <time className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {recentTasks.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No tasks</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Title</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Priority</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr key={task.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-900">{task.title}</td>
                    <td className="px-4 py-2 text-gray-600">{task.status}</td>
                    <td className="px-4 py-2 text-gray-600">{task.priority}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {recentMessages.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No messages</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Subject</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Channel</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Triage</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentMessages.map((msg) => (
                  <tr key={msg.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-900">{msg.subject ?? '(no subject)'}</td>
                    <td className="px-4 py-2 text-gray-600">{msg.channel}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`font-medium ${
                          msg.triageScore >= 8
                            ? 'text-red-600'
                            : msg.triageScore >= 5
                              ? 'text-amber-600'
                              : 'text-gray-600'
                        }`}
                      >
                        {msg.triageScore}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(msg.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {upcomingEvents.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No upcoming events</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{event.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(event.startTime).toLocaleString()} &mdash;{' '}
                    {new Date(event.endTime).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'financial' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard label="Receivable" value={`$${financialSummary.receivable.toLocaleString()}`} />
            <MetricCard label="Payable" value={`$${financialSummary.payable.toLocaleString()}`} />
            <MetricCard
              label="Overdue"
              value={`$${financialSummary.overdue.toLocaleString()}`}
              warn={financialSummary.overdue > 0}
            />
            <MetricCard label="Monthly Burn" value={`$${financialSummary.monthlyBurn.toLocaleString()}`} />
          </div>
        </div>
      )}

      {activeTab === 'compliance' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Compliance Profiles</h3>
            <div className="flex flex-wrap gap-2">
              {entity.complianceProfile.map((profile) => (
                <span
                  key={profile}
                  className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700"
                >
                  {profile}
                </span>
              ))}
            </div>
          </div>
          {health.alerts.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Alerts</h3>
              <ul className="space-y-2">
                {health.alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className={`rounded-lg p-3 text-sm ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-red-50 text-red-700'
                        : alert.severity === 'HIGH'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-gray-50 text-gray-600'
                    }`}
                  >
                    <span className="font-medium">[{alert.severity}]</span> {alert.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  warn,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-xl font-bold mt-1 ${
          warn ? 'text-red-600' : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
