'use client';

interface SentimentPoint {
  time: number;
  sentiment: number;
}

export function SentimentTimeline({ data }: { data: SentimentPoint[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-500 py-4 text-center">No sentiment data</p>;
  }

  const maxTime = Math.max(...data.map((d) => d.time));
  const height = 120;
  const width = 400;
  const padding = 20;

  const points = data.map((d) => {
    const x = padding + (d.time / Math.max(maxTime, 1)) * (width - padding * 2);
    const y = height / 2 - (d.sentiment * (height / 2 - padding));
    return `${x},${y}`;
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Sentiment Timeline</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: `${height}px` }}>
        {/* Zero line */}
        <line
          x1={padding} y1={height / 2}
          x2={width - padding} y2={height / 2}
          stroke="#e5e7eb" strokeWidth="1"
        />
        {/* Positive zone label */}
        <text x={2} y={padding} fontSize="8" fill="#9ca3af">+1</text>
        {/* Negative zone label */}
        <text x={2} y={height - padding + 8} fontSize="8" fill="#9ca3af">-1</text>
        {/* Line */}
        {points.length > 1 && (
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
          />
        )}
        {/* Dots */}
        {data.map((d, i) => {
          const x = padding + (d.time / Math.max(maxTime, 1)) * (width - padding * 2);
          const y = height / 2 - (d.sentiment * (height / 2 - padding));
          const color = d.sentiment > 0.3 ? '#22c55e' : d.sentiment < -0.3 ? '#ef4444' : '#6366f1';
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
    </div>
  );
}
