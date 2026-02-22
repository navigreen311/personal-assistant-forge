'use client';

import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = '📭',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="text-5xl mb-4" role="img" aria-label="empty state icon">
          {icon}
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {title}
        </h3>

        {subtitle && (
          <p className="text-sm text-gray-500 mb-4">
            {subtitle}
          </p>
        )}

        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default EmptyState;
