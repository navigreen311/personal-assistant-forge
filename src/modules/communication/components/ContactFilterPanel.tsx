'use client';

import { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactFilterPanelProps {
  isOpen: boolean;
  filters: {
    tier?: string;
    cadenceStatus?: string;
    scoreMin?: number;
    scoreMax?: number;
    tags?: string[];
    lastTouch?: string;
    hasCommitments?: string;
  };
  availableTags: string[];
  onFilterChange: (key: string, value: any) => void;
  onClear: () => void;
  onApply: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_OPTIONS = ['All', 'VIP', 'Client', 'Vendor', 'Team', 'Partner', 'Personal'] as const;
const CADENCE_OPTIONS = ['All', 'Overdue', 'Due Soon', 'On Track', 'No Cadence'] as const;
const LAST_TOUCH_OPTIONS = [
  { label: 'Any', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Over 30 Days', value: 'over_30' },
  { label: 'Over 90 Days', value: 'over_90' },
] as const;
const COMMITMENT_OPTIONS = ['All', 'With Open', 'No Open'] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PillButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm border cursor-pointer transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700 border-blue-300'
          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function TagDropdown({
  availableTags,
  selectedTags,
  onToggleTag,
}: {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="w-full px-3 py-2 text-sm text-left border border-gray-300 rounded-lg bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {selectedTags.length > 0
          ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''} selected`
          : 'Select tags...'}
        <span className="float-right text-gray-400">&#9662;</span>
      </button>

      {isDropdownOpen && availableTags.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {availableTags.map((tag) => (
            <label
              key={tag}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedTags.includes(tag)}
                onChange={() => onToggleTag(tag)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {tag}
            </label>
          ))}
        </div>
      )}

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
            >
              {tag}
              <button
                type="button"
                onClick={() => onToggleTag(tag)}
                className="hover:text-blue-900 focus:outline-none"
                aria-label={`Remove ${tag}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContactFilterPanel({
  isOpen,
  filters,
  availableTags,
  onFilterChange,
  onClear,
  onApply,
}: ContactFilterPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setMaxHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen, filters, availableTags]);

  const activeTier = filters.tier || 'All';
  const activeCadence = filters.cadenceStatus || 'All';
  const activeCommitments = filters.hasCommitments || 'All';
  const selectedTags = filters.tags ?? [];

  function handleToggleTag(tag: string) {
    const current = filters.tags ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    onFilterChange('tags', next);
  }

  return (
    <div
      ref={contentRef}
      className="transition-all duration-300 overflow-hidden"
      style={{
        maxHeight: isOpen ? `${maxHeight}px` : '0px',
        opacity: isOpen ? 1 : 0,
      }}
    >
      <div className="bg-white border border-gray-200 rounded-lg p-4 mt-3">
        {/* Filter Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Relationship Tier */}
          <FilterSection label="Relationship Tier">
            <div className="flex flex-wrap gap-2">
              {TIER_OPTIONS.map((tier) => (
                <PillButton
                  key={tier}
                  label={tier}
                  isActive={activeTier === tier}
                  onClick={() => onFilterChange('tier', tier === 'All' ? '' : tier)}
                />
              ))}
            </div>
          </FilterSection>

          {/* 2. Cadence Status */}
          <FilterSection label="Cadence Status">
            <div className="flex flex-wrap gap-2">
              {CADENCE_OPTIONS.map((status) => (
                <PillButton
                  key={status}
                  label={status}
                  isActive={activeCadence === status}
                  onClick={() => onFilterChange('cadenceStatus', status === 'All' ? '' : status)}
                />
              ))}
            </div>
          </FilterSection>

          {/* 3. Score Range */}
          <FilterSection label="Score Range">
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={filters.scoreMin ?? ''}
                onChange={(e) =>
                  onFilterChange(
                    'scoreMin',
                    e.target.value === '' ? undefined : Number(e.target.value),
                  )
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="flex items-center text-gray-400 text-sm">&ndash;</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="100"
                value={filters.scoreMax ?? ''}
                onChange={(e) =>
                  onFilterChange(
                    'scoreMax',
                    e.target.value === '' ? undefined : Number(e.target.value),
                  )
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </FilterSection>

          {/* 4. Tags */}
          <FilterSection label="Tags">
            <TagDropdown
              availableTags={availableTags}
              selectedTags={selectedTags}
              onToggleTag={handleToggleTag}
            />
          </FilterSection>

          {/* 5. Last Touch */}
          <FilterSection label="Last Touch">
            <select
              value={filters.lastTouch ?? ''}
              onChange={(e) => onFilterChange('lastTouch', e.target.value || '')}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {LAST_TOUCH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FilterSection>

          {/* 6. Has Commitments */}
          <FilterSection label="Has Commitments">
            <div className="flex flex-wrap gap-2">
              {COMMITMENT_OPTIONS.map((option) => (
                <PillButton
                  key={option}
                  label={option}
                  isActive={activeCommitments === option}
                  onClick={() =>
                    onFilterChange('hasCommitments', option === 'All' ? '' : option)
                  }
                />
              ))}
            </div>
          </FilterSection>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onApply}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
