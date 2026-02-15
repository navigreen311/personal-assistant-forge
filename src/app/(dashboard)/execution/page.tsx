'use client';

import FlightControl from '@/modules/execution/components/FlightControl';

export default function FlightControlPage() {
  // ASSUMPTION: entityId would come from auth context or session in production.
  // Using a placeholder for now; replace with actual entity resolution.
  const entityId = 'default-entity';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Flight Control
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Monitor and manage the action queue. Approve, reject, or schedule pending actions.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <QuickFilter label="Pending Approval" status="QUEUED" />
          <QuickFilter label="High Risk" blastRadius="HIGH" />
          <QuickFilter label="Today&apos;s Executions" status="EXECUTED" />
        </div>
      </div>
      <FlightControl entityId={entityId} />
    </div>
  );
}

function QuickFilter({
  label,
  status,
  blastRadius,
}: {
  label: string;
  status?: string;
  blastRadius?: string;
}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (blastRadius) params.set('blastRadius', blastRadius);

  return (
    <a
      href={`/execution?${params.toString()}`}
      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
    >
      {label}
    </a>
  );
}
