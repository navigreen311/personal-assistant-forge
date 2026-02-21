'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (project: any) => void;
  preSelectedTemplate?: string;
}

interface EntityOption {
  id: string;
  name: string;
}

interface Milestone {
  name: string;
  date: string;
}

interface FormErrors {
  name?: string;
  entityId?: string;
}

// ---------------------------------------------------------------------------
// Template milestone presets
// ---------------------------------------------------------------------------

const TEMPLATE_MILESTONES: Record<string, string[]> = {
  'Client Onboarding': ['Discovery', 'Proposal', 'Contract', 'Kickoff', 'Delivery'],
  'Product Launch': ['Research', 'Design', 'Development', 'Testing', 'Launch'],
  'Compliance Review': ['Documentation', 'Submission', 'Inspection', 'Approval'],
  'Hiring Sprint': ['Job Post', 'Screening', 'Interviews', 'Offer', 'Onboarding'],
  'Deal Pipeline': ['Qualification', 'Proposal', 'Negotiation', 'Close'],
};

const TEMPLATE_OPTIONS = [
  'None',
  'Client Onboarding',
  'Product Launch',
  'Compliance Review',
  'Hiring Sprint',
  'Deal Pipeline',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewProjectModal({
  isOpen,
  onClose,
  onCreated,
  preSelectedTemplate,
}: NewProjectModalProps) {
  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityId, setEntityId] = useState('');
  const [status, setStatus] = useState('Active');
  const [targetDate, setTargetDate] = useState('');
  const [template, setTemplate] = useState(preSelectedTemplate ?? 'None');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Entities
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');

  // Fetch entities on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingEntities(true);
    fetch('/api/entities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEntities(
            json.data.map((e: { id: string; name: string }) => ({
              id: e.id,
              name: e.name,
            })),
          );
        }
      })
      .catch(() => {
        // Silently fail - user can still see empty dropdown
      })
      .finally(() => setLoadingEntities(false));
  }, [isOpen]);

  // Apply preSelectedTemplate on mount
  useEffect(() => {
    if (preSelectedTemplate && preSelectedTemplate !== 'None') {
      setTemplate(preSelectedTemplate);
      applyTemplate(preSelectedTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedTemplate]);

  // Apply template milestones
  const applyTemplate = (templateName: string) => {
    const presetNames = TEMPLATE_MILESTONES[templateName];
    if (presetNames) {
      setMilestones(presetNames.map((n) => ({ name: n, date: '' })));
    } else {
      setMilestones([]);
    }
  };

  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    applyTemplate(value);
  };

  // Tags
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

  // Milestones
  const addMilestone = () => {
    setMilestones([...milestones, { name: '', date: '' }]);
  };

  const updateMilestone = (index: number, field: keyof Milestone, value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!name.trim()) {
      newErrors.name = 'Project name is required.';
    }
    if (!entityId) {
      newErrors.entityId = 'Entity is required.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        entityId,
        status: status === 'On Hold' ? 'ON_HOLD' : 'ACTIVE',
        targetDate: targetDate || undefined,
        template: template !== 'None' ? template : undefined,
        tags: tags.length > 0 ? tags : undefined,
        milestones: milestones
          .filter((m) => m.name.trim())
          .map((m) => ({
            name: m.name.trim(),
            date: m.date || undefined,
          })),
      };

      const res = await fetch('/api/projects', {
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
        err instanceof Error ? err.message : 'Failed to create project',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setEntityId('');
      setStatus('Active');
      setTargetDate('');
      setTemplate(preSelectedTemplate ?? 'None');
      setTags([]);
      setTagInput('');
      setMilestones([]);
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen, preSelectedTemplate]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
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
        <h2 className="text-lg font-semibold text-gray-900 mb-5">New Project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Submit error */}
          {submitError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {submitError}
            </div>
          )}

          {/* 1. Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="e.g. Q1 Product Launch"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.name ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>

          {/* 2. Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional project description..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* 3. Entity */}
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
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.entityId ? 'border-red-400' : 'border-gray-300'
              }`}
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

          {/* 4. Status & 5. Target Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* 6. Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template
            </label>
            <select
              value={template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TEMPLATE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Tags */}
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
              }}
              placeholder="Type a tag and press Enter..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 8. Milestones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Milestones
              </label>
              <button
                type="button"
                onClick={addMilestone}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                + Add Milestone
              </button>
            </div>
            {milestones.length > 0 ? (
              <div className="space-y-2">
                {milestones.map((milestone, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={milestone.name}
                      onChange={(e) =>
                        updateMilestone(index, 'name', e.target.value)
                      }
                      placeholder={`Milestone ${index + 1}`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={milestone.date}
                      onChange={(e) =>
                        updateMilestone(index, 'date', e.target.value)
                      }
                      className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100"
                      title="Remove milestone"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">
                No milestones added yet. Select a template or add manually.
              </p>
            )}
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
              {isSubmitting ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
