'use client';

import type { StressLevel } from '../types';

function getStressColor(level: number): string {
  if (level <= 30) return 'text-green-600';
  if (level <= 50) return 'text-yellow-500';
  if (level <= 70) return 'text-orange-500';
  return 'text-red-600';
}

function getStressLabel(level: number): string {
  if (level <= 30) return 'Low';
  if (level <= 50) return 'Moderate';
  if (level <= 70) return 'Elevated';
  return 'High';
}

export default function StressGauge({ level }: { level: StressLevel }) {
  const colorClass = getStressColor(level.level);
  const rotation = (level.level / 100) * 180 - 90;

  return (
    <div className="text-center space-y-3">
      <h3 className="text-lg font-semibold">Stress Level</h3>
      <div className="relative w-40 h-20 mx-auto overflow-hidden">
        <div className="absolute inset-0 border-t-[12px] border-l-[12px] border-r-[12px] rounded-t-full border-gray-200" />
        <div
          className={`absolute bottom-0 left-1/2 w-1 h-16 origin-bottom ${colorClass} bg-current`}
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-700 rounded-full" />
      </div>
      <div className={`text-3xl font-bold ${colorClass}`}>{level.level}</div>
      <div className="text-sm text-gray-600">{getStressLabel(level.level)}</div>
      <div className="text-xs text-gray-400">Source: {level.source}</div>
      {level.triggers.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center mt-2">
          {level.triggers.map((trigger, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-600">
              {trigger}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
