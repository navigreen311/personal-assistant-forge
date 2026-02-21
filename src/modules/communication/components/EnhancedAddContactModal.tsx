'use client';

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnhancedAddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (contact: any) => void;
  entities: Array<{ id: string; name: string }>;
}

type RelationshipTier = 'VIP' | 'Client' | 'Vendor' | 'Team' | 'Partner' | 'Personal';
type PreferredChannel = 'EMAIL' | 'VOICE' | 'SMS' | 'SLACK' | 'TEAMS';
type PreferredTone = 'DIRECT' | 'WARM' | 'FORMAL' | 'CASUAL' | 'DIPLOMATIC';
type BestTimeToReach = 'Morning' | 'Afternoon' | 'Evening' | 'Anytime';
type FollowUpCadence = '' | '7' | '14' | '30' | '60' | '90';

interface FormData {
  // Basic info
  name: string;
  company: string;
  title: string;
  entityId: string;
  relationshipTier: RelationshipTier;

  // Contact info
  emails: string[];
  phones: string[];
  linkedin: string;
  timezone: string;

  // Communication prefs
  preferredChannel: PreferredChannel;
  preferredTone: PreferredTone;
  bestTimeToReach: BestTimeToReach;

  // Relationship
  followUpCadence: FollowUpCadence;
  source: string;
  notes: string;
  tags: string[];
}

interface FormErrors {
  name?: string;
  entityId?: string;
  general?: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  company: '',
  title: '',
  entityId: '',
  relationshipTier: 'Personal',

  emails: [''],
  phones: [''],
  linkedin: '',
  timezone: '',

  preferredChannel: 'EMAIL',
  preferredTone: 'DIRECT',
  bestTimeToReach: 'Anytime',

  followUpCadence: '',
  source: '',
  notes: '',
  tags: [],
};

const TIMEZONES = [
  { value: '', label: 'Select timezone...' },
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (Europe/London)' },
  { value: 'Europe/Paris', label: 'Paris (Europe/Paris)' },
  { value: 'Europe/Berlin', label: 'Berlin (Europe/Berlin)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (Asia/Tokyo)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (Asia/Shanghai)' },
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Australia/Sydney', label: 'Sydney (Australia/Sydney)' },
];

const CADENCE_OPTIONS: Array<{ value: FollowUpCadence; label: string }> = [
  { value: '', label: 'None' },
  { value: '7', label: 'Every 7 days' },
  { value: '14', label: 'Every 14 days' },
  { value: '30', label: 'Every 30 days' },
  { value: '60', label: 'Every 60 days' },
  { value: '90', label: 'Every 90 days' },
];

