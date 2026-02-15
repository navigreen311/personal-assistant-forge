'use client';

import { useState } from 'react';
import type { BlastRadius } from '@/shared/types';

interface NewDecisionFormProps {
  onSubmit: (data: {
    entityId: string;
    title: string;
    description: string;
    context: string;
    deadline?: string;
    stakeholders: string[];
    constraints: string[];
    blastRadius: BlastRadius;
  }) => void;
  onCancel: () => void;
  entityId?: string;
}

export default function NewDecisionForm({
  onSubmit,
  onCancel,
  entityId: defaultEntityId,
}: NewDecisionFormProps) {
  const [step, setStep] = useState(1);
  const [entityId, setEntityId] = useState(defaultEntityId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [deadline, setDeadline] = useState('');
  const [stakeholders, setStakeholders] = useState('');
  const [constraints, setConstraints] = useState('');
  const [blastRadius, setBlastRadius] = useState<BlastRadius>('MEDIUM');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      entityId,
      title,
      description,
      context,
      deadline: deadline || undefined,
      stakeholders: stakeholders
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      constraints: constraints
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      blastRadius,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              s <= step ? 'bg-blue-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>

          {!defaultEntityId && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Entity ID</label>
              <input
                type="text"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Decision Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="What decision needs to be made?"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Describe the decision in detail..."
              required
            />
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            disabled={!title || !description || !entityId}
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Context & Constraints</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="What background information is relevant?"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Constraints (one per line)
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Budget limit: $10,000&#10;Must be completed by Q2..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Blast Radius</label>
            <select
              value={blastRadius}
              onChange={(e) => setBlastRadius(e.target.value as BlastRadius)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="LOW">Low — Affects few people/systems</option>
              <option value="MEDIUM">Medium — Moderate reach</option>
              <option value="HIGH">High — Wide impact</option>
              <option value="CRITICAL">Critical — Organization-wide</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              disabled={!context}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Stakeholders & Timeline</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Stakeholders (comma-separated IDs)
            </label>
            <input
              type="text"
              value={stakeholders}
              onChange={(e) => setStakeholders(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="contact-1, contact-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Deadline (optional)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Back
            </button>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create Decision Brief
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
