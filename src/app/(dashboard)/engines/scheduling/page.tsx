'use client';

import { useState } from 'react';

const MOCK_STATS = { eventsOptimized: 12, conflictsResolved: 3, bufferTimeMin: 45, satisfaction: 91 };
const MOCK_RECENT = [
  { time: '10 min ago', event: 'Team standup moved to 9:30am', type: 'Rescheduled', impact: 'Freed 30min focus block', status: 'Applied' as const },
  { time: '25 min ago', event: 'Lunch overlap resolved', type: 'Conflict', impact: 'Moved 1:1 to 2pm', status: 'Applied' as const },
  { time: '40 min ago', event: 'Added 15min buffer before client call', type: 'Buffer', impact: 'Prep time added', status: 'Applied' as const },
  { time: '1 hr ago', event: 'Focus block protected 10am-12pm', type: 'Protected', impact: 'Declined meeting invite', status: 'Suggested' as const },
  { time: '2 hr ago', event: 'Back-to-back meetings broken up', type: 'Optimization', impact: 'Added 10min breaks', status: 'Applied' as const },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

export default function SchedulingEnginePage() {
  const [strategy, setStrategy] = useState('balance');
  const [minDuration, setMinDuration] = useState(15);
  const [maxBackToBack, setMaxBackToBack] = useState(3);
  const [bufferMinutes, setBufferMinutes] = useState(10);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Events Optimized" value={String(MOCK_STATS.eventsOptimized)} />
        <StatCard label="Conflicts Resolved" value={String(MOCK_STATS.conflictsResolved)} />
        <StatCard label="Buffer Time Added" value={`${MOCK_STATS.bufferTimeMin}min`} />
        <StatCard label="Satisfaction" value={`${MOCK_STATS.satisfaction}%`} />
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Optimization Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="minimize-gaps">Minimize Gaps</option>
              <option value="maximize-focus">Maximize Focus Blocks</option>
              <option value="balance">Balance</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Min Meeting Duration: {minDuration}min
            </label>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Max Back-to-Back: {maxBackToBack}
            </label>
            <input
              type="range"
              min={1}
              max={8}
              value={maxBackToBack}
              onChange={(e) => setMaxBackToBack(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Buffer Between Meetings: {bufferMinutes}min
            </label>
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Energy Overlay */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Energy Overlay</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm font-medium text-green-800 dark:text-green-300">Morning (8am - 12pm)</div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">High Energy - Deep work & creative tasks</div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Afternoon (12pm - 5pm)</div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Medium Energy - Meetings & collaboration</div>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm font-medium text-purple-800 dark:text-purple-300">Evening (5pm - 8pm)</div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Low Energy - Light admin & planning</div>
          </div>
        </div>
      </div>

      {/* Focus Time Protection */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Focus Time Protection</h2>
        <div className="space-y-2">
          {[
            'Block 10am-12pm daily for deep work',
            'No meetings before 9am',
            'Friday afternoon reserved for planning',
            'Auto-decline meetings during focus blocks (suggest alternatives)',
          ].map((rule, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-900 rounded-md px-4 py-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-gray-700 dark:text-gray-300">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Optimizations */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent Optimizations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Time</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Event</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Type</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Impact</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_RECENT.map((item, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-zinc-700/50 hover:bg-gray-50 dark:hover:bg-zinc-700/30">
                  <td className="py-2 px-3 text-gray-400 dark:text-gray-500 whitespace-nowrap">{item.time}</td>
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300 max-w-xs truncate">{item.event}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-400">{item.type}</span>
                  </td>
                  <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.impact}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      item.status === 'Applied' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
