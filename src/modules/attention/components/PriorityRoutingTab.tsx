'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriorityRoutingTabProps {
  entityId?: string;
  period?: string;
}

interface VIPContact {
  id: string;
  name: string;
}

interface ContactSearchResult {
  id: string;
  name: string;
  email?: string;
}

type ConditionType = 'sender_domain' | 'sender_email' | 'subject_contains' | 'source' | 'label';
type RuleAction = 'P0_PUSH_SMS' | 'P0_PUSH' | 'P1_EMAIL' | 'P1_PUSH' | 'P2_SILENT' | 'P2_WEEKLY';
type EscalationMethod = 'desktop_notification' | 'push_sms' | 'voiceforge_call';

interface CustomRoutingRule {
  id: string;
  conditionType: ConditionType;
  conditionValue: string;
  action: RuleAction;
}

interface InterruptProtocol {
  firstAttempt: EscalationMethod;
  afterFiveMin: EscalationMethod;
  afterFifteenMin: EscalationMethod;
}

interface RoutingState {
  vipContacts: VIPContact[];
  keywords: string[];
  customRules: CustomRoutingRule[];
  interruptProtocol: InterruptProtocol;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_TYPE_LABELS: Record<ConditionType, string> = {
  sender_domain: 'Sender domain',
  sender_email: 'Sender email',
  subject_contains: 'Subject contains',
  source: 'Source app',
  label: 'Label / tag',
};

const RULE_ACTION_OPTIONS: { value: RuleAction; label: string }[] = [
  { value: 'P0_PUSH_SMS', label: 'P0 + Push + SMS' },
  { value: 'P0_PUSH', label: 'P0 + Push' },
  { value: 'P1_EMAIL', label: 'P1 + Email' },
  { value: 'P1_PUSH', label: 'P1 + Push' },
  { value: 'P2_SILENT', label: 'P2 + Silent' },
  { value: 'P2_WEEKLY', label: 'P2 + Weekly' },
];

const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  P0_PUSH_SMS: 'P0 + Push + SMS',
  P0_PUSH: 'P0 + Push',
  P1_EMAIL: 'P1 + Email',
  P1_PUSH: 'P1 + Push',
  P2_SILENT: 'P2 + Silent',
  P2_WEEKLY: 'P2 + Weekly',
};

const ESCALATION_LABELS: Record<EscalationMethod, string> = {
  desktop_notification: 'Desktop notification',
  push_sms: 'Push + SMS',
  voiceforge_call: 'VoiceForge call',
};

const ESCALATION_OPTIONS: EscalationMethod[] = [
  'desktop_notification',
  'push_sms',
  'voiceforge_call',
];

const DEFAULT_KEYWORDS = ['urgent', 'emergency', 'HCQC', 'compliance', 'lawsuit'];

