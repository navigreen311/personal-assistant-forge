'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface WizardContextData {
  entityId: string;
  title: string;
  description: string;
  type: string;
  urgency: string;
  deadline: string;
  stakeholderIds: string[];
  linkedProjectId?: string;
  linkedTaskIds: string[];
}

interface DecisionWizardContextStepProps {
  data: WizardContextData;
  onChange: (data: WizardContextData) => void;
  onNext: () => void;
  onCancel: () => void;
}

interface EntityOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  name: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  title: string;
}

// ============================================================================
// Constants
// ============================================================================

const DECISION_TYPES = [
  'Strategic',
  'Operational',
  'Financial',
  'Hiring',
  'Vendor',
  'Investment',
];

const URGENCY_LEVELS = [
  { value: 'Critical', color: 'bg-red-500' },
  { value: 'High', color: 'bg-orange-500' },
  { value: 'Medium', color: 'bg-yellow-500' },
  { value: 'Low', color: 'bg-green-500' },
];

const WIZARD_STEPS = ['Context', 'Options', 'Analysis', 'Review'];

// ============================================================================
// Progress Stepper
// ============================================================================

function ProgressStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {WIZARD_STEPS.map((label, index) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                index === currentStep
                  ? 'bg-blue-600 text-white'
                  : index < currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-400'
              }`}
            >
              {index < currentStep ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </div>
            <span
              className={`text-xs mt-1 ${
                index === currentStep ? 'text-blue-600 font-medium' : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
          {index < WIZARD_STEPS.length - 1 && (
            <div
              className={`h-0.5 w-12 mx-1 ${
                index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Searchable Multi-Select (for Stakeholders and Tasks)
// ============================================================================

function SearchableMultiSelect<T extends { id: string }>({
  label,
  placeholder,
  searchEndpoint,
  selectedIds,
  onSelectionChange,
  displayField,
  optional,
}: {
  label: string;
  placeholder: string;
  searchEndpoint: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  displayField: keyof T;
  optional?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [selectedItems, setSelectedItems] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search on query change
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${searchEndpoint}?search=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          const items: T[] = json.data ?? json;
          // Filter out already-selected items
          setResults(items.filter((item) => !selectedIds.includes(item.id)));
          setIsOpen(true);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchEndpoint, selectedIds]);

  const addItem = (item: T) => {
    setSelectedItems((prev) => [...prev, item]);
    onSelectionChange([...selectedIds, item.id]);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const removeItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
    onSelectionChange(selectedIds.filter((sid) => sid !== id));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-gray-400 ml-1">(optional)</span>}
      </label>

      {/* Selected pills */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-200"
            >
              {String(item[displayField])}
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="ml-0.5 text-blue-400 hover:text-blue-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
      />

      {/* Dropdown results */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
          )}
          {!isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">No results found</div>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addItem(item)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-700"
            >
              {String(item[displayField])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function DecisionWizardContextStep({
  data,
  onChange,
  onNext,
  onCancel,
}: DecisionWizardContextStepProps) {
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Fetch entities on mount
  useEffect(() => {
    async function fetchEntities() {
      try {
        const res = await fetch('/api/entities');
        if (res.ok) {
          const json = await res.json();
          setEntities(json.data ?? json);
        }
      } catch {
        // Silently fail; user can retry
      }
    }
    fetchEntities();
  }, []);

  // Fetch projects on mount
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const json = await res.json();
          setProjects(json.data ?? json);
        }
      } catch {
        // Silently fail
      }
    }
    fetchProjects();
  }, []);

  const updateField = useCallback(
    <K extends keyof WizardContextData>(field: K, value: WizardContextData[K]) => {
      onChange({ ...data, [field]: value });
    },
    [data, onChange],
  );

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // Validation
  const validate = useCallback((): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.entityId) errs.entityId = 'Entity is required';
    if (!data.title.trim()) errs.title = 'Title is required';
    if (!data.description.trim()) errs.description = 'Description is required';
    return errs;
  }, [data.entityId, data.title, data.description]);

  // Re-validate when data changes (only show errors for touched fields)
  useEffect(() => {
    setErrors(validate());
  }, [validate]);

  const handleNext = () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      // Mark all required fields as touched to show errors
      setTouched({ entityId: true, title: true, description: true });
      setErrors(validationErrors);
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-6">
      {/* Progress Stepper */}
      <ProgressStepper currentStep={0} />

      {/* Entity Select (required) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Entity <span className="text-red-500">*</span>
        </label>
        <select
          value={data.entityId}
          onChange={(e) => updateField('entityId', e.target.value)}
          onBlur={() => handleBlur('entityId')}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select an entity...</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
        {touched.entityId && errors.entityId && (
          <p className="mt-1 text-xs text-red-600">{errors.entityId}</p>
        )}
      </div>

      {/* Decision Title (required) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Decision Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.title}
          onChange={(e) => updateField('title', e.target.value)}
          onBlur={() => handleBlur('title')}
          placeholder="What decision needs to be made?"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
        {touched.title && errors.title && (
          <p className="mt-1 text-xs text-red-600">{errors.title}</p>
        )}
      </div>

      {/* Description (required) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={data.description}
          onChange={(e) => updateField('description', e.target.value)}
          onBlur={() => handleBlur('description')}
          rows={4}
          placeholder="Describe the context, constraints, and what success looks like..."
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
        {touched.description && errors.description && (
          <p className="mt-1 text-xs text-red-600">{errors.description}</p>
        )}
      </div>

      {/* Decision Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Decision Type</label>
        <select
          value={data.type}
          onChange={(e) => updateField('type', e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select a type...</option>
          {DECISION_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Urgency */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Urgency</label>
        <select
          value={data.urgency}
          onChange={(e) => updateField('urgency', e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Select urgency...</option>
          {URGENCY_LEVELS.map(({ value, color }) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {data.urgency && (
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                URGENCY_LEVELS.find((u) => u.value === data.urgency)?.color ?? 'bg-gray-300'
              }`}
            />
            <span className="text-xs text-gray-500">{data.urgency} urgency</span>
          </div>
        )}
      </div>

      {/* Deadline */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Decide by</label>
        <input
          type="date"
          value={data.deadline}
          onChange={(e) => updateField('deadline', e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Stakeholders (multi-select with search) */}
      <SearchableMultiSelect<ContactOption>
        label="Stakeholders"
        placeholder="Search contacts..."
        searchEndpoint="/api/contacts"
        selectedIds={data.stakeholderIds}
        onSelectionChange={(ids) => updateField('stakeholderIds', ids)}
        displayField="name"
        optional
      />

      {/* Linked Project */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Linked Project <span className="text-gray-400 ml-1">(optional)</span>
        </label>
        <select
          value={data.linkedProjectId ?? ''}
          onChange={(e) => updateField('linkedProjectId', e.target.value || undefined)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">No linked project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* Linked Tasks (multi-select with search) */}
      <SearchableMultiSelect<TaskOption>
        label="Linked Tasks"
        placeholder="Search tasks..."
        searchEndpoint="/api/tasks"
        selectedIds={data.linkedTaskIds}
        onSelectionChange={(ids) => updateField('linkedTaskIds', ids)}
        displayField="title"
        optional
      />

      {/* Bottom Buttons */}
      <div className="flex justify-between pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
