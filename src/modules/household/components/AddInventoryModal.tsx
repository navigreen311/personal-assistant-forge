'use client';

import { useState } from 'react';
import type { InventoryItem } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NewInventoryItem = Omit<InventoryItem, 'id' | 'userId'>;

interface AddInventoryModalProps {
  properties: { id: string; name: string }[];
  onClose: () => void;
  onSave: (item: NewInventoryItem) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: InventoryItem['category']; label: string }[] = [
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'OUTDOOR', label: 'Outdoor' },
  { value: 'OTHER', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddInventoryModal({ properties, onClose, onSave }: AddInventoryModalProps) {
  const [itemName, setItemName] = useState('');
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [category, setCategory] = useState<InventoryItem['category']>('APPLIANCE');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyEndDate, setWarrantyEndDate] = useState('');
  const [value, setValue] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [notes, setNotes] = useState('');

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const canSave = itemName.trim() && propertyId && purchaseDate;

  function handleSave() {
    if (!canSave) return;

    const item: NewInventoryItem = {
      itemName: itemName.trim(),
      propertyId,
      propertyName: selectedProperty?.name ?? '',
      category,
      purchaseDate: new Date(purchaseDate),
      warrantyEndDate: warrantyEndDate ? new Date(warrantyEndDate) : undefined,
      value: value ? parseFloat(value) : 0,
      serialNumber: serialNumber.trim() || undefined,
      modelNumber: modelNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(item);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add Inventory Item</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Item Name */}
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Samsung Refrigerator"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Property */}
            <div>
              <label className={labelClass}>
                Property <span className="text-red-500">*</span>
              </label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className={inputClass}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InventoryItem['category'])}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Purchase Date */}
            <div>
              <label className={labelClass}>
                Purchase Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Warranty End Date */}
            <div>
              <label className={labelClass}>Warranty End Date</label>
              <input
                type="date"
                value={warrantyEndDate}
                onChange={(e) => setWarrantyEndDate(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Value */}
            <div>
              <label className={labelClass}>Value ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Serial Number */}
            <div>
              <label className={labelClass}>Serial Number</label>
              <input
                type="text"
                placeholder="Optional"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Model Number */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Model Number</label>
              <input
                type="text"
                placeholder="Optional"
                value={modelNumber}
                onChange={(e) => setModelNumber(e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Notes</label>
              <textarea
                rows={3}
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}
