'use client';

import { useState, useEffect } from 'react';
import type {
  RoutingCondition,
  RoutingAction,
  CaptureSource,
  CaptureContentType,
} from '@/modules/capture/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaptureRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (rule: any) => void;
  editRule?: {
    id: string;
    name: string;
    conditions: RoutingCondition[];
    actions: RoutingAction;
    priority: number;
    isActive: boolean;
  } | null;
  entities?: { id: string; name: string }[];
}

interface FormErrors {
  name?: string;
  conditions?: string;
  targetType?: string;
}

type MatchMode = 'ALL' | 'ANY';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_OPTIONS: RoutingCondition['field'][] = [
  'source',
  'contentType',
  'content',
  'sender',
  'keyword',
];

const FIELD_LABELS: Record<RoutingCondition['field'], string> = {
  source: 'Source',
  contentType: 'Content Type',
  content: 'Content',
  sender: 'Sender',
  keyword: 'Keyword',
};

const OPERATOR_OPTIONS: RoutingCondition['operator'][] = [
  'equals',
  'contains',
  'matches',
  'startsWith',
];

const OPERATOR_LABELS: Record<RoutingCondition['operator'], string> = {
  equals: 'equals',
  contains: 'contains',
  matches: 'matches',
  startsWith: 'starts with',
};

const SOURCE_OPTIONS: CaptureSource[] = [
  'VOICE',
  'SCREENSHOT',
  'CLIPBOARD',
  'SHARE_SHEET',
  'BROWSER_EXTENSION',
  'EMAIL_FORWARD',
  'SMS_BRIDGE',
  'DESKTOP_TRAY',
  'CAMERA_SCAN',
  'MANUAL',
];

const CONTENT_TYPE_OPTIONS: CaptureContentType[] = [
  'TEXT',
  'IMAGE',
  'AUDIO',
  'URL',
  'DOCUMENT',
  'BUSINESS_CARD',
  'RECEIPT',
  'WHITEBOARD',
  'SCREENSHOT',
];

const TARGET_TYPE_OPTIONS: RoutingAction['targetType'][] = [
  'TASK',
  'CONTACT',
  'NOTE',
  'EVENT',
  'MESSAGE',
  'EXPENSE',
];

