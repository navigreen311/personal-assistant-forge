'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkActionsBarProps {
  selectedCount: number;
  selectedIds: string[];
  entities: Array<{ id: string; name: string }>;
  onAction: (action: string, data?: any) => void;
  onClearSelection: () => void;
}

type ActiveDropdown = 'tag' | 'cadence' | 'entity' | null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CADENCE_OPTIONS = [
  { label: 'Every 7 days', value: '7d' },
  { label: 'Every 14 days', value: '14d' },
  { label: 'Every 30 days', value: '30d' },
  { label: 'Every 60 days', value: '60d' },
  { label: 'Every 90 days', value: '90d' },
] as const;

// ---------------------------------------------------------------------------
// Hook: close dropdown on outside click
// ---------------------------------------------------------------------------

function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  isOpen: boolean,
) {
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, onClose, isOpen]);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors cursor-pointer ${
        variant === 'danger'
          ? 'hover:bg-red-700/40 text-red-300'
          : 'hover:bg-gray-700 text-gray-200'
      }`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function TagDropdown({
  onApply,
  onClose,
}: {
  onApply: (tag: string) => void;
  onClose: () => void;
}) {
  const [tagValue, setTagValue] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, true);

  function handleApply() {
    const trimmed = tagValue.trim();
    if (trimmed) {
      onApply(trimmed);
      setTagValue('');
    }
  }

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 bg-white text-gray-900 rounded-lg shadow-xl border p-3 min-w-[200px] z-40"
    >
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Add tag to selected
      </label>
      <input
        type="text"
        value={tagValue}
        onChange={(e) => setTagValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleApply();
        }}
        placeholder="Enter tag name..."
        className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        autoFocus
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={!tagValue.trim()}
        className="mt-2 w-full bg-blue-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        Apply
      </button>
    </div>
  );
}

function CadenceDropdown({
  onSelect,
  onClose,
}: {
  onSelect: (cadence: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, true);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 bg-white text-gray-900 rounded-lg shadow-xl border p-3 min-w-[200px] z-40"
    >
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Set cadence for selected
      </label>
      <div className="flex flex-col gap-1">
        {CADENCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className="text-left px-2.5 py-1.5 text-sm rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EntityDropdown({
  entities,
  onSelect,
  onClose,
}: {
  entities: Array<{ id: string; name: string }>;
  onSelect: (entityId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onClose, true);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 left-0 bg-white text-gray-900 rounded-lg shadow-xl border p-3 min-w-[200px] max-h-60 overflow-y-auto z-40"
    >
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Move to entity
      </label>
      <div className="flex flex-col gap-1">
        {entities.length === 0 && (
          <span className="text-sm text-gray-400 px-2.5 py-1.5">
            No entities available
          </span>
        )}
        {entities.map((entity) => (
          <button
            key={entity.id}
            type="button"
            onClick={() => onSelect(entity.id)}
            className="text-left px-2.5 py-1.5 text-sm rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
          >
            {entity.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeleteConfirmation({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, onCancel, true);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 right-0 bg-white text-gray-900 rounded-lg shadow-xl border p-3 min-w-[200px] z-40"
    >
      <p className="text-sm font-medium text-red-700 mb-3">
        Delete {count} contact{count !== 1 ? 's' : ''}?
      </p>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function BulkActionsBar({
  selectedCount,
  selectedIds,
  entities,
  onAction,
  onClearSelection,
}: BulkActionsBarProps) {
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isVisible = selectedCount > 0;

  // Close everything when selection clears
  useEffect(() => {
    if (!isVisible) {
      setActiveDropdown(null);
      setShowDeleteConfirm(false);
    }
  }, [isVisible]);

  const closeDropdowns = useCallback(() => {
    setActiveDropdown(null);
    setShowDeleteConfirm(false);
  }, []);

  function toggleDropdown(dropdown: ActiveDropdown) {
    setShowDeleteConfirm(false);
    setActiveDropdown((prev) => (prev === dropdown ? null : dropdown));
  }

  // ---- Action handlers ----

  function handleTagApply(tag: string) {
    onAction('tag', { tag, contactIds: selectedIds });
    closeDropdowns();
  }

  function handleCadenceSelect(cadence: string) {
    onAction('cadence', { cadence, contactIds: selectedIds });
    closeDropdowns();
  }

  function handleEntitySelect(entityId: string) {
    onAction('changeEntity', { entityId, contactIds: selectedIds });
    closeDropdowns();
  }

  function handleDeleteConfirm() {
    onAction('delete', { contactIds: selectedIds });
    closeDropdowns();
  }

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-30 transition-all duration-300 ease-out ${
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-20 opacity-0 pointer-events-none'
      }`}
    >
      <div className="bg-gray-900 text-white rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
        {/* Selection count */}
        <span className="font-medium text-sm whitespace-nowrap">
          {selectedCount} selected
        </span>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Tag */}
          <div className="relative">
            <ActionButton
              icon="&#x1F3F7;"
              label="Tag"
              onClick={() => toggleDropdown('tag')}
            />
            {activeDropdown === 'tag' && (
              <TagDropdown
                onApply={handleTagApply}
                onClose={() => setActiveDropdown(null)}
              />
            )}
          </div>

          {/* Set Cadence */}
          <div className="relative">
            <ActionButton
              icon="&#x23F0;"
              label="Set Cadence"
              onClick={() => toggleDropdown('cadence')}
            />
            {activeDropdown === 'cadence' && (
              <CadenceDropdown
                onSelect={handleCadenceSelect}
                onClose={() => setActiveDropdown(null)}
              />
            )}
          </div>

          {/* Change Entity */}
          <div className="relative">
            <ActionButton
              icon="&#x1F4C1;"
              label="Change Entity"
              onClick={() => toggleDropdown('entity')}
            />
            {activeDropdown === 'entity' && (
              <EntityDropdown
                entities={entities}
                onSelect={handleEntitySelect}
                onClose={() => setActiveDropdown(null)}
              />
            )}
          </div>

          {/* Bulk Email */}
          <ActionButton
            icon="&#x1F4E7;"
            label="Bulk Email"
            onClick={() => {
              closeDropdowns();
              onAction('email', { contactIds: selectedIds });
            }}
          />

          {/* Export */}
          <ActionButton
            icon="&#x1F4E4;"
            label="Export"
            onClick={() => {
              closeDropdowns();
              onAction('export', { contactIds: selectedIds });
            }}
          />

          {/* Delete */}
          <div className="relative">
            <ActionButton
              icon="&#x1F5D1;"
              label="Delete"
              variant="danger"
              onClick={() => {
                setActiveDropdown(null);
                setShowDeleteConfirm((prev) => !prev);
              }}
            />
            {showDeleteConfirm && (
              <DeleteConfirmation
                count={selectedCount}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setShowDeleteConfirm(false)}
              />
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Clear selection button */}
        <button
          type="button"
          onClick={() => {
            closeDropdowns();
            onClearSelection();
          }}
          className="text-gray-400 hover:text-white transition-colors p-1 cursor-pointer"
          title="Clear selection"
          aria-label="Clear selection"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
