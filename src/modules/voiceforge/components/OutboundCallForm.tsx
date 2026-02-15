'use client';

import { useState } from 'react';

interface OutboundCallFormData {
  entityId: string;
  contactId: string;
  personaId: string;
  scriptId?: string;
  purpose: string;
  maxDuration?: number;
  recordCall?: boolean;
}

interface OutboundCallFormProps {
  onSubmit: (data: OutboundCallFormData) => Promise<void>;
  onCancel: () => void;
}

export function OutboundCallForm({ onSubmit, onCancel }: OutboundCallFormProps) {
  const [form, setForm] = useState<OutboundCallFormData>({
    entityId: '',
    contactId: '',
    personaId: '',
    purpose: '',
    maxDuration: 300,
    recordCall: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Initiate Outbound Call</h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Entity ID</label>
          <input type="text" value={form.entityId} required
            onChange={(e) => setForm({ ...form, entityId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Contact ID</label>
          <input type="text" value={form.contactId} required
            onChange={(e) => setForm({ ...form, contactId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Persona ID</label>
          <input type="text" value={form.personaId} required
            onChange={(e) => setForm({ ...form, personaId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Script ID (optional)</label>
          <input type="text" value={form.scriptId ?? ''}
            onChange={(e) => setForm({ ...form, scriptId: e.target.value || undefined })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
        <input type="text" value={form.purpose} required
          onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Max Duration (seconds)</label>
          <input type="number" value={form.maxDuration ?? 300}
            onChange={(e) => setForm({ ...form, maxDuration: parseInt(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md" />
        </div>
        <label className="flex items-center gap-2 text-sm pt-5">
          <input type="checkbox" checked={form.recordCall ?? true}
            onChange={(e) => setForm({ ...form, recordCall: e.target.checked })}
            className="rounded" />
          Record call
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={submitting}
          className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {submitting ? 'Initiating...' : 'Initiate Call'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </form>
  );
}
