'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Contact, Commitment } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedContactDetailProps {
  contactId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysSince(date: Date | string | null): number {
  if (!date) return 999;
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatRelativeDate(date: Date | string | null): string {
  if (!date) return 'Never';
  const days = getDaysSince(date);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  return new Date(date).toLocaleDateString();
}

function getCadenceThresholdDays(frequency: string | undefined): number {
  const thresholds: Record<string, number> = {
    DAILY: 1,
    WEEKLY: 7,
    BIWEEKLY: 14,
    MONTHLY: 30,
    QUARTERLY: 90,
  };
  return thresholds[frequency ?? ''] ?? 14;
}

function computeNextTouchDate(
  lastTouch: Date | string | null,
  cadenceDays: number,
): string {
  if (!lastTouch) return 'ASAP';
  const last = new Date(lastTouch).getTime();
  const next = new Date(last + cadenceDays * 24 * 60 * 60 * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (next < today) return 'Overdue';
  return next.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-indigo-500',
    'bg-teal-500',
  ];
  const color = colors[Math.abs(hash) % colors.length];

  return (
    <div
      className={`flex items-center justify-center h-16 w-16 rounded-full text-white text-xl font-bold shrink-0 ${color}`}
    >
      {initials}
    </div>
  );
}

function ScoreBarWide({ score }: { score: number }) {
  const color =
    score > 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-semibold text-gray-700 w-8 text-right">
        {score}
      </span>
    </div>
  );
}

