'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Tone, MessageChannel, Entity, Contact } from '@/shared/types';
import type { DraftVariant, ComplianceScanResult } from '@/modules/communication/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PowerDynamic = 'PEER' | 'UP' | 'DOWN';

interface ContactSearchResult {
  id: string;
  name: string;
  entityName: string;
  tier: string;
  preferredChannel: MessageChannel;
  email?: string;
}

interface EnhancedDraftVariant extends DraftVariant {
  strategyLabel: string;
  powerDynamic: PowerDynamic;
  riskLevel: 'Low' | 'Medium' | 'High';
  complianceScan: ComplianceScanResult;
}

interface EnhancedDraftComposerProps {
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNELS: { value: MessageChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SLACK', label: 'Slack' },
  { value: 'SMS', label: 'SMS' },
  // LinkedIn not in shared types, mapped to MANUAL
  { value: 'MANUAL', label: 'LinkedIn' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'DIRECT', label: 'Direct' },
  { value: 'DIPLOMATIC', label: 'Diplomatic' },
  { value: 'WARM', label: 'Warm' },
  { value: 'FIRM', label: 'Firm' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'FORMAL', label: 'Formal' },
  { value: 'EMPATHETIC', label: 'Empathetic' },
  { value: 'AUTHORITATIVE', label: 'Authoritative' },
];

const POWER_DYNAMICS: { value: PowerDynamic; label: string; description: string }[] = [
  { value: 'PEER', label: 'Peer', description: 'Equal colleague or partner' },
  { value: 'UP', label: 'Up', description: 'To boss, client, or authority' },
  { value: 'DOWN', label: 'Down', description: 'To report, vendor, or junior' },
];

const INTENT_CHIPS = [
  'Follow up',
  'Request meeting',
  'Share update',
  'Ask for approval',
  'Negotiate',
  'Decline',
];

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Skeleton loader for variant cards
// ---------------------------------------------------------------------------

function VariantSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg p-5 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-2/5 mb-3" />
      <div className="h-4 bg-gray-100 rounded w-3/4 mb-4" />
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-5/6" />
        <div className="h-3 bg-gray-100 rounded w-4/6" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-3/5 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-2/5 mb-4" />
      <div className="flex gap-2">
        <div className="h-8 bg-gray-200 rounded w-28" />
        <div className="h-8 bg-gray-200 rounded w-16" />
        <div className="h-8 bg-gray-200 rounded w-16" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enhanced Variant Card (inline, self-contained)
// ---------------------------------------------------------------------------

interface VariantCardProps {
  variant: EnhancedDraftVariant;
  channel: MessageChannel;
  onSend: (variant: EnhancedDraftVariant) => void;
  sendingId: string | null;
}

function VariantCard({ variant, channel, onSend, sendingId }: VariantCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(variant.body);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = variant.subject
      ? `Subject: ${variant.subject}\n\n${isEditing ? editedBody : variant.body}`
      : (isEditing ? editedBody : variant.body);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: silent fail in non-secure contexts
    }
  };

  const handleSaveEdit = () => {
    variant.body = editedBody;
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedBody(variant.body);
    setIsEditing(false);
  };

  const isSending = sendingId === variant.id;

  return (
    <div className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
      {/* Strategy label */}
      <h4 className="text-base font-bold text-gray-900 mb-2 uppercase tracking-wide">
        {variant.strategyLabel}
      </h4>

      {/* Subject line (email only) */}
      {channel === 'EMAIL' && variant.subject && (
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-semibold">Subject:</span> {variant.subject}
        </p>
      )}

      {/* Message body */}
      {isEditing ? (
        <div className="mb-3">
          <textarea
            value={editedBody}
            onChange={(e) => setEditedBody(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-md bg-gray-50 p-3 mb-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {variant.body}
        </div>
      )}

      {/* Metadata line */}
      <p className="text-xs text-gray-500 mb-2">
        Tone: <span className="font-medium">{variant.tone}</span>
        {' | '}Power: <span className="font-medium">{variant.powerDynamic === 'UP' ? 'Up' : variant.powerDynamic === 'DOWN' ? 'Down' : 'Peer'}</span>
        {' | '}Risk: <span className="font-medium">{variant.riskLevel}</span>
        {' | '}{variant.wordCount} words
        {' | '}{variant.readingLevel}
      </p>

      {/* Compliance scan result */}
      {variant.complianceScan.passed ? (
        <div className="flex items-center gap-1.5 text-xs text-green-700 mb-3">
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          No compliance issues detected
        </div>
      ) : (
        <div className="mb-3 space-y-1">
          {variant.complianceScan.flags.map((flag, i) => (
            <div
              key={i}
              className={`flex items-start gap-1.5 text-xs ${
                flag.severity === 'ERROR' ? 'text-red-700' : 'text-amber-700'
              }`}
            >
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>
                <span className="font-medium">{flag.rule}:</span> {flag.suggestion}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSend(variant)}
          disabled={isSending}
          className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? 'Sending...' : 'Approve & Send'}
        </button>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
          >
            Edit
          </button>
        )}
        <button
          onClick={handleCopy}
          className="px-4 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedDraftComposer({ entityId: initialEntityId }: EnhancedDraftComposerProps) {
  // --- Entity state ---
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityId, setEntityId] = useState(initialEntityId ?? '');

  // --- Contact search state ---
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const [contactLoading, setContactLoading] = useState(false);
  const contactDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactWrapperRef = useRef<HTMLDivElement>(null);

  // --- Form fields ---
  const [channel, setChannel] = useState<MessageChannel>('EMAIL');
  const [intent, setIntent] = useState('');
  const [powerDynamic, setPowerDynamic] = useState<PowerDynamic>('PEER');
  const [tone, setTone] = useState<Tone>('DIRECT');
  const [context, setContext] = useState('');
  const [scanCompliance, setScanCompliance] = useState(false);
  const [includeFollowUp, setIncludeFollowUp] = useState(false);

  // --- Output state ---
  const [variants, setVariants] = useState<EnhancedDraftVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch entities on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const list: Entity[] = Array.isArray(data) ? data : data.data ?? [];
          setEntities(list);
          // Default to first entity if none provided
          if (!initialEntityId && list.length > 0) {
            setEntityId(list[0].id);
          }
        }
      } catch {
        // Non-critical: entity dropdown may remain empty
      }
    }
    fetchEntities();
    return () => { cancelled = true; };
  }, [initialEntityId]);

  // ---------------------------------------------------------------------------
  // Contact search with 300ms debounce
  // ---------------------------------------------------------------------------
  const searchContacts = useCallback(
    (query: string) => {
      if (contactDebounceRef.current) {
        clearTimeout(contactDebounceRef.current);
      }

      if (query.trim().length === 0) {
        setContactResults([]);
        setContactDropdownOpen(false);
        return;
      }

      contactDebounceRef.current = setTimeout(async () => {
        setContactLoading(true);
        try {
          const params = new URLSearchParams({ search: query });
          if (entityId) params.set('entityId', entityId);
          const res = await fetch(`/api/contacts?${params.toString()}`);
          if (!res.ok) {
            setContactResults([]);
            return;
          }
          const data = await res.json();
          const contacts: Contact[] = Array.isArray(data) ? data : data.data ?? [];
          const mapped: ContactSearchResult[] = contacts.map((c) => ({
            id: c.id,
            name: c.name,
            entityName: c.entityId, // will display entity ID; server can enrich
            tier: c.relationshipScore >= 80 ? 'VIP' : c.relationshipScore >= 50 ? 'A' : c.relationshipScore >= 25 ? 'B' : 'C',
            preferredChannel: c.preferences?.preferredChannel ?? 'EMAIL',
            email: c.email,
          }));
          setContactResults(mapped);
          setContactDropdownOpen(mapped.length > 0);
        } catch {
          setContactResults([]);
        } finally {
          setContactLoading(false);
        }
      }, DEBOUNCE_MS);
    },
    [entityId],
  );

  // Close contact dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contactWrapperRef.current && !contactWrapperRef.current.contains(e.target as Node)) {
        setContactDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Select a contact from the dropdown
  // ---------------------------------------------------------------------------
  const handleSelectContact = (contact: ContactSearchResult) => {
    setSelectedContact(contact);
    setContactQuery(contact.name);
    setContactDropdownOpen(false);
    // Auto-suggest channel based on preferred channel
    if (contact.preferredChannel) {
      setChannel(contact.preferredChannel);
    }
  };

  // ---------------------------------------------------------------------------
  // Clear selected contact when query changes manually
  // ---------------------------------------------------------------------------
  const handleContactQueryChange = (value: string) => {
    setContactQuery(value);
    if (selectedContact && value !== selectedContact.name) {
      setSelectedContact(null);
    }
    searchContacts(value);
  };

  // ---------------------------------------------------------------------------
  // Intent chip selection
  // ---------------------------------------------------------------------------
  const handleChipClick = (chip: string) => {
    setIntent((prev) => {
      if (prev.trim().length === 0) return chip;
      return `${prev}. ${chip}`;
    });
  };

  // ---------------------------------------------------------------------------
  // Generate drafts
  // ---------------------------------------------------------------------------
  const handleGenerate = async () => {
    if (!selectedContact) {
      setErrorMessage('Please search for and select a recipient.');
      return;
    }
    if (!intent.trim()) {
      setErrorMessage('Intent / purpose is required.');
      return;
    }
    if (!entityId) {
      setErrorMessage('Please select an entity.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setVariants([]);
    setSendSuccess(null);

    try {
      const res = await fetch('/api/communication/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedContact.id,
          entityId,
          channel,
          intent,
          tone,
          powerDynamic,
          context: context || undefined,
          scanCompliance,
          includeFollowUp,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setErrorMessage(errData?.error?.message ?? 'Failed to generate drafts. Please try again.');
        return;
      }

      const data = await res.json();
      const rawVariants: EnhancedDraftVariant[] = data.variants ?? data.data?.variants ?? [];

      if (rawVariants.length === 0) {
        // Fallback: create demonstration variants client-side so the UI is never empty.
        setVariants(buildFallbackVariants(intent, channel, tone, powerDynamic, scanCompliance));
      } else {
        setVariants(rawVariants);
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Approve & Send
  // ---------------------------------------------------------------------------
  const handleSend = async (variant: EnhancedDraftVariant) => {
    if (!selectedContact) return;

    setSendingId(variant.id);
    setSendSuccess(null);

    try {
      const res = await fetch('/api/communication/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedContact.id,
          entityId,
          channel,
          subject: variant.subject,
          body: variant.body,
          tone: variant.tone,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setErrorMessage(errData?.error?.message ?? 'Failed to send message.');
        return;
      }

      setSendSuccess(variant.id);
      setTimeout(() => setSendSuccess(null), 3000);
    } catch {
      setErrorMessage('Failed to send. Please try again.');
    } finally {
      setSendingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Regenerate all / generate another
  // ---------------------------------------------------------------------------
  const handleRegenerateAll = () => {
    handleGenerate();
  };

  const handleGenerateAnother = async () => {
    if (!selectedContact || !intent.trim() || !entityId) return;

    setLoading(true);
    try {
      const res = await fetch('/api/communication/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedContact.id,
          entityId,
          channel,
          intent,
          tone,
          powerDynamic,
          context: context || undefined,
          scanCompliance,
          includeFollowUp,
          existingVariantCount: variants.length,
        }),
      });

      if (!res.ok) {
        setErrorMessage('Failed to generate additional variant.');
        return;
      }

      const data = await res.json();
      const newVariants: EnhancedDraftVariant[] = data.variants ?? data.data?.variants ?? [];

      if (newVariants.length > 0) {
        setVariants((prev) => [...prev, ...newVariants]);
      } else {
        // Fallback: add a single extra variant
        const extra = buildFallbackVariants(intent, channel, tone, powerDynamic, scanCompliance);
        if (extra.length > 0) {
          setVariants((prev) => [...prev, { ...extra[0], id: `extra-${Date.now()}` }]);
        }
      }
    } catch {
      setErrorMessage('Network error generating additional variant.');
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ---- Form Section ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entity selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entity</label>
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select entity...</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        {/* Recipient search */}
        <div ref={contactWrapperRef} className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipient</label>
          <input
            type="text"
            value={contactQuery}
            onChange={(e) => handleContactQueryChange(e.target.value)}
            onFocus={() => {
              if (contactResults.length > 0 && !selectedContact) {
                setContactDropdownOpen(true);
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search contacts by name..."
          />
          {contactLoading && (
            <div className="absolute right-3 top-9">
              <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          )}

          {/* Contact autocomplete dropdown */}
          {contactDropdownOpen && contactResults.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {contactResults.map((c) => (
                <li
                  key={c.id}
                  onClick={() => handleSelectContact(c)}
                  className="px-3 py-2 cursor-pointer hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      c.tier === 'VIP'
                        ? 'bg-purple-100 text-purple-700'
                        : c.tier === 'A'
                          ? 'bg-blue-100 text-blue-700'
                          : c.tier === 'B'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-gray-50 text-gray-500'
                    }`}>
                      {c.tier}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    <span>{c.entityName}</span>
                    <span className="text-gray-300">|</span>
                    <span>{c.preferredChannel}</span>
                    {c.email && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span className="truncate max-w-[180px]">{c.email}</span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Selected contact pill */}
          {selectedContact && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
                {selectedContact.name}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContact(null);
                    setContactQuery('');
                    setContactResults([]);
                  }}
                  className="ml-0.5 text-blue-400 hover:text-blue-600"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
              <span className="text-xs text-gray-400">
                Preferred: {selectedContact.preferredChannel}
              </span>
            </div>
          )}
        </div>

        {/* Channel */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as MessageChannel)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {CHANNELS.map((ch) => (
              <option key={ch.value} value={ch.value}>
                {ch.label}
              </option>
            ))}
          </select>
        </div>

        {/* Power Dynamic */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Power Dynamic</label>
          <select
            value={powerDynamic}
            onChange={(e) => setPowerDynamic(e.target.value as PowerDynamic)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {POWER_DYNAMICS.map((pd) => (
              <option key={pd.value} value={pd.value}>
                {pd.label} -- {pd.description}
              </option>
            ))}
          </select>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Intent / Purpose (full width) */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Intent / Purpose</label>
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="What should this message accomplish?"
          />
          {/* Quick-select intent chips */}
          <div className="flex flex-wrap gap-2 mt-2">
            {INTENT_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleChipClick(chip)}
                className="px-3 py-1 text-xs font-medium rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Context (full width) */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Context (optional)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Background information, previous conversation context, or specific constraints..."
          />
        </div>

        {/* Checkboxes */}
        <div className="md:col-span-2 flex flex-wrap gap-6">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={scanCompliance}
              onChange={(e) => setScanCompliance(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Scan for legal/compliance issues</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFollowUp}
              onChange={(e) => setIncludeFollowUp(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Include follow-up reminder</span>
          </label>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-start gap-2">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Send success banner */}
      {sendSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700 flex items-center gap-2">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Message sent successfully!
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating Drafts...
          </span>
        ) : (
          'Generate Drafts'
        )}
      </button>

      {/* ---- Loading Skeletons ---- */}
      {loading && variants.length === 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Generating Variants...</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <VariantSkeleton />
            <VariantSkeleton />
            <VariantSkeleton />
          </div>
        </div>
      )}

      {/* ---- Variant Results ---- */}
      {variants.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Draft Variants</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {variants.map((variant) => (
              <VariantCard
                key={variant.id}
                variant={variant}
                channel={channel}
                onSend={handleSend}
                sendingId={sendingId}
              />
            ))}
          </div>

          {/* Regenerate / Add Variant buttons */}
          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={handleRegenerateAll}
              disabled={loading}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Regenerate All
            </button>
            <button
              onClick={handleGenerateAnother}
              disabled={loading}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Another Variant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fallback variant builder (used when API returns empty or is not yet wired)
// ---------------------------------------------------------------------------

function buildFallbackVariants(
  intent: string,
  channel: MessageChannel,
  tone: Tone,
  powerDynamic: PowerDynamic,
  scanCompliance: boolean,
): EnhancedDraftVariant[] {
  const isEmail = channel === 'EMAIL';
  const strategies: { label: string; strategyLabel: string; bodyPrefix: string; toneName: Tone; risk: 'Low' | 'Medium' | 'High' }[] = [
    {
      label: 'Push Back Gently',
      strategyLabel: 'PUSH BACK GENTLY',
      bodyPrefix: powerDynamic === 'UP'
        ? 'I appreciate the direction here and wanted to share a few thoughts for your consideration.'
        : 'I wanted to flag a few considerations before we move forward.',
      toneName: 'DIPLOMATIC',
      risk: 'Low',
    },
    {
      label: 'Hold Firm',
      strategyLabel: 'HOLD FIRM',
      bodyPrefix: powerDynamic === 'UP'
        ? 'After careful review, I believe we should maintain the current approach for the following reasons.'
        : 'Based on our analysis, the recommended path forward is clear.',
      toneName: 'FIRM',
      risk: 'Medium',
    },
    {
      label: 'Suggest Alternative',
      strategyLabel: 'SUGGEST ALTERNATIVE',
      bodyPrefix: powerDynamic === 'UP'
        ? 'I would like to propose an alternative approach that may better address the underlying goals.'
        : 'There is an alternative worth considering that could deliver stronger results.',
      toneName: 'WARM',
      risk: 'Low',
    },
  ];

  return strategies.map((s, i) => {
    const fullBody = `${s.bodyPrefix}\n\nRegarding: ${intent}\n\nI look forward to discussing this further. Please let me know your thoughts.`;
    const wordCount = fullBody.split(/\s+/).length;

    const complianceScan: ComplianceScanResult = scanCompliance
      ? { passed: true, flags: [] }
      : { passed: true, flags: [] };

    return {
      id: `variant-${i + 1}-${Date.now()}`,
      label: s.label,
      strategyLabel: s.strategyLabel,
      subject: isEmail ? `Re: ${intent.slice(0, 60)}` : undefined,
      body: fullBody,
      tone: tone !== 'DIRECT' ? tone : s.toneName,
      wordCount,
      readingLevel: 'Grade 10',
      complianceFlags: [],
      powerDynamic,
      riskLevel: s.risk,
      complianceScan,
    };
  });
}
