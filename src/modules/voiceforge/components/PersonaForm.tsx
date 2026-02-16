'use client';

import { useState } from 'react';
import type { VoicePersona, VoiceConfig, PersonalityConfig } from '@/modules/voiceforge/types';

interface PersonaFormProps {
  initial?: Partial<VoicePersona>;
  onSubmit: (data: { name: string; description: string; voiceConfig: VoiceConfig; personality: PersonalityConfig; status: VoicePersona['status'] }) => Promise<void>;
  onCancel: () => void;
}

export function PersonaForm({ initial, onSubmit, onCancel }: PersonaFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState<VoicePersona['status']>(initial?.status ?? 'DRAFT');
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(initial?.voiceConfig ?? {
    provider: 'mock',
    voiceId: '',
    speed: 1.0,
    pitch: 1.0,
    language: 'en-US',
  });
  const [personality, setPersonality] = useState<PersonalityConfig>(initial?.personality ?? {
    defaultTone: 'WARM',
    formality: 5,
    empathy: 5,
    assertiveness: 5,
    humor: 3,
    vocabulary: 'MODERATE',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ name, description, voiceConfig, personality, status });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as VoicePersona['status'])}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md">
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <fieldset className="border border-gray-200 rounded-lg p-3">
        <legend className="text-sm font-medium text-gray-700 px-1">Voice Config</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Provider</label>
            <input type="text" value={voiceConfig.provider}
              onChange={(e) => setVoiceConfig({ ...voiceConfig, provider: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Voice ID</label>
            <input type="text" value={voiceConfig.voiceId}
              onChange={(e) => setVoiceConfig({ ...voiceConfig, voiceId: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Speed ({voiceConfig.speed}x)</label>
            <input type="range" min="0.5" max="2" step="0.1" value={voiceConfig.speed}
              onChange={(e) => setVoiceConfig({ ...voiceConfig, speed: parseFloat(e.target.value) })}
              className="w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Pitch ({voiceConfig.pitch}x)</label>
            <input type="range" min="0.5" max="2" step="0.1" value={voiceConfig.pitch}
              onChange={(e) => setVoiceConfig({ ...voiceConfig, pitch: parseFloat(e.target.value) })}
              className="w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Language</label>
            <input type="text" value={voiceConfig.language}
              onChange={(e) => setVoiceConfig({ ...voiceConfig, language: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md" />
          </div>
        </div>
      </fieldset>

      <fieldset className="border border-gray-200 rounded-lg p-3">
        <legend className="text-sm font-medium text-gray-700 px-1">Personality</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">Default Tone</label>
            <input type="text" value={personality.defaultTone}
              onChange={(e) => setPersonality({ ...personality, defaultTone: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Vocabulary</label>
            <select value={personality.vocabulary}
              onChange={(e) => setPersonality({ ...personality, vocabulary: e.target.value as PersonalityConfig['vocabulary'] })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md">
              <option value="SIMPLE">Simple</option>
              <option value="MODERATE">Moderate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </div>
          {(['formality', 'empathy', 'assertiveness', 'humor'] as const).map((trait) => (
            <div key={trait}>
              <label className="text-xs text-gray-500 capitalize">{trait} ({personality[trait]})</label>
              <input type="range" min="0" max="10" value={personality[trait]}
                onChange={(e) => setPersonality({ ...personality, [trait]: parseInt(e.target.value) })}
                className="w-full" />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {submitting ? 'Saving...' : initial ? 'Update Persona' : 'Create Persona'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
