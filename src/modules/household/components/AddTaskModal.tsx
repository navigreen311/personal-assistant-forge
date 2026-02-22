'use client';

import { useState } from 'react';
import type { MaintenanceTask } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────
interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: Partial<MaintenanceTask>) => void;
  providers?: { id: string; name: string }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────
const CATEGORIES: MaintenanceTask['category'][] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'LAWN',
  'APPLIANCE',
  'ROOF',
  'PEST',
  'GENERAL',
];

const CATEGORY_LABELS: Record<MaintenanceTask['category'], string> = {
  HVAC: 'HVAC',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  LAWN: 'Lawn Care',
  APPLIANCE: 'Appliance',
  ROOF: 'Roofing',
  PEST: 'Pest Control',
  GENERAL: 'General',
};

const FREQUENCIES: { value: MaintenanceTask['frequency']; label: string }[] = [
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'BIANNUAL', label: 'Biannual' },
  { value: 'ANNUAL', label: 'Annual' },
];

const SEASONS: { value: NonNullable<MaintenanceTask['season']>; label: string }[] = [
  { value: 'ANY', label: 'Any Season' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
  { value: 'WINTER', label: 'Winter' },
];

interface FormState {
  title: string;
  category: MaintenanceTask['category'] | '';
  frequency: MaintenanceTask['frequency'] | '';
  season: MaintenanceTask['season'] | '';
  nextDueDate: string;
  assignedProviderId: string;
  estimatedCostUsd: string;
  description: string;
  notes: string;
  autoBook: boolean;
  remindBefore: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  category: '',
  frequency: '',
  season: '',
  nextDueDate: '',
  assignedProviderId: '',
  estimatedCostUsd: '',
  description: '',
  notes: '',
  autoBook: false,
  remindBefore: true,
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
  providers = [],
}: AddTaskModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  if (!isOpen) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.category || !form.frequency || !form.nextDueDate) return;

    const task: Partial<MaintenanceTask> = {
      title: form.title,
      category: form.category as MaintenanceTask['category'],
      frequency: form.frequency as MaintenanceTask['frequency'],
      season: (form.season as MaintenanceTask['season']) || undefined,
      nextDueDate: new Date(form.nextDueDate),
      assignedProviderId: form.assignedProviderId || undefined,
      estimatedCostUsd: form.estimatedCostUsd ? parseFloat(form.estimatedCostUsd) : undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
      status: 'UPCOMING',
    };

    onSubmit(task);
    setForm(EMPTY_FORM);
    onClose();
  }

  function handleCancel() {
    setForm(EMPTY_FORM);
    onClose();
  }

  const isValid = form.title && form.category && form.frequency && form.nextDueDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add Maintenance Task
          </h2>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Row 1: Task Name + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Task Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Replace HVAC filter"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value as MaintenanceTask['category'])}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Frequency + Season */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Frequency <span className="text-red-500">*</span>
              </label>
              <select
                value={form.frequency}
                onChange={(e) => update('frequency', e.target.value as MaintenanceTask['frequency'])}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                required
              >
                <option value="">Select frequency</option>
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Season
              </label>
              <select
                value={form.season}
                onChange={(e) => update('season', e.target.value as MaintenanceTask['season'])}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">No preference</option>
                {SEASONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Due Date + Provider */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.nextDueDate}
                onChange={(e) => update('nextDueDate', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provider
              </label>
              <select
                value={form.assignedProviderId}
                onChange={(e) => update('assignedProviderId', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">DIY (no provider)</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Estimated Cost + Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Estimated Cost ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.estimatedCostUsd}
                onChange={(e) => update('estimatedCostUsd', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                placeholder="Brief description..."
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              placeholder="Additional notes..."
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.autoBook}
                onChange={(e) => update('autoBook', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Auto-book via VoiceForge when due
              </span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.remindBefore}
                onChange={(e) => update('remindBefore', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Remind me 7 days before
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
