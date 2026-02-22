'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GoalDefinition, GoalCorrectionSuggestion } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnhancedGoalsTabProps {
  entityId?: string;
  period?: string;
}

interface KeyResult {
  id: string;
  description: string;
  targetValue: number;
  currentValue: number;
  unit: string;
}

interface GoalFormData {
  title: string;
  entityId: string;
  framework: 'OKR' | 'SMART' | 'CUSTOM';
  targetValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  keyResults: KeyResult[];
  linkedTaskSearch: string;
  autoProgress: boolean;
}

type StatusFilter = 'ALL' | 'ON_TRACK' | 'BEHIND' | 'AT_RISK' | 'COMPLETE';

interface EnhancedGoal extends GoalDefinition {
  keyResults?: KeyResult[];
  correction?: GoalCorrectionSuggestion;
}
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'On Track', value: 'ON_TRACK' },
  { label: 'Behind', value: 'BEHIND' },
  { label: 'At Risk', value: 'AT_RISK' },
  { label: 'Completed', value: 'COMPLETE' },
];

const STATUS_PRIORITY: Record<string, number> = {
  AT_RISK: 0,
  BEHIND: 1,
  ON_TRACK: 2,
  COMPLETE: 3,
  ABANDONED: 4,
};

const STATUS_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  ON_TRACK: { bg: 'bg-green-100', bar: 'bg-green-500', text: 'text-green-800' },
  AT_RISK: { bg: 'bg-red-100', bar: 'bg-red-500', text: 'text-red-800' },
  BEHIND: { bg: 'bg-amber-100', bar: 'bg-amber-500', text: 'text-amber-800' },
  COMPLETE: { bg: 'bg-blue-100', bar: 'bg-blue-500', text: 'text-blue-800' },
  ABANDONED: { bg: 'bg-gray-100', bar: 'bg-gray-400', text: 'text-gray-600' },
};

const FRAMEWORK_BADGE: Record<string, string> = {
  OKR: 'bg-purple-100 text-purple-800',
  SMART: 'bg-indigo-100 text-indigo-800',
  CUSTOM: 'bg-gray-100 text-gray-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyForm(entityId?: string): GoalFormData {
  return {
    title: '',
    entityId: entityId ?? '',
    framework: 'OKR',
    targetValue: 100,
    unit: '%',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    keyResults: [],
    linkedTaskSearch: '',
    autoProgress: false,
  };
}