const PRIORITY_OPTIONS: NonNullable<RoutingAction['priority']>[] = ['P0', 'P1', 'P2'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyCondition(): RoutingCondition {
  return { field: 'source', operator: 'equals', value: '' };
}

function createDefaultAction(): RoutingAction {
  return { targetType: 'TASK' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CaptureRuleModal({
  isOpen,
  onClose,
  onSaved,
  editRule,
  entities = [],
}: CaptureRuleModalProps) {
  // Form fields
  const [name, setName] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('ALL');
  const [conditions, setConditions] = useState<RoutingCondition[]>([createEmptyCondition()]);
  const [actions, setActions] = useState<RoutingAction>(createDefaultAction());
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');

  // ---------------------------------------------------------------------------
  // Populate form when editing
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen && editRule) {
      setName(editRule.name);
      setConditions(
        editRule.conditions.length > 0
          ? editRule.conditions.map((c) => ({ ...c }))
          : [createEmptyCondition()],
      );
      setActions({ ...editRule.actions });
      setPriority(editRule.priority);
      setIsActive(editRule.isActive);
      setTags(editRule.actions.tags ?? []);
    }
  }, [isOpen, editRule]);

  // ---------------------------------------------------------------------------
  // Reset form on close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setMatchMode('ALL');
      setConditions([createEmptyCondition()]);
      setActions(createDefaultAction());
      setPriority(0);
      setIsActive(true);
      setTags([]);
      setTagInput('');
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Conditions
  // ---------------------------------------------------------------------------

  const addCondition = () => {
    setConditions([...conditions, createEmptyCondition()]);
  };

  const updateCondition = (
    index: number,
    field: keyof RoutingCondition,
    value: string,
  ) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };

    // Reset value when field changes (source/contentType use dropdowns)
    if (field === 'field') {
      updated[index].value = '';
    }

    setConditions(updated);
  };

  const removeCondition = (index: number) => {
    if (conditions.length <= 1) return; // must keep at least 1
    setConditions(conditions.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // Tags
  // ---------------------------------------------------------------------------

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Rule name is required.';
    }

    const hasValidCondition = conditions.some((c) => c.value.trim() !== '');
    if (!hasValidCondition) {
      newErrors.conditions = 'At least one condition with a value is required.';
    }

    if (!actions.targetType) {
      newErrors.targetType = 'Target module is required.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const body = {
        name: name.trim(),
        matchMode,
        conditions: conditions.filter((c) => c.value.trim() !== ''),
        actions: {
          targetType: actions.targetType,
          entityId: actions.entityId || undefined,
          projectId: actions.projectId || undefined,
          priority: actions.priority || undefined,
          tags: tags.length > 0 ? tags : undefined,
        },
        priority,
        isActive,
      };

      const isEditing = !!editRule;
      const url = isEditing
        ? `/api/capture/rules/${editRule!.id}`
        : '/api/capture/rules';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(
          json?.error?.message ?? `Request failed with status ${res.status}`,
        );
      }

      const json = await res.json();
      onSaved?.(json.data ?? json);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save rule',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Value input renderer per field type
  // ---------------------------------------------------------------------------

  const renderValueInput = (condition: RoutingCondition, index: number) => {
    const baseClass =
      'flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

    if (condition.field === 'source') {
      return (
        <select
          value={condition.value}
          onChange={(e) => updateCondition(index, 'value', e.target.value)}
          className={baseClass}
        >
          <option value="">Select source...</option>
          {SOURCE_OPTIONS.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
      );
    }

    if (condition.field === 'contentType') {
      return (
        <select
          value={condition.value}
          onChange={(e) => updateCondition(index, 'value', e.target.value)}
          className={baseClass}
        >
          <option value="">Select type...</option>
          {CONTENT_TYPE_OPTIONS.map((ct) => (
            <option key={ct} value={ct}>
              {ct}
            </option>
          ))}
        </select>
      );
    }

    // Free text for content, sender, keyword
    return (
      <input
        type="text"
        value={condition.value}
        onChange={(e) => updateCondition(index, 'value', e.target.value)}
        placeholder="Enter value..."
        className={baseClass}
      />
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  const isEditing = !!editRule;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto mx-4 p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <h2 className="text-lg font-semibold text-gray-900 mb-5">
          {isEditing ? 'Edit Capture Rule' : 'Create Capture Rule'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {submitError}
            </div>
          )}

          {/* 1. Rule Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="e.g. Route emails to tasks"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.name ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>

          {/* ─── CONDITIONS (IF) ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Conditions (IF)
              </span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            {/* Match mode */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Match
              </label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All conditions (AND)</option>
                <option value="ANY">Any condition (OR)</option>
              </select>
            </div>

            {/* Condition rows */}
            <div className="space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  {/* Field */}
                  <select
                    value={condition.field}
                    onChange={(e) =>
                      updateCondition(index, 'field', e.target.value)
                    }
                    className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={condition.operator}
                    onChange={(e) =>
                      updateCondition(index, 'operator', e.target.value)
                    }
                    className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {OPERATOR_OPTIONS.map((op) => (
                      <option key={op} value={op}>
                        {OPERATOR_LABELS[op]}
                      </option>
                    ))}
                  </select>

                  {/* Value (dropdown or text, depending on field) */}
                  {renderValueInput(condition, index)}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    disabled={conditions.length <= 1}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove condition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Condition error */}
            {errors.conditions && (
              <p className="mt-1 text-xs text-red-600">{errors.conditions}</p>
            )}

            {/* Add condition */}
            <button
              type="button"
              onClick={addCondition}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              + Add condition
            </button>
          </div>

          {/* ─── ACTIONS (THEN) ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Actions (THEN)
              </span>
              <div className="flex-1 border-t border-gray-200" />
            </div>

            <div className="space-y-3">
              {/* Route to Entity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Route to Entity
                </label>
                <select
                  value={actions.entityId ?? ''}
                  onChange={(e) =>
                    setActions({ ...actions, entityId: e.target.value || undefined })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select entity...</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Route to Module */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Route to Module <span className="text-red-500">*</span>
                </label>
                <select
                  value={actions.targetType}
                  onChange={(e) => {
                    setActions({
                      ...actions,
                      targetType: e.target.value as RoutingAction['targetType'],
                    });
                    if (errors.targetType)
                      setErrors({ ...errors, targetType: undefined });
                  }}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.targetType ? 'border-red-400' : 'border-gray-300'
                  }`}
                >
                  {TARGET_TYPE_OPTIONS.map((tt) => (
                    <option key={tt} value={tt}>
                      {tt}
                    </option>
                  ))}
                </select>
                {errors.targetType && (
                  <p className="mt-1 text-xs text-red-600">{errors.targetType}</p>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={actions.priority ?? ''}
                  onChange={(e) =>
                    setActions({
                      ...actions,
                      priority: (e.target.value || undefined) as RoutingAction['priority'],
                    })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No priority</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-blue-400 hover:text-red-500 leading-none ml-0.5"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                    if (e.key === ',' && tagInput.trim()) {
                      e.preventDefault();
                      addTag(tagInput);
                    }
                  }}
                  placeholder="Type a tag and press Enter..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting
                ? 'Saving...'
                : isEditing
                  ? 'Update Rule'
                  : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
