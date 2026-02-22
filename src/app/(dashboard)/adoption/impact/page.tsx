'use client';

/* ------------------------------------------------------------------ */
/*  Impact Dashboard — mock data, no DB calls                         */
/* ------------------------------------------------------------------ */

interface WeeklyData {
  week: string;
  hours: number;
}

interface BreakdownRow {
  activity: string;
  timeSaved: string;
  actions: number;
  roi: string;
}

const WEEKLY_TREND: WeeklyData[] = [
  { week: 'Jan 6', hours: 1.2 },
  { week: 'Jan 13', hours: 2.0 },
  { week: 'Jan 20', hours: 2.8 },
  { week: 'Jan 27', hours: 3.1 },
  { week: 'Feb 3', hours: 3.9 },
  { week: 'Feb 10', hours: 4.5 },
  { week: 'Feb 17', hours: 4.8 },
  { week: 'Feb 22', hours: 5.2 },
];

const BREAKDOWN: BreakdownRow[] = [
  { activity: 'Email Triage', timeSaved: '6.2h', actions: 89, roi: '$930' },
  { activity: 'Follow-up Drafts', timeSaved: '4.1h', actions: 34, roi: '$615' },
  { activity: 'Meeting Scheduling', timeSaved: '3.0h', actions: 18, roi: '$450' },
  { activity: 'Task Creation', timeSaved: '2.8h', actions: 42, roi: '$420' },
  { activity: 'Report Generation', timeSaved: '1.6h', actions: 4, roi: '$240' },
  { activity: 'VoiceForge Calls', timeSaved: '1.0h', actions: 6, roi: '$150' },
];

const MAX_BAR_HOURS = 6; // scale for the bar chart

export default function ImpactPage() {
  const totalTimeSaved = 18.7;
  const tasksAutoCompleted = 34;
  const emailsAutoSent = 89;
  const delegationLevel = 'Observer';
  const hourlyRate = 150;
  const monthlyValue = Math.round(totalTimeSaved * hourlyRate);
  const roi = Math.round(monthlyValue / (hourlyRate * 1.25)); // approximate ROI multiplier

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Impact Dashboard</h2>
        <p className="text-gray-500 mt-1">
          Track how much time and money your AI assistant saves you.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Time Saved This Month" value={`${totalTimeSaved} hrs`} accent="blue" />
        <StatCard label="Tasks Auto-Completed" value={String(tasksAutoCompleted)} accent="emerald" />
        <StatCard label="Emails Auto-Sent" value={String(emailsAutoSent)} accent="violet" />
        <StatCard label="Delegation Level" value={delegationLevel} accent="amber" />
      </div>

      {/* Time Saved Trend (bar chart via divs) */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Time Saved Trend (8 weeks)</h3>
        <div className="flex items-end gap-3 h-48">
          {WEEKLY_TREND.map((w) => {
            const heightPercent = Math.min((w.hours / MAX_BAR_HOURS) * 100, 100);
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-700">{w.hours}h</span>
                <div className="w-full relative" style={{ height: '140px' }}>
                  <div
                    className="absolute bottom-0 w-full bg-blue-500 rounded-t-md transition-all duration-500"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 mt-1">{w.week}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equivalent Value callout */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-100">Equivalent Value</p>
            <p className="text-2xl font-bold mt-1">
              At ${hourlyRate}/hr, AI saved you ${monthlyValue.toLocaleString()} this month
            </p>
            <p className="text-sm text-green-200 mt-1">{roi}x ROI on your subscription</p>
          </div>
          <div className="bg-white/20 rounded-full p-3">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Breakdown by Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time Saved
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ROI
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {BREAKDOWN.map((row) => (
                <tr key={row.activity} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.activity}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{row.timeSaved}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{row.actions}</td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">{row.roi}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-6 py-3 text-sm font-semibold text-gray-900">Total</td>
                <td className="px-6 py-3 text-sm font-semibold text-gray-900">18.7h</td>
                <td className="px-6 py-3 text-sm font-semibold text-gray-900">193</td>
                <td className="px-6 py-3 text-sm font-semibold text-green-700">$2,805</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card sub-component                                            */
/* ------------------------------------------------------------------ */

const ACCENT_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', icon: 'text-violet-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500' },
};

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  const colors = ACCENT_MAP[accent] ?? ACCENT_MAP.blue;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors.text}`}>{value}</p>
    </div>
  );
}
