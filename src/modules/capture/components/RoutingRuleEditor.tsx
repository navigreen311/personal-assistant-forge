'use client';

import { useState, useCallback } from 'react';
import type { RoutingRule, RoutingCondition, RoutingAction } from '@/modules/capture/types';

interface RoutingRuleEditorProps {
  rules: RoutingRule[];
  onSave: (rule: Omit<RoutingRule, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<RoutingRule>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onTest?: (rule: Omit<RoutingRule, 'id'>, sampleInput: string) => void;
}

const EMPTY_CONDITION: RoutingCondition = {
  field: 'source',
  operator: 'equals',
  value: '',
};

const EMPTY_ACTION: RoutingAction = {
  targetType: 'NOTE',
};

export default function RoutingRuleEditor({
  rules,
  onSave,
  onUpdate,
  onDelete,
  onReorder,
  onTest,
}: RoutingRuleEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [conditions, setConditions] = useState<RoutingCondition[]>([{ ...EMPTY_CONDITION }]);
  const [actions, setActions] = useState<RoutingAction>({ ...EMPTY_ACTION });
  const [priority, setPriority] = useState(50);
  const [testInput, setTestInput] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setConditions([{ ...EMPTY_CONDITION }]);
    setActions({ ...EMPTY_ACTION });
    setPriority(50);
    setEditingId(null);
    setIsCreating(false);
    setTestInput('');
  }, []);

  const handleEdit = useCallback((rule: RoutingRule) => {
    setEditingId(rule.id);
    setName(rule.name);
    setConditions([...rule.conditions]);
    setActions({ ...rule.actions });
    setPriority(rule.priority);
    setIsCreating(false);
  }, []);

  const handleSave = useCallback(() => {
    const rule = {
      name,
      conditions,
      actions,
      priority,
      isActive: true,
    };

    if (editingId) {
      onUpdate(editingId, rule);
    } else {
      onSave(rule);
    }
    resetForm();
  }, [name, conditions, actions, priority, editingId, onUpdate, onSave, resetForm]);

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

  const showForm = isCreating || editingId !== null;

  return (
    <div className="space-y-6">
      {/* Rule list */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Routing Rules</h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsCreating(true);
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Rule
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3 p-4 ${!rule.isActive ? 'opacity-50' : ''}`}
            >
              {/* Priority controls */}
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onReorder(rule.id, 'up')}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={index === rules.length - 1}
                  onClick={() => onReorder(rule.id, 'down')}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Rule info */}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{rule.name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-gray-500">
                  {rule.conditions.map((c, ci) => (
                    <span key={ci} className="rounded bg-gray-100 px-1.5 py-0.5">
                      {c.field} {c.operator} &quot;{c.value}&quot;
                    </span>
                  ))}
                  <span className="text-gray-300">→</span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
                    {rule.actions.targetType}
                  </span>
                </div>
              </div>

              {/* Priority badge */}
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                P{rule.priority}
              </span>

              {/* Actions */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleEdit(rule)}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Edit"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(rule.id)}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {rules.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              No routing rules configured. Add one to get started.
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">
            {editingId ? 'Edit Rule' : 'New Routing Rule'}
          </h3>

          {/* Rule name */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Route invoices to expenses"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Conditions */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-gray-600">
              Conditions (all must match)
            </label>
            {conditions.map((cond, idx) => (
              <div key={idx} className="mb-2 flex gap-2">
                <select
                  value={cond.field}
                  onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="source">Source</option>
                  <option value="contentType">Content Type</option>
                  <option value="content">Content</option>
                  <option value="keyword">Keyword</option>
                  <option value="sender">Sender</option>
                </select>
                <select
                  value={cond.operator}
                  onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="equals">equals</option>
                  <option value="contains">contains</option>
                  <option value="matches">matches (regex)</option>
                  <option value="startsWith">starts with</option>
                </select>
                <input
                  type="text"
                  value={cond.value}
                  onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
                {conditions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCondition(idx)}
                    className="rounded p-1.5 text-red-400 hover:bg-red-50"
                    aria-label="Remove condition"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addCondition}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Add condition
            </button>
          </div>

          {/* Action */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Route To</label>
            <select
              value={actions.targetType}
              onChange={(e) =>
                setActions((prev) => ({
                  ...prev,
                  targetType: e.target.value as RoutingAction['targetType'],
                }))
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Priority (higher = evaluated first)
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              min={0}
              max={999}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Test */}
          {onTest && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">Test Rule</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Enter sample text to test..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    onTest({ name, conditions, actions, priority, isActive: true }, testInput)
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Test
                </button>
              </div>
            </div>
          )}

          {/* Form actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editingId ? 'Update' : 'Create'} Rule
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
