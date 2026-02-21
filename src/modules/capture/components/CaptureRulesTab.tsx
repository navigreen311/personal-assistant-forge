'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RoutingRule, RoutingCondition, RoutingAction } from '@/modules/capture/types';

interface CaptureRulesTabProps {
  entities?: { id: string; name: string }[];
}

type MatchMode = 'all' | 'any';

const EMPTY_CONDITION: RoutingCondition = {
  field: 'source',
  operator: 'equals',
  value: '',
};

const EMPTY_ACTION: RoutingAction = {
  targetType: 'TASK',
};

const FIELD_LABELS: Record<RoutingCondition['field'], string> = {
  source: 'source',
  contentType: 'content type',
  content: 'content',
  sender: 'sender',
  keyword: 'keyword',
};

const OPERATOR_LABELS: Record<RoutingCondition['operator'], string> = {
  equals: '=',
  contains: 'contains',
  matches: 'matches',
  startsWith: 'starts with',
};

const TARGET_TYPE_LABELS: Record<RoutingAction['targetType'], string> = {
  TASK: 'Task',
  CONTACT: 'Contact',
  NOTE: 'Note',
  EVENT: 'Event',
  MESSAGE: 'Message',
  EXPENSE: 'Expense',
};

export default function CaptureRulesTab({ entities = [] }: CaptureRulesTabProps) {
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // New rule form state
  const [ruleName, setRuleName] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('all');
  const [conditions, setConditions] = useState<RoutingCondition[]>([{ ...EMPTY_CONDITION }]);
  const [action, setAction] = useState<RoutingAction>({ ...EMPTY_ACTION });
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- Data fetching ----------

  const fetchRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/capture/rules');
      if (res.ok) {
        const data: RoutingRule[] = await res.json();
        setRules(data);
      }
    } catch {
      // Silently fail — empty state will show
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // ---------- Toggle active ----------

  const handleToggle = useCallback(async (rule: RoutingRule) => {
    try {
      const res = await fetch('/api/capture/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, isActive: !rule.isActive }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === rule.id ? { ...r, isActive: !r.isActive } : r,
          ),
        );
      }
    } catch {
      // Fail silently
    }
  }, []);

  // ---------- Delete ----------

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this rule? This action cannot be undone.',
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/capture/rules', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      // Fail silently
    }
  }, []);

  // ---------- New rule modal helpers ----------

  const resetForm = useCallback(() => {
    setRuleName('');
    setMatchMode('all');
    setConditions([{ ...EMPTY_CONDITION }]);
    setAction({ ...EMPTY_ACTION });
    setTagInput('');
    setShowModal(false);
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [...prev, { ...EMPTY_CONDITION }]);
  }, []);

  const removeCondition = useCallback((index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateCondition = useCallback(
    (index: number, field: keyof RoutingCondition, value: string) => {
      setConditions((prev) =>
        prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
      );
    },
    [],
  );

  const handleAddTag = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = tagInput.trim().replace(/,$/g, '');
        if (tag && !(action.tags ?? []).includes(tag)) {
          setAction((prev) => ({
            ...prev,
            tags: [...(prev.tags ?? []), tag],
          }));
          setTagInput('');
        }
      }
    },
    [tagInput, action.tags],
  );

  const removeTag = useCallback((tag: string) => {
    setAction((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).filter((t) => t !== tag),
    }));
  }, []);

  // ---------- Create rule ----------

  const handleCreate = useCallback(async () => {
    if (!ruleName.trim() || conditions.length === 0) return;

    setIsSubmitting(true);
    try {
      const newRule = {
        name: ruleName.trim(),
        conditions,
        actions: action,
        priority: rules.length + 1,
        isActive: true,
      };

      const res = await fetch('/api/capture/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });

      if (res.ok) {
        const created: RoutingRule = await res.json();
        setRules((prev) => [...prev, created]);
        resetForm();
      }
    } catch {
      // Fail silently
    } finally {
      setIsSubmitting(false);
    }
  }, [ruleName, conditions, action, rules.length, resetForm]);

  // ---------- Entity name resolution ----------

  const resolveEntityName = useCallback(
    (entityId?: string): string => {
      if (!entityId) return 'Unassigned';
      const entity = entities.find((e) => e.id === entityId);
      return entity?.name ?? entityId;
    },
    [entities],
  );

  // ---------- Render conditions in natural language ----------

  const formatConditions = (conds: RoutingCondition[]): string => {
    return conds
      .map(
        (c) =>
          `${FIELD_LABELS[c.field]} ${OPERATOR_LABELS[c.operator]} "${c.value}"`,
      )
      .join(' AND ');
  };

  // ---------- Skeleton loader ----------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-72 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
              <div className="h-6 w-11 animate-pulse rounded-full bg-gray-200" />
            </div>
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-gray-100" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="mt-3 flex gap-2">
              <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------- Main render ----------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Capture Rules</h2>
          <p className="mt-1 text-sm text-gray-500">
            Define automatic routing for incoming captures.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Rule
        </button>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          <p className="mt-3 text-sm text-gray-500">
            No routing rules defined yet. Create rules to automatically route
            captures to the right place.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-xl border border-gray-200 bg-white p-5 transition-opacity ${
                !rule.isActive ? 'opacity-50' : ''
              }`}
            >
              {/* Top row: name + toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">{rule.name}</h3>
                <button
                  type="button"
                  onClick={() => handleToggle(rule)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    rule.isActive ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={rule.isActive}
                  aria-label={rule.isActive ? 'On' : 'Off'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      rule.isActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Conditions */}
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-700">IF</span>{' '}
                {formatConditions(rule.conditions)}
              </p>

              {/* Actions */}
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-medium text-gray-700">THEN</span>{' '}
                <span className="text-gray-400">&rarr;</span>{' '}
                {rule.actions.entityId && (
                  <>
                    Entity: {resolveEntityName(rule.actions.entityId)}
                    <span className="mx-1 text-gray-300">|</span>
                  </>
                )}
                Route: {TARGET_TYPE_LABELS[rule.actions.targetType]}
                {rule.actions.priority && (
                  <>
                    <span className="mx-1 text-gray-300">|</span>
                    Priority: {rule.actions.priority}
                  </>
                )}
              </p>

              {/* Tags */}
              {rule.actions.tags && rule.actions.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rule.actions.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Edit / Delete */}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="rounded-md px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}

          {/* Reorder hint */}
          <p className="text-center text-xs text-gray-400">
            Rules are evaluated top-to-bottom. First match wins.
          </p>
        </div>
      )}

      {/* New Rule Modal (inline overlay) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-base font-semibold text-gray-900">New Rule</h3>
              <button
                type="button"
                onClick={resetForm}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              {/* Rule Name */}
              <div className="mb-5">
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Email from HCQC"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* CONDITIONS section */}
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Conditions
                  </label>
                  <select
                    value={matchMode}
                    onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="all">Match All</option>
                    <option value="any">Match Any</option>
                  </select>
                </div>

                <div className="space-y-2">
                  {conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={cond.field}
                        onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="source">Source</option>
                        <option value="contentType">Content Type</option>
                        <option value="content">Content</option>
                        <option value="sender">Sender</option>
                        <option value="keyword">Keyword</option>
                      </select>
                      <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="equals">equals</option>
                        <option value="contains">contains</option>
                        <option value="matches">matches</option>
                        <option value="startsWith">starts with</option>
                      </select>
                      <input
                        type="text"
                        value={cond.value}
                        onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                        placeholder="Value"
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                      />
                      {conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(idx)}
                          className="shrink-0 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove condition"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addCondition}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  + Add condition
                </button>
              </div>

              {/* ACTIONS section */}
              <div className="mb-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </label>

                <div className="space-y-3">
                  {/* Route to Entity */}
                  {entities.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600">
                        Route to Entity
                      </label>
                      <select
                        value={action.entityId ?? ''}
                        onChange={(e) =>
                          setAction((prev) => ({
                            ...prev,
                            entityId: e.target.value || undefined,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Select entity...</option>
                        {entities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Route to Module */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Route to Module
                    </label>
                    <select
                      value={action.targetType}
                      onChange={(e) =>
                        setAction((prev) => ({
                          ...prev,
                          targetType: e.target.value as RoutingAction['targetType'],
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="TASK">Task</option>
                      <option value="CONTACT">Contact</option>
                      <option value="NOTE">Note</option>
                      <option value="EVENT">Event</option>
                      <option value="MESSAGE">Message</option>
                      <option value="EXPENSE">Expense</option>
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Priority
                    </label>
                    <select
                      value={action.priority ?? ''}
                      onChange={(e) =>
                        setAction((prev) => ({
                          ...prev,
                          priority: (e.target.value || undefined) as
                            | 'P0'
                            | 'P1'
                            | 'P2'
                            | undefined,
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">No priority</option>
                      <option value="P0">P0 — Critical</option>
                      <option value="P1">P1 — High</option>
                      <option value="P2">P2 — Normal</option>
                    </select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Tags
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2">
                      {(action.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="text-blue-400 hover:text-blue-600"
                            aria-label={`Remove tag ${tag}`}
                          >
                            <svg
                              className="h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        placeholder={
                          (action.tags ?? []).length === 0
                            ? 'Type and press Enter...'
                            : ''
                        }
                        className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-0"
                      />
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Press Enter or comma to add a tag.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!ruleName.trim() || conditions.length === 0 || isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
