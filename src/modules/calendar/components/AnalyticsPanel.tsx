'use client';

interface AnalyticsPanelProps {
  entityId?: string;
  onClose: () => void;
}

// --- Mock Data ---

const TIME_ALLOCATION = [
  { label: 'Meetings', hours: 14.5, color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50' },
  { label: 'Focus', hours: 10.0, color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
  { label: 'Admin', hours: 5.5, color: 'bg-gray-400', textColor: 'text-gray-600', bgLight: 'bg-gray-50' },
  { label: 'Personal', hours: 4.0, color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-50' },
  { label: 'Buffer', hours: 3.0, color: 'bg-amber-400', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
];

const TOTAL_HOURS = TIME_ALLOCATION.reduce((sum, c) => sum + c.hours, 0);

const WEEK_COMPARISON = [
  { category: 'Meetings', thisWeek: 14.5, lastWeek: 12.0 },
  { category: 'Focus Time', thisWeek: 10.0, lastWeek: 13.5 },
  { category: 'Admin', thisWeek: 5.5, lastWeek: 4.0 },
  { category: 'Personal', thisWeek: 4.0, lastWeek: 4.5 },
  { category: 'Buffer', thisWeek: 3.0, lastWeek: 2.5 },
];

const MEETING_TREND = [
  { label: 'Week 1 (Jan 27)', hours: 10.5 },
  { label: 'Week 2 (Feb 3)', hours: 13.0 },
  { label: 'Week 3 (Feb 10)', hours: 11.5 },
  { label: 'Week 4 (Feb 17)', hours: 14.5 },
];
const MAX_TREND_HOURS = Math.max(...MEETING_TREND.map((w) => w.hours));

const FOCUS_GOAL_HOURS = 15;
const FOCUS_ACTUAL_HOURS = 10;

const TOP_PARTICIPANTS = [
  { name: 'Dr. Sarah Martinez', initials: 'SM', count: 8 },
  { name: 'James Okafor', initials: 'JO', count: 6 },
  { name: 'Priya Nair', initials: 'PN', count: 5 },
  { name: 'Tom Lindqvist', initials: 'TL', count: 4 },
  { name: 'Aiko Tanaka', initials: 'AT', count: 3 },
];
const MAX_PARTICIPANT_COUNT = TOP_PARTICIPANTS[0].count;

const MEETING_FREE_DAYS: number = 5;

// --- Helpers ---

function getFocusColor(actual: number, goal: number): string {
  const ratio = actual / goal;
  if (ratio >= 0.8) return 'bg-green-500';
  if (ratio >= 0.5) return 'bg-amber-400';
  return 'bg-red-500';
}

function getFocusTextColor(actual: number, goal: number): string {
  const ratio = actual / goal;
  if (ratio >= 0.8) return 'text-green-700';
  if (ratio >= 0.5) return 'text-amber-700';
  return 'text-red-700';
}

function ChangeArrow({ thisWeek, lastWeek }: { thisWeek: number; lastWeek: number }) {
  const diff = thisWeek - lastWeek;
  if (Math.abs(diff) < 0.05) {
    return <span className="text-gray-400 text-xs">&#8212;</span>;
  }
  return (
    <span
      className={`text-xs font-semibold ${diff > 0 ? 'text-red-500' : 'text-green-600'}`}
    >
      {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}h
    </span>
  );
}

// --- Component ---

export function AnalyticsPanel({ entityId: _entityId, onClose }: AnalyticsPanelProps) {
  const focusPct = Math.round((FOCUS_ACTUAL_HOURS / FOCUS_GOAL_HOURS) * 100);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 m-0">Calendar Analytics</h2>
            <p className="text-xs text-gray-500 mt-0.5">Feb 17 – Feb 23, 2026</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close analytics panel"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-8">

          {/* 1. Time Allocation */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Time Allocation
            </h3>
            <div className="space-y-2.5">
              {TIME_ALLOCATION.map((cat) => {
                const pct = Math.round((cat.hours / TOTAL_HOURS) * 100);
                return (
                  <div key={cat.label}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${cat.color}`} />
                        <span className="text-sm text-gray-700">{cat.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500">{cat.hours}h</span>
                        <span className={`font-semibold w-9 text-right ${cat.textColor}`}>{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`${cat.color} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">Total tracked: {TOTAL_HOURS}h</p>
          </section>

          {/* 2. This Week vs Last Week */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              This Week vs Last Week
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase">
                    <th className="text-left pb-2 font-medium">Category</th>
                    <th className="text-right pb-2 font-medium">This Week</th>
                    <th className="text-right pb-2 font-medium">Last Week</th>
                    <th className="text-right pb-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEK_COMPARISON.map((row, i) => (
                    <tr
                      key={row.category}
                      className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                    >
                      <td className="py-2 px-2 rounded-l text-gray-700">{row.category}</td>
                      <td className="py-2 px-2 text-right font-medium text-gray-900">
                        {row.thisWeek}h
                      </td>
                      <td className="py-2 px-2 text-right text-gray-500">{row.lastWeek}h</td>
                      <td className="py-2 px-2 text-right rounded-r">
                        <ChangeArrow thisWeek={row.thisWeek} lastWeek={row.lastWeek} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Meeting Hours Trend */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Meeting Hours Trend (Last 4 Weeks)
            </h3>
            <div className="space-y-3">
              {MEETING_TREND.map((week) => {
                const barPct = Math.round((week.hours / MAX_TREND_HOURS) * 100);
                return (
                  <div key={week.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 shrink-0">{week.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                      <div
                        className="bg-blue-400 h-5 rounded-full transition-all duration-500"
                        style={{ width: `${barPct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white mix-blend-difference">
                        {week.hours}h
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. Focus Time Achievement */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Focus Time Achievement
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-end mb-2">
                <span className="text-sm text-gray-600">
                  <span className={`text-2xl font-bold ${getFocusTextColor(FOCUS_ACTUAL_HOURS, FOCUS_GOAL_HOURS)}`}>
                    {FOCUS_ACTUAL_HOURS}h
                  </span>
                  <span className="text-gray-400 ml-1">/ {FOCUS_GOAL_HOURS}h goal</span>
                </span>
                <span className={`text-sm font-semibold ${getFocusTextColor(FOCUS_ACTUAL_HOURS, FOCUS_GOAL_HOURS)}`}>
                  {focusPct}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`${getFocusColor(FOCUS_ACTUAL_HOURS, FOCUS_GOAL_HOURS)} h-3 rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(focusPct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {focusPct >= 80
                  ? 'Great focus discipline this week!'
                  : focusPct >= 50
                  ? 'Halfway there — protect more deep work blocks.'
                  : 'Focus time is below target. Consider blocking mornings.'}
              </p>
            </div>
          </section>

          {/* 5. Top Meeting Participants */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Top Meeting Participants
            </h3>
            <div className="space-y-2">
              {TOP_PARTICIPANTS.map((person) => {
                const barPct = Math.round((person.count / MAX_PARTICIPANT_COUNT) * 100);
                return (
                  <div key={person.name} className="flex items-center gap-3">
                    {/* Avatar placeholder */}
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {person.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-gray-800 truncate">{person.name}</span>
                        <span className="text-xs font-semibold text-gray-600 ml-2 shrink-0">
                          {person.count} meetings
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-400 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 6. Meeting-Free Days This Month */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Meeting-Free Days This Month
            </h3>
            <div className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg px-5 py-4">
              <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-white">{MEETING_FREE_DAYS}</span>
              </div>
              <div>
                <p className="text-base font-semibold text-green-800 m-0">
                  {MEETING_FREE_DAYS} meeting-free day{(MEETING_FREE_DAYS as number) !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-green-600 mt-0.5">
                  in February 2026
                  {MEETING_FREE_DAYS >= 4
                    ? ' — excellent boundary-setting!'
                    : MEETING_FREE_DAYS >= 2
                    ? ' — good, aim for 4+ per month.'
                    : ' — try to protect at least one full day per week.'}
                </p>
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
