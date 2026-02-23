'use client';

import { useState } from 'react';

export interface TrustedDevice {
  id: string;
  phoneNumber: string;
  label: string;
  isPrimary: boolean;
  dateAdded: string;
  lastUsed?: string;
}

export interface TrustedDevicesListProps {
  devices: TrustedDevice[];
  onAdd: (device: Omit<TrustedDevice, 'id' | 'dateAdded'>) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, updates: Partial<TrustedDevice>) => void;
}

const LABEL_OPTIONS = ['Mobile', 'Office', 'Home', 'Other'];

export default function TrustedDevicesList({ devices, onAdd, onRemove, onEdit }: TrustedDevicesListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('Mobile');
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editIsPrimary, setEditIsPrimary] = useState(false);

  const handleAdd = () => {
    const trimmed = newPhone.trim();
    if (!trimmed) return;
    onAdd({
      phoneNumber: trimmed,
      label: newLabel,
      isPrimary: newIsPrimary,
    });
    setNewPhone('');
    setNewLabel('Mobile');
    setNewIsPrimary(false);
    setShowAddForm(false);
  };

  const handleStartEdit = (device: TrustedDevice) => {
    setEditingId(device.id);
    setEditPhone(device.phoneNumber);
    setEditLabel(device.label);
    setEditIsPrimary(device.isPrimary);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editPhone.trim();
    if (!trimmed) return;
    onEdit(id, {
      phoneNumber: trimmed,
      label: editLabel,
      isPrimary: editIsPrimary,
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Trusted Devices
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Shadow will only place outbound calls to verified numbers.
      </p>

      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device.id}
            className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4"
          >
            {editingId === device.id ? (
              /* Edit Mode */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="+1 (555) 123-4567"
                  />
                  <select
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    {LABEL_OPTIONS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsPrimary}
                      onChange={(e) => setEditIsPrimary(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded focus:ring-blue-500"
                    />
                    Set as primary
                  </label>
                  <div className="flex-1" />
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveEdit(device.id)}
                    disabled={!editPhone.trim()}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              /* Display Mode */
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                      {device.phoneNumber}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full">
                      {device.label}
                    </span>
                    {device.isPrimary && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>Added: {device.dateAdded}</span>
                    {device.lastUsed && <span>Last used: {device.lastUsed}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => handleStartEdit(device)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    aria-label={`Edit ${device.phoneNumber}`}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onRemove(device.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    aria-label={`Remove ${device.phoneNumber}`}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add Number Form */}
        {showAddForm ? (
          <div className="bg-gray-50 dark:bg-gray-700/50 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="+1 (555) 123-4567"
                autoFocus
              />
              <select
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {LABEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsPrimary}
                  onChange={(e) => setNewIsPrimary(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded focus:ring-blue-500"
                />
                Set as primary
              </label>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewPhone('');
                  setNewLabel('Mobile');
                  setNewIsPrimary(false);
                }}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newPhone.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Number
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-dashed border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add number
          </button>
        )}
      </div>
    </div>
  );
}