function generateId(): string {
  return `kr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function computeProgress(goal: EnhancedGoal): number {
  if (goal.targetValue <= 0) return 0;
  return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
}

function sortByStatusPriority(goals: EnhancedGoal[]): EnhancedGoal[] {
  return [...goals].sort(
    (a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99),
  );
}
// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="mt-4 h-2 w-full rounded-full bg-gray-100" />
          <div className="mt-3 flex gap-2">
            <div className="h-3 w-20 rounded bg-gray-100" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
      <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
      <h3 className="mt-4 text-sm font-semibold text-gray-900">No goals yet</h3>
      <p className="mt-1 text-sm text-gray-500">Create your first goal to start tracking progress.</p>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Goal Creation Form
// ---------------------------------------------------------------------------

interface GoalFormProps {
  entityId?: string;
  onCreated: () => void;
}

function GoalCreationForm({ entityId, onCreated }: GoalFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<GoalFormData>(() => createEmptyForm(entityId));
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof GoalFormData>(key: K, value: GoalFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addKeyResult() {
    setForm((prev) => ({
      ...prev,
      keyResults: [
        ...prev.keyResults,
        { id: generateId(), description: '', targetValue: 100, currentValue: 0, unit: '%' },
      ],
    }));
  }

  function updateKeyResult(id: string, field: keyof KeyResult, value: string | number) {
    setForm((prev) => ({
      ...prev,
      keyResults: prev.keyResults.map((kr) =>
        kr.id === id ? { ...kr, [field]: value } : kr,
      ),
    }));
  }

  function removeKeyResult(id: string) {
    setForm((prev) => ({
      ...prev,
      keyResults: prev.keyResults.filter((kr) => kr.id !== id),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.endDate) return;
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        entityId: form.entityId || undefined,
        framework: form.framework,
        targetValue: form.targetValue,
        unit: form.unit,
        startDate: form.startDate,
        endDate: form.endDate,
        keyResults: form.framework === 'OKR' ? form.keyResults : [],
        autoProgress: form.autoProgress,
      };
      await fetch('/api/analytics/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setForm(createEmptyForm(entityId));
      setExpanded(false);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="text-sm font-semibold text-gray-900">+ Create New Goal</span>
        <svg className={`h-5 w-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Goal Title</label>
              <input type="text" value={form.title} onChange={(e) => updateField('title', e.target.value)} placeholder="e.g. Increase monthly revenue" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Entity</label>
              <select value={form.entityId} onChange={(e) => updateField('entityId', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">-- Select Entity --</option>
                <option value="personal">Personal</option>
                <option value="work">Work</option>
                <option value="health">Health</option>
                <option value="finance">Finance</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select value={form.framework} onChange={(e) => updateField('framework', e.target.value as GoalFormData['framework'])} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="OKR">OKR</option>
                <option value="SMART">SMART</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Target</label>
              <input type="number" value={form.targetValue} onChange={(e) => updateField('targetValue', Number(e.target.value))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" min={0} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Unit</label>
              <input type="text" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} placeholder="%, USD, tasks..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => updateField('endDate', e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
            </div>
          </div>
          {form.framework === 'OKR' && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Key Results</span>
                <button type="button" onClick={addKeyResult} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">+ Add Key Result</button>
              </div>
              {form.keyResults.length === 0 && (
                <p className="text-xs text-gray-400">No key results added yet. Click above to add one.</p>
              )}
              <div className="space-y-3">
                {form.keyResults.map((kr) => (
                  <div key={kr.id} className="flex items-start gap-2">
                    <input type="text" value={kr.description} onChange={(e) => updateKeyResult(kr.id, 'description', e.target.value)} placeholder="Key result description" className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <input type="number" value={kr.targetValue} onChange={(e) => updateKeyResult(kr.id, 'targetValue', Number(e.target.value))} placeholder="Target" className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" min={0} />
                    <input type="text" value={kr.unit} onChange={(e) => updateKeyResult(kr.id, 'unit', e.target.value)} placeholder="Unit" className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <button type="button" onClick={() => removeKeyResult(kr.id)} className="mt-0.5 rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove key result">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Linked Tasks</label>
            <input type="text" value={form.linkedTaskSearch} onChange={(e) => updateField('linkedTaskSearch', e.target.value)} placeholder="Search tasks to link..." className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.autoProgress} onChange={(e) => updateField('autoProgress', e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Calculate progress from linked tasks/metrics
          </label>

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Goal'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
// ---------------------------------------------------------------------------
// Enhanced Goal Card
// ---------------------------------------------------------------------------

interface EnhancedGoalCardProps {
  goal: EnhancedGoal;
  onProgressUpdated: () => void;
}

function EnhancedGoalCard({ goal, onProgressUpdated }: EnhancedGoalCardProps) {
  const [editingProgress, setEditingProgress] = useState(false);
  const [krValues, setKrValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const progress = computeProgress(goal);
  const colors = STATUS_COLORS[goal.status] ?? STATUS_COLORS.ON_TRACK;
  const frameworkBadge = FRAMEWORK_BADGE[goal.framework] ?? FRAMEWORK_BADGE.CUSTOM;

  function initKrValues() {
    const values: Record<string, number> = {};
    (goal.keyResults ?? []).forEach((kr) => {
      values[kr.id] = kr.currentValue;
    });
    setKrValues(values);
  }

  function handleStartEdit() {
    initKrValues();
    setEditingProgress(true);
  }

  async function handleSaveProgress() {
    setSaving(true);
    try {
      await fetch(`/api/analytics/goals/${goal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyResults: krValues }),
      });
      setEditingProgress(false);
      onProgressUpdated();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {goal.entityId && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{goal.entityId}</span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${frameworkBadge}`}>{goal.framework}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>{goal.status.replace('_', ' ')}</span>
      </div>

      <h4 className="text-base font-bold text-gray-900">{goal.title}</h4>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">{goal.currentValue} / {goal.targetValue} {goal.unit}</span>
          <span className="font-semibold text-gray-900">{progress}%</span>
        </div>
        <div className="mt-1.5 h-2.5 w-full rounded-full bg-gray-100">
          <div className={`h-2.5 rounded-full transition-all ${colors.bar}`} style={{ width: `${progress}%` }} />
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400">Due {new Date(goal.endDate).toLocaleDateString()}</p>

      {goal.framework === 'OKR' && goal.keyResults && goal.keyResults.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Key Results</p>
          {goal.keyResults.map((kr) => {
            const krProgress = kr.targetValue > 0 ? Math.min(100, Math.round((kr.currentValue / kr.targetValue) * 100)) : 0;
            const krStatusIcon = krProgress >= 70 ? '✓' : krProgress >= 40 ? '●' : '!';
            const krStatusColor = krProgress >= 70 ? 'text-green-600' : krProgress >= 40 ? 'text-amber-500' : 'text-red-500';
            return (
              <div key={kr.id} className="flex items-center gap-2 text-sm">
                <span className={`text-xs font-bold ${krStatusColor}`}>{krStatusIcon}</span>
                <span className="flex-1 text-gray-700">{kr.description}</span>
                {editingProgress ? (
                  <input type="number" value={krValues[kr.id] ?? kr.currentValue} onChange={(e) => setKrValues((prev) => ({ ...prev, [kr.id]: Number(e.target.value) }))} className="w-16 rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none" min={0} />
                ) : (
                  <span className="text-xs text-gray-500">{kr.currentValue}/{kr.targetValue} {kr.unit}</span>
                )}
                <span className="text-xs font-medium text-gray-500">{krProgress}%</span>
              </div>
            );
          })}
        </div>
      )}
      {goal.correction && (
        <div className="mt-4 rounded-md bg-blue-50 p-3">
          <p className="text-xs font-medium text-blue-800">AI Insight</p>
          <p className="mt-0.5 text-xs text-blue-700">{goal.correction.suggestion}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {editingProgress ? (
          <>
            <button onClick={handleSaveProgress} disabled={saving} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Progress'}</button>
            <button onClick={() => setEditingProgress(false)} className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={handleStartEdit} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Update Progress</button>
            <button className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">Edit</button>
            <button className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200">View Linked Tasks ({goal.linkedTaskIds?.length ?? 0})</button>
          </>
        )}
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedGoalsTab({ entityId, period }: EnhancedGoalsTabProps) {
  const [goals, setGoals] = useState<EnhancedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>('ALL');

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (period) params.set('period', period);
      const res = await fetch(`/api/analytics/goals?${params.toString()}`);
      if (res.ok) {
        const data: EnhancedGoal[] = await res.json();
        setGoals(data);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, period]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const filtered = activeFilter === 'ALL' ? goals : goals.filter((g) => g.status === activeFilter);
  const sorted = sortByStatusPriority(filtered);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setActiveFilter(f.value)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${activeFilter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{f.label}</button>
        ))}
      </div>

      <GoalCreationForm entityId={entityId} onCreated={fetchGoals} />

      {loading ? (
        <LoadingSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4">
          {sorted.map((goal) => (
            <EnhancedGoalCard key={goal.id} goal={goal} onProgressUpdated={fetchGoals} />
          ))}
        </div>
      )}
    </div>
  );
}
