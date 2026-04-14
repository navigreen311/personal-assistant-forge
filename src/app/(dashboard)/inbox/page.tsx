'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useShadowPageMap } from '@/hooks/useShadowPageMap';
import { InboxList } from '@/modules/inbox/components/InboxList';
import { InboxFilters } from '@/modules/inbox/components/InboxFilters';
import { MessageDetail } from '@/modules/inbox/components/MessageDetail';
import { BatchTriagePanel } from '@/modules/inbox/components/BatchTriagePanel';
import type {
  InboxItem,
  InboxFilters as InboxFiltersType,
  InboxStats,
  BatchTriageResult,
} from '@/modules/inbox/inbox.types';

// New components to be created by other agents — imported with fallback support
let EnhancedMessageRow: React.ComponentType<{ item: InboxItem; isSelected: boolean; onSelect: (id: string) => void }> | null = null;
let EnhancedMessageDetail: React.ComponentType<{
  item: InboxItem;
  onArchive: (id: string) => void;
  onReply: (id: string) => void;
  onStar: (id: string) => void;
  onFollowUp: (id: string, date: Date) => void;
  onSendDraft: (id: string, body: string) => void;
  onGenerateDraft: (id: string) => void;
}> | null = null;
let BulkActionBar: React.ComponentType<{
  selectedIds: string[];
  onArchive: (ids: string[]) => void;
  onMarkProcessed: (ids: string[]) => void;
  onDelegate: (ids: string[]) => void;
  onSnooze: (ids: string[]) => void;
  onDeselectAll: () => void;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  EnhancedMessageRow = require('@/modules/inbox/components/EnhancedMessageRow').EnhancedMessageRow ?? null;
} catch {
  // Component not yet created — fall back to InboxList
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  EnhancedMessageDetail = require('@/modules/inbox/components/EnhancedMessageDetail').EnhancedMessageDetail ?? null;
} catch {
  // Component not yet created — fall back to MessageDetail
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  BulkActionBar = require('@/modules/inbox/components/BulkActionBar').BulkActionBar ?? null;
} catch {
  // Component not yet created — omit bulk action bar
}

// --- Types ---

type TriageTab = 'all' | 'queue' | 'in_progress' | 'processed' | 'follow_up' | 'archived';
type SortBy = 'urgency' | 'date_newest' | 'date_oldest' | 'sender_importance';

interface TriageTabConfig {
  id: TriageTab;
  label: string;
}

const TRIAGE_TABS: TriageTabConfig[] = [
  { id: 'all', label: 'All' },
  { id: 'queue', label: 'Queue' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'processed', label: 'Processed' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'archived', label: 'Archived' },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'urgency', label: 'Urgency (High→Low)' },
  { value: 'date_newest', label: 'Date (Newest)' },
  { value: 'date_oldest', label: 'Date (Oldest)' },
  { value: 'sender_importance', label: 'Sender Importance' },
];

