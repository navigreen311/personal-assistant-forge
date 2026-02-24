'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ExecutionGate } from '@/modules/execution/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedGatesTabProps {
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type GateActionWhenTriggered = 'REQUIRE_APPROVAL' | 'NOTIFY' | 'BLOCK_AND_NOTIFY';
type GateNotificationMethod = 'PUSH' | 'EMAIL' | 'BOTH';
type ConditionOperator = 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'outside';
type ConditionField = 'Amount' | 'Recipients' | 'Blast Radius' | 'Confidence' | 'Time' | 'Contact Type';
type AppliesTo = 'ALL' | 'SPECIFIC_MODULES' | 'SPECIFIC_ENTITIES';

interface GateCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface NewGateFormData {
  name: string;
  conditions: GateCondition[];
  appliesTo: AppliesTo;
  selectedModules: string[];
  actionWhenTriggered: GateActionWhenTriggered;
  notificationMethod: GateNotificationMethod;
}

/** Extended gate with UI-friendly fields derived from the base ExecutionGate. */
interface DisplayGate extends ExecutionGate {
  conditionLabel: string;
  appliesToLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONDITION_FIELDS: ConditionField[] = [
  'Amount',
  'Recipients',
  'Blast Radius',
  'Confidence',
  'Time',
  'Contact Type',
];

const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'outside', label: 'outside' },
];

const MODULE_OPTIONS = [
  'Email sends',
  'VoiceForge',
  'Calendar',
  'Finance',
  'Communication',
  'Tasks',
  'Documents',
];

const INITIAL_FORM: NewGateFormData = {
  name: '',
  conditions: [{ field: 'Amount', operator: 'greater_than', value: '' }],
  appliesTo: 'ALL',
  selectedModules: [],
  actionWhenTriggered: 'REQUIRE_APPROVAL',
  notificationMethod: 'PUSH',
};

// ---------------------------------------------------------------------------
// Default gates (hardcoded fallback when API returns empty)
// ---------------------------------------------------------------------------

