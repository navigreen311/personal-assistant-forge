'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CallGuardrails } from '@/modules/voiceforge/types';

// ============================================================================
// Types
// ============================================================================

interface CampaignWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (campaign: any) => void;
}

interface EntityOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface PersonaOption {
  id: string;
  name: string;
  description?: string;
}

interface ScriptOption {
  id: string;
  name: string;
  status: string;
}

interface SetupData {
  name: string;
  entityId: string;
  campaignType: string;
  description: string;
}

interface AudienceData {
  selectedContactIds: string[];
  selectedContacts: ContactOption[];
  excludeCalledInDays: number;
}

interface ScriptPersonaData {
  personaId: string;
  scriptId: string;
  callObjective: string;
  guardrails: CallGuardrails;
  voicemailScript: string;
}

interface ScheduleData {
  startMode: 'immediately' | 'scheduled';
  scheduledDate: string;
  callWindowStart: string;
  callWindowEnd: string;
  maxCallsPerDay: number;
  daysOfWeek: boolean[];
  retryDelayHours: number;
  retryMaxAttempts: number;
  stopConditionPercent: number;
}

// ============================================================================
// Constants
// ============================================================================

const WIZARD_STEPS = ['Setup', 'Audience', 'Script', 'Launch'];

const CAMPAIGN_TYPES = [
  'Cold Outreach',
  'Follow-up',
  'Reminder',
  'Survey',
  'Custom',
];

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TIME_OPTIONS = [
  '6:00 AM', '6:30 AM', '7:00 AM', '7:30 AM',
  '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM',
  '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM',
  '8:00 PM', '8:30 PM', '9:00 PM',
];

const DEFAULT_GUARDRAILS: CallGuardrails = {
  maxCommitments: 3,
  forbiddenTopics: [],
  escalationTriggers: [],
  complianceProfile: [],
  maxSilenceSeconds: 10,
};

const COMPLIANCE_OPTIONS = [
  { value: 'do-not-call', label: 'Respect Do-Not-Call lists' },
  { value: 'recording-disclosure', label: 'Disclose call recording' },
  { value: 'identity-disclosure', label: 'Disclose AI identity' },
  { value: 'opt-out', label: 'Offer opt-out on request' },
  { value: 'time-restrictions', label: 'Respect calling time restrictions' },
];

// ============================================================================
// Progress Stepper
// ============================================================================

function ProgressStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {WIZARD_STEPS.map((label, index) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                index === currentStep
                  ? 'bg-blue-600 text-white'
                  : index < currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-400'
              }`}
            >
              {index < currentStep ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`text-xs mt-1 ${
                index === currentStep ? 'text-blue-600 font-medium' : index < currentStep ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
          {index < WIZARD_STEPS.length - 1 && (
            <div
              className={`h-0.5 w-16 mx-2 transition-colors ${
                index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Contact Search Multi-Select
// ============================================================================

function ContactMultiSelect({
  entityId,
  selectedContacts,
  onSelectionChange,
}: {
  entityId: string;
  selectedContacts: ContactOption[];
  onSelectionChange: (contacts: ContactOption[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedIds = selectedContacts.map((c) => c.id);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim() || !entityId) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/contacts?entityId=${encodeURIComponent(entityId)}&search=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const json = await res.json();
          const items: ContactOption[] = json.data ?? json;
          setResults(items.filter((item) => !selectedIds.includes(item.id)));
          setIsOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, entityId, selectedIds]);

  const addContact = (contact: ContactOption) => {
    onSelectionChange([...selectedContacts, contact]);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const removeContact = (id: string) => {
    onSelectionChange(selectedContacts.filter((c) => c.id !== id));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700">
        Select Contacts <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts by name, phone, or email..."
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
      />

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
          )}
          {!isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No contacts found</div>
          )}
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => addContact(contact)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700 flex justify-between items-center"
            >
              <span className="font-medium">{contact.name}</span>
              {contact.phone && (
                <span className="text-xs text-gray-400">{contact.phone}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Selected contacts count */}
      {selectedContacts.length > 0 && (
        <p className="mt-1.5 text-sm font-medium text-blue-600">
          {selectedContacts.length} contact{selectedContacts.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Step 1 - Setup
// ============================================================================

function StepSetup({
  data,
  onChange,
  entities,
  errors,
  touched,
  onBlur,
}: {
  data: SetupData;
  onChange: (data: SetupData) => void;
  entities: EntityOption[];
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  onBlur: (field: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Campaign Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          onBlur={() => onBlur('name')}
          placeholder="e.g., Q1 Outreach - New Leads"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
        {touched.name && errors.name && (
          <p className="mt-1 text-xs text-red-600">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Entity <span className="text-red-500">*</span>
        </label>
        <select
          value={data.entityId}
          onChange={(e) => onChange({ ...data, entityId: e.target.value })}
          onBlur={() => onBlur('entityId')}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select an entity...</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
        {touched.entityId && errors.entityId && (
          <p className="mt-1 text-xs text-red-600">{errors.entityId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Campaign Type</label>
        <select
          value={data.campaignType}
          onChange={(e) => onChange({ ...data, campaignType: e.target.value })}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select a type...</option>
          {CAMPAIGN_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          placeholder="Describe the purpose and goals of this campaign..."
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 - Audience
// ============================================================================

function StepAudience({
  data,
  onChange,
  entityId,
  errors,
  touched,
}: {
  data: AudienceData;
  onChange: (data: AudienceData) => void;
  entityId: string;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}) {
  return (
    <div className="space-y-5">
      <ContactMultiSelect
        entityId={entityId}
        selectedContacts={data.selectedContacts}
        onSelectionChange={(contacts) =>
          onChange({
            ...data,
            selectedContacts: contacts,
            selectedContactIds: contacts.map((c) => c.id),
          })
        }
      />
      {touched.contacts && errors.contacts && (
        <p className="-mt-3 text-xs text-red-600">{errors.contacts}</p>
      )}

      {/* Exclude recent contacts */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Exclude Recently Called
        </label>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-gray-500">Exclude contacts called in last</span>
          <input
            type="number"
            value={data.excludeCalledInDays}
            onChange={(e) =>
              onChange({ ...data, excludeCalledInDays: parseInt(e.target.value) || 0 })
            }
            min={0}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-sm text-gray-500">days</span>
        </div>
      </div>

      {/* Preview panel */}
      {data.selectedContacts.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selected Contacts Preview
          </label>
          <div className="rounded-lg border border-gray-200 bg-gray-50 max-h-56 overflow-y-auto">
            {data.selectedContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-b-0"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">{contact.name}</span>
                  {contact.phone && (
                    <span className="text-xs text-gray-400 ml-2">{contact.phone}</span>
                  )}
                  {contact.email && (
                    <span className="text-xs text-gray-400 ml-2">{contact.email}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...data,
                      selectedContacts: data.selectedContacts.filter((c) => c.id !== contact.id),
                      selectedContactIds: data.selectedContactIds.filter((id) => id !== contact.id),
                    })
                  }
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step 3 - Script & Persona
// ============================================================================

function StepScriptPersona({
  data,
  onChange,
  entityId,
  errors,
  touched,
  onBlur,
}: {
  data: ScriptPersonaData;
  onChange: (data: ScriptPersonaData) => void;
  entityId: string;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  onBlur: (field: string) => void;
}) {
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [scripts, setScripts] = useState<ScriptOption[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [triggerInput, setTriggerInput] = useState('');

  useEffect(() => {
    if (!entityId) return;

    async function fetchPersonas() {
      try {
        const res = await fetch(`/api/voice/persona?entityId=${encodeURIComponent(entityId)}`);
        if (res.ok) {
          const json = await res.json();
          setPersonas(json.data ?? json);
        }
      } catch {
        // Silently fail
      }
    }

    async function fetchScripts() {
      try {
        const res = await fetch('/api/voice/scripts');
        if (res.ok) {
          const json = await res.json();
          setScripts(json.data ?? json);
        }
      } catch {
        // Silently fail
      }
    }

    fetchPersonas();
    fetchScripts();
  }, [entityId]);

  const addForbiddenTopic = () => {
    if (topicInput.trim()) {
      onChange({
        ...data,
        guardrails: {
          ...data.guardrails,
          forbiddenTopics: [...data.guardrails.forbiddenTopics, topicInput.trim()],
        },
      });
      setTopicInput('');
    }
  };

  const removeForbiddenTopic = (index: number) => {
    onChange({
      ...data,
      guardrails: {
        ...data.guardrails,
        forbiddenTopics: data.guardrails.forbiddenTopics.filter((_, i) => i !== index),
      },
    });
  };

  const addEscalationTrigger = () => {
    if (triggerInput.trim()) {
      onChange({
        ...data,
        guardrails: {
          ...data.guardrails,
          escalationTriggers: [...data.guardrails.escalationTriggers, triggerInput.trim()],
        },
      });
      setTriggerInput('');
    }
  };

  const removeEscalationTrigger = (index: number) => {
    onChange({
      ...data,
      guardrails: {
        ...data.guardrails,
        escalationTriggers: data.guardrails.escalationTriggers.filter((_, i) => i !== index),
      },
    });
  };

  const toggleComplianceProfile = (value: string) => {
    const current = data.guardrails.complianceProfile;
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({
      ...data,
      guardrails: { ...data.guardrails, complianceProfile: updated },
    });
  };

  return (
    <div className="space-y-5">
      {/* Persona select */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Persona <span className="text-red-500">*</span>
        </label>
        <select
          value={data.personaId}
          onChange={(e) => onChange({ ...data, personaId: e.target.value })}
          onBlur={() => onBlur('personaId')}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select a persona...</option>
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
        {touched.personaId && errors.personaId && (
          <p className="mt-1 text-xs text-red-600">{errors.personaId}</p>
        )}
      </div>

      {/* Script select */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Script</label>
        <select
          value={data.scriptId}
          onChange={(e) => onChange({ ...data, scriptId: e.target.value })}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select a script...</option>
          {scripts.map((script) => (
            <option key={script.id} value={script.id}>
              {script.name} {script.status === 'DRAFT' ? '(Draft)' : ''}
            </option>
          ))}
          <option value="__new__">+ Create new script</option>
        </select>
      </div>

      {/* Call Objective */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Call Objective</label>
        <textarea
          value={data.callObjective}
          onChange={(e) => onChange({ ...data, callObjective: e.target.value })}
          rows={3}
          placeholder="Describe what each call should accomplish..."
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Guardrails Section */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-4">
        <h4 className="text-sm font-semibold text-gray-900">Call Guardrails</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Commitments</label>
            <input
              type="number"
              value={data.guardrails.maxCommitments}
              min={0}
              onChange={(e) =>
                onChange({
                  ...data,
                  guardrails: { ...data.guardrails, maxCommitments: parseInt(e.target.value) || 0 },
                })
              }
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Max Silence (seconds)</label>
            <input
              type="number"
              value={data.guardrails.maxSilenceSeconds}
              min={1}
              onChange={(e) =>
                onChange({
                  ...data,
                  guardrails: { ...data.guardrails, maxSilenceSeconds: parseInt(e.target.value) || 1 },
                })
              }
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Compliance checkboxes */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Compliance Profile</label>
          <div className="space-y-2">
            {COMPLIANCE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.guardrails.complianceProfile.includes(option.value)}
                  onChange={() => toggleComplianceProfile(option.value)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Forbidden Topics */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Forbidden Topics</label>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              value={topicInput}
              placeholder="Add topic..."
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addForbiddenTopic();
                }
              }}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addForbiddenTopic}
              className="px-2 py-1 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.guardrails.forbiddenTopics.map((topic, i) => (
              <span
                key={i}
                className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1"
              >
                {topic}
                <button
                  type="button"
                  onClick={() => removeForbiddenTopic(i)}
                  className="text-red-400 hover:text-red-600"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Escalation Triggers */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Escalation Triggers</label>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              value={triggerInput}
              placeholder="Add trigger..."
              onChange={(e) => setTriggerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEscalationTrigger();
                }
              }}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addEscalationTrigger}
              className="px-2 py-1 text-sm bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.guardrails.escalationTriggers.map((trigger, i) => (
              <span
                key={i}
                className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1"
              >
                {trigger}
                <button
                  type="button"
                  onClick={() => removeEscalationTrigger(i)}
                  className="text-yellow-400 hover:text-yellow-600"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Voicemail Script */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Voicemail Script</label>
        <p className="text-xs text-gray-400 mb-1">Script if voicemail detected</p>
        <textarea
          value={data.voicemailScript}
          onChange={(e) => onChange({ ...data, voicemailScript: e.target.value })}
          rows={3}
          placeholder="Hi, this is [persona] calling on behalf of [entity]. We wanted to reach out regarding..."
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Step 4 - Schedule & Launch
// ============================================================================

function StepScheduleLaunch({
  data,
  onChange,
}: {
  data: ScheduleData;
  onChange: (data: ScheduleData) => void;
}) {
  const toggleDay = (index: number) => {
    const updated = [...data.daysOfWeek];
    updated[index] = !updated[index];
    onChange({ ...data, daysOfWeek: updated });
  };

  return (
    <div className="space-y-5">
      {/* Schedule mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startMode"
              value="immediately"
              checked={data.startMode === 'immediately'}
              onChange={() => onChange({ ...data, startMode: 'immediately' })}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Start immediately</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startMode"
              value="scheduled"
              checked={data.startMode === 'scheduled'}
              onChange={() => onChange({ ...data, startMode: 'scheduled' })}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Schedule for...</span>
          </label>
        </div>
        {data.startMode === 'scheduled' && (
          <input
            type="datetime-local"
            value={data.scheduledDate}
            onChange={(e) => onChange({ ...data, scheduledDate: e.target.value })}
            className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          />
        )}
      </div>

      {/* Calling Hours */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Calling Hours</label>
        <div className="flex items-center gap-2">
          <select
            value={data.callWindowStart}
            onChange={(e) => onChange({ ...data, callWindowStart: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={`start-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">to</span>
          <select
            value={data.callWindowEnd}
            onChange={(e) => onChange({ ...data, callWindowEnd: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          >
            {TIME_OPTIONS.map((time) => (
              <option key={`end-${time}`} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Max Calls Per Day */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Max Calls Per Day</label>
        <input
          type="number"
          value={data.maxCallsPerDay}
          min={1}
          onChange={(e) => onChange({ ...data, maxCallsPerDay: parseInt(e.target.value) || 1 })}
          className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Days of Week */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
        <div className="flex gap-2">
          {DAYS_OF_WEEK.map((day, index) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(index)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                data.daysOfWeek[index]
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Retry settings */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Retry Settings</label>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">If no answer, retry after</span>
          <input
            type="number"
            value={data.retryDelayHours}
            min={1}
            onChange={(e) => onChange({ ...data, retryDelayHours: parseInt(e.target.value) || 1 })}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-sm text-gray-500">hours, max</span>
          <input
            type="number"
            value={data.retryMaxAttempts}
            min={1}
            onChange={(e) => onChange({ ...data, retryMaxAttempts: parseInt(e.target.value) || 1 })}
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-sm text-gray-500">attempts</span>
        </div>
      </div>

      {/* Stop Condition */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Stop Condition</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Stop if</span>
          <input
            type="number"
            value={data.stopConditionPercent}
            min={0}
            max={100}
            onChange={(e) =>
              onChange({ ...data, stopConditionPercent: parseInt(e.target.value) || 0 })
            }
            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
          />
          <span className="text-sm text-gray-500">% mark not interested</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main CampaignWizard Component
// ============================================================================

export default function CampaignWizard({ isOpen, onClose, onCreated }: CampaignWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [entities, setEntities] = useState<EntityOption[]>([]);

  // Step 1 - Setup data
  const [setupData, setSetupData] = useState<SetupData>({
    name: '',
    entityId: '',
    campaignType: '',
    description: '',
  });

  // Step 2 - Audience data
  const [audienceData, setAudienceData] = useState<AudienceData>({
    selectedContactIds: [],
    selectedContacts: [],
    excludeCalledInDays: 7,
  });

  // Step 3 - Script & Persona data
  const [scriptPersonaData, setScriptPersonaData] = useState<ScriptPersonaData>({
    personaId: '',
    scriptId: '',
    callObjective: '',
    guardrails: { ...DEFAULT_GUARDRAILS },
    voicemailScript: '',
  });

  // Step 4 - Schedule data
  const [scheduleData, setScheduleData] = useState<ScheduleData>({
    startMode: 'immediately',
    scheduledDate: '',
    callWindowStart: '9:00 AM',
    callWindowEnd: '5:00 PM',
    maxCallsPerDay: 50,
    daysOfWeek: [true, true, true, true, true, false, false], // Mon-Fri
    retryDelayHours: 24,
    retryMaxAttempts: 3,
    stopConditionPercent: 50,
  });

  // Fetch entities on mount
  useEffect(() => {
    if (!isOpen) return;

    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities');
        if (res.ok) {
          const json = await res.json();
          setEntities(json.data ?? json);
        }
      } catch {
        // Silently fail
      }
    }
    fetchEntities();
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsSubmitting(false);
      setSubmitError('');
      setTouched({});
      setSetupData({ name: '', entityId: '', campaignType: '', description: '' });
      setAudienceData({ selectedContactIds: [], selectedContacts: [], excludeCalledInDays: 7 });
      setScriptPersonaData({
        personaId: '',
        scriptId: '',
        callObjective: '',
        guardrails: { ...DEFAULT_GUARDRAILS },
        voicemailScript: '',
      });
      setScheduleData({
        startMode: 'immediately',
        scheduledDate: '',
        callWindowStart: '9:00 AM',
        callWindowEnd: '5:00 PM',
        maxCallsPerDay: 50,
        daysOfWeek: [true, true, true, true, true, false, false],
        retryDelayHours: 24,
        retryMaxAttempts: 3,
        stopConditionPercent: 50,
      });
    }
  }, [isOpen]);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Validation per step
  const getStepErrors = useCallback(
    (step: number): Record<string, string> => {
      const errs: Record<string, string> = {};
      switch (step) {
        case 0:
          if (!setupData.name.trim()) errs.name = 'Campaign name is required';
          if (!setupData.entityId) errs.entityId = 'Entity is required';
          break;
        case 1:
          if (audienceData.selectedContactIds.length === 0)
            errs.contacts = 'At least 1 contact is required';
          break;
        case 2:
          if (!scriptPersonaData.personaId) errs.personaId = 'Persona is required';
          break;
        case 3:
          // No hard requirements for schedule step
          break;
      }
      return errs;
    },
    [setupData, audienceData, scriptPersonaData]
  );

  const currentErrors = getStepErrors(currentStep);

  const handleNext = () => {
    const errors = getStepErrors(currentStep);
    if (Object.keys(errors).length > 0) {
      // Mark all relevant fields as touched
      const touchFields: Record<string, boolean> = {};
      Object.keys(errors).forEach((key) => {
        touchFields[key] = true;
      });
      setTouched((prev) => ({ ...prev, ...touchFields }));
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const buildPayload = (isDraft: boolean) => {
    const activeDays = DAYS_OF_WEEK.filter((_, i) => scheduleData.daysOfWeek[i]).map(
      (_, i) => i
    );

    return {
      name: setupData.name,
      entityId: setupData.entityId,
      campaignType: setupData.campaignType,
      description: setupData.description,
      personaId: scriptPersonaData.personaId,
      scriptId: scriptPersonaData.scriptId === '__new__' ? '' : scriptPersonaData.scriptId,
      targetContactIds: audienceData.selectedContactIds,
      callObjective: scriptPersonaData.callObjective,
      guardrails: scriptPersonaData.guardrails,
      voicemailScript: scriptPersonaData.voicemailScript,
      excludeCalledInDays: audienceData.excludeCalledInDays,
      schedule: {
        startDate:
          scheduleData.startMode === 'immediately'
            ? new Date().toISOString()
            : scheduleData.scheduledDate,
        callWindowStart: scheduleData.callWindowStart,
        callWindowEnd: scheduleData.callWindowEnd,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        maxCallsPerDay: scheduleData.maxCallsPerDay,
        retryAttempts: scheduleData.retryMaxAttempts,
        retryDelayHours: scheduleData.retryDelayHours,
        daysOfWeek: activeDays,
      },
      stopConditions: [
        {
          type: 'NEGATIVE_SENTIMENT',
          threshold: scheduleData.stopConditionPercent,
        },
      ],
      status: isDraft ? 'DRAFT' : 'ACTIVE',
    };
  };

  const handleSubmit = async (isDraft: boolean) => {
    if (!isDraft) {
      // Validate all steps before launch
      for (let step = 0; step < WIZARD_STEPS.length; step++) {
        const errors = getStepErrors(step);
        if (Object.keys(errors).length > 0) {
          setCurrentStep(step);
          const touchFields: Record<string, boolean> = {};
          Object.keys(errors).forEach((key) => {
            touchFields[key] = true;
          });
          setTouched((prev) => ({ ...prev, ...touchFields }));
          return;
        }
      }
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = buildPayload(isDraft);
      const res = await fetch('/api/voice/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message ?? `Failed to create campaign (${res.status})`);
      }

      const campaign = await res.json();
      onCreated?.(campaign.data ?? campaign);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message ?? 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Create Campaign</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Progress Stepper */}
          <ProgressStepper currentStep={currentStep} />

          {/* Step Content */}
          {currentStep === 0 && (
            <StepSetup
              data={setupData}
              onChange={setSetupData}
              entities={entities}
              errors={currentErrors}
              touched={touched}
              onBlur={handleBlur}
            />
          )}

          {currentStep === 1 && (
            <StepAudience
              data={audienceData}
              onChange={setAudienceData}
              entityId={setupData.entityId}
              errors={currentErrors}
              touched={touched}
            />
          )}

          {currentStep === 2 && (
            <StepScriptPersona
              data={scriptPersonaData}
              onChange={setScriptPersonaData}
              entityId={setupData.entityId}
              errors={currentErrors}
              touched={touched}
              onBlur={handleBlur}
            />
          )}

          {currentStep === 3 && (
            <StepScheduleLaunch
              data={scheduleData}
              onChange={setScheduleData}
            />
          )}

          {/* Submit error */}
          {submitError && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <div>
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                &larr; Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep === WIZARD_STEPS.length - 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={isSubmitting}
                  className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Launching...
                    </span>
                  ) : (
                    'Launch Campaign'
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Next &rarr;
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
