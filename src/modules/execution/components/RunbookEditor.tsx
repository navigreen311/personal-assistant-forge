'use client';

import { useState, useCallback, useRef } from 'react';
import type { Runbook, RunbookStep } from '@/modules/execution/types';
import type { BlastRadius } from '@/shared/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RunbookEditorProps {
  runbook?: Runbook;
  entityId: string;
  onSave?: (runbook: Runbook) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPES = [
  'SEND_EMAIL',
  'SEND_SMS',
  'CREATE_TASK',
  'UPDATE_RECORD',
  'DELETE_RECORD',
  'CALL_API',
  'RUN_WORKFLOW',
  'GENERATE_REPORT',
  'NOTIFY_TEAM',
  'SYNC_DATA',
] as const;

const BLAST_RADIUS_OPTIONS: BlastRadius[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const BUILT_IN_TEMPLATES: { label: string; steps: RunbookStep[] }[] = [
  {
    label: 'Daily Data Sync',
    steps: [
      {
        order: 1,
        name: 'Fetch external data',
        description: 'Pull latest data from external API',
        actionType: 'CALL_API',
        parameters: { endpoint: '', method: 'GET' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
        timeout: 30,
      },
      {
        order: 2,
        name: 'Sync records',
        description: 'Upsert fetched data into local store',
        actionType: 'SYNC_DATA',
        parameters: {},
        requiresApproval: false,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
        timeout: 60,
      },
      {
        order: 3,
        name: 'Notify team',
        description: 'Send summary notification',
        actionType: 'NOTIFY_TEAM',
        parameters: { channel: 'general' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: true,
        timeout: 10,
      },
    ],
  },
  {
    label: 'Weekly Report',
    steps: [
      {
        order: 1,
        name: 'Generate report',
        description: 'Compile weekly metrics report',
        actionType: 'GENERATE_REPORT',
        parameters: { reportType: 'weekly' },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
        timeout: 120,
      },
      {
        order: 2,
        name: 'Email report',
        description: 'Send report to stakeholders',
        actionType: 'SEND_EMAIL',
        parameters: { to: '', subject: 'Weekly Report' },
        requiresApproval: true,
        maxBlastRadius: 'MEDIUM',
        continueOnFailure: false,
        timeout: 30,
      },
    ],
  },
  {
    label: 'Contact Cleanup',
    steps: [
      {
        order: 1,
        name: 'Identify stale contacts',
        description: 'Find contacts with no activity in 90 days',
        actionType: 'CALL_API',
        parameters: { query: 'stale_contacts', daysInactive: 90 },
        requiresApproval: false,
        maxBlastRadius: 'LOW',
        continueOnFailure: false,
        timeout: 60,
      },
      {
        order: 2,
        name: 'Archive contacts',
        description: 'Move stale contacts to archive',
        actionType: 'UPDATE_RECORD',
        parameters: { status: 'archived' },
        requiresApproval: true,
        maxBlastRadius: 'HIGH',
        continueOnFailure: false,
        timeout: 120,
      },
    ],
  },
];

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every day at midnight', cron: '0 0 * * *' },
  { label: 'Every day at 9 AM', cron: '0 9 * * *' },
  { label: 'Every Monday at 9 AM', cron: '0 9 * * 1' },
  { label: 'Every 1st of the month', cron: '0 0 1 * *' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyStep(order: number): RunbookStep {
  return {
    order,
    name: '',
    description: '',
    actionType: ACTION_TYPES[0],
    parameters: {},
    requiresApproval: false,
    maxBlastRadius: 'LOW',
    continueOnFailure: false,
    timeout: 30,
  };
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Simple human-readable mappings for the most common patterns
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour at minute 0';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every day at midnight';
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Every day at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[Number(dayOfWeek)] ?? `day ${dayOfWeek}`;
    return `Every ${dayName} at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `On day ${dayOfMonth} of every month at ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  return `Cron: ${expr}`;
}

function generateId(): string {
  return `rb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RunbookEditor({ runbook, entityId, onSave, onCancel }: RunbookEditorProps) {
  // Form state
  const [name, setName] = useState(runbook?.name ?? '');
  const [description, setDescription] = useState(runbook?.description ?? '');
  const [steps, setSteps] = useState<RunbookStep[]>(
    runbook?.steps.length ? runbook.steps : [createEmptyStep(1)],
  );
  const [tags, setTags] = useState<string>(runbook?.tags.join(', ') ?? '');
  const [schedule, setSchedule] = useState(runbook?.schedule ?? '');
  const [isActive, setIsActive] = useState(runbook?.isActive ?? false);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // Drag state
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // --- Step management ---

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, createEmptyStep(prev.length + 1)]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })),
    );
  }, []);

  const updateStep = useCallback((index: number, patch: Partial<RunbookStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }, []);

  // --- Drag-and-drop ---

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    setSteps((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated.map((s, i) => ({ ...s, order: i + 1 }));
    });
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  // --- Template selection ---

  const applyTemplate = useCallback((templateLabel: string) => {
    const tpl = BUILT_IN_TEMPLATES.find((t) => t.label === templateLabel);
    if (tpl) {
      setSteps(tpl.steps.map((s, i) => ({ ...s, order: i + 1 })));
    }
    setSelectedTemplate(templateLabel);
  }, []);

  // --- Save ---

  const handleSave = useCallback(() => {
    const now = new Date();
    // Clean parameters: strip out parse error markers before saving
    const cleanedSteps = steps.map((s, i) => {
      const params = { ...s.parameters };
      if (params._parseError) {
        // Revert to empty object if the user left invalid JSON
        return { ...s, order: i + 1, parameters: {} };
      }
      return { ...s, order: i + 1 };
    });
    const assembled: Runbook = {
      id: runbook?.id ?? generateId(),
      name,
      description,
      entityId,
      schedule: schedule || undefined,
      steps: cleanedSteps,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      isActive,
      createdBy: runbook?.createdBy ?? 'current-user',
      createdAt: runbook?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: runbook?.lastRunAt,
      lastRunStatus: runbook?.lastRunStatus,
    };
    onSave?.(assembled);
  }, [runbook, name, description, entityId, schedule, steps, tags, isActive, onSave]);

  // --- JSON parameter helpers ---

  const [paramErrors, setParamErrors] = useState<Record<number, string>>({});

  const parseParams = (raw: string, stepIndex: number): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setParamErrors((prev) => ({ ...prev, [stepIndex]: 'Parameters must be a JSON object (not array or primitive)' }));
        return { _parseError: true, _rawInput: raw, _message: 'Must be a JSON object' };
      }
      // Clear any previous error for this step on successful parse
      setParamErrors((prev) => {
        const next = { ...prev };
        delete next[stepIndex];
        return next;
      });
      return parsed as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
      setParamErrors((prev) => ({ ...prev, [stepIndex]: message }));
      return { _parseError: true, _rawInput: raw, _message: message };
    }
  };

  const stringifyParams = (params: Record<string, unknown>): string => {
    // If the params contain a parse error marker, show the raw input
    // so the user can continue editing from where they left off
    if (params._parseError && typeof params._rawInput === 'string') {
      return params._rawInput;
    }
    return JSON.stringify(params, null, 2);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-4xl space-y-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {runbook ? 'Edit Runbook' : 'Create Runbook'}
        </h2>
        <div className="flex items-center gap-3">
          {/* Active toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>{isActive ? 'Active' : 'Inactive'}</span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Name & description */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Runbook name"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tags <span className="font-normal text-zinc-400">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="sync, daily, data"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this runbook do?"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Template selector */}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Start from template
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">-- Select a template --</option>
          {BUILT_IN_TEMPLATES.map((t) => (
            <option key={t.label} value={t.label}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Schedule configuration */}
      <fieldset className="rounded-md border border-zinc-200 p-4 dark:border-zinc-700">
        <legend className="px-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Schedule
        </legend>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                onClick={() => setSchedule(p.cron)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  schedule === p.cron
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              Cron expression
            </label>
            <input
              type="text"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 9 * * 1"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>
          {schedule && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {describeCron(schedule)}
            </p>
          )}
        </div>
      </fieldset>

      {/* Steps */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Steps</h3>
          <button
            type="button"
            onClick={addStep}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            + Add Step
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div
              key={`step-${idx}`}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className={`rounded-lg border p-4 transition-colors ${
                dragOverIndex === idx
                  ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                  : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
              }`}
            >
              {/* Step header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="cursor-grab text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    title="Drag to reorder"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="9" cy="6" r="1" />
                      <circle cx="15" cy="6" r="1" />
                      <circle cx="9" cy="12" r="1" />
                      <circle cx="15" cy="12" r="1" />
                      <circle cx="9" cy="18" r="1" />
                      <circle cx="15" cy="18" r="1" />
                    </svg>
                  </span>
                  <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                    Step {idx + 1}
                  </span>
                </div>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    title="Remove step"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Step fields */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Name
                  </label>
                  <input
                    type="text"
                    value={step.name}
                    onChange={(e) => updateStep(idx, { name: e.target.value })}
                    placeholder="Step name"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                  />
                </div>

                {/* Action type */}
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Action Type
                  </label>
                  <select
                    value={step.actionType}
                    onChange={(e) => updateStep(idx, { actionType: e.target.value })}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {ACTION_TYPES.map((at) => (
                      <option key={at} value={at}>
                        {at.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Description
                  </label>
                  <input
                    type="text"
                    value={step.description}
                    onChange={(e) => updateStep(idx, { description: e.target.value })}
                    placeholder="What does this step do?"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                  />
                </div>

                {/* Parameters JSON */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Parameters (JSON)
                  </label>
                  <textarea
                    value={stringifyParams(step.parameters)}
                    onChange={(e) => updateStep(idx, { parameters: parseParams(e.target.value, idx) })}
                    rows={3}
                    className={`w-full rounded-md border bg-white px-3 py-1.5 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 ${
                      paramErrors[idx]
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-red-500'
                        : 'border-zinc-300 focus:border-blue-500 focus:ring-blue-500 dark:border-zinc-600'
                    }`}
                  />
                  {paramErrors[idx] && (
                    <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                      Invalid JSON: {paramErrors[idx]}
                    </p>
                  )}
                </div>

                {/* Max blast radius */}
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Max Blast Radius
                  </label>
                  <select
                    value={step.maxBlastRadius}
                    onChange={(e) =>
                      updateStep(idx, { maxBlastRadius: e.target.value as BlastRadius })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    {BLAST_RADIUS_OPTIONS.map((br) => (
                      <option key={br} value={br}>
                        {br}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timeout */}
                <div>
                  <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={step.timeout ?? ''}
                    onChange={(e) =>
                      updateStep(idx, {
                        timeout: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="30"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                  />
                </div>

                {/* Toggles row */}
                <div className="flex flex-wrap gap-6 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={step.requiresApproval}
                      onChange={(e) => updateStep(idx, { requiresApproval: e.target.checked })}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
                    />
                    Requires Approval
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={step.continueOnFailure}
                      onChange={(e) => updateStep(idx, { continueOnFailure: e.target.checked })}
                      className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600"
                    />
                    Continue on Failure
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Preview / Simulate
        </button>

        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Runbook
          </button>
        </div>
      </div>
    </div>
  );
}
