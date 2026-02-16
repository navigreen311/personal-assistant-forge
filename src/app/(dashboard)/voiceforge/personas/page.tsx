'use client';

import { useState, useEffect } from 'react';
import type { VoicePersona } from '@/modules/voiceforge/types';
import { PersonaCard } from '@/modules/voiceforge/components/PersonaCard';
import { PersonaForm } from '@/modules/voiceforge/components/PersonaForm';
import { ConsentChainTimeline } from '@/modules/voiceforge/components/ConsentChainTimeline';

export default function PersonasPage() {
  const [personas, setPersonas] = useState<VoicePersona[]>([]);
  const [selected, setSelected] = useState<VoicePersona | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const entityId = 'default';
    fetch(`/api/voice/persona?entityId=${entityId}`)
      .then((r) => r.json())
      .then((data) => {
        setPersonas(data.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/voice/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, entityId: 'default' }),
      });
      const result = await res.json();
      if (result.success) {
        setPersonas((prev) => [result.data, ...prev]);
        setShowForm(false);
      }
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading personas...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Persona Management</h1>
        <button
          onClick={() => { setShowForm(true); setSelected(null); }}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Create Persona
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <PersonaForm
            onSubmit={async (data) => {
              await handleCreate(data as never);
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Persona Cards */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                onClick={() => { setSelected(p); setShowForm(false); }}
              />
            ))}
          </div>
          {personas.length === 0 && !showForm && (
            <p className="text-sm text-gray-500">No personas created yet</p>
          )}
        </div>

        {/* Detail Panel */}
        <div>
          {selected ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{selected.name}</h3>
                <p className="text-sm text-gray-500">{selected.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">Provider:</span> {selected.voiceConfig.provider}
                </div>
                <div>
                  <span className="text-gray-400">Voice ID:</span> {selected.voiceConfig.voiceId}
                </div>
                <div>
                  <span className="text-gray-400">Speed:</span> {selected.voiceConfig.speed}x
                </div>
                <div>
                  <span className="text-gray-400">Pitch:</span> {selected.voiceConfig.pitch}x
                </div>
                <div>
                  <span className="text-gray-400">Tone:</span> {selected.personality.defaultTone}
                </div>
                <div>
                  <span className="text-gray-400">Vocabulary:</span> {selected.personality.vocabulary}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Consent Chain</h4>
                <ConsentChainTimeline entries={selected.consentChain} />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
              Select a persona to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
