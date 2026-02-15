'use client';

import type { ProjectHealth } from '@/shared/types';

interface EntityHealthBadgeProps {
  health: ProjectHealth;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const healthConfig: Record<
  ProjectHealth,
  { color: string; bgColor: string; label: string; icon: string }
> = {
  GREEN: {
    color: 'text-green-600',
    bgColor: 'bg-green-500',
    label: 'Healthy',
    icon: '',
  },
  YELLOW: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-500',
    label: 'At Risk',
    icon: '⚠',
  },
  RED: {
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    label: 'Critical',
    icon: '!',
  },
};

const sizeClasses = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3.5 w-3.5',
  lg: 'h-5 w-5',
};

const iconSizes = {
  sm: 'text-[8px]',
  md: 'text-[10px]',
  lg: 'text-xs',
};

export function EntityHealthBadge({
  health,
  size = 'md',
  showLabel = false,
}: EntityHealthBadgeProps) {
  const config = healthConfig[health];

  return (
    <div
      className="inline-flex items-center gap-1.5"
      title={config.label}
      role="status"
      aria-label={`Health status: ${config.label}`}
    >
      <span
        className={`relative inline-flex items-center justify-center rounded-full ${config.bgColor} ${sizeClasses[size]}`}
      >
        {config.icon && (
          <span
            className={`font-bold text-white leading-none ${iconSizes[size]}`}
          >
            {config.icon}
          </span>
        )}
      </span>
      {showLabel && (
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      )}
    </div>
  );
}
