'use client';

import { useState, useEffect, useCallback } from 'react';

interface MaintenanceTask {
  id: string;
  task: string;
  property: string;
  dueDate: string;
  provider: string;
  status: 'pending' | 'confirmed' | 'scheduled';
}

interface ActivityEntry {
  id: string;
  date: string;
  description: string;
  cost: number;
}

interface DashboardData {
  maintenance: MaintenanceTask[];
  activity: ActivityEntry[];
}

interface HouseholdDashboardTabProps {
  entityId?: string;
  property?: string;
  onRefresh?: () => void;
}

const DEMO_DATA: DashboardData = {
  maintenance: [
    {
      id: '1',
      task: 'HVAC Filter Change',
      property: 'Main Residence',
      dueDate: '2026-03-01',
      provider: 'Comfort Air Services',
      status: 'pending',
    },
    {
      id: '2',
      task: 'Gutter Cleaning',
      property: 'Main Residence',
      dueDate: '2026-03-15',
      provider: 'CleanPro Exteriors',
      status: 'confirmed',
    },
    {
      id: '3',
      task: 'Lawn Service',
      property: 'Main Residence',
      dueDate: 'Weekly',
      provider: 'GreenThumb Landscaping',
      status: 'scheduled',
    },
  ],
  activity: [
    {
      id: '1',
      date: '2026-02-18',
      description: 'Plumber visit — fixed kitchen faucet leak',
      cost: 185,
    },
    {
      id: '2',
      date: '2026-02-14',
      description: 'Lawn service — weekly mowing & edging',
      cost: 75,
    },
    {
      id: '3',
      date: '2026-02-10',
      description: 'HVAC inspection — annual tune-up completed',
      cost: 120,
    },
  ],
};

export default function HouseholdDashboardTab({
  entityId,
  property,
  onRefresh,
}: HouseholdDashboardTabProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (property) params.set('property', property);

      const res = await fetch(`/api/household/dashboard?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      setData(json);
    } catch {
      setData(DEMO_DATA);
    } finally {
      setLoading(false);
    }
  }, [entityId, property]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading dashboard…</span>
      </div>
    );
  }

  const maintenance = data?.maintenance ?? [];
  const activity = data?.activity ?? [];

  return (
    <div className="space-y-6">
      {/* Upcoming Maintenance */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upcoming Maintenance
          </h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Refresh
            </button>
          )}
        </div>

        {maintenance.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No maintenance tasks scheduled. Add a property to get AI-powered
              maintenance reminders.
            </p>
            <button className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              + Add Property
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 font-medium">Task</th>
                  <th className="pb-3 font-medium">Property</th>
                  <th className="pb-3 font-medium">Due Date</th>
                  <th className="pb-3 font-medium">Provider</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {maintenance.map((item) => (
                  <tr key={item.id} className="text-gray-700 dark:text-gray-300">
                    <td className="py-3 font-medium text-gray-900 dark:text-white">
                      {item.task}
                    </td>
                    <td className="py-3">{item.property}</td>
                    <td className="py-3">{item.dueDate}</td>
                    <td className="py-3">{item.provider}</td>
                    <td className="py-3">
                      {item.status === 'scheduled' ? (
                        <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-300 rounded-md">
                          ✅ Scheduled
                        </span>
                      ) : item.status === 'confirmed' ? (
                        <button className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
                          Confirm
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors">
                            Schedule
                          </button>
                          <button className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-md transition-colors">
                            DIY
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h3>

        {activity.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
            No recent activity to display.
          </p>
        ) : (
          <div className="space-y-4">
            {activity.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-full whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {entry.description}
                  </span>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-full whitespace-nowrap">
                  ${entry.cost}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