const DEFAULT_STATE: RoutingState = {
  vipContacts: [],
  keywords: [...DEFAULT_KEYWORDS],
  customRules: [
    {
      id: 'rule-1',
      conditionType: 'sender_domain',
      conditionValue: 'hcqc.nv.gov',
      action: 'P0_PUSH_SMS',
    },
  ],
  interruptProtocol: {
    firstAttempt: 'desktop_notification',
    afterFiveMin: 'push_sms',
    afterFifteenMin: 'voiceforge_call',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let ruleIdCounter = 100;
function generateRuleId(): string {
  ruleIdCounter += 1;
  return `rule-${Date.now()}-${ruleIdCounter}`;
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

function ShieldIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function XIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function GripVerticalIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function TrashIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Pill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 text-blue-400 hover:bg-blue-200 hover:text-blue-600 transition-colors cursor-pointer"
        aria-label={`Remove ${label}`}
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PriorityRoutingTab({ entityId, period }: PriorityRoutingTabProps) {
  const [state, setState] = useState<RoutingState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [showVIPSearch, setShowVIPSearch] = useState(false);
  const [vipSearchQuery, setVipSearchQuery] = useState('');
  const [vipSearchResults, setVipSearchResults] = useState<ContactSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [keywordInput, setKeywordInput] = useState('');

  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleConditionType, setNewRuleConditionType] = useState<ConditionType>('sender_domain');
  const [newRuleConditionValue, setNewRuleConditionValue] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<RuleAction>('P0_PUSH_SMS');

  // --- Fetch existing routing config ---
  useEffect(() => {
    async function fetchRouting() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (entityId) params.set('entityId', entityId);
        if (period) params.set('period', period);

        const res = await fetch(`/api/attention?${params}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setState((prev) => ({ ...prev, ...json.data }));
          }
        }
      } catch {
        // Use default state on failure
      } finally {
        setIsLoading(false);
      }
    }
    fetchRouting();
  }, [entityId, period]);

  // --- VIP contact search (debounced) ---
  useEffect(() => {
    if (!vipSearchQuery.trim()) {
      setVipSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(vipSearchQuery.trim())}`);
        if (res.ok) {
          const json = await res.json();
          const results: ContactSearchResult[] = (json.data ?? []).map(
            (c: { id: string; name: string; email?: string }) => ({
              id: c.id,
              name: c.name,
              email: c.email,
            }),
          );
          const existingIds = new Set(state.vipContacts.map((v) => v.id));
          setVipSearchResults(results.filter((r) => !existingIds.has(r.id)));
        }
      } catch {
        setVipSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [vipSearchQuery, state.vipContacts]);

  // --- VIP Contacts handlers ---
  const addVIPContact = useCallback((contact: ContactSearchResult) => {
    setState((prev) => ({
      ...prev,
      vipContacts: [...prev.vipContacts, { id: contact.id, name: contact.name }],
    }));
    setVipSearchQuery('');
    setVipSearchResults([]);
    setShowVIPSearch(false);
  }, []);

  const removeVIPContact = useCallback((contactId: string) => {
    setState((prev) => ({
      ...prev,
      vipContacts: prev.vipContacts.filter((c) => c.id !== contactId),
    }));
  }, []);

  // --- Keyword handlers ---
  const addKeyword = useCallback((keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    setState((prev) => {
      if (prev.keywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return { ...prev, keywords: [...prev.keywords, trimmed] };
    });
    setKeywordInput('');
  }, []);

  const removeKeyword = useCallback((keyword: string) => {
    setState((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
    }));
  }, []);

  const handleKeywordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addKeyword(keywordInput);
      }
    },
    [keywordInput, addKeyword],
  );

  // --- Custom Rules handlers ---
  const addCustomRule = useCallback(() => {
    if (!newRuleConditionValue.trim()) return;

    const newRule: CustomRoutingRule = {
      id: generateRuleId(),
      conditionType: newRuleConditionType,
      conditionValue: newRuleConditionValue.trim(),
      action: newRuleAction,
    };

    setState((prev) => ({
      ...prev,
      customRules: [...prev.customRules, newRule],
    }));

    setNewRuleConditionType('sender_domain');
    setNewRuleConditionValue('');
    setNewRuleAction('P0_PUSH_SMS');
    setShowAddRule(false);
  }, [newRuleConditionType, newRuleConditionValue, newRuleAction]);

  const deleteCustomRule = useCallback((ruleId: string) => {
    setState((prev) => ({
      ...prev,
      customRules: prev.customRules.filter((r) => r.id !== ruleId),
    }));
  }, []);

  // --- Interrupt Protocol handlers ---
  const updateInterruptProtocol = useCallback(
    (field: keyof InterruptProtocol, value: EscalationMethod) => {
      setState((prev) => ({
        ...prev,
        interruptProtocol: { ...prev.interruptProtocol, [field]: value },
      }));
    },
    [],
  );

  // --- Save handler ---
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/attention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, period, ...state }),
      });

      if (res.ok) {
        setSaveMessage('Routing rules saved successfully.');
      } else {
        setSaveMessage('Failed to save routing rules. Please try again.');
      }
    } catch {
      setSaveMessage('Failed to save routing rules. Please try again.');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }, [state, entityId, period]);

  // --- Format rule condition for display ---
  const formatCondition = (rule: CustomRoutingRule): string => {
    return `${CONDITION_TYPE_LABELS[rule.conditionType]} = '${rule.conditionValue}'`;
  };

  // ---------- Skeleton loader ----------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-52 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-80 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="flex gap-2">
            <div className="h-8 w-24 animate-pulse rounded-full bg-gray-100" />
            <div className="h-8 w-28 animate-pulse rounded-full bg-gray-100" />
            <div className="h-8 w-20 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-gray-100" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-44 animate-pulse rounded bg-gray-200 mb-4" />
          {[1, 2].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-gray-100 mb-2" />
          ))}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="h-4 w-36 animate-pulse rounded bg-gray-200 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main render ----------

  return (
    <div className="space-y-6">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldIcon className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Priority Routing Rules</h2>
            <p className="text-sm text-gray-500">
              Define how notifications are prioritized and routed.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddRule(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          + New Rule
        </button>
      </div>

      {/* ========== VIP CONTACTS ========== */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>VIP Contacts</SectionHeading>

        <div className="flex flex-wrap items-center gap-2">
          {state.vipContacts.map((contact) => (
            <Pill
              key={contact.id}
              label={contact.name}
              onRemove={() => removeVIPContact(contact.id)}
            />
          ))}

          {state.vipContacts.length === 0 && !showVIPSearch && (
            <span className="text-sm text-gray-400 italic">No VIP contacts added yet.</span>
          )}

          {showVIPSearch ? (
            <div className="relative">
              <input
                type="text"
                value={vipSearchQuery}
                onChange={(e) => setVipSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                autoFocus
                onBlur={() => {
                  setTimeout(() => {
                    setShowVIPSearch(false);
                    setVipSearchQuery('');
                    setVipSearchResults([]);
                  }, 200);
                }}
                className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {(vipSearchResults.length > 0 || isSearching) && (
                <div className="absolute top-full left-0 z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                  {isSearching && (
                    <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
                  )}
                  {vipSearchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addVIPContact(result)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <span className="font-medium text-gray-900">{result.name}</span>
                      {result.email && (
                        <span className="ml-2 text-gray-400">{result.email}</span>
                      )}
                    </button>
                  ))}
                  {!isSearching && vipSearchQuery.trim() && vipSearchResults.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-400">No contacts found.</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowVIPSearch(true)}
              className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
            >
              + Add VIP contact
            </button>
          )}
        </div>
      </div>

      {/* ========== KEYWORD ESCALATION ========== */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Keyword Escalation</SectionHeading>
        <p className="text-xs text-gray-400 mb-3">
          Messages containing these keywords auto-escalate to P0
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {state.keywords.map((keyword) => (
            <Pill
              key={keyword}
              label={keyword}
              onRemove={() => removeKeyword(keyword)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeywordKeyDown}
            placeholder="Type keyword and press Enter..."
            className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => addKeyword(keywordInput)}
            disabled={!keywordInput.trim()}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            + Add keyword
          </button>
        </div>
      </div>

      {/* ========== CUSTOM ROUTING RULES ========== */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>Custom Routing Rules</SectionHeading>
        </div>

        {state.customRules.length === 0 && !showAddRule && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8 text-center">
            <p className="text-sm text-gray-500">
              No custom routing rules defined. Add rules to automatically route specific notifications.
            </p>
          </div>
        )}

        {state.customRules.length > 0 && (
          <div className="space-y-2 mb-4">
            {state.customRules.map((rule, index) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 group"
              >
                <span
                  className="text-gray-300 cursor-grab"
                  title="Drag to reorder (coming soon)"
                >
                  <GripVerticalIcon className="w-4 h-4" />
                </span>

                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </span>

                <div className="flex-1 text-sm text-gray-700">
                  <span className="font-semibold text-gray-800">IF</span>{' '}
                  {formatCondition(rule)}{' '}
                  <span className="text-gray-400 mx-1">&rarr;</span>{' '}
                  <span className="font-semibold text-blue-700">{RULE_ACTION_LABELS[rule.action]}</span>
                </div>

                <button
                  type="button"
                  onClick={() => deleteCustomRule(rule.id)}
                  className="opacity-0 group-hover:opacity-100 rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                  aria-label={`Delete rule ${index + 1}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}

            <p className="text-center text-xs text-gray-400 mt-2">
              Rules are evaluated top-to-bottom. First match wins.
            </p>
          </div>
        )}

        {showAddRule && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-3">
            <h4 className="text-sm font-medium text-gray-800 mb-3">New Routing Rule</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Condition type
                </label>
                <select
                  value={newRuleConditionType}
                  onChange={(e) => setNewRuleConditionType(e.target.value as ConditionType)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {(Object.entries(CONDITION_TYPE_LABELS) as [ConditionType, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Value
                </label>
                <input
                  type="text"
                  value={newRuleConditionValue}
                  onChange={(e) => setNewRuleConditionValue(e.target.value)}
                  placeholder="e.g., hcqc.nv.gov"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Action
                </label>
                <select
                  value={newRuleAction}
                  onChange={(e) => setNewRuleAction(e.target.value as RuleAction)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {RULE_ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddRule(false);
                  setNewRuleConditionValue('');
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addCustomRule}
                disabled={!newRuleConditionValue.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Add Rule
              </button>
            </div>
          </div>
        )}

        {!showAddRule && (
          <button
            type="button"
            onClick={() => setShowAddRule(true)}
            className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer w-full"
          >
            + Add Rule
          </button>
        )}
      </div>

      {/* ========== INTERRUPT PROTOCOL ========== */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <SectionHeading>Interrupt Protocol</SectionHeading>
        <p className="text-xs text-gray-400 mb-4">
          For P0 Critical items when DND is active:
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-gray-700">1st attempt</span>
            </div>
            <select
              value={state.interruptProtocol.firstAttempt}
              onChange={(e) =>
                updateInterruptProtocol('firstAttempt', e.target.value as EscalationMethod)
              }
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ESCALATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {ESCALATION_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-gray-700">After 5 min</span>
            </div>
            <select
              value={state.interruptProtocol.afterFiveMin}
              onChange={(e) =>
                updateInterruptProtocol('afterFiveMin', e.target.value as EscalationMethod)
              }
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ESCALATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {ESCALATION_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-gray-700">After 15 min</span>
            </div>
            <select
              value={state.interruptProtocol.afterFifteenMin}
              onChange={(e) =>
                updateInterruptProtocol('afterFifteenMin', e.target.value as EscalationMethod)
              }
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ESCALATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {ESCALATION_LABELS[opt]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5">
            {ESCALATION_LABELS[state.interruptProtocol.firstAttempt]}
          </span>
          <span>&rarr;</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
            {ESCALATION_LABELS[state.interruptProtocol.afterFiveMin]}
          </span>
          <span>&rarr;</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5">
            {ESCALATION_LABELS[state.interruptProtocol.afterFifteenMin]}
          </span>
        </div>
      </div>

      {/* ========== SAVE BUTTON ========== */}
      <div className="flex items-center justify-end gap-3">
        {saveMessage && (
          <span
            className={`text-sm font-medium ${saveMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}
          >
            {saveMessage}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isSaving ? 'Saving...' : 'Save Routing Rules'}
        </button>
      </div>
    </div>
  );
}