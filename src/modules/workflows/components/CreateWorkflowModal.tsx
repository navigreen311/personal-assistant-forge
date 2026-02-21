'use client';

import { useState, useEffect } from 'react';

// ============================================================================
// Create Workflow Modal
// Step 1: Choose creation method (template, blank, or AI describe)
// Step 2: Fill in details and submit
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workflow: any) => void;
}

type CreationMethod = 'template' | 'blank' | 'ai';

interface EntityOption {
  id: string;
  name: string;
}

interface FormErrors {
  name?: string;
  entityId?: string;
  aiPrompt?: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'inbox-zero',
    name: 'Inbox Zero',
    description: 'Auto-triage, draft, archive',
    icon: '\u2709\uFE0F',
    steps: 3,
  },
  {
    id: 'client-follow-up',
    name: 'Client Follow-up Cadence',
    description: 'Automated follow-ups',
    icon: '\uD83D\uDD04',
    steps: 4,
  },
  {
    id: 'invoice-follow-up',
    name: 'Invoice Follow-up',
    description: 'Auto-remind overdue payers',
    icon: '\uD83D\uDCB0',
    steps: 3,
  },
  {
    id: 'weekly-cfo-pack',
    name: 'Weekly CFO Pack',
    description: 'Auto-generate financial report',
    icon: '\uD83D\uDCC8',
    steps: 4,
  },
  {
    id: 'hiring-sprint',
    name: 'Hiring Sprint',
    description: 'Screen, schedule interviews',
    icon: '\uD83D\uDC65',
    steps: 5,
  },
  {
    id: 'board-prep',
    name: 'Board Prep',
    description: 'Auto-generate board deck',
    icon: '\uD83C\uDFAF',
    steps: 4,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CreateWorkflowModal({
  isOpen,
  onClose,
  onCreated,
}: CreateWorkflowModalProps) {
  // Step management
  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [description, setDescription] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');

  // Data sources
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;
    setLoadingEntities(true);
    fetch('/api/entities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEntities(
            json.data.map((e: any) => ({
              id: e.id,
              name: e.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEntities(false));
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // Template selection handler
  // -------------------------------------------------------------------------

  const handleTemplateSelect = (template: WorkflowTemplate) => {
    setSelectedTemplate(template);
    setMethod('template');
    setName(template.name);
    setDescription(template.description);
  };

  const handleBlankSelect = () => {
    setMethod('blank');
    setSelectedTemplate(null);
    setName('');
    setDescription('');
  };

  const handleAiSelect = () => {
    setMethod('ai');
    setSelectedTemplate(null);
    setName('');
    setDescription('');
    setAiPrompt('');
  };

  // -------------------------------------------------------------------------
  // Back to step 1
  // -------------------------------------------------------------------------

  const handleBack = () => {
    setMethod(null);
    setSelectedTemplate(null);
    setName('');
    setDescription('');
    setAiPrompt('');
    setErrors({});
    setSubmitError('');
  };

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (method === 'template' || method === 'blank') {
      if (!name.trim()) {
        newErrors.name = 'Workflow name is required.';
      }
    }

    if (!entityId) {
      newErrors.entityId = 'Entity is required.';
    }

    if (method === 'ai' && !aiPrompt.trim()) {
      newErrors.aiPrompt = 'Please describe what this workflow should do.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const body: Record<string, any> = {
        name: name.trim() || undefined,
        entityId,
        description: description.trim() || undefined,
      };

      if (method === 'template' && selectedTemplate) {
        body.templateId = selectedTemplate.id;
      }

      if (method === 'ai') {
        body.aiPrompt = aiPrompt.trim();
      }

      const res = await fetch('/api/workflows', {
        method: 'POST',
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
      onCreated?.(json.data ?? json);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create workflow',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Reset on close
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) {
      setMethod(null);
      setSelectedTemplate(null);
      setName('');
      setEntityId('');
      setDescription('');
      setAiPrompt('');
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  if (!isOpen) return null;

  const inputClass = (hasError?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      hasError ? 'border-red-400' : 'border-gray-300'
    }`;

  const getSubmitLabel = (): string => {
    if (isSubmitting) return 'Creating...';
    if (method === 'template') return 'Create from Template';
    if (method === 'ai') return 'Build Workflow';
    return 'Create Blank Workflow';
  };

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
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
          Create Workflow
        </h2>

        {/* ------------------------------------------------------------- */}
        {/* STEP 1: Choose creation method                                 */}
        {/* ------------------------------------------------------------- */}
        {!method && (
          <div>
            {/* Popular Templates */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Popular Templates
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {POPULAR_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className="bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-xl p-4 cursor-pointer text-left transition-colors"
                  >
                    <div className="text-2xl mb-2">{template.icon}</div>
                    <div className="font-semibold text-gray-900 text-sm mb-1">
                      {template.name}
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      {template.description}
                    </div>
                    <div className="text-xs text-gray-400">
                      {template.steps} steps
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* OR Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-gray-400 font-medium">OR</span>
              </div>
            </div>

            {/* Blank and AI options */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleBlankSelect}
                className="w-full bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-xl p-4 cursor-pointer text-left transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">{'\uD83D\uDCC4'}</span>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">
                    Blank Workflow
                  </div>
                  <div className="text-xs text-gray-500">
                    Build from scratch
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={handleAiSelect}
                className="w-full bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-xl p-4 cursor-pointer text-left transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">{'\u2728'}</span>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">
                    Describe it
                  </div>
                  <div className="text-xs text-gray-500">
                    AI builds the workflow from your prompt
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* STEP 2: Form (after method selection)                          */}
        {/* ------------------------------------------------------------- */}
        {method && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {/* Method badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-500">
                Method:
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                {method === 'template' && selectedTemplate
                  ? `${selectedTemplate.icon} ${selectedTemplate.name}`
                  : method === 'blank'
                    ? '\uD83D\uDCC4 Blank Workflow'
                    : '\u2728 AI Describe'}
              </span>
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {submitError}
              </div>
            )}

            {/* ---- Template Form ---- */}
            {method === 'template' && (
              <>
                {/* Workflow Name (pre-filled) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Workflow Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="e.g. Inbox Zero"
                    className={inputClass(errors.name)}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                  )}
                </div>

                {/* Entity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={entityId}
                    onChange={(e) => {
                      setEntityId(e.target.value);
                      if (errors.entityId) setErrors({ ...errors, entityId: undefined });
                    }}
                    className={inputClass(errors.entityId)}
                  >
                    <option value="">
                      {loadingEntities ? 'Loading entities...' : 'Select an entity'}
                    </option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                  {errors.entityId && (
                    <p className="mt-1 text-xs text-red-600">{errors.entityId}</p>
                  )}
                </div>

                {/* Description (pre-filled) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Workflow description..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </>
            )}

            {/* ---- Blank Form ---- */}
            {method === 'blank' && (
              <>
                {/* Workflow Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Workflow Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="e.g. My Custom Workflow"
                    className={inputClass(errors.name)}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-600">{errors.name}</p>
                  )}
                </div>

                {/* Entity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={entityId}
                    onChange={(e) => {
                      setEntityId(e.target.value);
                      if (errors.entityId) setErrors({ ...errors, entityId: undefined });
                    }}
                    className={inputClass(errors.entityId)}
                  >
                    <option value="">
                      {loadingEntities ? 'Loading entities...' : 'Select an entity'}
                    </option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                  {errors.entityId && (
                    <p className="mt-1 text-xs text-red-600">{errors.entityId}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="What does this workflow do?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </>
            )}

            {/* ---- AI Describe Form ---- */}
            {method === 'ai' && (
              <>
                {/* AI Prompt */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What should this workflow do? <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => {
                      setAiPrompt(e.target.value);
                      if (errors.aiPrompt) setErrors({ ...errors, aiPrompt: undefined });
                    }}
                    rows={6}
                    placeholder="Every day at 9am, check my inbox for emails from HCQC..."
                    className={inputClass(errors.aiPrompt) + ' resize-none'}
                  />
                  {errors.aiPrompt && (
                    <p className="mt-1 text-xs text-red-600">{errors.aiPrompt}</p>
                  )}
                </div>

                {/* Entity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={entityId}
                    onChange={(e) => {
                      setEntityId(e.target.value);
                      if (errors.entityId) setErrors({ ...errors, entityId: undefined });
                    }}
                    className={inputClass(errors.entityId)}
                  >
                    <option value="">
                      {loadingEntities ? 'Loading entities...' : 'Select an entity'}
                    </option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                  {errors.entityId && (
                    <p className="mt-1 text-xs text-red-600">{errors.entityId}</p>
                  )}
                </div>
              </>
            )}

            {/* ---- Actions ---- */}
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
              >
                {method === 'ai' && !isSubmitting && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                )}
                {getSubmitLabel()}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
