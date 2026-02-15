'use client';

import type { Entity, ComplianceProfile, ProjectHealth } from '@/shared/types';
import { EntityHealthBadge } from './EntityHealthBadge';

interface EntityCardProps {
  entity: Entity;
  health?: ProjectHealth;
  metrics?: {
    openTasks: number;
    pendingMessages: number;
    upcomingEvents: number;
  };
  onClick?: () => void;
}

const complianceBadgeColors: Record<ComplianceProfile, string> = {
  HIPAA: 'bg-red-100 text-red-700',
  GDPR: 'bg-blue-100 text-blue-700',
  CCPA: 'bg-purple-100 text-purple-700',
  SOX: 'bg-amber-100 text-amber-700',
  SEC: 'bg-orange-100 text-orange-700',
  REAL_ESTATE: 'bg-green-100 text-green-700',
  GENERAL: 'bg-gray-100 text-gray-600',
};

export function EntityCard({
  entity,
  health = 'GREEN',
  metrics,
  onClick,
}: EntityCardProps) {
  const accentColor = entity.brandKit?.primaryColor ?? '#6366f1';

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Accent bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: accentColor }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {entity.name}
            </h3>
            <span className="inline-block mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {entity.type}
            </span>
          </div>
          <EntityHealthBadge health={health} size="md" />
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <MetricItem label="Tasks" value={metrics.openTasks} />
            <MetricItem label="Messages" value={metrics.pendingMessages} />
            <MetricItem label="Events" value={metrics.upcomingEvents} />
          </div>
        )}

        {/* Compliance badges */}
        {entity.complianceProfile.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {entity.complianceProfile.map((profile) => (
              <span
                key={profile}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${complianceBadgeColors[profile] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {profile}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center rounded-lg bg-gray-50 px-2 py-1.5">
      <div className="text-lg font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
