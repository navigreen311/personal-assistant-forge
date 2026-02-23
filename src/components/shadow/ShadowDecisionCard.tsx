'use client';

export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
}

interface ShadowDecisionCardProps {
  question: string;
  options: DecisionOption[];
  onSelect: (optionId: string) => void;
  selected?: string;
}

export function ShadowDecisionCard({
  question,
  options,
  onSelect,
  selected,
}: ShadowDecisionCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 bg-white dark:bg-gray-800 max-w-sm">
      <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
        {question}
      </p>
      <div className="flex flex-col gap-2">
        {options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              onClick={() => onSelect(option.id)}
              disabled={!!selected}
              className={`w-full text-left px-3 py-2 rounded-lg border-2 transition-all text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : selected
                    ? 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                    : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
              }`}
            >
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {option.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