const DEFAULT_GATES: DisplayGate[] = [
  {
    id: 'default-financial-limit',
    name: 'Financial limit',
    expression: 'amount > 500',
    description: 'Requires approval for financial actions over $500',
    scope: 'GLOBAL',
    isActive: true,
    conditionLabel: 'Amount > $500',
    appliesToLabel: 'All financial actions',
  },
  {
    id: 'default-mass-email',
    name: 'Mass email',
    expression: 'recipients > 10',
    description: 'Requires approval for emails sent to more than 10 recipients',
    scope: 'GLOBAL',
    isActive: true,
    conditionLabel: 'Recipients > 10',
    appliesToLabel: 'Email sends',
  },
  {
    id: 'default-new-contact-call',
    name: 'New contact call',
    expression: 'contact_type == unknown && action == first_call',
    description: 'Requires approval for first calls to unknown contacts',
    scope: 'GLOBAL',
    isActive: true,
    conditionLabel: 'First call to unknown',
    appliesToLabel: 'VoiceForge',
  },
  {
    id: 'default-high-blast-radius',
    name: 'High blast radius',
    expression: 'blast_radius > MEDIUM',
    description: 'Requires approval for actions with blast radius above Medium',
    scope: 'GLOBAL',
    isActive: true,
    conditionLabel: 'Blast > Medium',
    appliesToLabel: 'All actions',
  },
  {
    id: 'default-low-confidence',
    name: 'Low confidence',
    expression: 'confidence < 70',
    description: 'Requires approval when AI confidence is below 70%',
    scope: 'GLOBAL',
    isActive: true,
    conditionLabel: 'AI confidence < 70%',
    appliesToLabel: 'All AI actions',
  },
  {
    id: 'default-after-hours',
    name: 'After hours',
    expression: 'time outside 08:00-18:00',
    description: 'Requires approval for outbound communications outside business hours',
    scope: 'GLOBAL',
    isActive: false,
    conditionLabel: 'Time outside 8am-6pm',
    appliesToLabel: 'Outbound comms',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function operatorSymbol(op: ConditionOperator): string {
  switch (op) {
    case 'greater_than':
      return '>';
    case 'less_than':
      return '<';
    case 'equals':
      return '=';
    case 'not_equals':
      return '!=';
    case 'outside':
      return 'outside';
  }
}

function buildConditionLabel(conditions: GateCondition[]): string {
  return conditions
    .map((c) => `${c.field} ${operatorSymbol(c.operator)} ${c.value}`)
    .join(' AND ');
}

function buildAppliesToLabel(appliesTo: AppliesTo, modules: string[]): string {
  switch (appliesTo) {
    case 'ALL':
      return 'All actions';
    case 'SPECIFIC_MODULES':
      return modules.length > 0 ? modules.join(', ') : 'No modules selected';
    case 'SPECIFIC_ENTITIES':
      return 'Specific entities';
  }
}

function buildExpression(conditions: GateCondition[]): string {
  return conditions
    .map((c) => {
      const field = c.field.toLowerCase().replace(/\s+/g, '_');
      return `${field} ${c.operator} ${c.value}`;
    })
    .join(' && ');
}

/** Convert a raw ExecutionGate from the API into a DisplayGate with labels. */
function toDisplayGate(gate: ExecutionGate): DisplayGate {
  return {
    ...gate,
    conditionLabel: gate.expression,
    appliesToLabel: gate.scope === 'GLOBAL' ? 'All actions' : gate.entityId ?? 'Entity-scoped',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedGatesTab({ entityId }: EnhancedGatesTabProps) {
  // ---- Data state ----------------------------------------------------------
  const [gates, setGates] = useState<DisplayGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Modal state ---------------------------------------------------------
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<NewGateFormData>({ ...INITIAL_FORM });
  const [submitting, setSubmitting] = useState(false);

  // ---- Toggling state (tracks in-flight toggle requests) -------------------
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // ---- Fetch gates ---------------------------------------------------------

  const fetchGates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);

      const res = await fetch(`/api/execution/gates?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch gates: ${res.statusText}`);

      const json = await res.json();
      const body: ExecutionGate[] = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);

      if (body.length === 0) {
        setGates(DEFAULT_GATES);
      } else {
        setGates(body.map(toDisplayGate));
      }
      setError(null);
    } catch (err) {
      // On fetch error, fall back to defaults so UI is still usable.
      setGates(DEFAULT_GATES);
      setError(err instanceof Error ? err.message : 'Failed to load gates');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    fetchGates();
  }, [fetchGates]);

  // ---- Toggle gate status --------------------------------------------------

  const handleToggleStatus = async (gate: DisplayGate) => {
    const newActive = !gate.isActive;

    // Optimistic update
    setGates((prev) =>
      prev.map((g) => (g.id === gate.id ? { ...g, isActive: newActive } : g)),
    );
    setTogglingIds((prev) => new Set(prev).add(gate.id));

    try {
      const res = await fetch('/api/execution/gates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gate.id, isActive: newActive }),
      });
      if (!res.ok) throw new Error('Failed to update gate status');
    } catch (err) {
      // Revert optimistic update
      setGates((prev) =>
        prev.map((g) => (g.id === gate.id ? { ...g, isActive: !newActive } : g)),
      );
      setError(err instanceof Error ? err.message : 'Toggle failed');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(gate.id);
        return next;
      });
    }
  };

  // ---- Create gate ---------------------------------------------------------

  const handleCreateGate = async () => {
    if (!formData.name.trim()) return;
    if (formData.conditions.some((c) => !c.value.trim())) return;

    setSubmitting(true);

    const newGate: Omit<ExecutionGate, 'id'> & {
      actionWhenTriggered: GateActionWhenTriggered;
      notificationMethod: GateNotificationMethod;
      appliesTo: AppliesTo;
      selectedModules: string[];
    } = {
      name: formData.name.trim(),
      expression: buildExpression(formData.conditions),
      description: `Gate: ${formData.name.trim()}`,
      scope: formData.appliesTo === 'ALL' ? 'GLOBAL' : 'ENTITY',
      entityId: entityId,
      isActive: true,
      actionWhenTriggered: formData.actionWhenTriggered,
      notificationMethod: formData.notificationMethod,
      appliesTo: formData.appliesTo,
      selectedModules: formData.selectedModules,
    };

    try {
      const res = await fetch('/api/execution/gates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGate),
      });

      if (!res.ok) throw new Error('Failed to create gate');

      const json = await res.json();
      const created: ExecutionGate = json.data ?? json;

      const displayGate: DisplayGate = {
        ...created,
        conditionLabel: buildConditionLabel(formData.conditions),
        appliesToLabel: buildAppliesToLabel(formData.appliesTo, formData.selectedModules),
      };

      setGates((prev) => [...prev, displayGate]);
      setShowModal(false);
      setFormData({ ...INITIAL_FORM });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create gate');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Form helpers --------------------------------------------------------

  const updateCondition = (index: number, updates: Partial<GateCondition>) => {
    setFormData((prev) => {
      const conditions = [...prev.conditions];
      conditions[index] = { ...conditions[index], ...updates };
      return { ...prev, conditions };
    });
  };

  const addCondition = () => {
    setFormData((prev) => ({
      ...prev,
      conditions: [
        ...prev.conditions,
        { field: 'Amount' as ConditionField, operator: 'greater_than' as ConditionOperator, value: '' },
      ],
    }));
  };

  const removeCondition = (index: number) => {
    if (formData.conditions.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  };

  const toggleModule = (mod: string) => {
    setFormData((prev) => {
      const selected = prev.selectedModules.includes(mod)
        ? prev.selectedModules.filter((m) => m !== mod)
        : [...prev.selectedModules, mod];
      return { ...prev, selectedModules: selected };
    });
  };

  const openModal = () => {
    setFormData({ ...INITIAL_FORM });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({ ...INITIAL_FORM });
  };

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Execution Gates</h2>
          <p className="mt-1 text-sm text-gray-500">
            Rules that control when actions require human approval.
          </p>
        </div>

        <button
          onClick={openModal}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + New Gate
        </button>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 underline hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ---- Loading ---- */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-gray-500">Loading gates...</div>
        </div>
      )}

      {/* ---- Empty State ---- */}
      {!loading && gates.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="text-gray-400 text-lg font-medium">
            No execution gates configured.
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Gates help ensure AI actions are reviewed when needed.
          </p>
          <button
            onClick={openModal}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + New Gate
          </button>
        </div>
      )}

      {/* ---- Gates Table ---- */}
      {!loading && gates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Gate Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Condition
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Applies To
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {gates.map((gate) => (
                <GateRow
                  key={gate.id}
                  gate={gate}
                  isToggling={togglingIds.has(gate.id)}
                  onToggleStatus={() => handleToggleStatus(gate)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Footer note ---- */}
      {!loading && gates.length > 0 && (
        <p className="text-xs text-gray-400">
          Gates are evaluated on every action. If triggered, action goes to Pending
          Approval queue.
        </p>
      )}

      {/* ---- New Gate Modal ---- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="p-6">
              {/* Modal header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">Create New Gate</h3>
                <button
                  onClick={closeModal}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label="Close modal"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Gate name */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gate Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Financial limit, Mass email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Condition builder */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conditions
                </label>
                <div className="space-y-3">
                  {formData.conditions.map((condition, index) => (
                    <div key={index} className="flex items-center gap-2">
                      {/* Field */}
                      <select
                        value={condition.field}
                        onChange={(e) =>
                          updateCondition(index, { field: e.target.value as ConditionField })
                        }
                        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {CONDITION_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>

                      {/* Operator */}
                      <select
                        value={condition.operator}
                        onChange={(e) =>
                          updateCondition(index, {
                            operator: e.target.value as ConditionOperator,
                          })
                        }
                        className="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {CONDITION_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {/* Value */}
                      <input
                        type="text"
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder="Value"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      {/* Remove condition */}
                      {formData.conditions.length > 1 && (
                        <button
                          onClick={() => removeCondition(index)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Remove condition"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={addCondition}
                  className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                >
                  + Add condition
                </button>
              </div>

              {/* Applies to */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Applies To
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="appliesTo"
                      value="ALL"
                      checked={formData.appliesTo === 'ALL'}
                      onChange={() => setFormData((prev) => ({ ...prev, appliesTo: 'ALL' }))}
                      className="text-blue-600"
                    />
                    All actions
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="appliesTo"
                      value="SPECIFIC_MODULES"
                      checked={formData.appliesTo === 'SPECIFIC_MODULES'}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, appliesTo: 'SPECIFIC_MODULES' }))
                      }
                      className="text-blue-600"
                    />
                    Specific modules
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="appliesTo"
                      value="SPECIFIC_ENTITIES"
                      checked={formData.appliesTo === 'SPECIFIC_ENTITIES'}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, appliesTo: 'SPECIFIC_ENTITIES' }))
                      }
                      className="text-blue-600"
                    />
                    Specific entities
                  </label>
                </div>

                {/* Module checkboxes */}
                {formData.appliesTo === 'SPECIFIC_MODULES' && (
                  <div className="mt-3 ml-6 space-y-1.5">
                    {MODULE_OPTIONS.map((mod) => (
                      <label
                        key={mod}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <input
                          type="checkbox"
                          checked={formData.selectedModules.includes(mod)}
                          onChange={() => toggleModule(mod)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        {mod}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Action when triggered */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action When Triggered
                </label>
                <select
                  value={formData.actionWhenTriggered}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      actionWhenTriggered: e.target.value as GateActionWhenTriggered,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="REQUIRE_APPROVAL">Require approval</option>
                  <option value="NOTIFY">Notify</option>
                  <option value="BLOCK_AND_NOTIFY">Block + notify</option>
                </select>
              </div>

              {/* Notification method */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notification Method
                </label>
                <select
                  value={formData.notificationMethod}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      notificationMethod: e.target.value as GateNotificationMethod,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="PUSH">Push</option>
                  <option value="EMAIL">Email</option>
                  <option value="BOTH">Both</option>
                </select>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGate}
                  disabled={submitting || !formData.name.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Creating...' : 'Create Gate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface GateRowProps {
  gate: DisplayGate;
  isToggling: boolean;
  onToggleStatus: () => void;
}

function GateRow({ gate, isToggling, onToggleStatus }: GateRowProps) {
  return (
    <tr className="transition-colors hover:bg-gray-50">
      {/* Gate Name */}
      <td className="px-4 py-3 font-medium text-gray-900">{gate.name}</td>

      {/* Condition */}
      <td className="px-4 py-3 text-gray-600">
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
          {gate.conditionLabel}
        </code>
      </td>

      {/* Applies To */}
      <td className="px-4 py-3 text-gray-600 text-sm">{gate.appliesToLabel}</td>

      {/* Status Toggle */}
      <td className="px-4 py-3 text-center">
        <button
          onClick={onToggleStatus}
          disabled={isToggling}
          className="inline-flex items-center gap-1.5 disabled:opacity-50"
          aria-label={`Toggle gate ${gate.name}`}
        >
          {gate.isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              Off
            </span>
          )}
        </button>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 text-right">
        <button className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors">
          Edit
        </button>
      </td>
    </tr>
  );
}
