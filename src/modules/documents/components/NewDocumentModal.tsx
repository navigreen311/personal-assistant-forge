'use client';

import { useState, useEffect } from 'react';
import type { DocumentTemplate, TemplateVariable } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (doc: any) => void;
}

type CreationMethod = 'template' | 'ai' | 'blank' | 'existing';

interface EntityOption {
  id: string;
  name: string;
  brandKit?: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl?: string;
    fontFamily?: string;
    toneGuide?: string;
  };
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ExistingDocument {
  id: string;
  title: string;
  type: string;
}

interface FormErrors {
  title?: string;
  entityId?: string;
  templateId?: string;
  aiPrompt?: string;
  existingDocId?: string;
}

type OutputFormat = 'DOCX' | 'PDF' | 'MARKDOWN' | 'HTML';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CREATION_METHODS: {
  key: CreationMethod;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'template',
    icon: '\uD83D\uDCC4',
    label: 'From Template',
    description: 'Pick a template and fill in the variables',
  },
  {
    key: 'ai',
    icon: '\u2728',
    label: 'AI Generate',
    description: 'Describe what you need and AI creates it',
  },
  {
    key: 'blank',
    icon: '\uD83D\uDCDD',
    label: 'Blank Document',
    description: 'Start from scratch',
  },
  {
    key: 'existing',
    icon: '\uD83D\uDCCE',
    label: 'From Existing',
    description: 'Duplicate and modify an existing doc',
  },
];

