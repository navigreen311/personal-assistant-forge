'use client';

import type { BlastRadius } from '@/shared/types';

const COLORS: Record<BlastRadius, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

interface BlastRadiusBadgeProps {
  radius: BlastRadius;
}

export default function BlastRadiusBadge({ radius }: BlastRadiusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[radius]}`}
    >
      {radius}
    </span>
  );
}
