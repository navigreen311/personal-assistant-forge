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

const toneOptions = ['Professional', 'Casual', 'Formal', 'Warm'] as const;
const modelOptions = ['Auto', 'Haiku', 'Sonnet', 'Opus'] as const;

type ExtraFields = {
  industry?: string;
  description?: string;
  website?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  address?: string;
  defaultTone?: string;
  aiBudgetLimit?: number;
  preferredModel?: string;
};

function getExtraFields(brandKit?: BrandKit): ExtraFields {
  const bk = brandKit as (BrandKit & { extraFields?: ExtraFields }) | undefined;
  return bk?.extraFields ?? {};
}

export function EntityForm({
  entity,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EntityFormProps) {
  const existingExtra = getExtraFields(entity?.brandKit);

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

  // New Basic Info fields
  const [industry, setIndustry] = useState(existingExtra.industry ?? '');
  const [description, setDescription] = useState(existingExtra.description ?? '');
  const [website, setWebsite] = useState(existingExtra.website ?? '');

  // New Contact Info fields
  const [primaryEmail, setPrimaryEmail] = useState(existingExtra.primaryEmail ?? '');
  const [primaryPhone, setPrimaryPhone] = useState(existingExtra.primaryPhone ?? '');
  const [address, setAddress] = useState(existingExtra.address ?? '');

  // New AI Configuration fields
  const [defaultTone, setDefaultTone] = useState(existingExtra.defaultTone ?? 'Professional');
  const [aiBudgetLimit, setAiBudgetLimit] = useState<number | ''>(
    existingExtra.aiBudgetLimit ?? '',
  );
  const [preferredModel, setPreferredModel] = useState(existingExtra.preferredModel ?? 'Auto');

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

    const extraFields: ExtraFields = {};
    if (industry) extraFields.industry = industry;
    if (description) extraFields.description = description;
    if (website) extraFields.website = website;
    if (primaryEmail) extraFields.primaryEmail = primaryEmail;
    if (primaryPhone) extraFields.primaryPhone = primaryPhone;
    if (address) extraFields.address = address;
    if (defaultTone) extraFields.defaultTone = defaultTone;
    if (aiBudgetLimit !== '' && aiBudgetLimit !== undefined) extraFields.aiBudgetLimit = Number(aiBudgetLimit);
    if (preferredModel) extraFields.preferredModel = preferredModel;

    const brandKit: BrandKit & { extraFields?: ExtraFields } = {
      primaryColor,
      secondaryColor,
      ...(logoUrl && { logoUrl }),
      ...(fontFamily && { fontFamily }),
      ...(toneGuide && { toneGuide }),
      ...(Object.keys(extraFields).length > 0 && { extraFields }),
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* === Basic Info Section === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Basic Information
        </h2>
        <div className="space-y-4">
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

          {/* Industry */}
          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-gray-700">
              Industry
            </label>
            <input
              id="industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g., Healthcare, Real Estate, Technology"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="Brief description of this entity..."
            />
          </div>

          {/* Website */}
          <div>
            <label htmlFor="website" className="block text-sm font-medium text-gray-700">
              Website
            </label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="https://example.com"
            />
          </div>
        </div>
      </section>

      {/* === Contact Info Section === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Contact Information
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="primaryEmail" className="block text-sm font-medium text-gray-700">
                Primary Email
              </label>
              <input
                id="primaryEmail"
                type="email"
                value={primaryEmail}
                onChange={(e) => setPrimaryEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="contact@example.com"
              />
            </div>
            <div>
              <label htmlFor="primaryPhone" className="block text-sm font-medium text-gray-700">
                Primary Phone
              </label>
              <input
                id="primaryPhone"
                type="tel"
                value={primaryPhone}
                onChange={(e) => setPrimaryPhone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700">
              Address
            </label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="123 Main St, City, State 12345"
            />
          </div>
        </div>
      </section>

      {/* === Compliance Profile === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Compliance Profiles
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </section>

      {/* === Brand Kit === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Brand Kit
        </h2>
        <div className="space-y-4">
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
        </div>
      </section>

      {/* === AI Configuration === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          AI Configuration
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="defaultTone" className="block text-sm font-medium text-gray-700">
                Default Tone
              </label>
              <select
                id="defaultTone"
                value={defaultTone}
                onChange={(e) => setDefaultTone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {toneOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="aiBudgetLimit" className="block text-sm font-medium text-gray-700">
                AI Budget Limit ($/month)
              </label>
              <input
                id="aiBudgetLimit"
                type="number"
                min={0}
                step={1}
                value={aiBudgetLimit}
                onChange={(e) =>
                  setAiBudgetLimit(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="100"
              />
            </div>
            <div>
              <label htmlFor="preferredModel" className="block text-sm font-medium text-gray-700">
                Preferred Model
              </label>
              <select
                id="preferredModel"
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* === Phone Numbers === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Phone Numbers
        </h2>
        <div className="space-y-2">
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
      </section>

      {/* === Voice Persona === */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
          Voice Persona
        </h2>
        <div>
          <label htmlFor="voicePersonaId" className="block text-sm font-medium text-gray-700">
            Voice Persona ID
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
      </section>

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
