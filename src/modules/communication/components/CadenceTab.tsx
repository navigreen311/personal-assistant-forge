'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CadenceTabProps {
  entityId?: string;
}

type CadenceStatus = 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_CADENCE';
type StatusFilter = 'ALL' | CadenceStatus;

interface EntityOption {
  id: string;
  name: string;
}

/** Shape returned by /api/communication/cadence/overdue */
interface OverdueEntry {
  contactId: string;
  contactName: string;
  frequency: string;
  daysOverdue: number;
}

/** Shape returned by /api/contacts */
interface RawContact {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  lastTouch: string | null;
  relationshipScore: number;
  tags: string[];
  preferences: {
    preferredChannel?: string;
    preferredTone?: string;
    cadenceFrequency?: string;
    escalated?: boolean;
    [key: string]: unknown;
  };
}

/** Enriched contact row used in the cadence grid */
interface CadenceContact {
  id: string;
  name: string;
  entityId: string;
  entityName: string;
  cadenceFrequency: string | null; // e.g. "BIWEEKLY", "MONTHLY"
  cadenceLabel: string;            // e.g. "Every 14d"
  lastTouchDate: Date | null;
  lastTouchLabel: string;          // e.g. "45d ago"
  status: CadenceStatus;
  statusLabel: string;             // e.g. "Overdue 15d"
  nextDueDate: Date | null;
  nextDueLabel: string;            // e.g. "Mar 15" or dash
  daysUntilDue: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: 'Every 1d',
  WEEKLY: 'Every 7d',
  BIWEEKLY: 'Every 14d',
  MONTHLY: 'Every 30d',
  QUARTERLY: 'Every 90d',
};

const ENTITY_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-amber-100 text-amber-700',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDays(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diff = daysBetween(date, now);
  if (diff < 0) return 'Just now';
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

function formatShortDate(date: Date | null): string {
  if (!date) return '\u2014';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeCadenceStatus(
  lastTouch: Date | null,
  frequencyKey: string | null,
): { status: CadenceStatus; statusLabel: string; nextDue: Date | null; daysUntilDue: number | null } {
  if (!frequencyKey || !FREQUENCY_DAYS[frequencyKey]) {
    return { status: 'NO_CADENCE', statusLabel: 'Set cadence', nextDue: null, daysUntilDue: null };
  }

  const intervalDays = FREQUENCY_DAYS[frequencyKey];
  const base = lastTouch ?? new Date();
  const nextDue = new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const daysUntilDue = daysBetween(now, nextDue);

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      status: 'OVERDUE',
      statusLabel: `Overdue ${overdueDays}d`,
      nextDue,
      daysUntilDue,
    };
  }

  if (daysUntilDue <= 7) {
    return {
      status: 'DUE_SOON',
      statusLabel: `Due in ${daysUntilDue}d`,
      nextDue,
      daysUntilDue,
    };
  }

  return {
    status: 'ON_TRACK',
    statusLabel: 'On track',
    nextDue,
    daysUntilDue,
  };
}

function getEntityColor(entityId: string): string {
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = ((hash << 5) - hash + entityId.charCodeAt(i)) | 0;
  }
  return ENTITY_COLORS[Math.abs(hash) % ENTITY_COLORS.length];
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function EnvelopeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function PhoneIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
      />
    </svg>
  );
}

function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChevronDownIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CalendarIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'red' | 'amber' | 'green' | 'gray';
}) {
  const colorMap = {
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
    green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
    gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-700' },
  };

  const c = colorMap[color];

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-4 flex flex-col items-center justify-center min-w-[120px]`}>
      <span className={`text-2xl font-bold ${c.text}`}>{count}</span>
      <span className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full ${c.badge}`}>{label}</span>
    </div>
  );
}

