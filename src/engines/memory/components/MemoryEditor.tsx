'use client';

import { useState, useCallback } from 'react';
import type { MemoryEntry, MemoryType } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface MemoryEditorProps {
  entry: MemoryEntry;
  onSave: (updated: MemoryEntry) => void;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MEMORY_TYPES: { value: MemoryType; label: string }[] = [
  { value: 'SHORT_TERM', label: 'Short-term' },
  { value: 'WORKING', label: 'Working' },
  { value: 'LONG_TERM', label: 'Long-term' },
  { value: 'EPISODIC', label: 'Episodic' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MemoryEditor({ entry, onSave, onDelete }: MemoryEditorProps) {
  const [content, setContent] = useState(entry.content);
  const [context, setContext] = useState(entry.context);
  const [type, setType] = useState<MemoryType>(entry.type);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!content.trim()) {
      setError('Content is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/memory/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, context, type }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Save failed (${res.status})`);
      }

      const { data } = (await res.json()) as { data: MemoryEntry };
      onSave(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }, [content, context, type, entry.id, onSave]);

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/memory/${entry.id}`, { method: 'DELETE' });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Delete failed (${res.status})`);
      }

      onDelete(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [confirmDelete, entry.id, onDelete]);

  const isDirty = content !== entry.content || context !== entry.context || type !== entry.type;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Edit Memory
        </h2>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Content */}
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          placeholder="Memory content..."
        />

        {/* Context */}
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Context
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          placeholder="Additional context..."
        />

        {/* Type dropdown */}
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MemoryType)}
          className="mb-6 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {MEMORY_TYPES.map((mt) => (
            <option key={mt.value} value={mt.value}>
              {mt.label}
            </option>
          ))}
        </select>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete?' : 'Delete'}
          </button>

          <div className="flex gap-2">
            {confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