// --- Component ---

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);

  useShadowPageMap({
    pageId: 'inbox',
    title: 'Inbox',
    description: 'Unified inbox — triage, drafting, follow-ups',
    visibleObjects: [],
    availableActions: [
      { id: 'triage', label: 'Triage inbox', voiceTriggers: ['triage', 'help me triage'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
      { id: 'draft_responses', label: 'Draft responses', voiceTriggers: ['draft replies', 'draft responses'], confirmationLevel: 'tap', reversible: true, blastRadius: 'self' },
      { id: 'show_urgent', label: 'Show urgent', voiceTriggers: ['urgent', 'important emails'], confirmationLevel: 'none', reversible: true, blastRadius: 'self' },
    ],
    activeFilters: {},
    activeEntity: null,
  });
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [filters, setFilters] = useState<InboxFiltersType>({});
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triageTab, setTriageTab] = useState<TriageTab>('queue');
  const [sortBy, setSortBy] = useState<SortBy>('urgency');

  // Derive the list of unique entities from fetched items for the entity filter
  const entityOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (item.message.entityId && !seen.has(item.message.entityId)) {
        seen.set(item.message.entityId, item.entityName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  // Count per triage tab — keyed by triageStatus (mapped from tab id)
  const tabCounts = React.useMemo(() => {
    const counts: Record<TriageTab, number> = {
      all: items.length,
      queue: 0,
      in_progress: 0,
      processed: 0,
      follow_up: 0,
      archived: 0,
    };
    for (const item of items) {
      const status = (item.message as unknown as Record<string, unknown>)['triageStatus'] as string | undefined;
      if (!status) {
        counts.queue += 1;
      } else if (status === 'in_progress') {
        counts.in_progress += 1;
      } else if (status === 'processed') {
        counts.processed += 1;
      } else if (status === 'follow_up') {
        counts.follow_up += 1;
      } else if (status === 'archived') {
        counts.archived += 1;
      } else {
        counts.queue += 1;
      }
    }
    return counts;
  }, [items]);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // Existing filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined) {
          params.set(key, value instanceof Date ? value.toISOString() : String(value));
        }
      }

      // Triage tab → triageStatus param (omit for "all")
      if (triageTab !== 'all') {
        params.set('triageStatus', triageTab);
      }

      // Sort param
      params.set('sortBy', sortBy);

      const res = await fetch(`/api/inbox?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setStats(data.data.stats);
      }
    } catch {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  }, [filters, triageTab, sortBy]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleSelectMessage = useCallback(async (messageId: string) => {
    setSelectedMessageId(messageId);
    try {
      const res = await fetch(`/api/inbox/${messageId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedItem(data.data);
      }
    } catch {
      // Handle error
    }
  }, []);

  const handleArchive = useCallback(
    async (messageId: string) => {
      await fetch(`/api/inbox/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      fetchInbox();
      setSelectedItem(null);
      setSelectedMessageId(null);
    },
    [fetchInbox],
  );

  const handleStar = useCallback(
    async (messageId: string) => {
      await fetch(`/api/inbox/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: true }),
      });
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleFollowUp = useCallback(
    async (messageId: string, date: Date) => {
      const item = items.find((i) => i.message.id === messageId);
      await fetch('/api/inbox/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          entityId: item?.message.entityId ?? '',
          reminderAt: date.toISOString(),
        }),
      });
    },
    [items],
  );

  const handleGenerateDraft = useCallback(
    async (messageId: string) => {
      const item = items.find((i) => i.message.id === messageId);
      const res = await fetch('/api/inbox/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          entityId: item?.message.entityId ?? '',
        }),
      });
      const data = await res.json();
      if (data.success && selectedItem) {
        setSelectedItem({ ...selectedItem, draft: data.data });
      }
    },
    [items, selectedItem],
  );

  const handleSendDraft = useCallback(
    async (messageId: string) => {
      await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleBatchTriage = useCallback(
    async (entityId: string, messageIds: string[]): Promise<BatchTriageResult | null> => {
      const res = await fetch('/api/inbox/triage/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, messageIds }),
      });
      const data = await res.json();
      if (data.success) {
        fetchInbox();
        return data.data;
      }
      return null;
    },
    [fetchInbox],
  );

  const handleBatchTriageAll = useCallback(
    async (entityId: string): Promise<BatchTriageResult | null> => {
      const res = await fetch('/api/inbox/triage/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });
      const data = await res.json();
      if (data.success) {
        fetchInbox();
        return data.data;
      }
      return null;
    },
    [fetchInbox],
  );

  // --- Bulk action handlers ---

  const handleBulkArchive = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/inbox/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          }),
        ),
      );
      setBatchSelectedIds([]);
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleBulkMarkProcessed = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/inbox/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triageStatus: 'processed' }),
          }),
        ),
      );
      setBatchSelectedIds([]);
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleBulkDelegate = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/inbox/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triageStatus: 'delegated' }),
          }),
        ),
      );
      setBatchSelectedIds([]);
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleBulkSnooze = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/inbox/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ triageStatus: 'snoozed' }),
          }),
        ),
      );
      setBatchSelectedIds([]);
      fetchInbox();
    },
    [fetchInbox],
  );

  const handleDeselectAll = useCallback(() => {
    setBatchSelectedIds([]);
  }, []);

  // --- Entity filter change ---

  const handleEntityChange = useCallback(
    (entityId: string) => {
      setFilters((prev) => ({ ...prev, entityId: entityId || undefined }));
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-6 px-4 py-2 bg-gray-50 border-b text-sm">
          <span>
            Total: <strong>{stats.total}</strong>
          </span>
          <span>
            Unread: <strong>{stats.unread}</strong>
          </span>
          <span className={stats.urgent > 0 ? 'text-red-600' : ''}>
            Urgent: <strong>{stats.urgent}</strong>
          </span>
          <span>
            Needs Response: <strong>{stats.needsResponse}</strong>
          </span>
          <span>
            Avg Score: <strong>{stats.avgTriageScore}</strong>
          </span>
          <button
            onClick={() => setShowBatchPanel(!showBatchPanel)}
            className={`ml-auto px-2.5 py-0.5 border border-gray-300 rounded cursor-pointer text-xs ${
              showBatchPanel ? 'bg-blue-50' : 'bg-white'
            }`}
          >
            Batch Triage
          </button>
        </div>
      )}

      {/* Batch triage panel */}
      {showBatchPanel && (
        <div className="p-4 border-b border-gray-200">
          <BatchTriagePanel
            selectedIds={batchSelectedIds}
            entityId={filters.entityId ?? ''}
            onTriageSelected={handleBatchTriage}
            onTriageAll={handleBatchTriageAll}
            onArchiveLowPriority={() => {}}
            onFlagUrgent={() => {}}
          />
        </div>
      )}

      {/* Bulk action bar — shown when messages are batch-selected */}
      {batchSelectedIds.length > 0 && BulkActionBar && (
        <BulkActionBar
          selectedIds={batchSelectedIds}
          onArchive={handleBulkArchive}
          onMarkProcessed={handleBulkMarkProcessed}
          onDelegate={handleBulkDelegate}
          onSnooze={handleBulkSnooze}
          onDeselectAll={handleDeselectAll}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: list + filters */}
        <div className="w-2/5 flex flex-col border-r border-gray-200">
          {/* Triage status tabs */}
          <div className="flex gap-1 px-3 pt-3 pb-2 border-b border-gray-200 overflow-x-auto flex-shrink-0">
            {TRIAGE_TABS.map((tab) => {
              const count = tabCounts[tab.id];
              const isActive = triageTab === tab.id;
              const isQueueWithItems = tab.id === 'queue' && count > 0;

              return (
                <button
                  key={tab.id}
                  onClick={() => setTriageTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-medium ${
                        isQueueWithItems
                          ? 'bg-red-100 text-red-700'
                          : isActive
                          ? 'bg-blue-200 text-blue-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters section */}
          <InboxFilters filters={filters} onFiltersChange={setFilters} />

          {/* Search row: sort dropdown + entity filter */}
          <div className="flex gap-2 px-3 py-2 border-b border-gray-200 flex-shrink-0">
            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="flex-1 border border-gray-300 rounded-md text-sm px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Entity filter */}
            <select
              value={filters.entityId ?? ''}
              onChange={(e) => handleEntityChange(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md text-sm px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Entities</option>
              {entityOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Message list */}
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              <div className="text-sm">Loading...</div>
            </div>
          ) : (
            <InboxList
              items={items}
              selectedId={selectedMessageId ?? undefined}
              onSelect={handleSelectMessage}
              onBatchSelect={setBatchSelectedIds}
            />
          )}
        </div>

        {/* Right panel: detail */}
        <div className="flex-1 overflow-hidden">
          {selectedItem ? (
            EnhancedMessageDetail ? (
              <EnhancedMessageDetail
                item={selectedItem}
                onArchive={handleArchive}
                onReply={() => {}}
                onStar={handleStar}
                onFollowUp={handleFollowUp}
                onSendDraft={handleSendDraft}
                onGenerateDraft={handleGenerateDraft}
              />
            ) : (
              <MessageDetail
                item={selectedItem}
                onArchive={handleArchive}
                onReply={() => {}}
                onStar={handleStar}
                onFollowUp={handleFollowUp}
                onSendDraft={handleSendDraft}
                onGenerateDraft={handleGenerateDraft}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-lg">Select a message</p>
                <p className="text-sm">Choose a message from the list to view its details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