function StatusBadge({ status, label }: { status: CadenceStatus; label: string }) {
  const styles: Record<CadenceStatus, string> = {
    OVERDUE: 'bg-red-100 text-red-700',
    DUE_SOON: 'bg-amber-100 text-amber-700',
    ON_TRACK: 'bg-green-100 text-green-700',
    NO_CADENCE: 'bg-gray-100 text-gray-500',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status === 'OVERDUE' && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      )}
      {status === 'DUE_SOON' && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      )}
      {status === 'ON_TRACK' && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      )}
      {label}
    </span>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CadenceTab({ entityId: propEntityId }: CadenceTabProps) {
  // --- State ---
  const [selectedEntityId, setSelectedEntityId] = useState<string>(propEntityId ?? '');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [contacts, setContacts] = useState<CadenceContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const activeEntityId = propEntityId ?? selectedEntityId;

  // --- Fetch entities for dropdown ---
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities?page=1&pageSize=100');
        if (res.ok) {
          const json = await res.json();
          const list: EntityOption[] = (json.data ?? []).map((e: { id: string; name: string }) => ({
            id: e.id,
            name: e.name,
          }));
          setEntities(list);
          // Auto-select first entity if none provided
          if (!propEntityId && !selectedEntityId && list.length > 0) {
            setSelectedEntityId(list[0].id);
          }
        }
      } catch {
        // Silently handle — entities dropdown will be empty
      }
    }
    fetchEntities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Build entity name lookup ---
  const entityNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of entities) {
      map[e.id] = e.name;
    }
    return map;
  }, [entities]);

  // --- Fetch contacts and compute cadence ---
  useEffect(() => {
    async function fetchContacts() {
      setLoading(true);
      setSelectedIds(new Set());
      try {
        const params = new URLSearchParams({ page: '1', pageSize: '200' });
        if (activeEntityId) params.set('entityId', activeEntityId);

        const [contactsRes, overdueRes] = await Promise.all([
          fetch(`/api/contacts?${params}`).catch(() => null),
          fetch('/api/communication/cadence/overdue').catch(() => null),
        ]);

        const rawContacts: RawContact[] = [];
        if (contactsRes?.ok) {
          const json = await contactsRes.json();
          rawContacts.push(...(json.data ?? []));
        }

        // Build an overdue lookup for supplementary data
        const overdueMap: Record<string, OverdueEntry> = {};
        if (overdueRes?.ok) {
          const json = await overdueRes.json();
          for (const entry of (json.data ?? []) as OverdueEntry[]) {
            overdueMap[entry.contactId] = entry;
          }
        }

        // Enrich contacts with cadence computation
        const enriched: CadenceContact[] = rawContacts.map((c) => {
          const freq = c.preferences?.cadenceFrequency ?? null;
          const lastTouchDate = c.lastTouch ? new Date(c.lastTouch) : null;
          const { status, statusLabel, nextDue, daysUntilDue } = computeCadenceStatus(lastTouchDate, freq);

          return {
            id: c.id,
            name: c.name,
            entityId: c.entityId,
            entityName: entityNameMap[c.entityId] ?? 'Unknown',
            cadenceFrequency: freq,
            cadenceLabel: freq ? (FREQUENCY_LABELS[freq] ?? `Every ${FREQUENCY_DAYS[freq] ?? '?'}d`) : 'No cadence',
            lastTouchDate,
            lastTouchLabel: formatRelativeDays(lastTouchDate),
            status,
            statusLabel,
            nextDueDate: nextDue,
            nextDueLabel: formatShortDate(nextDue),
            daysUntilDue,
          };
        });

        setContacts(enriched);
      } catch {
        setContacts([]);
      } finally {
        setLoading(false);
      }
    }

    if (activeEntityId || entities.length > 0) {
      fetchContacts();
    }
  }, [activeEntityId, entityNameMap, entities.length]);

  // --- Computed counts ---
  const counts = useMemo(() => {
    const result = { OVERDUE: 0, DUE_SOON: 0, ON_TRACK: 0, NO_CADENCE: 0 };
    for (const c of contacts) {
      result[c.status]++;
    }
    return result;
  }, [contacts]);

  // --- Filtered contacts ---
  const filteredContacts = useMemo(() => {
    if (statusFilter === 'ALL') return contacts;
    return contacts.filter((c) => c.status === statusFilter);
  }, [contacts, statusFilter]);

  // --- Selection handlers ---
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredContacts.length && filteredContacts.length > 0) {
        return new Set();
      }
      return new Set(filteredContacts.map((c) => c.id));
    });
  }, [filteredContacts]);

  const selectAllOverdue = useCallback(() => {
    const overdueIds = contacts.filter((c) => c.status === 'OVERDUE').map((c) => c.id);
    setSelectedIds(new Set(overdueIds));
  }, [contacts]);

  // --- Action handlers (placeholder) ---
  const handleDraft = useCallback((name: string) => {
    alert(`Opening draft composer for ${name}`);
  }, []);

  const handleCall = useCallback((name: string) => {
    alert(`Opening VoiceForge for ${name}`);
  }, []);

  const handleSetCadence = useCallback((name: string) => {
    alert(`Set cadence for ${name}`);
  }, []);

  const handleDraftAllFollowUps = useCallback(() => {
    const names = contacts
      .filter((c) => selectedIds.has(c.id))
      .map((c) => c.name);
    alert(`Opening draft composer for ${names.length} contacts:\n${names.join(', ')}`);
  }, [contacts, selectedIds]);

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Follow-Up Cadence Manager</h2>
        </div>
        {!propEntityId && entities.length > 0 && (
          <div className="relative">
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Entities</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusCard label="Overdue" count={counts.OVERDUE} color="red" />
        <StatusCard label="Due Soon 7d" count={counts.DUE_SOON} color="amber" />
        <StatusCard label="On Track" count={counts.ON_TRACK} color="green" />
        <StatusCard label="No Cadence" count={counts.NO_CADENCE} color="gray" />
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPill label="All" active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
        <FilterPill label="Overdue" active={statusFilter === 'OVERDUE'} onClick={() => setStatusFilter('OVERDUE')} />
        <FilterPill label="Due Soon" active={statusFilter === 'DUE_SOON'} onClick={() => setStatusFilter('DUE_SOON')} />
        <FilterPill label="On Track" active={statusFilter === 'ON_TRACK'} onClick={() => setStatusFilter('ON_TRACK')} />
        <FilterPill label="No Cadence" active={statusFilter === 'NO_CADENCE'} onClick={() => setStatusFilter('NO_CADENCE')} />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={selectAllOverdue}
            className="px-3 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
          >
            Select overdue
          </button>
          <button
            type="button"
            onClick={handleDraftAllFollowUps}
            className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <EnvelopeIcon className="w-3.5 h-3.5" />
            Draft All Follow-ups
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">Loading cadence data...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && contacts.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <ClockIcon className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm text-gray-500 mt-3">
            No contacts with cadence rules. Set cadence on contacts to track follow-up timing.
          </p>
        </div>
      )}

      {/* No results for current filter */}
      {!loading && contacts.length > 0 && filteredContacts.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-500">
            No contacts match the current filter.
          </p>
        </div>
      )}

      {/* Cadence Grid */}
      {!loading && filteredContacts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entity
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cadence
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Touch
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Due
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className={`transition-colors ${
                      selectedIds.has(contact.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>

                    {/* Contact Name */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-900">{contact.name}</span>
                    </td>

                    {/* Entity Pill */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getEntityColor(contact.entityId)}`}
                      >
                        {contact.entityName}
                      </span>
                    </td>

                    {/* Cadence */}
                    <td className="px-4 py-3">
                      <span className={`text-sm ${contact.cadenceFrequency ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                        {contact.cadenceLabel}
                      </span>
                    </td>

                    {/* Last Touch */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{contact.lastTouchLabel}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={contact.status} label={contact.statusLabel} />
                    </td>

                    {/* Next Due */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{contact.nextDueLabel}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleDraft(contact.name)}
                          title={`Draft message for ${contact.name}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <EnvelopeIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCall(contact.name)}
                          title={`Call ${contact.name}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors cursor-pointer"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetCadence(contact.name)}
                          title={`Set cadence for ${contact.name}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors cursor-pointer"
                        >
                          <ClockIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
