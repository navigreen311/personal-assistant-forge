'use client';

import { useState, useMemo } from 'react';

export interface SessionEntryForAnalytics {
  id: string;
  date: string;
  channel: string;
  actions?: string[];
  actionsCount?: number;
}

export interface HistoryStatsForAnalytics {
  totalSessions: number;
  approvalRate: number;
}

export interface SessionAnalyticsChartProps {
  sessions: SessionEntryForAnalytics[];
  stats: HistoryStatsForAnalytics;
}

export default function SessionAnalyticsChart({ sessions, stats }: SessionAnalyticsChartProps) {
  const [expanded, setExpanded] = useState(false);

  const analytics = useMemo(() => {
    // Sessions over last 7 days
    const now = new Date();
    const last7Days: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      const dayLabel = day.toLocaleDateString('en-US', { weekday: 'short' });
      const count = sessions.filter((s) => s.date.slice(0, 10) === dayStr).length;
      last7Days.push({ label: dayLabel, count });
    }
    const maxCount = Math.max(...last7Days.map((d) => d.count), 1);

    // Channel breakdown
    const channelCounts: Record<string, number> = {};
    sessions.forEach((s) => {
      const ch = s.channel || 'web';
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });
    const total = sessions.length || 1;
    const channelBreakdown = [
      { channel: 'Web', key: 'web', percent: Math.round(((channelCounts['web'] || 0) / total) * 100), color: 'bg-blue-500' },
      { channel: 'Voice', key: 'voice', percent: Math.round(((channelCounts['voice'] || 0) / total) * 100), color: 'bg-green-500' },
      { channel: 'Phone', key: 'phone', percent: Math.round(((channelCounts['phone'] || 0) / total) * 100), color: 'bg-amber-500' },
      { channel: 'Mobile', key: 'mobile', percent: Math.round(((channelCounts['mobile'] || 0) / total) * 100), color: 'bg-purple-500' },
    ];

    // Top actions
    const actionCounts: Record<string, number> = {};
    sessions.forEach((s) => {
      (s.actions || []).forEach((action) => {
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });
    });
    const topActions = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([action, count]) => ({ action, count }));

    // Peak usage hours
    const hourCounts: Record<number, number> = {};
    sessions.forEach((s) => {
      try {
        const hour = new Date(s.date).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch {
        // skip invalid dates
      }
    });
    const peakHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => {
        const h = parseInt(hour);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:00 ${ampm}`;
      });

    return { last7Days, maxCount, channelBreakdown, topActions, peakHours };
  }, [sessions]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-500 dark:text-gray-400"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {expanded ? 'Hide analytics' : 'Show analytics'}
          </span>
        </div>
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {/* Sessions Over Time */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Sessions Over Time (Last 7 Days)
              </h4>
              <div className="flex items-end gap-2 h-32">
                {analytics.last7Days.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{day.count}</span>
                    <div className="w-full relative" style={{ height: '80px' }}>
                      <div
                        className="absolute bottom-0 w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all"
                        style={{
                          height: `${(day.count / analytics.maxCount) * 100}%`,
                          minHeight: day.count > 0 ? '4px' : '0px',
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{day.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Channel Breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Channel Breakdown
              </h4>
              <div className="space-y-3">
                {analytics.channelBreakdown.map((ch) => (
                  <div key={ch.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ch.channel}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{ch.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className={`${ch.color} h-2 rounded-full transition-all`}
                        style={{ width: `${ch.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Actions */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Top Actions
              </h4>
              {analytics.topActions.length > 0 ? (
                <ol className="space-y-2">
                  {analytics.topActions.map((item, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300 truncate mr-2">
                        <span className="text-gray-400 dark:text-gray-500 mr-1">{i + 1}.</span>
                        {item.action}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {item.count}x
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No actions recorded yet.</p>
              )}
            </div>

            {/* Peak Usage & Override Rate */}
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Peak Usage Hours
                </h4>
                {analytics.peakHours.length > 0 ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {analytics.peakHours.join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Not enough data yet.</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Override Rate (Approval)
                </h4>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all"
                      style={{ width: `${stats.approvalRate}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {stats.approvalRate}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Percentage of Shadow suggestions accepted
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
