'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { MessageChannel } from '@/shared/types';

// ============================================================================
// Types
// ============================================================================

type HistoryStatus = 'DRAFT' | 'SENT' | 'OPENED' | 'REPLIED' | 'NO_RESPONSE';
type DateRange = '7d' | '30d' | 'all';

interface HistoryEntry {
  id: string;
  date: string;
  recipientName: string;
  recipientId: string;
  channel: MessageChannel;
  subject: string;
  preview: string;
  status: HistoryStatus;
  fullBody: string;
}

interface DraftHistoryTabProps {
  entityId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_OPTIONS: { value: HistoryStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'OPENED', label: 'Opened' },
  { value: 'REPLIED', label: 'Replied' },
  { value: 'NO_RESPONSE', label: 'No Response' },
];

const CHANNEL_OPTIONS: { value: MessageChannel | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'SLACK', label: 'Slack' },
  { value: 'SMS', label: 'SMS' },
  { value: 'MANUAL', label: 'LinkedIn' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' },
];

const PAGE_SIZE = 20;

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function formatEntryDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return dateStr;
  }
}

function getChannelIcon(channel: MessageChannel): string {
  switch (channel) {
    case 'EMAIL':
      return '\u2709'; // envelope
    case 'SLACK':
    case 'DISCORD':
    case 'TEAMS':
      return '#';
    case 'SMS':
    case 'VOICE':
      return '\u260E'; // phone
    case 'WHATSAPP':
    case 'TELEGRAM':
      return '\u260E';
    case 'MANUAL':
      return '\uD83D\uDD17'; // link
    default:
      return '\u2709';
  }
}

function getChannelLabel(channel: MessageChannel): string {
  switch (channel) {
    case 'EMAIL':
      return 'Email';
    case 'SLACK':
      return 'Slack';
    case 'SMS':
      return 'SMS';
    case 'WHATSAPP':
      return 'WhatsApp';
    case 'TEAMS':
      return 'Teams';
    case 'DISCORD':
      return 'Discord';
    case 'TELEGRAM':
      return 'Telegram';
    case 'VOICE':
      return 'Voice';
    case 'MANUAL':
      return 'LinkedIn';
    default:
      return channel;
  }
}

function getStatusBadgeClasses(status: HistoryStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-700';
    case 'SENT':
      return 'bg-blue-100 text-blue-700';
    case 'OPENED':
      return 'bg-green-100 text-green-700';
    case 'REPLIED':
      return 'bg-green-100 text-green-800 font-bold';
    case 'NO_RESPONSE':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getStatusLabel(status: HistoryStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SENT':
      return 'Sent';
    case 'OPENED':
      return 'Opened';
    case 'REPLIED':
      return 'Replied';
    case 'NO_RESPONSE':
      return 'No Response';
    default:
      return status;
  }
}

function getDateRangeMs(range: DateRange): number | null {
  switch (range) {
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    case 'all':
      return null;
  }
}

// ============================================================================
// Component
// ============================================================================

export default function DraftHistoryTab({ entityId }: DraftHistoryTabProps) {
  // --- Data state ---
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  // --- Filter state ---
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<HistoryStatus | 'ALL'>('ALL');
  const [channelFilter, setChannelFilter] = useState<MessageChannel | 'ALL'>('ALL');
  const [dateRange, setDateRange] = useState<DateRange>('all');

  // --- Detail modal state ---
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  // --- Fetch data ---
  const fetchHistory = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          pageSize: String(PAGE_SIZE),
        });
        if (entityId) params.set('entityId', entityId);
        if (statusFilter !== 'ALL') params.set('status', statusFilter);

        const res = await fetch(`/api/communication/history?${params}`);
        if (!res.ok) {
          if (!append) setEntries([]);
          setHasMore(false);
          return;
        }

        const json = await res.json();
        const data: HistoryEntry[] = json.data ?? [];
        const total: number = json.meta?.total ?? data.length;

        if (append) {
          setEntries((prev) => [...prev, ...data]);
        } else {
          setEntries(data);
        }
        setHasMore(pageNum * PAGE_SIZE < total);
      } catch {
        if (!append) setEntries([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [entityId, statusFilter],
  );

  useEffect(() => {
    setPage(1);
    fetchHistory(1, false);
  }, [fetchHistory]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHistory(nextPage, true);
  };

  // --- Client-side filtering ---
  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = getDateRangeMs(dateRange);

    return entries.filter((entry) => {
      // Channel filter
      if (channelFilter !== 'ALL' && entry.channel !== channelFilter) return false;

      // Date range filter
      if (rangeMs !== null) {
        const entryTime = new Date(entry.date).getTime();
        if (now - entryTime > rangeMs) return false;
      }

      // Search filter (subject + recipient)
      if (search) {
        const q = search.toLowerCase();
        const matchesSubject = entry.subject.toLowerCase().includes(q);
        const matchesRecipient = entry.recipientName.toLowerCase().includes(q);
        if (!matchesSubject && !matchesRecipient) return false;
      }

      return true;
    });
  }, [entries, search, channelFilter, dateRange]);

  // --- Actions ---
  const handleView = (entry: HistoryEntry) => {
    setSelectedEntry(entry);
  };

  const handleEdit = (entry: HistoryEntry) => {
    alert(`Edit draft: "${entry.subject}" (ID: ${entry.id})`);
  };

  const handleSend = (entry: HistoryEntry) => {
    alert(`Send draft: "${entry.subject}" (ID: ${entry.id})`);
  };

  const handleCloseDetail = () => {
    setSelectedEntry(null);
  };

  // --- Render ---
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Communication History</h2>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subject or recipient..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as HistoryStatus | 'ALL')}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as MessageChannel | 'ALL')}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading indicator */}
      {loading && entries.length === 0 && (
        <p className="text-sm text-gray-500">Loading history...</p>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">
            No communication history yet. Use the Draft Composer to start communicating.
          </p>
        </div>
      )}

      {/* History Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-md">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject / Preview
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatEntryDate(entry.date)}
                  </td>

                  {/* Recipient */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {entry.recipientName}
                  </td>

                  {/* Channel */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    <span className="mr-1">{getChannelIcon(entry.channel)}</span>
                    {getChannelLabel(entry.channel)}
                  </td>

                  {/* Subject / Preview */}
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-xs">
                    {truncate(entry.subject || entry.preview, 50)}
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${getStatusBadgeClasses(entry.status)}`}
                    >
                      {getStatusLabel(entry.status)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      {entry.status === 'DRAFT' ? (
                        <>
                          <button
                            onClick={() => handleEdit(entry)}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleSend(entry)}
                            className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                          >
                            Send
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleView(entry)}
                          className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Detail Modal / Panel */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Message Detail</h3>
              <button
                onClick={handleCloseDetail}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close detail panel"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Date:</span>{' '}
                  <span className="text-gray-900">{formatEntryDate(selectedEntry.date)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${getStatusBadgeClasses(selectedEntry.status)}`}
                  >
                    {getStatusLabel(selectedEntry.status)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Recipient:</span>{' '}
                  <span className="text-gray-900">{selectedEntry.recipientName}</span>
                </div>
                <div>
                  <span className="text-gray-500">Channel:</span>{' '}
                  <span className="text-gray-900">
                    {getChannelIcon(selectedEntry.channel)} {getChannelLabel(selectedEntry.channel)}
                  </span>
                </div>
              </div>

              {selectedEntry.subject && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{selectedEntry.subject}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-500 mb-1">Message</p>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800 whitespace-pre-wrap">
                  {selectedEntry.fullBody}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-3 border-t border-gray-200">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
