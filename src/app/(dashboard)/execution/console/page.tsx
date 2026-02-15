'use client';

import OperatorConsole from '@/modules/execution/components/OperatorConsole';

export default function OperatorConsolePage() {
  const entityId = 'default-entity';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Operator Console
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Full timeline of all system actions with filtering and activity analytics.
        </p>
      </div>
      <OperatorConsole entityId={entityId} />
    </div>
  );
}
