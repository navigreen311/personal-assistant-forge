'use client';

import { useState, useCallback } from 'react';

interface DecisionOption {
  id: string;
  name: string;
  description: string;
  estimatedCost?: string;
  riskLevel: string;
  timeline?: string;
}

interface DecisionWizardOptionsStepProps {
  options: DecisionOption[];
  context: { title: string; description: string; type: string };
  onChange: (options: DecisionOption[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const STEP_LABELS = ['Context', 'Options', 'Analysis', 'Review'];

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function generateId(): string {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyOption(): DecisionOption {
  return {
    id: generateId(),
    name: '',
    description: '',
    estimatedCost: '',
    riskLevel: 'Medium',
    timeline: '',
  };
}

function generateTemplateOptions(contextType: string): DecisionOption[] {
  const templates: Record<string, DecisionOption[]> = {
    financial: [
      {
        id: generateId(),
        name: 'Conservative Investment',
        description: 'Low-risk approach with stable, predictable returns over time.',
        estimatedCost: '$5,000',
        riskLevel: 'Low',
        timeline: '12 months',
      },
      {
        id: generateId(),
        name: 'Balanced Portfolio',
        description: 'Mix of growth and stability, moderate risk with diversified allocation.',
        estimatedCost: '$10,000',
        riskLevel: 'Medium',
        timeline: '6 months',
      },
      {
        id: generateId(),
        name: 'Aggressive Growth',
        description: 'High-growth strategy targeting maximum returns with higher volatility.',
        estimatedCost: '$15,000',
        riskLevel: 'High',
        timeline: '3 months',
      },
    ],
    strategic: [
      {
        id: generateId(),
        name: 'Maintain Current Course',
        description: 'Continue with the existing strategy, optimizing incrementally.',
        estimatedCost: '$2,000',
        riskLevel: 'Low',
        timeline: '1 month',
      },
      {
        id: generateId(),
        name: 'Pivot Direction',
        description: 'Shift strategy to address new opportunities or market changes.',
        estimatedCost: '$20,000',
        riskLevel: 'Medium',
        timeline: '3 months',
      },
      {
        id: generateId(),
        name: 'Full Transformation',
        description: 'Complete overhaul of approach with new tools, processes, and goals.',
        estimatedCost: '$50,000',
        riskLevel: 'High',
        timeline: '6 months',
      },
    ],
    default: [
      {
        id: generateId(),
        name: 'Option 1 - Do Nothing',
        description: 'Maintain the status quo and monitor the situation.',
        estimatedCost: '$0',
        riskLevel: 'Low',
        timeline: 'N/A',
      },
      {
        id: generateId(),
        name: 'Option 2 - Moderate Change',
        description: 'Make targeted adjustments to address the core issue.',
        estimatedCost: '$5,000',
        riskLevel: 'Medium',
        timeline: '3 months',
      },
      {
        id: generateId(),
        name: 'Option 3 - Bold Action',
        description: 'Take decisive action with significant resource commitment.',
        estimatedCost: '$25,000',
        riskLevel: 'High',
        timeline: '6 months',
      },
    ],
  };

  return templates[contextType] ?? templates.default;
}

export default function DecisionWizardOptionsStep({
  options,
  context,
  onChange,
  onBack,
  onNext,
}: DecisionWizardOptionsStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const updateOption = useCallback(
    (id: string, field: keyof DecisionOption, value: string) => {
      const updated = options.map((opt) =>
        opt.id === id ? { ...opt, [field]: value } : opt
      );
      onChange(updated);

      // Clear error for this field when user types
      const errorKey = `${id}-${field}`;
      if (errors[errorKey]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[errorKey];
          return next;
        });
      }
    },
    [options, onChange, errors]
  );

  const addOption = useCallback(() => {
    if (options.length >= 4) return;
    onChange([...options, createEmptyOption()]);
  }, [options, onChange]);

  const removeOption = useCallback(
    (id: string) => {
      if (options.length <= 2) return;
      onChange(options.filter((opt) => opt.id !== id));
      // Clear errors for removed option
      setErrors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(id)) delete next[key];
        });
        return next;
      });
    },
    [options, onChange]
  );

  const handleGenerateOptions = useCallback(async () => {
    setIsGenerating(true);
    try {
      // Attempt to call the API
      const response = await fetch('/api/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-options',
          context,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.options && Array.isArray(data.options)) {
          onChange(data.options);
          setErrors({});
          setIsGenerating(false);
          return;
        }
      }
    } catch {
      // API not available, fall through to template generation
    }

    // Mock AI response with template options based on context.type
    await new Promise((resolve) => setTimeout(resolve, 800));
    const generated = generateTemplateOptions(context.type);
    onChange(generated);
    setErrors({});
    setIsGenerating(false);
  }, [context, onChange]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (options.length < 2) {
      newErrors.global = 'At least 2 options are required.';
    }

    options.forEach((opt) => {
      if (!opt.name.trim()) {
        newErrors[`${opt.id}-name`] = 'Name is required.';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [options]);

  const handleNext = useCallback(() => {
    if (validate()) {
      onNext();
    }
  }, [validate, onNext]);

  return (
    <div className="space-y-6">
      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-6">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index;
          const isCompleted = stepNumber < 1;
          const isActive = stepNumber === 1;

          return (
            <div key={label} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isCompleted ? '\u2713' : index + 1}
                </div>
                <span
                  className={`mt-1 text-xs ${
                    isActive ? 'text-blue-600 font-medium' : 'text-gray-500'
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < STEP_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    stepNumber < 1 ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Header */}
      <h3 className="text-lg font-medium text-gray-900">
        Define 2-4 options to evaluate
      </h3>

      {/* AI Generation Button */}
      <button
        type="button"
        onClick={handleGenerateOptions}
        disabled={isGenerating}
        className="bg-purple-50 border border-purple-200 text-purple-700 rounded-lg px-4 py-2 w-full text-center hover:bg-purple-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating options...
          </span>
        ) : (
          '\u2728 AI: Generate 3 options from context'
        )}
      </button>

      {/* Global Error */}
      {errors.global && (
        <p className="text-sm text-red-600">{errors.global}</p>
      )}

      {/* Option Forms */}
      <div>
        {options.map((option, index) => (
          <div
            key={option.id}
            className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-gray-900">
                Option {OPTION_LETTERS[index] ?? index + 1}
              </span>
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(option.id)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                  aria-label={`Remove Option ${OPTION_LETTERS[index]}`}
                >
                  <span role="img" aria-label="delete">
                    🗑
                  </span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={option.name}
                  onChange={(e) => updateOption(option.id, 'name', e.target.value)}
                  placeholder="Option name"
                  className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors[`${option.id}-name`]
                      ? 'border-red-400'
                      : 'border-gray-300'
                  }`}
                />
                {errors[`${option.id}-name`] && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors[`${option.id}-name`]}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={option.description}
                  onChange={(e) =>
                    updateOption(option.id, 'description', e.target.value)
                  }
                  rows={2}
                  placeholder="Describe this option..."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Estimated Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Estimated Cost
                </label>
                <input
                  type="text"
                  value={option.estimatedCost ?? ''}
                  onChange={(e) =>
                    updateOption(option.id, 'estimatedCost', e.target.value)
                  }
                  placeholder="$..."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Risk Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Risk Level
                </label>
                <select
                  value={option.riskLevel}
                  onChange={(e) =>
                    updateOption(option.id, 'riskLevel', e.target.value)
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              {/* Estimated Timeline */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Estimated Timeline
                </label>
                <input
                  type="text"
                  value={option.timeline ?? ''}
                  onChange={(e) =>
                    updateOption(option.id, 'timeline', e.target.value)
                  }
                  placeholder="e.g., 3 months"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Option Button */}
      <button
        type="button"
        onClick={addOption}
        disabled={options.length >= 4}
        className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add Option
      </button>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
