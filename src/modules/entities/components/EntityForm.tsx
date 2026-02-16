'use client';

import { useState } from 'react';
import type { Entity, BrandKit, ComplianceProfile } from '@/shared/types';
import { createEntitySchema } from '../entity.validation';

interface EntityFormProps {
  entity?: Entity;
  onSubmit: (data: EntityFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export interface EntityFormData {
  name: string;
  type: string;
  complianceProfile: ComplianceProfile[];
  brandKit?: BrandKit;
  voicePersonaId?: string;
  phoneNumbers: string[];
}

const entityTypes = ['Personal', 'LLC', 'Corporation', 'Trust', 'Partnership'];
const complianceOptions: ComplianceProfile[] = [
  'GENERAL',
  'HIPAA',
  'GDPR',
  'CCPA',
  'SOX',
  'SEC',
  'REAL_ESTATE',
];

export function EntityForm({
  entity,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EntityFormProps) {
  const [name, setName] = useState(entity?.name ?? '');
  const [type, setType] = useState(entity?.type ?? 'Personal');
  const [complianceProfile, setComplianceProfile] = useState<ComplianceProfile[]>(
    entity?.complianceProfile ?? ['GENERAL'],
  );
  const [primaryColor, setPrimaryColor] = useState(
    entity?.brandKit?.primaryColor ?? '#6366f1',
  );
  const [secondaryColor, setSecondaryColor] = useState(
    entity?.brandKit?.secondaryColor ?? '#818cf8',
  );
  const [logoUrl, setLogoUrl] = useState(entity?.brandKit?.logoUrl ?? '');
  const [fontFamily, setFontFamily] = useState(entity?.brandKit?.fontFamily ?? '');
  const [toneGuide, setToneGuide] = useState(entity?.brandKit?.toneGuide ?? '');
  const [voicePersonaId, setVoicePersonaId] = useState(
    entity?.voicePersonaId ?? '',
  );
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>(
    entity?.phoneNumbers ?? [''],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggleCompliance(profile: ComplianceProfile) {
    setComplianceProfile((prev) =>
      prev.includes(profile)
        ? prev.filter((p) => p !== profile)
        : [...prev, profile],
    );
  }

  function addPhoneNumber() {
    setPhoneNumbers((prev) => [...prev, '']);
  }

  function removePhoneNumber(index: number) {
    setPhoneNumbers((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePhoneNumber(index: number, value: string) {
    setPhoneNumbers((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const brandKit: BrandKit = {
      primaryColor,
      secondaryColor,
      ...(logoUrl && { logoUrl }),
      ...(fontFamily && { fontFamily }),
      ...(toneGuide && { toneGuide }),
    };

    const data = {
      name,
      type,
      complianceProfile,
      brandKit,
      ...(voicePersonaId && { voicePersonaId }),
      phoneNumbers: phoneNumbers.filter((p) => p.trim() !== ''),
    };

    const result = createEntitySchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Entity Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          placeholder="My Business LLC"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name}</p>
        )}
      </div>

      {/* Type */}
      <div>
        <label htmlFor="type" className="block text-sm font-medium text-gray-700">
          Entity Type
        </label>
        <select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Compliance Profile */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          Compliance Profiles
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {complianceOptions.map((profile) => (
            <label
              key={profile}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                complianceProfile.includes(profile)
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={complianceProfile.includes(profile)}
                onChange={() => toggleCompliance(profile)}
                className="sr-only"
              />
              {profile}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Brand Kit */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-gray-700">Brand Kit</legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="primaryColor" className="block text-xs text-gray-500">
              Primary Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="primaryColor"
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-8 w-8 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="#6366f1"
              />
            </div>
            {errors['brandKit.primaryColor'] && (
              <p className="mt-1 text-sm text-red-600">
                {errors['brandKit.primaryColor']}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="secondaryColor" className="block text-xs text-gray-500">
              Secondary Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="secondaryColor"
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-8 w-8 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="#818cf8"
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="logoUrl" className="block text-xs text-gray-500">
            Logo URL
          </label>
          <input
            id="logoUrl"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="https://example.com/logo.png"
          />
        </div>

        <div>
          <label htmlFor="fontFamily" className="block text-xs text-gray-500">
            Font Family
          </label>
          <input
            id="fontFamily"
            type="text"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Inter, sans-serif"
          />
        </div>

        <div>
          <label htmlFor="toneGuide" className="block text-xs text-gray-500">
            Tone Guide
          </label>
          <textarea
            id="toneGuide"
            value={toneGuide}
            onChange={(e) => setToneGuide(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Professional, warm, and approachable..."
          />
        </div>
      </fieldset>

      {/* Phone Numbers */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Phone Numbers
        </label>
        <div className="mt-2 space-y-2">
          {phoneNumbers.map((phone, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => updatePhoneNumber(index, e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="+1 (555) 123-4567"
              />
              {phoneNumbers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePhoneNumber(index)}
                  className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-400 hover:text-red-500 hover:border-red-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addPhoneNumber}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add phone number
          </button>
        </div>
      </div>

      {/* Voice Persona */}
      <div>
        <label htmlFor="voicePersonaId" className="block text-sm font-medium text-gray-700">
          Voice Persona
        </label>
        <input
          id="voicePersonaId"
          type="text"
          value={voicePersonaId}
          onChange={(e) => setVoicePersonaId(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="Persona ID (future integration)"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : entity ? 'Update Entity' : 'Create Entity'}
        </button>
      </div>
    </form>
  );
}
