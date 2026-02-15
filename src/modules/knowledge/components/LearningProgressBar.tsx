'use client';

interface LearningProgressBarProps {
  progress: number;
}

export default function LearningProgressBar({ progress }: LearningProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">Progress</span>
        <span className="text-xs font-medium text-gray-900">{clamped}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
