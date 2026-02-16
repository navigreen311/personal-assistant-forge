'use client';

export default function StressTrendChart({ data }: { data: { date: string; average: number }[] }) {
  if (data.length === 0) return <p className="text-gray-500 text-sm">No stress data available.</p>;

  const maxAvg = Math.max(...data.map(d => d.average), 100);

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Stress Trend</h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((entry, idx) => {
          const heightPct = (entry.average / maxAvg) * 100;
          const color = entry.average > 70 ? 'bg-red-400' : entry.average > 50 ? 'bg-yellow-400' : 'bg-green-400';

          return (
            <div key={idx} className="flex flex-col items-center flex-1" title={`${entry.date}: ${entry.average}`}>
              <div className={`w-full rounded-t ${color}`} style={{ height: `${heightPct}%` }} />
              <div className="text-[8px] text-gray-400 mt-1">{entry.date.slice(5)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
