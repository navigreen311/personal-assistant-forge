'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonaCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (persona: any) => void;
  editPersona?: {
    id: string;
    name: string;
    entityId: string;
    voiceGender: string;
    voiceTone: string;
    industry: string;
    personality: string;
    greeting: string;
    rules: string[];
  } | null;
}

interface EntityOption {
  id: string;
  name: string;
}

type VoiceGender = 'Male' | 'Female' | 'Neutral';
type VoiceTone = 'Warm' | 'Professional' | 'Friendly' | 'Authoritative' | 'Casual';
type Industry = 'Healthcare' | 'Real Estate' | 'Legal' | 'Finance' | 'Technology' | 'General';

const VOICE_GENDERS: VoiceGender[] = ['Male', 'Female', 'Neutral'];
const VOICE_TONES: VoiceTone[] = ['Warm', 'Professional', 'Friendly', 'Authoritative', 'Casual'];
const INDUSTRIES: Industry[] = ['Healthcare', 'Real Estate', 'Legal', 'Finance', 'Technology', 'General'];

interface DefaultRule {
  label: string;
  defaultChecked: boolean;
}

const DEFAULT_RULES: DefaultRule[] = [
  { label: 'Always disclose AI nature', defaultChecked: true },
  { label: 'Request recording consent', defaultChecked: true },
  { label: 'Stay on topic', defaultChecked: true },
  { label: 'Can make commitments', defaultChecked: false },
  { label: 'Can discuss pricing', defaultChecked: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonaCreatorModal({
  isOpen,
  onClose,
  onCreated,
  editPersona,
}: PersonaCreatorModalProps) {
  const isEditMode = !!editPersona;

  // Entities
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('Male');
  const [voiceTone, setVoiceTone] = useState<VoiceTone>('Warm');
  const [industry, setIndustry] = useState<Industry | ''>('');
  const [personality, setPersonality] = useState('');
  const [greeting, setGreeting] = useState('');

  // Behavioral rules — default rules tracked as boolean array
  const [defaultRuleStates, setDefaultRuleStates] = useState<boolean[]>(
    DEFAULT_RULES.map((r) => r.defaultChecked),
  );
  const [customRules, setCustomRules] = useState<string[]>([]);
  const [newCustomRule, setNewCustomRule] = useState('');

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
  // Populate form for edit mode
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    if (editPersona) {
      setName(editPersona.name);
      setEntityId(editPersona.entityId);
      setVoiceGender(editPersona.voiceGender as VoiceGender);
      setVoiceTone(editPersona.voiceTone as VoiceTone);
      setIndustry(editPersona.industry as Industry);
      setPersonality(editPersona.personality);
      setGreeting(editPersona.greeting);

      // Reconcile rules: match known default rules, rest go to custom
      const knownLabels = DEFAULT_RULES.map((r) => r.label);
      const states = DEFAULT_RULES.map((r) => editPersona.rules.includes(r.label));
      setDefaultRuleStates(states);
      setCustomRules(editPersona.rules.filter((r) => !knownLabels.includes(r)));
    }
  }, [isOpen, editPersona]);

  // ---------------------------------------------------------------------------
  // Reset form on close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setEntityId('');
      setVoiceGender('Male');
      setVoiceTone('Warm');
      setIndustry('');
      setPersonality('');
      setGreeting('');
      setDefaultRuleStates(DEFAULT_RULES.map((r) => r.defaultChecked));
      setCustomRules([]);
      setNewCustomRule('');
      setSubmitError('');
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const toggleDefaultRule = (index: number) => {
    setDefaultRuleStates((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const addCustomRule = () => {
    const trimmed = newCustomRule.trim();
    if (!trimmed) return;
    if (customRules.includes(trimmed)) return;
    setCustomRules((prev) => [...prev, trimmed]);
    setNewCustomRule('');
  };

  const removeCustomRule = (index: number) => {
    setCustomRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCustomRuleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomRule();
    }
  };

  const collectRules = (): string[] => {
    const rules: string[] = [];
    DEFAULT_RULES.forEach((r, i) => {
      if (defaultRuleStates[i]) {
        rules.push(r.label);
      }
    });
    rules.push(...customRules);
    return rules;
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const isValid = name.trim() !== '' && entityId !== '' && voiceGender !== '';

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const body = {
        name: name.trim(),
        entityId,
        voiceGender,
        voiceTone,
        industry: industry || undefined,
        personality: personality.trim() || undefined,
        greeting: greeting.trim() || undefined,
        rules: collectRules(),
      };

      const url = isEditMode
        ? `/api/voice/persona/${editPersona!.id}`
        : '/api/voice/persona';

      const res = await fetch(url, {
        method: isEditMode ? 'PUT' : 'POST',
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
      onCreated?.(json.data ?? json);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save persona',
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
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
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
        <h2 className="text-lg font-semibold text-gray-900 mb-5">
          {isEditMode ? 'Edit Persona' : 'Create Voice Persona'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {submitError}
            </div>
          )}

          {/* ── Persona Name ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Persona Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Sarah - Healthcare Assistant"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* ── Entity ── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity <span className="text-red-500">*</span>
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">
                {loadingEntities ? 'Loading entities...' : 'Select entity...'}
              </option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          {/* ── VOICE ATTRIBUTES section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Voice Attributes
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Gender — radio buttons */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-3">
                {VOICE_GENDERS.map((g) => (
                  <label
                    key={g}
                    className={`flex-1 text-center cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      voiceGender === g
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceGender"
                      value={g}
                      checked={voiceGender === g}
                      onChange={() => setVoiceGender(g)}
                      className="sr-only"
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>

            {/* Tone — radio buttons */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tone
              </label>
              <div className="flex flex-wrap gap-2">
                {VOICE_TONES.map((t) => (
                  <label
                    key={t}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      voiceTone === t
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceTone"
                      value={t}
                      checked={voiceTone === t}
                      onChange={() => setVoiceTone(t)}
                      className="sr-only"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {/* Industry — select dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry | '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select...</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── PERSONALITY section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Personality
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Personality Description */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Personality Description
              </label>
              <textarea
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                rows={3}
                placeholder="Describe the persona's communication style, key traits, and approach..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Default Greeting */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Greeting
              </label>
              <input
                type="text"
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder="Hi, this is {name} from {company}. How can I help you today?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* ── BEHAVIORAL RULES section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Behavioral Rules
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Default rule checkboxes */}
            <div className="space-y-2 mb-3">
              {DEFAULT_RULES.map((rule, i) => (
                <label
                  key={rule.label}
                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={defaultRuleStates[i]}
                    onChange={() => toggleDefaultRule(i)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  {rule.label}
                </label>
              ))}
            </div>

            {/* Custom rules list */}
            {customRules.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {customRules.map((rule, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700"
                  >
                    <span className="flex-1">{rule}</span>
                    <button
                      type="button"
                      onClick={() => removeCustomRule(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={`Remove rule: ${rule}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add custom rule */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCustomRule}
                onChange={(e) => setNewCustomRule(e.target.value)}
                onKeyDown={handleCustomRuleKeyDown}
                placeholder="Add custom rule..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addCustomRule}
                disabled={!newCustomRule.trim()}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>
          </div>

          {/* ── PREVIEW section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Preview
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button
              type="button"
              disabled
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Play sample voice
              <span className="ml-1 text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                Coming soon
              </span>
            </button>
          </div>

          {/* ── Actions ── */}
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
              disabled={isSubmitting || !isValid}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting
                ? 'Saving...'
                : isEditMode
                  ? 'Update Persona'
                  : 'Create Persona'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