const CADENCE_FREQUENCY_MAP: Record<string, string> = {
  '7': 'WEEKLY',
  '14': 'BIWEEKLY',
  '30': 'MONTHLY',
  '60': 'BIMONTHLY',
  '90': 'QUARTERLY',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedAddContactModal({
  isOpen,
  onClose,
  onCreated,
  entities,
}: EnhancedAddContactModalProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // ---- helpers ----

  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear inline error when user starts typing
      if (field === 'name' || field === 'entityId') {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [],
  );

  const addEmail = () => {
    setForm((prev) => ({ ...prev, emails: [...prev.emails, ''] }));
  };

  const updateEmail = (index: number, value: string) => {
    setForm((prev) => {
      const emails = [...prev.emails];
      emails[index] = value;
      return { ...prev, emails };
    });
  };

  const removeEmail = (index: number) => {
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.filter((_, i) => i !== index),
    }));
  };

  const addPhone = () => {
    setForm((prev) => ({ ...prev, phones: [...prev.phones, ''] }));
  };

  const updatePhone = (index: number, value: string) => {
    setForm((prev) => {
      const phones = [...prev.phones];
      phones[index] = value;
      return { ...prev, phones };
    });
  };

  const removePhone = (index: number) => {
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.filter((_, i) => i !== index),
    }));
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !form.tags.includes(trimmed)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  // ---- validation ----

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.name.trim()) {
      newErrors.name = 'Name is required.';
    }
    if (!form.entityId) {
      newErrors.entityId = 'Entity is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ---- submit ----

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setErrors({});

    try {
      // Build channels array from multi-value fields
      const channels: Array<{ type: string; handle: string }> = [];

      form.emails.forEach((email) => {
        const trimmed = email.trim();
        if (trimmed) {
          channels.push({ type: 'EMAIL', handle: trimmed });
        }
      });

      form.phones.forEach((phone) => {
        const trimmed = phone.trim();
        if (trimmed) {
          channels.push({ type: 'VOICE', handle: trimmed });
        }
      });

      if (form.linkedin.trim()) {
        channels.push({ type: 'MANUAL', handle: form.linkedin.trim() });
      }

      // Build preferences object
      const preferences: Record<string, unknown> = {
        preferredChannel: form.preferredChannel,
        preferredTone: form.preferredTone,
        timezone: form.timezone || undefined,
        doNotContact: false,
      };

      // Extra enhanced fields stored in preferences JSON
      if (form.company.trim()) {
        preferences.company = form.company.trim();
      }
      if (form.title.trim()) {
        preferences.titleRole = form.title.trim();
      }
      if (form.relationshipTier) {
        preferences.relationshipTier = form.relationshipTier;
      }
      if (form.bestTimeToReach !== 'Anytime') {
        preferences.bestTimeToReach = form.bestTimeToReach;
      }
      if (form.followUpCadence) {
        preferences.cadenceFrequency =
          CADENCE_FREQUENCY_MAP[form.followUpCadence] ?? undefined;
        preferences.cadenceDays = parseInt(form.followUpCadence, 10);
      }
      if (form.source.trim()) {
        preferences.source = form.source.trim();
      }
      if (form.notes.trim()) {
        preferences.notes = form.notes.trim();
      }
      if (form.linkedin.trim()) {
        preferences.linkedin = form.linkedin.trim();
      }

      // Primary email/phone for the top-level fields
      const primaryEmail = form.emails.find((e) => e.trim())?.trim() || undefined;
      const primaryPhone = form.phones.find((p) => p.trim())?.trim() || undefined;

      const payload = {
        name: form.name.trim(),
        entityId: form.entityId,
        email: primaryEmail,
        phone: primaryPhone,
        channels,
        preferences,
        tags: form.tags,
      };

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error?.message ?? `Request failed with status ${res.status}`,
        );
      }

      const json = await res.json();
      const createdContact = json.data ?? json;

      // Reset form
      setForm(INITIAL_FORM);
      setTagInput('');
      onCreated?.(createdContact);
      onClose();
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Failed to create contact',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----

  if (!isOpen) return null;

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none';
  const selectClass =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const sectionHeaderClass =
    'text-sm font-semibold text-gray-500 uppercase tracking-wider mt-6 mb-3 border-b pb-2';
  const errorInputClass =
    'w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Contact</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* General error */}
        {errors.general && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg mb-4">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* ===== BASIC INFO ===== */}
          <h3 className={sectionHeaderClass}>Basic Info</h3>

          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className={labelClass}>
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={errors.name ? errorInputClass : inputClass}
                placeholder="John Smith"
              />
              {errors.name && (
                <p className="text-xs text-red-600 mt-1">{errors.name}</p>
              )}
            </div>

            {/* Company / Title row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Company / Org</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => updateField('company', e.target.value)}
                  className={inputClass}
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className={labelClass}>Title / Role</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className={inputClass}
                  placeholder="VP of Sales"
                />
              </div>
            </div>

            {/* Entity dropdown */}
            <div>
              <label className={labelClass}>
                Entity <span className="text-red-500">*</span>
              </label>
              <select
                value={form.entityId}
                onChange={(e) => updateField('entityId', e.target.value)}
                className={
                  errors.entityId
                    ? 'w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white'
                    : selectClass
                }
              >
                <option value="">Select entity...</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
              {errors.entityId && (
                <p className="text-xs text-red-600 mt-1">{errors.entityId}</p>
              )}
            </div>

            {/* Relationship Tier */}
            <div>
              <label className={labelClass}>Relationship Tier</label>
              <select
                value={form.relationshipTier}
                onChange={(e) =>
                  updateField('relationshipTier', e.target.value as RelationshipTier)
                }
                className={selectClass}
              >
                <option value="VIP">VIP</option>
                <option value="Client">Client</option>
                <option value="Vendor">Vendor</option>
                <option value="Team">Team</option>
                <option value="Partner">Partner</option>
                <option value="Personal">Personal</option>
              </select>
            </div>
          </div>

          {/* ===== CONTACT INFO ===== */}
          <h3 className={sectionHeaderClass}>Contact Info</h3>

          <div className="space-y-3">
            {/* Emails */}
            <div>
              <label className={labelClass}>Email</label>
              {form.emails.map((email, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(idx, e.target.value)}
                    className={inputClass}
                    placeholder="john@example.com"
                  />
                  {form.emails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEmail(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 shrink-0"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addEmail}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add another email
              </button>
            </div>

            {/* Phones */}
            <div>
              <label className={labelClass}>Phone</label>
              {form.phones.map((phone, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => updatePhone(idx, e.target.value)}
                    className={inputClass}
                    placeholder="+1 555-0100"
                  />
                  {form.phones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhone(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 shrink-0"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addPhone}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add another phone
              </button>
            </div>

            {/* LinkedIn */}
            <div>
              <label className={labelClass}>LinkedIn</label>
              <input
                type="url"
                value={form.linkedin}
                onChange={(e) => updateField('linkedin', e.target.value)}
                className={inputClass}
                placeholder="https://linkedin.com/in/johnsmith"
              />
            </div>

            {/* Timezone */}
            <div>
              <label className={labelClass}>Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => updateField('timezone', e.target.value)}
                className={selectClass}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ===== COMMUNICATION PREFS ===== */}
          <h3 className={sectionHeaderClass}>Communication Preferences</h3>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Preferred Channel */}
              <div>
                <label className={labelClass}>Channel</label>
                <select
                  value={form.preferredChannel}
                  onChange={(e) =>
                    updateField('preferredChannel', e.target.value as PreferredChannel)
                  }
                  className={selectClass}
                >
                  <option value="EMAIL">Email</option>
                  <option value="VOICE">Phone</option>
                  <option value="SMS">SMS</option>
                  <option value="SLACK">Slack</option>
                  <option value="TEAMS">Teams</option>
                </select>
              </div>

              {/* Preferred Tone */}
              <div>
                <label className={labelClass}>Tone</label>
                <select
                  value={form.preferredTone}
                  onChange={(e) =>
                    updateField('preferredTone', e.target.value as PreferredTone)
                  }
                  className={selectClass}
                >
                  <option value="DIRECT">Direct</option>
                  <option value="WARM">Warm</option>
                  <option value="FORMAL">Formal</option>
                  <option value="CASUAL">Casual</option>
                  <option value="DIPLOMATIC">Diplomatic</option>
                </select>
              </div>

              {/* Best Time to Reach */}
              <div>
                <label className={labelClass}>Best Time</label>
                <select
                  value={form.bestTimeToReach}
                  onChange={(e) =>
                    updateField('bestTimeToReach', e.target.value as BestTimeToReach)
                  }
                  className={selectClass}
                >
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                  <option value="Anytime">Anytime</option>
                </select>
              </div>
            </div>
          </div>

          {/* ===== RELATIONSHIP ===== */}
          <h3 className={sectionHeaderClass}>Relationship</h3>

          <div className="space-y-3">
            {/* Follow-up Cadence */}
            <div>
              <label className={labelClass}>Follow-up Cadence</label>
              <select
                value={form.followUpCadence}
                onChange={(e) =>
                  updateField('followUpCadence', e.target.value as FollowUpCadence)
                }
                className={selectClass}
              >
                {CADENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Source */}
            <div>
              <label className={labelClass}>How did you meet? / Source</label>
              <input
                type="text"
                value={form.source}
                onChange={(e) => updateField('source', e.target.value)}
                className={inputClass}
                placeholder="Conference, referral, cold outreach..."
              />
            </div>

            {/* Notes */}
            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                className={inputClass}
                rows={3}
                placeholder="Any additional context about this contact..."
              />
            </div>

            {/* Tags */}
            <div>
              <label className={labelClass}>Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-blue-400 hover:text-blue-700"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className={inputClass}
                placeholder="Type a tag and press Enter..."
              />
            </div>
          </div>

          {/* ===== ACTIONS ===== */}
          <div className="flex justify-end gap-2 pt-6 mt-6 border-t border-gray-200">
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
