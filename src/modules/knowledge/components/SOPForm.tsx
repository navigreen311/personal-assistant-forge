'use client';

import { useState } from 'react';
import type { SOPStep } from '@/modules/knowledge/types';

interface SOPFormProps {
  entityId: string;
  onCreated?: () => void;
  onCancel: () => void;
}

export default function SOPForm({ entityId, onCreated, onCancel }: SOPFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<SOPStep[]>([
    { order: 1, instruction: '', isOptional: false },
  ]);
  const [triggerConditions, setTriggerConditions] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);

  function addStep() {
    setSteps([...steps, { order: steps.length + 1, instruction: '', isOptional: false }]);
  }

  function updateStep(index: number, field: keyof SOPStep, value: unknown) {
    const updated = [...steps];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setSteps(updated);
  }

  function removeStep(index: number) {
    const updated = steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 }));
    setSteps(updated);
  }

  async function handleSubmit() {
    if (!title.trim() || steps.some((s) => !s.instruction.trim())) return;
    setLoading(true);
    try {
      await fetch('/api/knowledge/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId,
          title,
          description,
          steps,
          triggerConditions: triggerConditions.split(',').map((t) => t.trim()).filter(Boolean),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          status: 'DRAFT',
        }),
      });
      onCreated?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
      <h3 className="text-lg font-bold text-gray-900">Create SOP</h3>

      <div>
        <label className="text-sm font-medium text-gray-700">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
          rows={2}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Steps</label>
        <div className="space-y-2 mt-1">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-2 items-start">
              <span className="text-sm font-bold text-gray-500 mt-2">{step.order}.</span>
              <input
                type="text"
                value={step.instruction}
                onChange={(e) => updateStep(index, 'instruction', e.target.value)}
                placeholder="Step instruction"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <label className="flex items-center gap-1 text-xs text-gray-500 mt-2">
                <input
                  type="checkbox"
                  checked={step.isOptional}
                  onChange={(e) => updateStep(index, 'isOptional', e.target.checked)}
                />
                Optional
              </label>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(index)}
                  className="text-red-500 hover:text-red-700 mt-2"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button onClick={addStep} className="text-sm text-blue-600 hover:text-blue-800">
            + Add Step
          </button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Trigger Conditions (comma-separated)</label>
        <input
          type="text"
          value={triggerConditions}
          onChange={(e) => setTriggerConditions(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700">Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          disabled={loading || !title.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create SOP'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
