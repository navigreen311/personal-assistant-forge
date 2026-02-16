'use client';

import { useState } from 'react';
import type { DeadManSwitch } from '../types';

export default function DeadManSwitchConfig({
  config,
  onSave,
}: {
  config: DeadManSwitch;
  onSave: (config: DeadManSwitch) => void;
}) {
  const [form, setForm] = useState<DeadManSwitch>(config);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold">Dead Man&apos;s Switch</h3>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">Enabled</label>
        <input
          type="checkbox"
          checked={form.isEnabled}
          onChange={e => setForm({ ...form, isEnabled: e.target.checked })}
          className="rounded"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Interval (hours)</label>
          <input
            type="number"
            value={form.checkInIntervalHours}
            onChange={e => setForm({ ...form, checkInIntervalHours: Number(e.target.value) })}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Trigger After Misses</label>
          <input
            type="number"
            value={form.triggerAfterMisses}
            onChange={e => setForm({ ...form, triggerAfterMisses: Number(e.target.value) })}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Protocols ({form.protocols.length})</h4>
        {form.protocols.map((protocol, idx) => (
          <div key={idx} className="border rounded-lg p-3 mb-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Step {protocol.order}: {protocol.contactName}</span>
              <span className="text-xs text-gray-500">+{protocol.delayHoursAfterTrigger}h delay</span>
            </div>
            <div className="text-xs text-gray-600 mt-1">{protocol.action}</div>
            <div className="text-xs text-gray-400 mt-1">{protocol.message}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <div>Last Check-in: {new Date(form.lastCheckIn).toLocaleString()}</div>
        <div>Missed: {form.missedCheckIns}</div>
      </div>

      <button type="submit" className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700">
        Save Configuration
      </button>
    </form>
  );
}
