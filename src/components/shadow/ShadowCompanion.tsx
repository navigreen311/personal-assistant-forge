'use client';

export interface CompanionStep {
  id: string;
  name: string;
  description: string;
}

type StepStatus = 'completed' | 'current' | 'skipped' | 'future';
type StepAction = 'shadow_handles' | 'i_do_it' | 'delegate';

interface ShadowCompanionProps {
  workflowName: string;
  steps: CompanionStep[];
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  isPaused: boolean;
  onStepAction: (stepIndex: number, action: StepAction) => void;
  onNavigate: (action: 'skip' | 'pause' | 'resume' | 'back' | 'finish') => void;
}

function getStepStatus(
  index: number,
  currentStep: number,
  completedSteps: number[],
  skippedSteps: number[],
): StepStatus {
  if (completedSteps.includes(index)) return 'completed';
  if (skippedSteps.includes(index)) return 'skipped';
  if (index === currentStep) return 'current';
  return 'future';
}

const statusColors: Record<StepStatus, string> = {
  completed: 'bg-green-500',
  current: 'bg-blue-500',
  skipped: 'bg-yellow-500',
  future: 'bg-gray-300 dark:bg-gray-600',
};

const statusLabels: Record<StepStatus, string> = {
  completed: 'Done',
  current: 'Current',
  skipped: 'Skipped',
  future: 'Pending',
};

export function ShadowCompanion({
  workflowName,
  steps,
  currentStep,
  completedSteps,
  skippedSteps,
  isPaused,
  onStepAction,
  onNavigate,
}: ShadowCompanionProps) {
  const totalSteps = steps.length;
  const completedCount = completedSteps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const currentStepData = steps[currentStep];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg bg-white dark:bg-gray-900 overflow-hidden max-w-md">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {workflowName}
          </h3>
          {isPaused && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 font-medium">
              Paused
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {completedCount} of {totalSteps} steps
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Current step display */}
      {currentStepData && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">
            Step {currentStep + 1} of {totalSteps}: {currentStepData.name}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {currentStepData.description}
          </p>

          {/* Per-step action buttons */}
          {!isPaused && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onStepAction(currentStep, 'shadow_handles')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              >
                Shadow handles it
              </button>
              <button
                onClick={() => onStepAction(currentStep, 'i_do_it')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              >
                I&apos;ll do it
              </button>
              <button
                onClick={() => onStepAction(currentStep, 'delegate')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
              >
                Delegate
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step progress visualization */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
        <div className="space-y-1.5">
          {steps.map((step, index) => {
            const status = getStepStatus(index, currentStep, completedSteps, skippedSteps);
            return (
              <div key={step.id} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${statusColors[status]}`}
                  title={statusLabels[status]}
                />
                <span
                  className={`text-xs truncate ${
                    status === 'current'
                      ? 'font-medium text-gray-900 dark:text-white'
                      : status === 'completed'
                        ? 'text-gray-500 dark:text-gray-400 line-through'
                        : status === 'skipped'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {step.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onNavigate('skip')}
          disabled={isPaused}
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
        >
          Skip
        </button>
        <button
          onClick={() => onNavigate(isPaused ? 'resume' : 'pause')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={() => onNavigate('back')}
          disabled={currentStep === 0 || isPaused}
          className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
        >
          Go back
        </button>
        <button
          onClick={() => onNavigate('finish')}
          className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors focus:outline-none"
        >
          Just finish it
        </button>
      </div>
    </div>
  );
}
