'use client';

interface CadenceIndicatorProps {
  frequency: string | null;
  isOverdue: boolean;
  escalated?: boolean;
}

export default function CadenceIndicator({ frequency, isOverdue, escalated }: CadenceIndicatorProps) {
  if (!frequency) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        No cadence
      </span>
    );
  }

  if (escalated) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-purple-700">
        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        Escalated ({frequency})
      </span>
    );
  }

  if (isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-700">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        Overdue ({frequency})
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700">
      <span className="w-2 h-2 rounded-full bg-green-500" />
      On track ({frequency})
    </span>
  );
}
