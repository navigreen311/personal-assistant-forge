'use client';

import { useState } from 'react';

export interface ActionOption {
  label: string;
  action: string;
  style: 'primary' | 'secondary' | 'danger';
}

interface ShadowActionCardProps {
  id: string;
  title: string;
  description: string;
  options: ActionOption[];
  onResponse: (actionId: string, action: string) => void;
  disabled?: boolean;
}

export function ShadowActionCard({
  id,
  title,
  description,
  options,
  onResponse,
  disabled = false,
}: ShadowActionCardProps) {
  const [responded, setResponded] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handleClick = (action: string) => {
    if (disabled || responded) return;
    setSelectedAction(action);
    setResponded(true);
    onResponse(id, action);
  };

  const styleMap: Record<ActionOption['style'], string> = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    secondary:
      'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
    danger:
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  const disabledStyle = 'opacity-50 cursor-not-allowed';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 bg-white dark:bg-gray-800 max-w-sm">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
        {title}
      </h4>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
        {description}
      </p>

      {responded && selectedAction ? (
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">
          Responded: {selectedAction}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.action}
              onClick={() => handleClick(option.action)}
              disabled={disabled || responded}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                styleMap[option.style]
              } ${disabled || responded ? disabledStyle : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
