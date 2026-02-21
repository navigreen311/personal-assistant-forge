'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { MessageChannel, Tone } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = 'drafting' | 'broadcast' | 'cadence' | 'relationships' | 'history';

interface EntityOption {
  id: string;
  name: string;
  type: string;
}

interface CommunicationStats {
  draftsToday: number;
  sentToday: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  approvalRate: number; // 0-100
}

interface OverdueFollowUp {
  contactId: string;
  contactName: string;
  frequency: string;
  daysOverdue: number;
}

interface ContactAttention {
  contactId: string;
  name: string;
  score: number;
  reason: string;
}

interface BroadcastHistoryItem {
  id: string;
  subject: string;
  totalSent: number;
  sentAt: string;
}

interface DraftHistoryItem {
  id: string;
  recipientName: string;
  channel: MessageChannel;
  tone: Tone;
  subject?: string;
  bodyPreview: string;
  status: 'DRAFT' | 'APPROVED' | 'SENT';
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Dynamic Imports with Graceful Fallbacks
// ---------------------------------------------------------------------------

// EnhancedDraftComposer -> falls back to DraftComposer
const EnhancedDraftComposer = dynamic(
  () =>
    import('@/modules/communication/components/EnhancedDraftComposer').catch(
      () => import('@/modules/communication/components/DraftComposer')
    ),
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Draft Composer" />,
  }
);

// EnhancedBroadcastComposer -> falls back to BroadcastComposer
const EnhancedBroadcastComposer = dynamic(
  () =>
    import('@/modules/communication/components/EnhancedBroadcastComposer').catch(
      () => import('@/modules/communication/components/BroadcastComposer')
    ),
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Broadcast Composer" />,
  }
);

// CadenceTab -> falls back to inline
const CadenceTab = dynamic(
  () =>
    import('@/modules/communication/components/CadenceTab').catch(() => ({
      default: CadenceTabFallback,
    })),
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Cadence" />,
  }
);

// RelationshipsTab -> falls back to inline
const RelationshipsTab = dynamic(
  () =>
    import('@/modules/communication/components/RelationshipsTab').catch(() => ({
      default: RelationshipsTabFallback,
    })),
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="Relationships" />,
  }
);

// DraftHistoryTab -> falls back to inline
const DraftHistoryTab = dynamic(
  () =>
    import('@/modules/communication/components/DraftHistoryTab').catch(() => ({
      default: DraftHistoryTabFallback,
    })),
  {
    ssr: false,
    loading: () => <TabLoadingSkeleton label="History" />,
  }
);

// ---------------------------------------------------------------------------
// Loading Skeleton Components
// ---------------------------------------------------------------------------

function TabLoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-5 w-5 bg-gray-200 rounded" />
        <div className="h-5 bg-gray-200 rounded w-40" />
      </div>
      <div className="space-y-4">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
        <div className="h-10 bg-gray-100 rounded w-48 mt-4" />
      </div>
      <p className="sr-only">Loading {label}...</p>
    </div>
  );
}

function StatsBarSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse"
        >
          <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
          <div className="h-7 bg-gray-200 rounded w-12" />
        </div>
      ))}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header skeleton */}
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-96 mb-4" />
        <div className="h-10 bg-gray-100 rounded w-48" />
      </div>

      {/* Stats bar skeleton */}
      <StatsBarSkeleton />

      {/* Tab bar skeleton */}
      <div className="border-b border-gray-200 animate-pulse">
        <div className="flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-100 rounded w-24 mb-3" />
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
        <div className="space-y-4">
          <div className="h-4 bg-gray-100 rounded w-full" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-4 bg-gray-100 rounded w-5/6" />
          <div className="h-32 bg-gray-50 rounded w-full mt-4" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  bold = false,
  suffix,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  suffix?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`text-2xl ${bold ? 'font-bold' : 'font-semibold'} ${color}`}
      >
        {value}
        {suffix && (
          <span className="text-sm font-normal ml-0.5">{suffix}</span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Fallback Components
// ---------------------------------------------------------------------------

function CadenceTabFallback({ entityId }: { entityId?: string }) {
  const [overdueFollowUps, setOverdueFollowUps] = useState<OverdueFollowUp[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCadence() {
      setLoading(true);
      try {
        const params = entityId ? `?entityId=${entityId}` : '';
        const res = await fetch(
          `/api/communication/cadence/overdue${params}`
        ).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          setOverdueFollowUps(data.data ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch cadence data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCadence();
  }, [entityId]);

  return (
    <div className="space-y-6">
      {/* Overdue Follow-Ups */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Overdue Follow-Ups
          </h3>
          {overdueFollowUps.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
              {overdueFollowUps.length} overdue
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-3">
                <div>
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
                <div className="h-6 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : overdueFollowUps.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-10 w-10 text-green-400 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              No overdue follow-ups. You&apos;re on track!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {overdueFollowUps.map((item) => (
              <div
                key={item.contactId}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.contactName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.frequency} cadence &middot; {item.daysOverdue} day
                    {item.daysOverdue !== 1 ? 's' : ''} overdue
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      item.daysOverdue > 14
                        ? 'bg-red-100 text-red-700'
                        : item.daysOverdue > 7
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {item.daysOverdue > 14
                      ? 'Critical'
                      : item.daysOverdue > 7
                        ? 'Warning'
                        : 'Overdue'}
                  </span>
                  <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Follow Up
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cadence Overview */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Cadence Overview
        </h3>
        <p className="text-sm text-gray-500">
          Configure follow-up cadences per contact. Set frequency, escalation
          rules, and preferred channels for automated reminders.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Daily
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">--</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Weekly
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">--</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Monthly
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-1">--</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RelationshipsTabFallback({ entityId }: { entityId?: string }) {
  const [contactsNeedingAttention, setContactsNeedingAttention] = useState<
    ContactAttention[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRelationships() {
      setLoading(true);
      try {
        const params = entityId ? `?entityId=${entityId}` : '';
        const res = await fetch(
          `/api/communication/relationships/attention${params}`
        ).catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          setContactsNeedingAttention(data.data ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch relationship data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRelationships();
  }, [entityId]);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-green-100 text-green-700';
    if (score >= 50) return 'bg-blue-100 text-blue-700';
    if (score >= 30) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getScoreBar = (score: number) => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-blue-500';
    if (score >= 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Contacts Needing Attention */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Contacts Needing Attention
          </h3>
          {contactsNeedingAttention.length > 0 && (
            <span className="text-xs text-gray-500">
              {contactsNeedingAttention.length} contact
              {contactsNeedingAttention.length !== 1 ? 's' : ''} flagged
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-3">
                <div>
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-56" />
                </div>
                <div className="h-6 bg-gray-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : contactsNeedingAttention.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-10 w-10 text-green-400 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              All relationships are healthy.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contactsNeedingAttention.map((item) => (
              <div
                key={item.contactId}
                className="py-3 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm font-medium text-gray-900">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {item.reason}
                  </p>
                  {/* Score bar */}
                  <div className="mt-2 w-full max-w-[200px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getScoreBar(item.score)}`}
                      style={{ width: `${Math.min(item.score, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getScoreColor(item.score)}`}
                  >
                    Score: {item.score}
                  </span>
                  <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                    Re-engage
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Relationship Health Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Relationship Health Summary
        </h3>
        <p className="text-sm text-gray-500">
          AI-powered relationship intelligence monitors interaction frequency,
          sentiment trends, and commitment fulfillment across your network.
        </p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Strong
            </p>
            <p className="text-lg font-semibold text-green-600 mt-1">--</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Moderate
            </p>
            <p className="text-lg font-semibold text-blue-600 mt-1">--</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Weak
            </p>
            <p className="text-lg font-semibold text-amber-600 mt-1">--</p>
          </div>
          <div className="border border-gray-100 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Dormant
            </p>
            <p className="text-lg font-semibold text-red-600 mt-1">--</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftHistoryTabFallback({ entityId }: { entityId?: string }) {
  const [history, setHistory] = useState<DraftHistoryItem[]>([]);
  const [broadcastHistory, setBroadcastHistory] = useState<
    BroadcastHistoryItem[]
  >([]);
  const [filter, setFilter] = useState<'all' | 'DRAFT' | 'APPROVED' | 'SENT'>(
    'all'
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const params = entityId ? `?entityId=${entityId}` : '';
        const [draftRes, broadcastRes] = await Promise.allSettled([
          fetch(`/api/communication/drafts/history${params}`),
          fetch(`/api/communication/broadcast/history${params}`),
        ]);

        if (
          draftRes.status === 'fulfilled' &&
          draftRes.value.ok
        ) {
          const data = await draftRes.value.json();
          setHistory(data.data ?? []);
        }
        if (
          broadcastRes.status === 'fulfilled' &&
          broadcastRes.value.ok
        ) {
          const data = await broadcastRes.value.json();
          setBroadcastHistory(data.data ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [entityId]);

  const filteredHistory =
    filter === 'all'
      ? history
      : history.filter((item) => item.status === filter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-700';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'SENT':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getChannelIcon = (channel: MessageChannel) => {
    switch (channel) {
      case 'EMAIL':
        return 'envelope';
      case 'SMS':
        return 'chat';
      case 'SLACK':
      case 'DISCORD':
      case 'TEAMS':
        return 'hashtag';
      default:
        return 'paper-airplane';
    }
  };

  return (
    <div className="space-y-6">
      {/* Draft History */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Draft History</h3>
          <div className="flex gap-1">
            {(['all', 'DRAFT', 'APPROVED', 'SENT'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-3">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-72" />
                </div>
                <div className="h-6 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-10 w-10 text-gray-300 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
            <p className="text-sm text-gray-500">
              {filter === 'all'
                ? 'No draft history yet. Start composing to see your history here.'
                : `No ${filter.toLowerCase()} drafts found.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredHistory.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between group hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 uppercase">
                      {getChannelIcon(item.channel) === 'envelope'
                        ? 'Email'
                        : item.channel}
                    </span>
                    <span className="text-gray-300">&middot;</span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.recipientName}
                    </span>
                  </div>
                  {item.subject && (
                    <p className="text-sm text-gray-700 truncate mt-0.5">
                      {item.subject}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {item.bodyPreview}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(item.createdAt).toLocaleDateString()} &middot;{' '}
                    {item.tone.toLowerCase()} tone
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(item.status)}`}
                  >
                    {item.status}
                  </span>
                  <button className="opacity-0 group-hover:opacity-100 text-xs text-blue-600 hover:text-blue-700 font-medium transition-opacity">
                    Reuse
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Broadcast History */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Broadcast History
        </h3>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="animate-pulse flex items-center justify-between py-3">
                <div>
                  <div className="h-4 bg-gray-200 rounded w-40 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-24" />
                </div>
                <div className="h-4 bg-gray-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : broadcastHistory.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              No broadcast history yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {broadcastHistory.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.subject}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(item.sentAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {item.totalSent} sent
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Configuration
// ---------------------------------------------------------------------------

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'drafting',
    label: 'Draft Composer',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
        />
      </svg>
    ),
  },
  {
    key: 'broadcast',
    label: 'Broadcast',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46"
        />
      </svg>
    ),
  },
  {
    key: 'cadence',
    label: 'Cadence',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  {
    key: 'relationships',
    label: 'Relationships',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
        />
      </svg>
    ),
  },
  {
    key: 'history',
    label: 'History',
    icon: (
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Default Stats
// ---------------------------------------------------------------------------

const DEFAULT_STATS: CommunicationStats = {
  draftsToday: 0,
  sentToday: 0,
  pendingFollowUps: 0,
  overdueFollowUps: 0,
  approvalRate: 0,
};

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function CommunicationPage() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<Tab>('drafting');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [stats, setStats] = useState<CommunicationStats>(DEFAULT_STATS);
  const [pageLoading, setPageLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch Entities ---
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities').catch(() => null);
        if (res?.ok) {
          const data = await res.json();
          const entityList: EntityOption[] = (data.data ?? []).map(
            (e: { id: string; name: string; type?: string }) => ({
              id: e.id,
              name: e.name,
              type: e.type ?? 'Unknown',
            })
          );
          setEntities(entityList);
        }
      } catch (err) {
        console.error('Failed to fetch entities:', err);
      } finally {
        setPageLoading(false);
      }
    }
    fetchEntities();
  }, []);

  // --- Fetch Stats (re-fetches when entity changes) ---
  const fetchStats = useCallback(async (entityId: string) => {
    setStatsLoading(true);
    try {
      const params = entityId ? `?entityId=${entityId}` : '';
      const res = await fetch(
        `/api/communication/stats${params}`
      ).catch(() => null);
      if (res?.ok) {
        const data = await res.json();
        setStats({
          draftsToday: data.data?.draftsToday ?? 0,
          sentToday: data.data?.sentToday ?? 0,
          pendingFollowUps: data.data?.pendingFollowUps ?? 0,
          overdueFollowUps: data.data?.overdueFollowUps ?? 0,
          approvalRate: data.data?.approvalRate ?? 0,
        });
      } else {
        setStats(DEFAULT_STATS);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      setStats(DEFAULT_STATS);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pageLoading) {
      fetchStats(selectedEntityId);
    }
  }, [selectedEntityId, pageLoading, fetchStats]);

  // --- Entity ID to pass to tabs ---
  const entityIdProp = selectedEntityId || undefined;

  // --- Render tab content ---
  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'drafting':
        return <EnhancedDraftComposer entityId={entityIdProp} />;
      case 'broadcast':
        return <EnhancedBroadcastComposer entityId={entityIdProp} />;
      case 'cadence':
        return <CadenceTab entityId={entityIdProp} />;
      case 'relationships':
        return <RelationshipsTab entityId={entityIdProp} />;
      case 'history':
        return <DraftHistoryTab entityId={entityIdProp} />;
      default:
        return null;
    }
  }, [activeTab, entityIdProp]);

  // --- Page Loading State ---
  if (pageLoading) {
    return <PageSkeleton />;
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <svg
            className="mx-auto h-10 w-10 text-red-400 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <p className="text-sm font-medium text-red-800">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchStats(selectedEntityId);
            }}
            className="mt-3 text-sm text-red-600 hover:text-red-700 font-medium underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Page Header                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Communication Hub
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Strategic communication — draft, broadcast, and manage relationships
            across all entities.
          </p>
        </div>

        {/* Entity Selector */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <label
            htmlFor="entity-select"
            className="text-sm font-medium text-gray-700 whitespace-nowrap"
          >
            Entity:
          </label>
          <select
            id="entity-select"
            value={selectedEntityId}
            onChange={(e) => setSelectedEntityId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px]"
          >
            <option value="">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
                {entity.type ? ` (${entity.type})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Stats Bar                                                         */}
      {/* ----------------------------------------------------------------- */}
      {statsLoading ? (
        <StatsBarSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            label="Drafts Today"
            value={stats.draftsToday}
            color="text-gray-600"
          />
          <StatCard
            label="Sent Today"
            value={stats.sentToday}
            color="text-blue-600"
          />
          <StatCard
            label="Pending Follow-ups"
            value={stats.pendingFollowUps}
            color="text-amber-600"
          />
          <StatCard
            label="Overdue Follow-ups"
            value={stats.overdueFollowUps}
            color="text-red-600"
            bold={stats.overdueFollowUps > 0}
          />
          <StatCard
            label="Approval Rate"
            value={stats.approvalRate}
            color="text-green-600"
            suffix="%"
          />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Tab Bar                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span
                  className={
                    isActive ? 'text-blue-600' : 'text-gray-400'
                  }
                >
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tab Content                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={activeTab}
      >
        {tabContent}
      </div>
    </div>
  );
}