const OUTPUT_FORMATS: OutputFormat[] = ['DOCX', 'PDF', 'MARKDOWN', 'HTML'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewDocumentModal({
  isOpen,
  onClose,
  onCreated,
}: NewDocumentModalProps) {
  // Step management
  const [method, setMethod] = useState<CreationMethod | null>(null);

  // Common fields
  const [title, setTitle] = useState('');
  const [entityId, setEntityId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('MARKDOWN');
  const [brandKitMode, setBrandKitMode] = useState<'default' | 'custom'>('default');
  const [customBrandKit, setCustomBrandKit] = useState({
    primaryColor: '#3b82f6',
    secondaryColor: '#6b7280',
    logoUrl: '',
    fontFamily: 'Arial, sans-serif',
    toneGuide: '',
  });

  // Method-specific: Template
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  // Method-specific: AI Generate
  const [aiPrompt, setAiPrompt] = useState('');

  // Method-specific: From Existing
  const [existingDocs, setExistingDocs] = useState<ExistingDocument[]>([]);
  const [loadingExistingDocs, setLoadingExistingDocs] = useState(false);
  const [existingDocId, setExistingDocId] = useState('');

  // Data sources
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  // Fetch entities on open
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
              brandKit: e.brandKit,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingEntities(false));
  }, [isOpen]);

  // Fetch projects on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingProjects(true);
    fetch('/api/projects')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setProjects(
            json.data.map((p: any) => ({
              id: p.id,
              name: p.name,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [isOpen]);

  // Fetch templates when "From Template" method is selected
  useEffect(() => {
    if (method !== 'template') return;
    setLoadingTemplates(true);
    fetch('/api/documents/templates')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setTemplates(json.data);
        } else if (Array.isArray(json)) {
          setTemplates(json);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [method]);

  // Fetch existing documents when "From Existing" method is selected
  useEffect(() => {
    if (method !== 'existing') return;
    setLoadingExistingDocs(true);
    fetch('/api/documents')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setExistingDocs(
            json.data.map((d: any) => ({
              id: d.id,
              title: d.title || d.name,
              type: d.type,
            })),
          );
        } else if (Array.isArray(json)) {
          setExistingDocs(
            json.map((d: any) => ({
              id: d.id,
              title: d.title || d.name,
              type: d.type,
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExistingDocs(false));
  }, [method]);

  // When a template is selected, initialise variable defaults
  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateVariables({});
      return;
    }
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (tpl) {
      const defaults: Record<string, string> = {};
      tpl.variables.forEach((v) => {
        defaults[v.name] = v.defaultValue ?? '';
      });
      setTemplateVariables(defaults);
    }
  }, [selectedTemplateId, templates]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const getSelectedEntityBrandKit = () => {
    const ent = entities.find((e) => e.id === entityId);
    return ent?.brandKit ?? null;
  };

  const resolveBrandKit = () => {
    if (brandKitMode === 'custom') {
      return {
        primaryColor: customBrandKit.primaryColor,
        secondaryColor: customBrandKit.secondaryColor,
        logoUrl: customBrandKit.logoUrl || undefined,
        fontFamily: customBrandKit.fontFamily || undefined,
        toneGuide: customBrandKit.toneGuide || undefined,
      };
    }
    const entityKit = getSelectedEntityBrandKit();
    return entityKit ?? undefined;
  };

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!title.trim()) newErrors.title = 'Document title is required.';
    if (!entityId) newErrors.entityId = 'Entity is required.';
    if (method === 'template' && !selectedTemplateId) {
      newErrors.templateId = 'Please select a template.';
    }
    if (method === 'ai' && !aiPrompt.trim()) {
      newErrors.aiPrompt = 'Please describe what you need.';
    }
    if (method === 'existing' && !existingDocId) {
      newErrors.existingDocId = 'Please select a document to duplicate.';
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
      const brandKit = resolveBrandKit();

      const body: Record<string, any> = {
        title: title.trim(),
        entityId,
        projectId: projectId || undefined,
        outputFormat,
        brandKit,
        method,
      };

      if (method === 'template') {
        body.templateId = selectedTemplateId;
        body.variables = templateVariables;
        body.citationsEnabled = false;
      } else if (method === 'ai') {
        body.aiPrompt = aiPrompt.trim();
      } else if (method === 'existing') {
        body.sourceDocumentId = existingDocId;
      }

      const res = await fetch('/api/documents', {
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
        err instanceof Error ? err.message : 'Failed to create document',
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
      setTitle('');
      setEntityId('');
      setProjectId('');
      setOutputFormat('MARKDOWN');
      setBrandKitMode('default');
      setCustomBrandKit({
        primaryColor: '#3b82f6',
        secondaryColor: '#6b7280',
        logoUrl: '',
        fontFamily: 'Arial, sans-serif',
        toneGuide: '',
      });
      setTemplates([]);
      setSelectedTemplateId('');
      setTemplateVariables({});
      setAiPrompt('');
      setExistingDocs([]);
      setExistingDocId('');
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

  const renderVariableInput = (v: TemplateVariable) => {
    const value = templateVariables[v.name] ?? '';
    const onChange = (val: string) =>
      setTemplateVariables((prev) => ({ ...prev, [v.name]: val }));

    if (v.type === 'SELECT' && v.options?.length) {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass()}
        >
          <option value="">Select...</option>
          {v.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (v.type === 'DATE') {
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass()}
        />
      );
    }

    if (v.type === 'NUMBER') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass()}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={v.defaultValue || `Enter ${v.label.toLowerCase()}...`}
        className={inputClass()}
      />
    );
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
          New Document
        </h2>

        {/* ----------------------------------------------------------------- */}
        {/* STEP 1: Choose creation method                                     */}
        {/* ----------------------------------------------------------------- */}
        {!method && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              How would you like to create your document?
            </p>
            <div className="grid grid-cols-2 gap-4">
              {CREATION_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className="bg-gray-50 hover:bg-blue-50 border-2 border-gray-200 hover:border-blue-300 rounded-xl p-6 cursor-pointer text-center transition-colors"
                >
                  <div className="text-3xl mb-2">{m.icon}</div>
                  <div className="font-semibold text-gray-900 mb-1">
                    {m.label}
                  </div>
                  <div className="text-xs text-gray-500">{m.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* STEP 2: Form (after method selection)                              */}
        {/* ----------------------------------------------------------------- */}
        {method && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Back button */}
            <button
              type="button"
              onClick={() => {
                setMethod(null);
                setErrors({});
                setSubmitError('');
              }}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to methods
            </button>

            {/* Method badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-gray-500">
                Method:
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                {CREATION_METHODS.find((m) => m.key === method)?.icon}{' '}
                {CREATION_METHODS.find((m) => m.key === method)?.label}
              </span>
            </div>

            {/* Submit error */}
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {submitError}
              </div>
            )}

            {/* ----- Common Fields ----- */}

            {/* Document Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors({ ...errors, title: undefined });
                }}
                placeholder="e.g. Q1 Financial Report"
                className={inputClass(errors.title)}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-600">{errors.title}</p>
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

            {/* Project (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputClass()}
              >
                <option value="">
                  {loadingProjects ? 'Loading projects...' : 'None'}
                </option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Output Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Output Format
              </label>
              <div className="flex gap-2">
                {OUTPUT_FORMATS.map((fmt) => (
                  <label
                    key={fmt}
                    className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg cursor-pointer text-sm transition-colors ${
                      outputFormat === fmt
                        ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700'
                        : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="outputFormat"
                      value={fmt}
                      checked={outputFormat === fmt}
                      onChange={() => setOutputFormat(fmt)}
                      className="sr-only"
                    />
                    {fmt}
                  </label>
                ))}
              </div>
            </div>

            {/* Brand Kit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand Kit
              </label>
              <div className="flex gap-2 mb-2">
                <label
                  className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    brandKitMode === 'default'
                      ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700'
                      : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="brandKitMode"
                    value="default"
                    checked={brandKitMode === 'default'}
                    onChange={() => setBrandKitMode('default')}
                    className="sr-only"
                  />
                  Use entity default
                </label>
                <label
                  className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    brandKitMode === 'custom'
                      ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700'
                      : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="brandKitMode"
                    value="custom"
                    checked={brandKitMode === 'custom'}
                    onChange={() => setBrandKitMode('custom')}
                    className="sr-only"
                  />
                  Custom...
                </label>
              </div>

              {brandKitMode === 'custom' && (
                <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Primary Color
                    </label>
                    <input
                      type="color"
                      value={customBrandKit.primaryColor}
                      onChange={(e) =>
                        setCustomBrandKit({ ...customBrandKit, primaryColor: e.target.value })
                      }
                      className="w-full h-9 border border-gray-300 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Secondary Color
                    </label>
                    <input
                      type="color"
                      value={customBrandKit.secondaryColor}
                      onChange={(e) =>
                        setCustomBrandKit({ ...customBrandKit, secondaryColor: e.target.value })
                      }
                      className="w-full h-9 border border-gray-300 rounded cursor-pointer"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Font Family
                    </label>
                    <select
                      value={customBrandKit.fontFamily}
                      onChange={(e) =>
                        setCustomBrandKit({ ...customBrandKit, fontFamily: e.target.value })
                      }
                      className={inputClass()}
                    >
                      <option value="Arial, sans-serif">Arial</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Courier New', monospace">Courier New</option>
                      <option value="'Helvetica Neue', sans-serif">Helvetica</option>
                      <option value="'Times New Roman', serif">Times New Roman</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Logo URL
                    </label>
                    <input
                      type="text"
                      value={customBrandKit.logoUrl}
                      onChange={(e) =>
                        setCustomBrandKit({ ...customBrandKit, logoUrl: e.target.value })
                      }
                      placeholder="https://..."
                      className={inputClass()}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ----- Method-specific content ----- */}

            {/* From Template: Template grid + variable fill */}
            {method === 'template' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Template <span className="text-red-500">*</span>
                  </label>
                  {loadingTemplates ? (
                    <p className="text-sm text-gray-400 italic">
                      Loading templates...
                    </p>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      No templates available.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setSelectedTemplateId(tpl.id);
                            if (errors.templateId) setErrors({ ...errors, templateId: undefined });
                          }}
                          className={`p-3 border-2 rounded-lg text-left transition-colors ${
                            selectedTemplateId === tpl.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="text-sm font-semibold text-gray-900">
                            {tpl.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {tpl.type} &middot; {tpl.category}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {tpl.variables.length} variable{tpl.variables.length !== 1 ? 's' : ''} &middot; v{tpl.version}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {errors.templateId && (
                    <p className="mt-1 text-xs text-red-600">{errors.templateId}</p>
                  )}
                </div>

                {/* Variable fill form */}
                {selectedTemplate && selectedTemplate.variables.length > 0 && (
                  <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700">
                      Template Variables
                    </h4>
                    {selectedTemplate.variables.map((v) => (
                      <div key={v.name}>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {v.label}
                          {v.required && (
                            <span className="text-red-500 ml-0.5">*</span>
                          )}
                        </label>
                        {renderVariableInput(v)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Generate: Large textarea */}
            {method === 'ai' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Describe what you need <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => {
                    setAiPrompt(e.target.value);
                    if (errors.aiPrompt) setErrors({ ...errors, aiPrompt: undefined });
                  }}
                  rows={6}
                  placeholder="e.g. Create a professional Statement of Work for a 3-month web development project. Include sections for scope, timeline, deliverables, payment terms, and acceptance criteria. The project involves building a customer portal with user authentication, dashboard, and reporting features."
                  className={inputClass(errors.aiPrompt) + ' resize-none'}
                />
                {errors.aiPrompt && (
                  <p className="mt-1 text-xs text-red-600">{errors.aiPrompt}</p>
                )}
              </div>
            )}

            {/* From Existing: Dropdown */}
            {method === 'existing' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duplicate from <span className="text-red-500">*</span>
                </label>
                <select
                  value={existingDocId}
                  onChange={(e) => {
                    setExistingDocId(e.target.value);
                    if (errors.existingDocId) setErrors({ ...errors, existingDocId: undefined });
                  }}
                  className={inputClass(errors.existingDocId)}
                >
                  <option value="">
                    {loadingExistingDocs
                      ? 'Loading documents...'
                      : 'Select an existing document'}
                  </option>
                  {existingDocs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title} ({doc.type})
                    </option>
                  ))}
                </select>
                {errors.existingDocId && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.existingDocId}
                  </p>
                )}
              </div>
            )}

            {/* ----- Actions ----- */}
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
                  ? 'Creating...'
                  : method === 'ai'
                    ? '\u2728 Generate'
                    : 'Create Document'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