function TierPill({ score }: { score: number }) {
  if (score > 70) {
    return (
      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded-full">
        Strong
      </span>
    );
  }
  if (score >= 40) {
    return (
      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
        Moderate
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-medium rounded-full">
      Weak
    </span>
  );
}

function EntityPill({ entityId }: { entityId: string }) {
  return (
    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
      {entityId}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function RelationshipOverviewSection({ contact }: { contact: Contact }) {
  const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
  const cadenceFrequency = prefs.cadenceFrequency as string | undefined;
  const daysSince = getDaysSince(contact.lastTouch);
  const cadenceDays = getCadenceThresholdDays(cadenceFrequency);
  const isOnTrack = cadenceFrequency ? daysSince <= cadenceDays : true;
  const nextTouchDue = cadenceFrequency
    ? computeNextTouchDate(contact.lastTouch, cadenceDays)
    : 'No cadence set';
  const preferredChannel = (prefs.preferredChannel as string) ?? contact.preferences?.preferredChannel ?? '--';
  const preferredTone = (prefs.preferredTone as string) ?? contact.preferences?.preferredTone ?? '--';

  // Determine last touch type heuristic (based on channels available)
  const lastTouchType = contact.channels.length > 0
    ? contact.channels[0].type.toLowerCase()
    : 'contact';

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Relationship Overview</h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Last Touch</span>
          <p className="text-gray-900 font-medium">
            {formatRelativeDate(contact.lastTouch)}
            {contact.lastTouch && (
              <span className="text-gray-500 font-normal"> ({lastTouchType})</span>
            )}
          </p>
        </div>

        <div>
          <span className="text-gray-500">Cadence</span>
          <p className="text-gray-900 font-medium">
            {cadenceFrequency ? (
              <>
                Every {cadenceDays} days{' '}
                {isOnTrack ? (
                  <span className="text-green-600">On track</span>
                ) : (
                  <span className="text-red-600">Overdue</span>
                )}
              </>
            ) : (
              <span className="text-gray-400">No cadence set</span>
            )}
          </p>
        </div>

        <div>
          <span className="text-gray-500">Next touch due</span>
          <p className={`font-medium ${nextTouchDue === 'Overdue' ? 'text-red-600' : 'text-gray-900'}`}>
            {nextTouchDue}
          </p>
        </div>

        <div>
          <span className="text-gray-500">Preferred channel</span>
          <p className="text-gray-900 font-medium">{preferredChannel}</p>
        </div>

        <div className="col-span-2">
          <span className="text-gray-500">Tone</span>
          <p className="text-gray-900 font-medium">{preferredTone}</p>
        </div>
      </div>
    </div>
  );
}

function OpenCommitmentsSection({ commitments }: { commitments: Commitment[] }) {
  const openCommitments = commitments.filter((c) => c.status === 'OPEN');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Open Commitments</h3>
        <span className="text-xs text-gray-500">{openCommitments.length} open</span>
      </div>

      {openCommitments.length === 0 ? (
        <p className="text-sm text-gray-500">No open commitments.</p>
      ) : (
        <ul className="space-y-2">
          {openCommitments.map((c) => {
            const isOverdue = c.dueDate && getDaysSince(c.dueDate) > 0;
            const directionLabel =
              c.direction === 'TO' ? 'You \u2192 them' : 'They \u2192 you';

            return (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {isOverdue ? (
                    <span className="text-amber-500" title="Overdue">{'\u26A0'}</span>
                  ) : (
                    <span className="text-gray-400">{'\u2022'}</span>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`${isOverdue ? 'text-amber-800' : 'text-gray-900'}`}>
                    {c.description}
                  </p>
                  <p className="text-xs text-gray-500">
                    {directionLabel}
                    {c.dueDate && (
                      <span className={isOverdue ? ' text-amber-600 font-medium' : ''}>
                        {' '}&middot; Due: {new Date(c.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
        + Add commitment
      </button>
    </div>
  );
}

function StakeholderDossierSection({ contact }: { contact: Contact }) {
  const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
  const communicationStyle = prefs.communicationStyle as string | undefined;
  const decisionStyle = prefs.decisionStyle as string | undefined;
  const hotButtons = prefs.hotButtons as string[] | undefined;
  const openLoops = prefs.openLoops as string[] | undefined;

  const hasContent = communicationStyle || decisionStyle ||
    (hotButtons && hotButtons.length > 0) ||
    (openLoops && openLoops.length > 0);

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Stakeholder Dossier</h3>
        <button className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          Edit dossier
        </button>
      </div>

      {!hasContent ? (
        <p className="text-sm text-gray-500">
          Add dossier notes to remember key details about this contact
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          {communicationStyle && (
            <div>
              <span className="text-gray-500">Communication style:</span>
              <p className="text-gray-900">{communicationStyle}</p>
            </div>
          )}
          {decisionStyle && (
            <div>
              <span className="text-gray-500">Decision style:</span>
              <p className="text-gray-900">{decisionStyle}</p>
            </div>
          )}
          {hotButtons && hotButtons.length > 0 && (
            <div>
              <span className="text-gray-500">Hot buttons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {hotButtons.map((btn, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full"
                  >
                    {btn}
                  </span>
                ))}
              </div>
            </div>
          )}
          {openLoops && openLoops.length > 0 && (
            <div>
              <span className="text-gray-500">Open loops:</span>
              <ul className="mt-1 space-y-1">
                {openLoops.map((loop, i) => (
                  <li key={i} className="text-gray-900 flex items-start gap-1.5">
                    <span className="text-gray-400 mt-0.5">{'\u2022'}</span>
                    {loop}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InteractionHistorySection({ contact }: { contact: Contact }) {
  // Interaction history is derived from available data; the API may provide
  // an `interactions` field on the contact. We handle both cases gracefully.
  const interactions = ((contact as unknown as Record<string, unknown>).interactions as Array<{
    id: string;
    date: string;
    type: 'email' | 'call' | 'meeting' | 'note';
    description: string;
  }>) ?? [];

  const typeIcons: Record<string, string> = {
    email: '\uD83D\uDCE7',
    call: '\uD83D\uDCDE',
    meeting: '\uD83D\uDCC5',
    note: '\uD83D\uDCDD',
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Interaction History</h3>

      {interactions.length === 0 ? (
        <p className="text-sm text-gray-500">No interactions recorded yet</p>
      ) : (
        <>
          <ul className="space-y-3">
            {interactions.slice(0, 5).map((interaction) => (
              <li key={interaction.id} className="flex items-start gap-3 text-sm">
                <span className="text-lg shrink-0 mt-0.5">
                  {typeIcons[interaction.type] ?? '\uD83D\uDCDD'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900">{interaction.description}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(interaction.date).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {interactions.length > 5 && (
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              View all &rarr;
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LinkedItemsSection({ contact }: { contact: Contact }) {
  // Linked items may be provided by the API as extended contact data
  const extended = contact as unknown as Record<string, unknown>;
  const linkedTasks = (extended.linkedTasks as Array<{ id: string; title: string; status: string }>) ?? [];
  const linkedProjects = (extended.linkedProjects as Array<{ id: string; name: string }>) ?? [];
  const linkedDecisions = (extended.linkedDecisions as Array<{ id: string; title: string }>) ?? [];

  const openTaskCount = linkedTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length;

  const hasContent = linkedTasks.length > 0 || linkedProjects.length > 0 || linkedDecisions.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Linked Items</h3>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{openTaskCount}</p>
          <p className="text-xs text-gray-500">Open Tasks</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{linkedProjects.length}</p>
          <p className="text-xs text-gray-500">Projects</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <p className="text-lg font-bold text-gray-900">{linkedDecisions.length}</p>
          <p className="text-xs text-gray-500">Decisions</p>
        </div>
      </div>

      {linkedProjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linkedProjects.map((p) => (
            <span
              key={p.id}
              className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full"
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading & Error states
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-gray-200" />
        <div className="space-y-2 flex-1">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-3 w-28 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
          </div>
        </div>
      </div>
      <div className="h-3 w-full bg-gray-200 rounded" />

      {/* Relationship overview skeleton */}
      <div className="bg-gray-100 rounded-lg p-4 space-y-3">
        <div className="h-4 w-40 bg-gray-200 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 bg-gray-200 rounded" />
              <div className="h-4 w-28 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Commitments skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-36 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-200 rounded" />
        <div className="h-3 w-3/4 bg-gray-200 rounded" />
      </div>

      {/* Dossier skeleton */}
      <div className="bg-gray-100 rounded-lg p-4 space-y-2">
        <div className="h-4 w-36 bg-gray-200 rounded" />
        <div className="h-3 w-full bg-gray-200 rounded" />
        <div className="h-3 w-2/3 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <svg
        className="w-12 h-12 text-red-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        Failed to load contact
      </h3>
      <p className="text-sm text-gray-500 mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
      >
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedContactDetail({
  contactId,
  isOpen,
  onClose,
}: EnhancedContactDetailProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}`);
      if (!res.ok) {
        throw new Error(`Failed to load contact (${res.status})`);
      }
      const json = await res.json();
      if (json.success === false) {
        throw new Error(json.error?.message ?? 'Failed to load contact');
      }
      setContact(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    if (isOpen && contactId) {
      fetchContact();
    }
    if (!isOpen) {
      // Reset state when panel closes
      setContact(null);
      setError(null);
    }
  }, [isOpen, contactId, fetchContact]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ============================================================= */}
        {/* 1. HEADER - Top bar with back/edit */}
        {/* ============================================================= */}
        <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <div className="flex items-center justify-between px-6 py-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors">
              Edit
            </button>
          </div>

          {/* Contact identity */}
          {contact && !loading && (
            <div className="px-6 pb-4 space-y-3">
              <div className="flex items-center gap-4">
                <DetailAvatar name={contact.name} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-gray-900 truncate">
                    {contact.name}
                  </h2>
                  <div className="text-sm text-gray-500 space-y-0.5">
                    {contact.email && <p className="truncate">{contact.email}</p>}
                    {contact.phone && <p>{contact.phone}</p>}
                  </div>
                </div>
              </div>

              {/* Tier + Entity pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <TierPill score={contact.relationshipScore} />
                <EntityPill entityId={contact.entityId} />
                {contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Score bar */}
              <ScoreBarWide score={contact.relationshipScore} />
            </div>
          )}
        </div>

        {/* ============================================================= */}
        {/* Content area */}
        {/* ============================================================= */}

        {loading && <LoadingSkeleton />}

        {error && !loading && (
          <ErrorState message={error} onRetry={fetchContact} />
        )}

        {contact && !loading && !error && (
          <div className="p-6 space-y-6 pb-24">
            {/* ========================================================= */}
            {/* 2. RELATIONSHIP OVERVIEW */}
            {/* ========================================================= */}
            <RelationshipOverviewSection contact={contact} />

            {/* ========================================================= */}
            {/* 3. OPEN COMMITMENTS */}
            {/* ========================================================= */}
            <OpenCommitmentsSection commitments={contact.commitments} />

            {/* ========================================================= */}
            {/* 4. STAKEHOLDER DOSSIER */}
            {/* ========================================================= */}
            <StakeholderDossierSection contact={contact} />

            {/* ========================================================= */}
            {/* 5. INTERACTION HISTORY */}
            {/* ========================================================= */}
            <InteractionHistorySection contact={contact} />

            {/* ========================================================= */}
            {/* 6. LINKED ITEMS */}
            {/* ========================================================= */}
            <LinkedItemsSection contact={contact} />
          </div>
        )}

        {/* ============================================================= */}
        {/* 7. ACTIONS BAR (sticky bottom) */}
        {/* ============================================================= */}
        {contact && !loading && !error && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 z-10">
            <div className="flex gap-2 overflow-x-auto">
              <button
                className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors whitespace-nowrap flex items-center gap-1.5"
                onClick={() => {
                  if (contact.email) window.location.href = `mailto:${contact.email}`;
                }}
              >
                {'\uD83D\uDCE7'} Email
              </button>
              <button
                className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors whitespace-nowrap flex items-center gap-1.5"
                onClick={() => {
                  if (contact.phone) window.location.href = `tel:${contact.phone}`;
                }}
              >
                {'\uD83D\uDCDE'} Call
              </button>
              <button className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors whitespace-nowrap flex items-center gap-1.5">
                {'\uD83D\uDCC5'} Schedule
              </button>
              <button className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors whitespace-nowrap flex items-center gap-1.5">
                {'\u270D'} Draft follow-up
              </button>
              <button className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors whitespace-nowrap flex items-center gap-1.5">
                {'\uD83D\uDCDD'} Add note
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
