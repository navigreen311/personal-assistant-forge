'use client';

import { useState } from 'react';
import type { InboundConfig } from '@/modules/voiceforge/types';

interface InboundConfigFormProps {
  initial?: Partial<InboundConfig>;
  onSubmit: (config: InboundConfig) => Promise<void>;
  onCancel: () => void;
}

export function InboundConfigForm({ initial, onSubmit, onCancel }: InboundConfigFormProps) {
  const [config, setConfig] = useState<InboundConfig>({
    entityId: initial?.entityId ?? '',
    phoneNumber: initial?.phoneNumber ?? '',
    greeting: initial?.greeting ?? 'Hello, how can I help you today?',
    personaId: initial?.personaId ?? '',
    routingRules: initial?.routingRules ?? [],
    afterHoursConfig: initial?.afterHoursConfig ?? {
      enabled: false,
      message: 'We are currently closed.',
      businessHours: [],
      voicemailEnabled: true,
    },
    spamFilterEnabled: initial?.spamFilterEnabled ?? true,
    vipContactIds: initial?.vipContactIds ?? [],
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(config);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Inbound Configuration</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity ID</label>
          <input type="text" value={config.entityId} required
            onChange={(e) => setConfig({ ...config, entityId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
          <input type="text" value={config.phoneNumber} required
            onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Persona ID</label>
          <input type="text" value={config.personaId} required
            onChange={(e) => setConfig({ ...config, personaId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Greeting</label>
        <textarea value={config.greeting}
          onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
          rows={2} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.spamFilterEnabled}
            onChange={(e) => setConfig({ ...config, spamFilterEnabled: e.target.checked })}
            className="rounded" />
          Spam filter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={config.afterHoursConfig.enabled}
            onChange={(e) => setConfig({
              ...config,
              afterHoursConfig: { ...config.afterHoursConfig, enabled: e.target.checked },
            })}
            className="rounded" />
          After-hours handling
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {submitting ? 'Saving...' : 'Save Config'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
