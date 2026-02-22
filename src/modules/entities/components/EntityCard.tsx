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
  activeEntityId?: string;
  onSetActive?: (entityId: string) => void;
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
  activeEntityId,
  onSetActive,
  onClick,
}: EntityCardProps) {
  const primaryColor = entity.brandKit?.primaryColor ?? '#6366f1';
  const secondaryColor = entity.brandKit?.secondaryColor ?? '#818cf8';
  const isActive = activeEntityId === entity.id;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow ${
        isActive ? 'border-green-400 ring-2 ring-green-200' : 'border-gray-200'
      }`}
    >
      {/* Accent bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: primaryColor }}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="min-w-0 flex-1 cursor-pointer"
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }}
          >
            <div className="flex items-center gap-2">
              {isActive && (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0"
                  title="Active Entity"
                />
              )}
              <h3 className="text-base font-semibold text-gray-900 truncate">
                {entity.name}
              </h3>
            </div>
            <span className="inline-block mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              {entity.type}
            </span>
          </div>
          <EntityHealthBadge health={health} size="md" />
        </div>

        {/* Brand Color Swatches */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1">
            <span
              className="inline-block h-5 w-5 rounded-full border border-gray-200 shadow-sm"
              style={{ backgroundColor: primaryColor }}
              title={`Primary: ${primaryColor}`}
            />
            <span
              className="inline-block h-5 w-5 rounded-full border border-gray-200 shadow-sm"
              style={{ backgroundColor: secondaryColor }}
              title={`Secondary: ${secondaryColor}`}
            />
          </div>
          <span className="text-xs text-gray-400">Brand colors</span>
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
          <div className="flex flex-wrap gap-1.5 mb-3">
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

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          {!isActive && onSetActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetActive(entity.id);
              }}
              className="flex-1 rounded-md border border-green-300 bg-green-50 px-2 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
            >
              Set as Active
            </button>
          )}
          {isActive && (
            <span className="flex-1 rounded-md border border-green-300 bg-green-100 px-2 py-1.5 text-xs font-medium text-green-700 text-center">
              Active
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick?.();
            }}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined') {
                window.location.href = `/entities/${entity.id}`;
              }
            }}
            className="flex-1 rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Dashboard
          </button>
        </div>
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
