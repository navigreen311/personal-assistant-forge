'use client';

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
}

export default function SleepScoreCard({ score, date }: { score: number; date: string }) {
  const colorClass = getScoreColor(score);

  return (
    <div className={`border rounded-lg p-6 text-center ${colorClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-75">Sleep Score</div>
      <div className="text-5xl font-bold mt-2">{score}</div>
      <div className="text-sm font-medium mt-1">{getScoreLabel(score)}</div>
      <div className="text-xs opacity-60 mt-2">{date}</div>
    </div>
  );
}
