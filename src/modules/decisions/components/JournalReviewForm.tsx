'use client';

import { useState } from 'react';

interface JournalReviewFormProps {
  entryId: string;
  onSubmit: (data: {
    actualOutcomes: string[];
    status: string;
    lessonsLearned: string;
  }) => void;
  onCancel: () => void;
}

export default function JournalReviewForm({
  entryId: _entryId,
  onSubmit,
  onCancel,
}: JournalReviewFormProps) {
  const [outcomes, setOutcomes] = useState('');
  const [status, setStatus] = useState('REVIEWED_CORRECT');
  const [lessons, setLessons] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      actualOutcomes: outcomes
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      status,
      lessonsLearned: lessons,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="REVIEWED_CORRECT">Correct</option>
          <option value="REVIEWED_INCORRECT">Incorrect</option>
          <option value="REVIEWED_MIXED">Mixed</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Actual Outcomes (one per line)
        </label>
        <textarea
          value={outcomes}
          onChange={(e) => setOutcomes(e.target.value)}
          rows={4}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Describe what actually happened..."
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Lessons Learned</label>
        <textarea
          value={lessons}
          onChange={(e) => setLessons(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="What did you learn from this decision?"
          required
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Submit Review
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
