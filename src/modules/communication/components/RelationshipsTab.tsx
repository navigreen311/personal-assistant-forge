'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Contact } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RelationshipsTabProps {
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface AttentionContact {
  contactId: string;
  name: string;
  score: number;
  reason: string;
}

interface FetchedCommitment {
  id: string;
  description: string;
  contactName: string;
  dueDate: string | null;
  status: string;
  type: 'made_by_me' | 'made_to_me';
}

interface GhostingCandidate {
  contactId: string;
  name: string;
  unansweredCount: number;
  daysSinceLastReply: number;
  lastChannel: string;
}

type HealthBucket = 'strong' | 'healthy' | 'cooling' | 'atRisk';

interface HealthCounts {
  strong: number;
  healthy: number;
  cooling: number;
  atRisk: number;
}

type TrendDirection = 'declining' | 'stable' | 'improving';

interface AtRiskRow {
  contactId: string;
  name: string;
  score: number;
  trend: TrendDirection;
  lastTouch: Date | null;
  openCommitments: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyScore(score: number): HealthBucket {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'healthy';
  if (score >= 40) return 'cooling';
  return 'atRisk';
}

function computeHealthCounts(contacts: Contact[]): HealthCounts {
  const counts: HealthCounts = { strong: 0, healthy: 0, cooling: 0, atRisk: 0 };
  for (const c of contacts) {
    counts[classifyScore(c.relationshipScore)]++;
  }
  return counts;
}

function inferTrend(contact: Contact): TrendDirection {
  // Heuristic: if score < 30 or no recent touch, declining.
  // If score >= 60, improving. Otherwise stable.
  const daysSince = getDaysSince(contact.lastTouch);
  if (contact.relationshipScore < 30 || daysSince > 60) return 'declining';
  if (contact.relationshipScore >= 60 && daysSince < 14) return 'improving';
  return 'stable';
}

function getTrendArrow(trend: TrendDirection): string {
  if (trend === 'declining') return '\u2193';
  if (trend === 'improving') return '\u2191';
  return '\u2192';
}

function getTrendLabel(trend: TrendDirection): string {
  if (trend === 'declining') return 'Declining';
  if (trend === 'improving') return 'Improving';
  return 'Stable';
}

function getTrendColor(trend: TrendDirection): string {
  if (trend === 'declining') return 'text-red-600';
  if (trend === 'improving') return 'text-green-600';
  return 'text-gray-500';
}

function getDaysSince(date: Date | string | null): number {
  if (!date) return 999;
  return Math.floor(
    (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatRelativeTime(date: Date | string | null): string {
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

function isDueSoon(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const days = getDaysSince(dueDate);
  // Due within the next 3 days (negative days means in the future)
  const daysUntil = -days;
  return daysUntil >= 0 && daysUntil <= 3;
}

function isOverdue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  return getDaysSince(dueDate) > 0;
}

function formatDueDate(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return 'No due date';
  return new Date(dueDate).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthCard({
  label,
  count,
  colorClasses,
  dotColor,
}: {
  label: string;
  count: number;
  colorClasses: string;
  dotColor: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${colorClasses}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{count}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Health cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-4">
            <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-8 w-12 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="h-5 w-44 bg-gray-200 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Ghosting skeleton */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="h-5 w-36 bg-gray-200 rounded" />
        <div className="h-20 w-full bg-gray-200 rounded" />
      </div>

      {/* Commitments skeleton */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-3/4 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Relationship Health
// ---------------------------------------------------------------------------

function RelationshipHealthSection({ counts }: { counts: HealthCounts }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Relationship Health
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HealthCard
          label="Strong (80-100)"
          count={counts.strong}
          colorClasses="bg-green-50 border-green-200 text-green-900"
          dotColor="bg-green-500"
        />
        <HealthCard
          label="Healthy (60-79)"
          count={counts.healthy}
          colorClasses="bg-blue-50 border-blue-200 text-blue-900"
          dotColor="bg-blue-500"
        />
        <HealthCard
          label="Cooling (40-59)"
          count={counts.cooling}
          colorClasses="bg-amber-50 border-amber-200 text-amber-900"
          dotColor="bg-amber-500"
        />
        <HealthCard
          label="At Risk (0-39)"
          count={counts.atRisk}
          colorClasses="bg-red-50 border-red-200 text-red-900"
          dotColor="bg-red-500"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: At-Risk Relationships
// ---------------------------------------------------------------------------

function AtRiskRelationshipsSection({ rows }: { rows: AtRiskRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          At-Risk Relationships
        </h3>
        <div className="text-center py-6">
          <svg
            className="w-10 h-10 text-green-400 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-gray-500">
            No at-risk relationships. Your relationship health is good!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">
          At-Risk Relationships
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Trend</th>
              <th className="px-4 py-3">Last Touch</th>
              <th className="px-4 py-3">Open Commitments</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.contactId} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {row.name}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 ${getTrendColor(row.trend)}`}>
                    {row.score}
                    <span className="text-xs">{getTrendArrow(row.trend)}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      row.trend === 'declining'
                        ? 'bg-red-100 text-red-700'
                        : row.trend === 'improving'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {getTrendLabel(row.trend)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {formatRelativeTime(row.lastTouch)}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {row.openCommitments > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-amber-600 font-medium">
                        {row.openCommitments}
                      </span>
                      <span className="text-xs text-gray-400">open</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors">
                      Draft re-engagement
                    </button>
                    <button className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                      Schedule call
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Ghosting Detection
// ---------------------------------------------------------------------------

function GhostingDetectionSection({
  candidates,
}: {
  candidates: GhostingCandidate[];
}) {
  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Ghosting Detection
        </h3>
        <div className="text-center py-6">
          <svg
            className="w-10 h-10 text-green-400 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-gray-500">No ghosting detected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Ghosting Detection
      </h3>
      <div className="space-y-3">
        {candidates.map((candidate) => (
          <div
            key={candidate.contactId}
            className="bg-red-50 border border-red-200 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-800 font-medium">
                  {candidate.name} hasn&apos;t replied to your last{' '}
                  {candidate.unansweredCount} messages (
                  {candidate.daysSinceLastReply}d ago)
                </p>
                {candidate.lastChannel && (
                  <p className="text-xs text-red-600 mt-1">
                    Last channel: {candidate.lastChannel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button className="px-2 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 rounded transition-colors">
                  Try different channel
                </button>
                <button className="px-2 py-1 text-xs font-medium text-amber-600 bg-white border border-amber-200 hover:bg-amber-50 rounded transition-colors">
                  Escalate
                </button>
                <button className="px-2 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 rounded transition-colors">
                  Accept
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Open Commitments
// ---------------------------------------------------------------------------

function OpenCommitmentsSection({
  promisesMade,
  promisesReceived,
}: {
  promisesMade: FetchedCommitment[];
  promisesReceived: FetchedCommitment[];
}) {
  const hasAny = promisesMade.length > 0 || promisesReceived.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Open Commitments
      </h3>

      {!hasAny ? (
        <div className="text-center py-6">
          <svg
            className="w-10 h-10 text-gray-300 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-sm text-gray-500">
            No open commitments tracked.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Promises you made */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Promises you made:
            </h4>
            {promisesMade.length === 0 ? (
              <p className="text-sm text-gray-400 ml-4">None</p>
            ) : (
              <ul className="space-y-2">
                {promisesMade.map((commitment) => {
                  const overdue = isOverdue(commitment.dueDate);
                  const dueSoon =
                    !overdue && isDueSoon(commitment.dueDate);

                  return (
                    <li
                      key={commitment.id}
                      className="flex items-start gap-2 text-sm ml-2"
                    >
                      <span className="mt-0.5 shrink-0">
                        {overdue ? (
                          <span className="text-red-500" title="Overdue">
                            {'\u26A0'}
                          </span>
                        ) : dueSoon ? (
                          <span className="text-amber-500" title="Due soon">
                            {'\u26A0'}
                          </span>
                        ) : (
                          <span className="text-gray-400">{'\u2022'}</span>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`${
                            overdue
                              ? 'text-red-800'
                              : dueSoon
                                ? 'text-amber-800'
                                : 'text-gray-900'
                          }`}
                        >
                          {commitment.description}
                          <span className="text-gray-500 font-normal">
                            {' '}
                            &mdash; {commitment.contactName}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {commitment.dueDate ? (
                            <span
                              className={
                                overdue
                                  ? 'text-red-600 font-medium'
                                  : dueSoon
                                    ? 'text-amber-600 font-medium'
                                    : ''
                              }
                            >
                              Due: {formatDueDate(commitment.dueDate)}
                              {overdue && ' (overdue)'}
                              {dueSoon && ' (due soon)'}
                            </span>
                          ) : (
                            'No due date'
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Promises made to you */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Promises made to you:
            </h4>
            {promisesReceived.length === 0 ? (
              <p className="text-sm text-gray-400 ml-4">None</p>
            ) : (
              <ul className="space-y-2">
                {promisesReceived.map((commitment) => {
                  const overdue = isOverdue(commitment.dueDate);
                  const dueSoon =
                    !overdue && isDueSoon(commitment.dueDate);

                  return (
                    <li
                      key={commitment.id}
                      className="flex items-start gap-2 text-sm ml-2"
                    >
                      <span className="mt-0.5 shrink-0">
                        {overdue ? (
                          <span className="text-red-500" title="Overdue">
                            {'\u26A0'}
                          </span>
                        ) : dueSoon ? (
                          <span className="text-amber-500" title="Due soon">
                            {'\u26A0'}
                          </span>
                        ) : (
                          <span className="text-gray-400">{'\u2022'}</span>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`${
                            overdue
                              ? 'text-red-800'
                              : dueSoon
                                ? 'text-amber-800'
                                : 'text-gray-900'
                          }`}
                        >
                          {commitment.description}
                          <span className="text-gray-500 font-normal">
                            {' '}
                            &mdash; {commitment.contactName}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {commitment.dueDate ? (
                            <span
                              className={
                                overdue
                                  ? 'text-red-600 font-medium'
                                  : dueSoon
                                    ? 'text-amber-600 font-medium'
                                    : ''
                              }
                            >
                              Due: {formatDueDate(commitment.dueDate)}
                              {overdue && ' (overdue)'}
                              {dueSoon && ' (due soon)'}
                            </span>
                          ) : (
                            'No due date'
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Log new commitment button */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          + Log new commitment
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RelationshipsTab({ entityId }: RelationshipsTabProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [attentionContacts, setAttentionContacts] = useState<AttentionContact[]>([]);
  const [commitments, setCommitments] = useState<FetchedCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Data fetching ----

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const contactParams = new URLSearchParams({ pageSize: '200' });
      if (entityId) contactParams.set('entityId', entityId);

      const commitmentParams = new URLSearchParams();
      if (entityId) commitmentParams.set('entityId', entityId);

      const [contactsRes, attentionRes, commitmentsRes] = await Promise.all([
        fetch(`/api/contacts?${contactParams}`).catch(() => null),
        fetch('/api/communication/relationships/attention').catch(() => null),
        entityId
          ? fetch(
              `/api/communication/commitments?${commitmentParams}`,
            ).catch(() => null)
          : Promise.resolve(null),
      ]);

      // Parse contacts
      if (contactsRes?.ok) {
        const json = await contactsRes.json();
        setContacts(json.data ?? []);
      } else {
        setContacts([]);
      }

      // Parse attention contacts
      if (attentionRes?.ok) {
        const json = await attentionRes.json();
        setAttentionContacts(json.data ?? []);
      } else {
        setAttentionContacts([]);
      }

      // Parse commitments
      if (commitmentsRes?.ok) {
        const json = await commitmentsRes.json();
        const fetched = json.data?.commitments ?? [];
        setCommitments(fetched);
      } else {
        setCommitments([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load relationship data',
      );
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Computed data ----

  const healthCounts = useMemo(
    () => computeHealthCounts(contacts),
    [contacts],
  );

  const atRiskRows: AtRiskRow[] = useMemo(() => {
    // Filter contacts with score < 40 (at risk)
    return contacts
      .filter((c) => c.relationshipScore < 40)
      .map((c) => {
        const openCommitments = (c.commitments ?? []).filter(
          (cm) => cm.status === 'OPEN',
        ).length;

        return {
          contactId: c.id,
          name: c.name,
          score: c.relationshipScore,
          trend: inferTrend(c),
          lastTouch: c.lastTouch,
          openCommitments,
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [contacts]);

  const ghostingCandidates: GhostingCandidate[] = useMemo(() => {
    // Detect contacts who may be ghosting: score < 30, no touch for > 14 days,
    // and are present in the attention list
    const attentionIds = new Set(attentionContacts.map((a) => a.contactId));

    return contacts
      .filter((c) => {
        const daysSince = getDaysSince(c.lastTouch);
        // Consider ghosting if: in attention list OR score very low with stale touch
        return (
          (attentionIds.has(c.id) || c.relationshipScore < 25) &&
          daysSince > 14
        );
      })
      .map((c) => {
        const daysSince = getDaysSince(c.lastTouch);
        // Estimate unanswered count from days and relationship decline
        const estimatedUnanswered = Math.max(
          1,
          Math.min(Math.floor(daysSince / 7), 10),
        );
        const primaryChannel =
          c.channels.length > 0 ? c.channels[0].type : 'Unknown';

        return {
          contactId: c.id,
          name: c.name,
          unansweredCount: estimatedUnanswered,
          daysSinceLastReply: daysSince,
          lastChannel: primaryChannel,
        };
      })
      .sort((a, b) => b.daysSinceLastReply - a.daysSinceLastReply);
  }, [contacts, attentionContacts]);

  const promisesMade = useMemo(
    () => commitments.filter((c) => c.type === 'made_by_me'),
    [commitments],
  );

  const promisesReceived = useMemo(
    () => commitments.filter((c) => c.type === 'made_to_me'),
    [commitments],
  );

  // ---- Render ----

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex flex-col items-center justify-center text-center py-8">
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
            Failed to load relationships
          </h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Relationship Health */}
      <RelationshipHealthSection counts={healthCounts} />

      {/* Section 2: At-Risk Relationships */}
      <AtRiskRelationshipsSection rows={atRiskRows} />

      {/* Section 3: Ghosting Detection */}
      <GhostingDetectionSection candidates={ghostingCandidates} />

      {/* Section 4: Open Commitments */}
      <OpenCommitmentsSection
        promisesMade={promisesMade}
        promisesReceived={promisesReceived}
      />
    </div>
  );
}
