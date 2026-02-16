'use client';

interface Props {
  data: { date: string; minutes: number }[];
}

export default function TimeSavedChart({ data }: Props) {
  const maxMinutes = Math.max(...data.map(d => d.minutes), 1);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Time Saved</h3>

      <div className="flex items-end gap-1 h-48">
        {data.map((entry) => {
          const height = (entry.minutes / maxMinutes) * 100;
          const date = new Date(entry.date);
          const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

          return (
            <div key={entry.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">{entry.minutes}m</span>
              <div
                className="w-full bg-blue-500 rounded-t transition-all duration-300 hover:bg-blue-600 min-h-[2px]"
                style={{ height: `${Math.max(height, 1)}%` }}
                title={`${entry.date}: ${entry.minutes} minutes saved`}
              />
              <span className="text-xs text-gray-400">{dayLabel}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-between text-sm text-gray-500">
        <span>Total: {data.reduce((s, d) => s + d.minutes, 0)} minutes</span>
        <span>Avg: {Math.round(data.reduce((s, d) => s + d.minutes, 0) / Math.max(data.length, 1))} min/day</span>
      </div>
    </div>
  );
}
