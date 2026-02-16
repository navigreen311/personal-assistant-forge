'use client';

import type { SleepData } from '../types';

export default function SleepChart({ data }: { data: SleepData[] }) {
  const maxHours = Math.max(...data.map(d => d.totalHours), 10);
  const displayData = data.slice(0, 30).reverse();

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Sleep History</h3>
      <div className="flex items-end gap-1 h-48 overflow-x-auto">
        {displayData.map((day, idx) => {
          const heightPct = (day.totalHours / maxHours) * 100;
          const deepPct = (day.deepSleepHours / day.totalHours) * 100;
          const remPct = (day.remSleepHours / day.totalHours) * 100;

          return (
            <div key={idx} className="flex flex-col items-center min-w-[20px]" title={`${day.date}: ${day.totalHours}h (Score: ${day.sleepScore})`}>
              <div className="w-4 flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${heightPct}%` }}>
                <div className="bg-indigo-800" style={{ height: `${deepPct}%` }} />
                <div className="bg-indigo-500" style={{ height: `${remPct}%` }} />
                <div className="bg-indigo-300 flex-1" />
              </div>
              <div className="text-[8px] text-gray-400 mt-1 rotate-[-45deg] origin-top-left w-6">
                {day.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-800 rounded" /> Deep</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-500 rounded" /> REM</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-300 rounded" /> Light</div>
      </div>
    </div>
  );
}
