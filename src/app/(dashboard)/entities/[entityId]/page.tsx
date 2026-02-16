'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import type { EntityDashboardData } from '@/modules/entities/entity.types';
import { EntityHealthBadge } from '@/modules/entities/components/EntityHealthBadge';

type Tab = 'overview' | 'tasks' | 'messages' | 'calendar' | 'financial' | 'compliance';

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
