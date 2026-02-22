'use client';

import { useState } from 'react';
import type { CrisisEvent, CrisisSeverity } from '../types';

interface EnhancedActiveTabProps {
  entityId?: string;
  onDeclare?: () => void;
  onRefresh?: () => void;
}

const DEMO_CRISIS: CrisisEvent = {
  id: 'crisis-001',
  userId: 'user-001',
  entityId: 'entity-medlink',
  type: 'DATA_BREACH',
  severity: 'CRITICAL',
  status: 'IN_PROGRESS',
  title: 'Unauthorized Access to Customer Database',
  description:
    'Suspicious query patterns detected on the customer database. Preliminary analysis indicates unauthorized read access to PII records.',
  detectedAt: new Date('2026-02-15T10:30:00'),
  acknowledgedAt: new Date('2026-02-15T10:35:00'),
  escalationChain: [
    {
      order: 1,
      contactName: 'CTO',
      contactMethod: 'PHONE',
      escalateAfterMinutes: 5,
      status: 'ACKNOWLEDGED',
      notifiedAt: new Date('2026-02-15T10:31:00'),
      acknowledgedAt: new Date('2026-02-15T10:33:00'),
    },
    {
      order: 2,
      contactName: 'Security Team Lead',
      contactMethod: 'SMS',
      escalateAfterMinutes: 10,
      status: 'ACKNOWLEDGED',
      notifiedAt: new Date('2026-02-15T10:32:00'),
      acknowledgedAt: new Date('2026-02-15T10:34:00'),
    },
  ],
  playbook: {
    id: 'pb-data-breach',
    name: 'Data Breach Response',
    crisisType: 'DATA_BREACH',
    steps: [
      {
        order: 1,
        title: 'Identify breach scope',
        description: 'Determine which systems and data were accessed.',
        actionType: 'TECHNICAL',
        isAutomatable: false,
        isComplete: true,
        completedAt: new Date('2026-02-15T14:00:00'),
      },
      {
        order: 2,
        title: 'Isolate affected systems',
        description: 'Quarantine compromised hosts and revoke credentials.',
        actionType: 'TECHNICAL',
        isAutomatable: true,
        isComplete: true,
        completedAt: new Date('2026-02-16T09:00:00'),
      },
      {
        order: 3,
        title: 'Notify affected parties',
        description: 'Draft and send notifications to impacted customers.',
        actionType: 'COMMUNICATION',
        isAutomatable: false,
        isComplete: false,
      },
      {
        order: 4,
        title: 'Engage legal counsel',
        description: 'Brief legal team on breach details and regulatory obligations.',
        actionType: 'LEGAL',
        isAutomatable: false,
        isComplete: false,
      },
      {
        order: 5,
        title: 'File regulatory reports',
        description: 'Submit required breach disclosures to regulatory bodies.',
        actionType: 'LEGAL',
        isAutomatable: false,
        isComplete: false,
      },
      {
        order: 6,
        title: 'Implement remediation',
        description: 'Patch vulnerabilities and harden access controls.',
        actionType: 'TECHNICAL',
        isAutomatable: true,
        isComplete: false,
      },
      {
        order: 7,
        title: 'Post-mortem and prevention plan',
        description: 'Conduct full review and define preventive measures.',
        actionType: 'DOCUMENTATION',
        isAutomatable: false,
        isComplete: false,
      },
    ],
    estimatedResolutionHours: 72,
  },
  warRoom: {
    isActive: true,
    activatedAt: new Date('2026-02-15T10:35:00'),
    clearedCalendarEvents: ['Board sync', 'Product review'],
    surfacedDocuments: ['incident-response-plan', 'data-breach-playbook'],
    draftedComms: ['Initial breach notification', 'Customer comm'],
    participants: ['CTO', 'Security Team Lead'],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(from: Date): string {
  const ms = Date.now() - from.getTime();
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function severityBorderClass(severity: CrisisSeverity): string {
  if (severity === 'CRITICAL') return 'border-2 border-red-300 dark:border-red-500';
  if (severity === 'HIGH') return 'border-2 border-yellow-300 dark:border-yellow-500';
  return 'border border-gray-200 dark:border-gray-700';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlaybookSteps({ crisis }: { crisis: CrisisEvent }) {
  const playbook = crisis.playbook;
  if (!playbook) return null;

  const completedCount = playbook.steps.filter((s) => s.isComplete).length;
  const currentStepOrder =
    playbook.steps.find((s) => !s.isComplete)?.order ?? -1;

  return (
    <div className="mt-4">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        Playbook: {playbook.name} (Step {currentStepOrder > 0 ? currentStepOrder : completedCount}/{playbook.steps.length})
      </div>
      <div className="space-y-1">
        {playbook.steps.map((step) => {
          const isCurrent = step.order === currentStepOrder;
          let icon: string;
          let textClass: string;

          if (step.isComplete) {
            icon = '✅';
            textClass = 'text-gray-600 dark:text-gray-400 line-through';
          } else if (isCurrent) {
            icon = '🔵';
            textClass = 'text-blue-700 dark:text-blue-400 font-medium';
          } else {
            icon = '⬜';
            textClass = 'text-gray-500 dark:text-gray-500';
          }

          return (
            <div key={step.order} className="flex items-center gap-2 text-sm">
              <span>{icon}</span>
              <span className={textClass}>
                Step {step.order}: {step.title}
                {step.isComplete && ' (completed)'}
                {isCurrent && ' (in progress)'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WarRoomSection({ crisis }: { crisis: CrisisEvent }) {
  const { warRoom } = crisis;
  if (!warRoom.isActive) return null;

  return (
    <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wider mb-3 text-center">
        ── WAR ROOM ──
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Cleared:</span>{" "}
          <span className="text-gray-600 dark:text-gray-400">
            {warRoom.clearedCalendarEvents.length} calendar event{warRoom.clearedCalendarEvents.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Documents:</span>{" "}
          <span className="text-gray-600 dark:text-gray-400">
            {warRoom.surfacedDocuments.join(', ')}
          </span>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Drafts:</span>{" "}
          <span className="text-gray-600 dark:text-gray-400">
            {warRoom.draftedComms.join(', ')}
          </span>
        </div>
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">Participants:</span>{" "}
          <span className="text-gray-600 dark:text-gray-400">
            {warRoom.participants.join(', ')}
          </span>
        </div>
      </div>
    </div>
  );
}

function CrisisActionButtons({
  onResolve,
}: {
  onResolve: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">
        View War Room
      </button>
      <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
        📞 Call Phone Tree
      </button>
      <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
        📧 Send Update
      </button>
      <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
        📋 View Playbook
      </button>
      <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors">
        ⏸ Pause
      </button>
      <button
        onClick={onResolve}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
      >
        ✅ Resolve Crisis
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolve Modal
// ---------------------------------------------------------------------------

function ResolveModal({
  crisis,
  onClose,
  onConfirm,
}: {
  crisis: CrisisEvent;
  onClose: () => void;
  onConfirm: (crisisId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
          Resolve Crisis
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Are you sure you want to mark <strong>{crisis.title}</strong> as resolved? This will deactivate the war room and notify all participants.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(crisis.id)}
            className="px-4 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            Confirm Resolve
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onDeclare }: { onDeclare?: () => void }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 text-center">
      <div className="text-4xl mb-3">✅</div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        No active crises
      </h3>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        All systems operating normally.
      </p>
      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 mb-6">
        <div>Last crisis: Feb 15, 2026 │ Time since: 6 days</div>
        <div>Dead Man&apos;s Switch: ✅ Active (last check-in: 2h ago)</div>
      </div>
      {onDeclare && (
        <button
          onClick={onDeclare}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-colors"
        >
          🚨 Declare New Crisis
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function EnhancedActiveTab({
  entityId,
  onDeclare,
  onRefresh,
}: EnhancedActiveTabProps) {
  const [crises, setCrises] = useState<CrisisEvent[]>([DEMO_CRISIS]);
  const [selectedCrisis, setSelectedCrisis] = useState<CrisisEvent | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filter by entity if provided
  const filteredCrises = entityId
    ? crises.filter((c) => c.entityId === entityId)
    : crises;

  const activeCrises = filteredCrises.filter(
    (c) => c.status !== 'RESOLVED' && c.status !== 'POST_MORTEM',
  );

  const handleResolve = (crisis: CrisisEvent) => {
    setSelectedCrisis(crisis);
    setShowResolveModal(true);
  };

  const confirmResolve = (crisisId: string) => {
    setLoading(true);
    setCrises((prev) =>
      prev.map((c) =>
        c.id === crisisId
          ? { ...c, status: 'RESOLVED' as const, resolvedAt: new Date() }
          : c,
      ),
    );
    setShowResolveModal(false);
    setSelectedCrisis(null);
    setLoading(false);
    onRefresh?.();
  };

  // Empty state
  if (activeCrises.length === 0) {
    return <EmptyState onDeclare={onDeclare} />;
  }

  // Active crises
  return (
    <div className="space-y-6">
      {loading && (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
          Updating...
        </div>
      )}

      {activeCrises.map((crisis) => {
        const lead =
          crisis.escalationChain.find((e) => e.status === 'ACKNOWLEDGED')
            ?.contactName ?? '—';

        return (
          <div
            key={crisis.id}
            className={`bg-white dark:bg-gray-900 rounded-xl shadow ${severityBorderClass(crisis.severity)} p-6`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚨</span>
                <span className="text-sm font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                  Active Crisis
                </span>
              </div>
              <button
                onClick={() => handleResolve(crisis)}
                className="px-3 py-1 text-sm font-medium rounded-md bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
              >
                Resolve
              </button>
            </div>

            {/* Title & metadata */}
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
              {crisis.title}
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>
                Type: <strong>{crisis.type.replace(/_/g, ' ')}</strong>
              </span>
              <span className="text-gray-300 dark:text-gray-600">│</span>
              <span>
                Severity:{" "}
                <strong
                  className={
                    crisis.severity === 'CRITICAL'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-yellow-600 dark:text-yellow-400'
                  }
                >
                  {crisis.severity}
                </strong>
              </span>
              <span className="text-gray-300 dark:text-gray-600">│</span>
              <span>
                Entity: <strong>MedLink</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span>
                Detected: <strong>{formatDateTime(new Date(crisis.detectedAt))}</strong>
              </span>
              <span className="text-gray-300 dark:text-gray-600">│</span>
              <span>
                Duration: <strong>{formatDuration(new Date(crisis.detectedAt))}</strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Status:{" "}
                <strong className="text-blue-600 dark:text-blue-400">
                  {crisis.status.replace(/_/g, ' ')}
                </strong>
              </span>
              <span className="text-gray-300 dark:text-gray-600">│</span>
              <span>
                Lead: <strong>{lead}</strong>
              </span>
            </div>

            {/* Playbook progress */}
            <PlaybookSteps crisis={crisis} />

            {/* War room details */}
            <WarRoomSection crisis={crisis} />

            {/* Action buttons */}
            <CrisisActionButtons onResolve={() => handleResolve(crisis)} />
          </div>
        );
      })}

      {/* Resolve confirmation modal */}
      {showResolveModal && selectedCrisis && (
        <ResolveModal
          crisis={selectedCrisis}
          onClose={() => {
            setShowResolveModal(false);
            setSelectedCrisis(null);
          }}
          onConfirm={confirmResolve}
        />
      )}
    </div>
  );
}
