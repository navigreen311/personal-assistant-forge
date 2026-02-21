'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallPlaced?: (call: any) => void;
  preSelectedEntityId?: string;
}

interface EntityOption {
  id: string;
  name: string;
}

interface PersonaOption {
  id: string;
  name: string;
}

interface ScriptOption {
  id: string;
  name: string;
}

interface ContactResult {
  id: string;
  name: string;
  phone: string;
}

interface Guardrails {
  requireAiDisclosure: boolean;
  recordCall: boolean;
  autoGenerateSummary: boolean;
  allowCommitments: boolean;
  allowPricingDiscussion: boolean;
}

type CallType = 'freeform' | 'use_script';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PlaceCallModal({
  isOpen,
  onClose,
  onCallPlaced,
  preSelectedEntityId,
}: PlaceCallModalProps) {
  // Contact autocomplete
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const contactDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactDropdownRef = useRef<HTMLDivElement>(null);

  // Entity
  const [entityId, setEntityId] = useState(preSelectedEntityId ?? '');
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Persona
  const [personaId, setPersonaId] = useState('');
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);

  // Call type & script
  const [callType, setCallType] = useState<CallType>('freeform');
  const [scriptId, setScriptId] = useState('');
  const [scripts, setScripts] = useState<ScriptOption[]>([]);
  const [loadingScripts, setLoadingScripts] = useState(false);

  // Objective
  const [objective, setObjective] = useState('');

  // Guardrails
  const [guardrails, setGuardrails] = useState<Guardrails>({
    requireAiDisclosure: true,
    recordCall: true,
    autoGenerateSummary: true,
    allowCommitments: false,
    allowPricingDiscussion: false,
  });

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ---------------------------------------------------------------------------
  // Fetch entities on open
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    setLoadingEntities(true);
    fetch('/api/entities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEntities(
            json.data.map((e: { id: string; name: string }) => ({
              id: e.id,
              name: e.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEntities(false));
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Fetch personas when entity changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!entityId) {
      setPersonas([]);
      setPersonaId('');
      return;
    }
    setLoadingPersonas(true);
    setPersonaId('');
    fetch(`/api/voice/persona?entityId=${encodeURIComponent(entityId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setPersonas(
            json.data.map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPersonas(false));
  }, [entityId]);

  // ---------------------------------------------------------------------------
  // Fetch scripts on open
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    setLoadingScripts(true);
    fetch('/api/voice/scripts')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setScripts(
            json.data.map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingScripts(false));
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Contact autocomplete with debounce
  // ---------------------------------------------------------------------------

  const searchContacts = useCallback((query: string) => {
    if (!query.trim()) {
      setContactResults([]);
      setShowContactDropdown(false);
      return;
    }
    setSearchingContacts(true);
    fetch(`/api/contacts?search=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setContactResults(
            json.data.map((c: { id: string; name: string; phone: string }) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
            })),
          );
          setShowContactDropdown(true);
        }
      })
      .catch(() => {})
      .finally(() => setSearchingContacts(false));
  }, []);

  const handleContactSearchChange = (value: string) => {
    setContactSearch(value);
    setSelectedContact(null);

    if (contactDebounceRef.current) {
      clearTimeout(contactDebounceRef.current);
    }

    contactDebounceRef.current = setTimeout(() => {
      searchContacts(value);
    }, 300);
  };

  const handleSelectContact = (contact: ContactResult) => {
    setSelectedContact(contact);
    setContactSearch(contact.name);
    setShowContactDropdown(false);
  };

  // Close contact dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contactDropdownRef.current &&
        !contactDropdownRef.current.contains(e.target as Node)
      ) {
        setShowContactDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Reset form on close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) {
      setContactSearch('');
      setContactResults([]);
      setSelectedContact(null);
      setShowContactDropdown(false);
      setEntityId(preSelectedEntityId ?? '');
      setPersonaId('');
      setPersonas([]);
      setCallType('freeform');
      setScriptId('');
      setObjective('');
      setGuardrails({
        requireAiDisclosure: true,
        recordCall: true,
        autoGenerateSummary: true,
        allowCommitments: false,
        allowPricingDiscussion: false,
      });
      setSubmitError('');
    }
  }, [isOpen, preSelectedEntityId]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const body = {
        contactId: selectedContact?.id,
        contactPhone: selectedContact?.phone,
        entityId,
        personaId,
        callType,
        scriptId: callType === 'use_script' ? scriptId : undefined,
        objective: objective.trim() || undefined,
        guardrails: {
          requireAiDisclosure: guardrails.requireAiDisclosure,
          recordCall: guardrails.recordCall,
          autoGenerateSummary: guardrails.autoGenerateSummary,
          allowCommitments: guardrails.allowCommitments,
          allowPricingDiscussion: guardrails.allowPricingDiscussion,
        },
      };

      const res = await fetch('/api/voice/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error?.message ?? `Request failed with status ${res.status}`,
        );
      }

      const json = await res.json();
      onCallPlaced?.(json.data ?? json);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to place call',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Place a Call</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {submitError}
            </div>
          )}

          {/* 1. Who to call — contact autocomplete */}
          <div ref={contactDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Who to call
            </label>
            <input
              type="text"
              value={contactSearch}
              onChange={(e) => handleContactSearchChange(e.target.value)}
              onFocus={() => {
                if (contactResults.length > 0) setShowContactDropdown(true);
              }}
              placeholder="Search contacts by name or phone..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            {selectedContact && (
              <p className="mt-1 text-xs text-gray-500">
                {selectedContact.name} &mdash; {selectedContact.phone}
              </p>
            )}
            {searchingContacts && (
              <p className="mt-1 text-xs text-gray-400">Searching...</p>
            )}
            {showContactDropdown && contactResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {contactResults.map((contact) => (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectContact(contact)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium text-gray-900">{contact.name}</span>
                      <span className="ml-2 text-gray-500">{contact.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 2. Entity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">
                {loadingEntities ? 'Loading entities...' : 'Select an entity'}
              </option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Persona */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Persona
            </label>
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              disabled={!entityId}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {!entityId
                  ? 'Select an entity first'
                  : loadingPersonas
                    ? 'Loading personas...'
                    : 'Select a persona'}
              </option>
              {personas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Call Type — radio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Call Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="callType"
                  value="freeform"
                  checked={callType === 'freeform'}
                  onChange={() => setCallType('freeform')}
                  className="text-green-600 focus:ring-green-500"
                />
                Freeform
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="callType"
                  value="use_script"
                  checked={callType === 'use_script'}
                  onChange={() => setCallType('use_script')}
                  className="text-green-600 focus:ring-green-500"
                />
                Use Script
              </label>
            </div>
          </div>

          {/* 5. Script (conditional) */}
          {callType === 'use_script' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Script
              </label>
              <select
                value={scriptId}
                onChange={(e) => setScriptId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="">
                  {loadingScripts ? 'Loading scripts...' : 'Select a script'}
                </option>
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>
                    {script.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 6. Call Objective */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Call Objective
            </label>
            <textarea
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              rows={3}
              placeholder="What should this call achieve?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
            />
          </div>

          {/* 7. Guardrails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Guardrails
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardrails.requireAiDisclosure}
                  onChange={(e) =>
                    setGuardrails({ ...guardrails, requireAiDisclosure: e.target.checked })
                  }
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Require AI disclosure at start
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardrails.recordCall}
                  onChange={(e) =>
                    setGuardrails({ ...guardrails, recordCall: e.target.checked })
                  }
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Record call (consent will be requested)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardrails.autoGenerateSummary}
                  onChange={(e) =>
                    setGuardrails({ ...guardrails, autoGenerateSummary: e.target.checked })
                  }
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Auto-generate summary after call
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardrails.allowCommitments}
                  onChange={(e) =>
                    setGuardrails({ ...guardrails, allowCommitments: e.target.checked })
                  }
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Allow AI to make commitments
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardrails.allowPricingDiscussion}
                  onChange={(e) =>
                    setGuardrails({ ...guardrails, allowPricingDiscussion: e.target.checked })
                  }
                  className="rounded text-green-600 focus:ring-green-500"
                />
                Allow AI to discuss pricing
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                'Placing Call...'
              ) : (
                <>
                  <span role="img" aria-label="phone">📞</span> Place Call
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
