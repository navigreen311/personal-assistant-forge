'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Contact, Entity, MessageChannel } from '@/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnhancedBroadcastComposerProps {
  entityId?: string;
}

interface BroadcastTemplate {
  id: string;
  name: string;
  subject?: string;
  body: string;
  channel: MessageChannel;
}

type ScheduleMode = 'now' | 'scheduled' | 'timezone';

type LastTouchFilter = '' | 'today' | 'this_week' | 'this_month' | 'over_30' | 'over_90';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNELS: { value: MessageChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SLACK', label: 'Slack' },
  { value: 'SMS', label: 'SMS' },
];

const MERGE_FIELDS = [
  { token: '{{firstName}}', label: 'firstName' },
  { token: '{{lastName}}', label: 'lastName' },
  { token: '{{company}}', label: 'company' },
  { token: '{{email}}', label: 'email' },
] as const;

const LAST_TOUCH_OPTIONS: { label: string; value: LastTouchFilter }[] = [
  { label: 'Any', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Over 30 Days', value: 'over_30' },
  { label: 'Over 90 Days', value: 'over_90' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Derive a first/last name split from a full name string. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

/** Replace merge-field tokens with values derived from a Contact. */
function renderMergeFields(template: string, contact: Contact): string {
  const { firstName, lastName } = splitName(contact.name);
  const map: Record<string, string> = {
    firstName,
    lastName,
    company: contact.tags.find((t) => t.startsWith('company:'))?.replace('company:', '') ?? '',
    email: contact.email ?? '',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, field) => map[field] ?? match);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
      {children}
    </h4>
  );
}

function RecipientPill({
  contact,
  onRemove,
}: {
  contact: Contact;
  onRemove: (id: string) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      {contact.name}
      <button
        type="button"
        onClick={() => onRemove(contact.id)}
        className="hover:text-blue-900 focus:outline-none"
        aria-label={`Remove ${contact.name}`}
      >
        &times;
      </button>
    </span>
  );
}

function MergeFieldPill({
  token,
  label,
  onClick,
}: {
  token: string;
  label: string;
  onClick: (token: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(token)}
      className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition-colors cursor-pointer"
    >
      {`{{${label}}}`}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedBroadcastComposer({
  entityId: initialEntityId,
}: EnhancedBroadcastComposerProps) {
  // ---- Entity state ----
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState(initialEntityId ?? '');

  // ---- Recipient state ----
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Contact[]>([]);

  // ---- Filter state ----
  const [filterTag, setFilterTag] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterLastTouch, setFilterLastTouch] = useState<LastTouchFilter>('');
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);

  // ---- Message state ----
  const [channel, setChannel] = useState<MessageChannel>('EMAIL');
  const [subject, setSubject] = useState('');
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ---- Personalization state ----
  const [aiPersonalize, setAiPersonalize] = useState(false);
  const [followUpTracking, setFollowUpTracking] = useState(false);

  // ---- Scheduling state ----
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now');
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // ---- Preview state ----
  const [previewContactId, setPreviewContactId] = useState('');

  // ---- Send state ----
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ totalSent: number; totalFailed: number } | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---- Refs ----
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // Data Fetching
  // =========================================================================

  // Fetch entities on mount
  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/entities');
        if (res.ok) {
          const json = await res.json();
          setEntities(json.data ?? []);
        }
      } catch {
        // Silently handle fetch errors
      }
    };
    fetchEntities();
  }, []);

  // Fetch templates when channel or entity changes
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const params = new URLSearchParams();
        if (selectedEntityId) params.set('entityId', selectedEntityId);
        if (channel) params.set('channel', channel);
        const res = await fetch(`/api/communication/templates?${params}`);
        if (res.ok) {
          const json = await res.json();
          setTemplates(json.data ?? []);
        }
      } catch {
        // Fall back to empty templates
        setTemplates([]);
      }
    };
    fetchTemplates();
  }, [selectedEntityId, channel]);

  // Debounced contact search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce(async (...args: unknown[]) => {
      const query = args[0] as string;
      const entityId = args[1] as string;
      if (!query || query.length < 2) {
        setSearchResults([]);
        setShowSearchDropdown(false);
        return;
      }
      setSearchLoading(true);
      try {
        const params = new URLSearchParams({ search: query });
        if (entityId) params.set('entityId', entityId);
        const res = await fetch(`/api/contacts?${params}`);
        if (res.ok) {
          const json = await res.json();
          const results: Contact[] = json.data ?? [];
          // Exclude already-selected recipients
          const selectedIds = new Set(selectedRecipients.map((r) => r.id));
          setSearchResults(results.filter((c) => !selectedIds.has(c.id)));
          setShowSearchDropdown(true);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300),
    [selectedRecipients],
  );

  useEffect(() => {
    debouncedSearch(searchQuery, selectedEntityId);
  }, [searchQuery, selectedEntityId, debouncedSearch]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchDropdownRef.current &&
        !searchDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch filtered contacts count when filters change
  useEffect(() => {
    const hasAnyFilter = filterTag || filterTier || filterEntity || filterLastTouch;
    if (!hasAnyFilter) {
      setFilteredCount(null);
      setFilteredContacts([]);
      return;
    }

    const fetchFiltered = async () => {
      try {
        const params = new URLSearchParams();
        if (filterTag) params.set('tags', filterTag);
        if (filterTier) params.set('tier', filterTier);
        if (filterEntity) params.set('entityId', filterEntity);
        if (filterLastTouch) params.set('lastTouch', filterLastTouch);
        params.set('pageSize', '200');

        const res = await fetch(`/api/contacts?${params}`);
        if (res.ok) {
          const json = await res.json();
          const contacts: Contact[] = json.data ?? [];
          setFilteredContacts(contacts);
          setFilteredCount(json.meta?.total ?? contacts.length);
        }
      } catch {
        setFilteredCount(null);
        setFilteredContacts([]);
      }
    };
    fetchFiltered();
  }, [filterTag, filterTier, filterEntity, filterLastTouch]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleAddRecipient = (contact: Contact) => {
    if (!selectedRecipients.find((r) => r.id === contact.id)) {
      setSelectedRecipients((prev) => [...prev, contact]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDropdown(false);
  };

  const handleRemoveRecipient = (contactId: string) => {
    setSelectedRecipients((prev) => prev.filter((r) => r.id !== contactId));
  };

  const handleAddAllFiltered = () => {
    const existingIds = new Set(selectedRecipients.map((r) => r.id));
    const newContacts = filteredContacts.filter((c) => !existingIds.has(c.id));
    setSelectedRecipients((prev) => [...prev, ...newContacts]);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setMessageBody(template.body);
      if (template.subject) setSubject(template.subject);
    }
  };

  const handleInsertMergeField = (token: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = messageBody.slice(0, start);
    const after = messageBody.slice(end);
    const newBody = before + token + after;

    setMessageBody(newBody);

    // Restore cursor position after the inserted token
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursor = start + token.length;
      textarea.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      setErrorMessage('Please select at least one recipient.');
      return;
    }
    if (!messageBody.trim()) {
      setErrorMessage('Message body cannot be empty.');
      return;
    }

    setSending(true);
    setErrorMessage(null);
    setSendResult(null);

    try {
      const res = await fetch('/api/communication/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntityId || undefined,
          recipientIds: selectedRecipients.map((r) => r.id),
          channel,
          subject: channel === 'EMAIL' ? subject : undefined,
          template: messageBody,
          aiPersonalize,
          followUpTracking,
          scheduleMode,
          scheduledAt: scheduleMode === 'scheduled' ? scheduledDateTime : undefined,
          sendInRecipientTimezone: scheduleMode === 'timezone',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setSendResult(json.data ?? { totalSent: selectedRecipients.length, totalFailed: 0 });
      } else {
        const json = await res.json().catch(() => null);
        setErrorMessage(json?.error?.message ?? 'Failed to send broadcast.');
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleCancel = () => {
    setSelectedRecipients([]);
    setMessageBody('');
    setSubject('');
    setSearchQuery('');
    setFilterTag('');
    setFilterTier('');
    setFilterEntity('');
    setFilterLastTouch('');
    setAiPersonalize(false);
    setFollowUpTracking(false);
    setScheduleMode('now');
    setScheduledDateTime('');
    setPreviewContactId('');
    setSelectedTemplateId('');
    setSendResult(null);
    setErrorMessage(null);
  };

  // =========================================================================
  // Derived values
  // =========================================================================

  const recipientCount = selectedRecipients.length;

  const previewContact =
    selectedRecipients.find((r) => r.id === previewContactId) ?? selectedRecipients[0] ?? null;

  const renderedPreview = previewContact
    ? renderMergeFields(messageBody, previewContact)
    : messageBody;

  const renderedSubjectPreview =
    previewContact && subject ? renderMergeFields(subject, previewContact) : subject;

  const visibleRecipientPills = selectedRecipients.slice(0, 5);
  const hiddenRecipientCount = Math.max(0, selectedRecipients.length - 5);

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Enhanced Broadcast Composer</h3>

      {/* ================================================================= */}
      {/* 1. ENTITY SELECTOR                                                */}
      {/* ================================================================= */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Entity</label>
        <select
          value={selectedEntityId}
          onChange={(e) => setSelectedEntityId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Entities</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </div>

      {/* ================================================================= */}
      {/* 2. RECIPIENTS                                                     */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <SectionHeading>Recipients</SectionHeading>

        {/* Contact search autocomplete */}
        <div className="relative" ref={searchDropdownRef}>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Contacts</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchDropdown(true);
            }}
            placeholder="Type to search contacts..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
          {searchLoading && (
            <span className="absolute right-3 top-9 text-xs text-gray-400">Searching...</span>
          )}

          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleAddRecipient(contact)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">{contact.name}</span>
                  {contact.email && (
                    <span className="ml-2 text-gray-500">{contact.email}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tag</label>
            <input
              type="text"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              placeholder="e.g. VIP"
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              <option value="VIP">VIP</option>
              <option value="Client">Client</option>
              <option value="Vendor">Vendor</option>
              <option value="Team">Team</option>
              <option value="Partner">Partner</option>
              <option value="Personal">Personal</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Entity</label>
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Last Touch</label>
            <select
              value={filterLastTouch}
              onChange={(e) => setFilterLastTouch(e.target.value as LastTouchFilter)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              {LAST_TOUCH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter match count + Add All */}
        {filteredCount !== null && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {filteredCount} contact{filteredCount !== 1 ? 's' : ''} match filters
            </span>
            <button
              type="button"
              onClick={handleAddAllFiltered}
              className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Add All
            </button>
          </div>
        )}

        {/* Selected recipients as pills */}
        {selectedRecipients.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {visibleRecipientPills.map((contact) => (
              <RecipientPill
                key={contact.id}
                contact={contact}
                onRemove={handleRemoveRecipient}
              />
            ))}
            {hiddenRecipientCount > 0 && (
              <span className="text-xs text-gray-500 font-medium">
                +{hiddenRecipientCount} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 3. MESSAGE                                                        */}
      {/* ================================================================= */}
      <div className="space-y-4">
        <SectionHeading>Message</SectionHeading>

        {/* Channel select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as MessageChannel)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {CHANNELS.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject (email only) */}
        {channel === 'EMAIL' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Template select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">None (compose from scratch)</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>

        {/* Message body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
          <textarea
            ref={bodyRef}
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            rows={6}
            placeholder="Compose your message... Use merge fields like {{firstName}} for personalization."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Merge field pills */}
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1.5">
            Available Merge Fields (click to insert)
          </span>
          <div className="flex flex-wrap gap-2">
            {MERGE_FIELDS.map((field) => (
              <MergeFieldPill
                key={field.token}
                token={field.token}
                label={field.label}
                onClick={handleInsertMergeField}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 4. PERSONALIZATION                                                */}
      {/* ================================================================= */}
      <div className="space-y-3">
        <SectionHeading>Personalization</SectionHeading>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={aiPersonalize}
            onChange={(e) => setAiPersonalize(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            AI personalizes each message using contact context
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={followUpTracking}
            onChange={(e) => setFollowUpTracking(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            Include individual follow-up tracking
          </span>
        </label>
      </div>

      {/* ================================================================= */}
      {/* 5. SCHEDULING                                                     */}
      {/* ================================================================= */}
      <div className="space-y-3">
        <SectionHeading>Scheduling</SectionHeading>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scheduleMode"
              value="now"
              checked={scheduleMode === 'now'}
              onChange={() => setScheduleMode('now')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Send now</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scheduleMode"
              value="scheduled"
              checked={scheduleMode === 'scheduled'}
              onChange={() => setScheduleMode('scheduled')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Schedule for...</span>
          </label>

          {scheduleMode === 'scheduled' && (
            <div className="ml-6">
              <input
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="scheduleMode"
              value="timezone"
              checked={scheduleMode === 'timezone'}
              onChange={() => setScheduleMode('timezone')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Send in recipient timezone</span>
          </label>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 6. PREVIEW                                                        */}
      {/* ================================================================= */}
      {selectedRecipients.length > 0 && messageBody && (
        <div className="space-y-3">
          <SectionHeading>Preview</SectionHeading>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preview as:</label>
            <select
              value={previewContactId}
              onChange={(e) => setPreviewContactId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              {selectedRecipients.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-2">
            {channel === 'EMAIL' && renderedSubjectPreview && (
              <div>
                <p className="text-xs text-gray-500">Subject:</p>
                <p className="text-sm font-medium text-gray-800">{renderedSubjectPreview}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Body:</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{renderedPreview}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Error / Success feedback                                          */}
      {/* ================================================================= */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {sendResult && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
          Broadcast sent: {sendResult.totalSent} delivered, {sendResult.totalFailed} failed.
        </div>
      )}

      {/* ================================================================= */}
      {/* 7. FOOTER                                                         */}
      {/* ================================================================= */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || recipientCount === 0 || !messageBody.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending
            ? 'Sending...'
            : `Send to ${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
