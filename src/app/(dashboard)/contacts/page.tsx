'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Contact, MessageChannel, Tone } from '@/shared/types';
import RelationshipBadge from '@/modules/communication/components/RelationshipBadge';
import CadenceIndicator from '@/modules/communication/components/CadenceIndicator';
import CommitmentList from '@/modules/communication/components/CommitmentList';
import GhostingWarning from '@/modules/communication/components/GhostingWarning';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = 'LIST' | 'GRID';
type SortField = 'name' | 'score' | 'lastTouch';
type SortDirection = 'asc' | 'desc';
type CadenceStatus = 'ALL' | 'OVERDUE' | 'ON_TRACK' | 'AHEAD' | 'NO_CADENCE';

interface ContactFilters {
  search: string;
  entityId: string;
  scoreRange: [number, number];
  cadenceStatus: CadenceStatus;
  tags: string;
}

interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  entityId: string;
  preferredChannel: MessageChannel;
  preferredTone: Tone;
  tags: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysSinceLastContact(lastTouch: Date | string | null): number {
  if (!lastTouch) return 999;
  return Math.floor(
    (Date.now() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getCadenceStatus(contact: Contact): CadenceStatus {
  const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
  const frequency = prefs.cadenceFrequency as string | undefined;
  if (!frequency) return 'NO_CADENCE';

  const daysSince = getDaysSinceLastContact(contact.lastTouch);

  const thresholds: Record<string, number> = {
    DAILY: 1,
    WEEKLY: 7,
    BIWEEKLY: 14,
    MONTHLY: 30,
    QUARTERLY: 90,
  };

  const threshold = thresholds[frequency] ?? 14;
  if (daysSince > threshold) return 'OVERDUE';
  if (daysSince < threshold * 0.5) return 'AHEAD';
  return 'ON_TRACK';
}

const INITIAL_FILTERS: ContactFilters = {
  search: '',
  entityId: '',
  scoreRange: [0, 100],
  cadenceStatus: 'ALL',
  tags: '',
};

const INITIAL_FORM: ContactFormData = {
  name: '',
  email: '',
  phone: '',
  entityId: '',
  preferredChannel: 'EMAIL',
  preferredTone: 'DIRECT',
  tags: '',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContactCardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gray-200" />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-24 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="h-3 w-full bg-gray-200 rounded" />
      <div className="h-3 w-2/3 bg-gray-200 rounded" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
        >
          <div className="h-9 w-9 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-40 bg-gray-200 rounded" />
            <div className="h-3 w-28 bg-gray-200 rounded" />
          </div>
          <div className="h-5 w-20 bg-gray-200 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ContactAvatar({ name }: { name: string }) {
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
      className={`flex items-center justify-center h-10 w-10 rounded-full text-white text-sm font-semibold shrink-0 ${color}`}
    >
      {initials}
    </div>
  );
}

function QuickActions({
  contact,
  onScheduleMeeting,
}: {
  contact: Contact;
  onScheduleMeeting: (contact: Contact) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          title="Send email"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </a>
      )}
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          title="Call"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </a>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onScheduleMeeting(contact);
        }}
        title="Schedule meeting"
        className="p-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score > 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-7 text-right">{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Detail Slide-Out
// ---------------------------------------------------------------------------

function ContactDetailSlideOut({
  contact,
  onClose,
}: {
  contact: Contact;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
  const cadenceFrequency = (prefs.cadenceFrequency as string | null) ?? null;
  const isEscalated = prefs.escalated === true;

  const daysSince = getDaysSinceLastContact(contact.lastTouch);
  const isGhosting = daysSince > 28;
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
    daysSince > 28 ? 'HIGH' : daysSince > 14 ? 'MEDIUM' : 'LOW';

  const cadenceStatus = getCadenceStatus(contact);
  const openCommitments = contact.commitments.filter((c) => c.status === 'OPEN');
  const fulfilledCommitments = contact.commitments.filter((c) => c.status === 'FULFILLED');
  const brokenCommitments = contact.commitments.filter((c) => c.status === 'BROKEN');

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <ContactAvatar name={contact.name} />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{contact.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <RelationshipBadge score={contact.relationshipScore} />
              <CadenceIndicator
                frequency={cadenceFrequency}
                isOverdue={cadenceStatus === 'OVERDUE'}
                escalated={isEscalated}
              />
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Ghosting warning */}
        <GhostingWarning
          isGhosting={isGhosting}
          riskLevel={riskLevel}
          daysSinceLastContact={daysSince}
        />

        {/* Quick actions row */}
        <div className="flex gap-2">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call
            </a>
          )}
          <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Meeting
          </button>
        </div>

        {/* Relationship score visual */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Relationship Score</h3>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-bold text-gray-900">
              {contact.relationshipScore}
            </span>
            <span className="text-sm text-gray-500 mb-1">/ 100</span>
          </div>
          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                contact.relationshipScore > 70
                  ? 'bg-green-500'
                  : contact.relationshipScore >= 40
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${contact.relationshipScore}%` }}
            />
          </div>
        </div>

        {/* Contact details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Email</span>
              <p className="text-gray-900 truncate">{contact.email ?? '--'}</p>
            </div>
            <div>
              <span className="text-gray-500">Phone</span>
              <p className="text-gray-900">{contact.phone ?? '--'}</p>
            </div>
            <div>
              <span className="text-gray-500">Preferred Channel</span>
              <p className="text-gray-900">
                {(prefs.preferredChannel as string) ?? '--'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Preferred Tone</span>
              <p className="text-gray-900">
                {(prefs.preferredTone as string) ?? '--'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Last Touch</span>
              <p className="text-gray-900">
                {contact.lastTouch
                  ? new Date(contact.lastTouch).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
            <div>
              <span className="text-gray-500">Entity</span>
              <p className="text-gray-900 truncate">{contact.entityId}</p>
            </div>
          </div>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Channels */}
        {contact.channels.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Channels</h3>
            <div className="space-y-1">
              {contact.channels.map((ch, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded">
                    {ch.type}
                  </span>
                  <span className="text-gray-600 truncate">{ch.handle}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commitment tracker */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Commitments</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                {openCommitments.length} open
              </span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                {fulfilledCommitments.length} fulfilled
              </span>
              {brokenCommitments.length > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                  {brokenCommitments.length} broken
                </span>
              )}
            </div>
          </div>
          <CommitmentList commitments={contact.commitments} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Contact Modal
// ---------------------------------------------------------------------------

function AddContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<ContactFormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!form.entityId.trim()) {
      setFormError('Entity ID is required.');
      return;
    }
    setSubmitting(true);
    setFormError('');

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          entityId: form.entityId.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          preferences: {
            preferredChannel: form.preferredChannel,
            preferredTone: form.preferredTone,
          },
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error?.message ?? `Request failed with status ${res.status}`,
        );
      }

      onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create contact');
    } finally {
      setSubmitting(false);
    }
  };

  const channels: MessageChannel[] = [
    'EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL',
  ];
  const tones: Tone[] = [
    'FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE',
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add Contact</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.entityId}
              onChange={(e) => setForm({ ...form, entityId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="entity-id"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="john@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="+1 555-0100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Channel</label>
              <select
                value={form.preferredChannel}
                onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as MessageChannel })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {channels.map((ch) => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Tone</label>
              <select
                value={form.preferredTone}
                onChange={(e) => setForm({ ...form, preferredTone: e.target.value as Tone })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {tones.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="client, vip, real-estate"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating...' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('LIST');
  const [filters, setFilters] = useState<ContactFilters>(INITIAL_FILTERS);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 50;

  // Fetch contacts from API
  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (filters.entityId) params.set('entityId', filters.entityId);
      if (filters.tags) params.set('tags', filters.tags);

      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) {
        throw new Error(`Failed to load contacts (${res.status})`);
      }
      const json = await res.json();
      if (json.success === false) {
        throw new Error(json.error?.message ?? 'Failed to load contacts');
      }
      setContacts(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  }, [page, filters.entityId, filters.tags]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Client-side filtering and sorting on the fetched page
  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    // Text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Relationship score range
    result = result.filter(
      (c) =>
        c.relationshipScore >= filters.scoreRange[0] &&
        c.relationshipScore <= filters.scoreRange[1],
    );

    // Cadence status
    if (filters.cadenceStatus !== 'ALL') {
      result = result.filter((c) => getCadenceStatus(c) === filters.cadenceStatus);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'score':
          cmp = a.relationshipScore - b.relationshipScore;
          break;
        case 'lastTouch': {
          const aTime = a.lastTouch ? new Date(a.lastTouch).getTime() : 0;
          const bTime = b.lastTouch ? new Date(b.lastTouch).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [contacts, filters, sortField, sortDirection]);

  const totalPages = Math.ceil(total / pageSize);

  // Summary statistics
  const stats = useMemo(() => {
    const overdue = contacts.filter((c) => getCadenceStatus(c) === 'OVERDUE').length;
    const avgScore =
      contacts.length > 0
        ? Math.round(contacts.reduce((s, c) => s + c.relationshipScore, 0) / contacts.length)
        : 0;
    const openCommitments = contacts.reduce(
      (sum, c) => sum + c.commitments.filter((cm) => cm.status === 'OPEN').length,
      0,
    );
    return { total, overdue, avgScore, openCommitments };
  }, [contacts, total]);

  const handleScheduleMeeting = (contact: Contact) => {
    window.open(`/calendar?contactId=${contact.id}`, '_self');
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage relationships, track commitments, and monitor follow-up cadence.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Contact
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Contacts</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '--' : stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg. Score</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '--' : stats.avgScore}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Overdue Follow-ups</p>
          <p className={`text-2xl font-bold mt-1 ${stats.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {isLoading ? '--' : stats.overdue}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Open Commitments</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{isLoading ? '--' : stats.openCommitments}</p>
        </div>
      </div>

      {/* Toolbar: search, filters toggle, view switcher, sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, phone, or tag..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showFilters
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>

          {/* View switcher */}
          <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('LIST')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                view === 'LIST' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="List view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setView('GRID')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                view === 'GRID' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {/* Sort dropdown */}
          <select
            value={`${sortField}:${sortDirection}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split(':') as [SortField, SortDirection];
              setSortField(f);
              setSortDirection(d);
            }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
            <option value="score:desc">Score (High-Low)</option>
            <option value="score:asc">Score (Low-High)</option>
            <option value="lastTouch:desc">Last Contact (Recent)</option>
            <option value="lastTouch:asc">Last Contact (Oldest)</option>
          </select>
        </div>
      </div>

      {/* Expandable filters panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Entity ID</label>
              <input
                type="text"
                value={filters.entityId}
                onChange={(e) => setFilters({ ...filters, entityId: e.target.value })}
                placeholder="Filter by entity..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Relationship Score: {filters.scoreRange[0]} - {filters.scoreRange[1]}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filters.scoreRange[0]}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      scoreRange: [Math.min(Number(e.target.value), filters.scoreRange[1]), filters.scoreRange[1]],
                    })
                  }
                  className="flex-1 h-1.5 accent-blue-600"
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={filters.scoreRange[1]}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      scoreRange: [filters.scoreRange[0], Math.max(Number(e.target.value), filters.scoreRange[0])],
                    })
                  }
                  className="flex-1 h-1.5 accent-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cadence Status</label>
              <select
                value={filters.cadenceStatus}
                onChange={(e) => setFilters({ ...filters, cadenceStatus: e.target.value as CadenceStatus })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All</option>
                <option value="OVERDUE">Overdue</option>
                <option value="ON_TRACK">On Track</option>
                <option value="AHEAD">Ahead</option>
                <option value="NO_CADENCE">No Cadence</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={filters.tags}
                onChange={(e) => setFilters({ ...filters, tags: e.target.value })}
                placeholder="client, vip"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => { setFilters(INITIAL_FILTERS); setPage(1); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={fetchContacts}
            className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        view === 'GRID' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ContactCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <ListSkeleton />
        )
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredContacts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No contacts found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {contacts.length > 0 ? 'Try adjusting your search or filters.' : 'Get started by adding your first contact.'}
          </p>
          {contacts.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Contact
            </button>
          )}
        </div>
      )}

      {/* LIST VIEW */}
      {!isLoading && !error && filteredContacts.length > 0 && view === 'LIST' && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Column headers */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-4">
              <button onClick={() => handleToggleSort('name')} className="flex items-center gap-1 hover:text-gray-700">
                Contact <SortIcon field="name" />
              </button>
            </div>
            <div className="col-span-2">
              <button onClick={() => handleToggleSort('score')} className="flex items-center gap-1 hover:text-gray-700">
                Score <SortIcon field="score" />
              </button>
            </div>
            <div className="col-span-2">Cadence</div>
            <div className="col-span-2">
              <button onClick={() => handleToggleSort('lastTouch')} className="flex items-center gap-1 hover:text-gray-700">
                Last Touch <SortIcon field="lastTouch" />
              </button>
            </div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <ul className="divide-y divide-gray-200">
            {filteredContacts.map((contact) => {
              const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
              const cadenceFreq = (prefs.cadenceFrequency as string | null) ?? null;
              const cadStatus = getCadenceStatus(contact);
              const daysSince = getDaysSinceLastContact(contact.lastTouch);

              return (
                <li
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                >
                  <div className="sm:col-span-4 flex items-center gap-3">
                    <ContactAvatar name={contact.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                      <p className="text-xs text-gray-500 truncate">{contact.email ?? contact.phone ?? 'No contact info'}</p>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="sm:hidden text-xs text-gray-500 mb-0.5">Score</div>
                    <ScoreBar score={contact.relationshipScore} />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="sm:hidden text-xs text-gray-500 mb-0.5">Cadence</div>
                    <CadenceIndicator
                      frequency={cadenceFreq}
                      isOverdue={cadStatus === 'OVERDUE'}
                      escalated={prefs.escalated === true}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="sm:hidden text-xs text-gray-500 mb-0.5">Last Touch</div>
                    <span className={`text-xs ${daysSince > 28 ? 'text-red-600 font-medium' : daysSince > 14 ? 'text-yellow-600' : 'text-gray-600'}`}>
                      {contact.lastTouch ? `${daysSince}d ago` : 'Never'}
                    </span>
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <QuickActions contact={contact} onScheduleMeeting={handleScheduleMeeting} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* GRID VIEW */}
      {!isLoading && !error && filteredContacts.length > 0 && view === 'GRID' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const prefs = (contact.preferences ?? {}) as unknown as Record<string, unknown>;
            const cadenceFreq = (prefs.cadenceFrequency as string | null) ?? null;
            const cadStatus = getCadenceStatus(contact);
            const daysSince = getDaysSinceLastContact(contact.lastTouch);
            const openCount = contact.commitments.filter((c) => c.status === 'OPEN').length;

            return (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <ContactAvatar name={contact.name} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
                      <p className="text-xs text-gray-500 truncate">{contact.email ?? contact.phone ?? '--'}</p>
                    </div>
                  </div>
                  <QuickActions contact={contact} onScheduleMeeting={handleScheduleMeeting} />
                </div>

                <div className="space-y-2">
                  <ScoreBar score={contact.relationshipScore} />
                  <div className="flex items-center justify-between">
                    <CadenceIndicator
                      frequency={cadenceFreq}
                      isOverdue={cadStatus === 'OVERDUE'}
                      escalated={prefs.escalated === true}
                    />
                    <span className={`text-xs ${daysSince > 28 ? 'text-red-600 font-medium' : daysSince > 14 ? 'text-yellow-600' : 'text-gray-500'}`}>
                      {contact.lastTouch ? `${daysSince}d ago` : 'Never contacted'}
                    </span>
                  </div>
                </div>

                {contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{tag}</span>
                    ))}
                    {contact.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-gray-400 text-xs">+{contact.tags.length - 3}</span>
                    )}
                  </div>
                )}

                {openCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {openCount} open commitment{openCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} contacts
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    page === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Contact detail slide-out */}
      {selectedContact && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedContact(null)} />
          <ContactDetailSlideOut
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            onRefresh={fetchContacts}
          />
        </>
      )}

      {/* Add contact modal */}
      {showAddModal && (
        <AddContactModal
          onClose={() => setShowAddModal(false)}
          onCreated={fetchContacts}
        />
      )}
    </div>
  );
}
