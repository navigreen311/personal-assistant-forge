'use client';

import type { JournalEntry } from '@/modules/decisions/types';

interface JournalEntryCardProps {
  entry: JournalEntry;
  onClick?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
  REVIEWED_CORRECT: 'bg-green-100 text-green-800',
  REVIEWED_INCORRECT: 'bg-red-100 text-red-800',
  REVIEWED_MIXED: 'bg-purple-100 text-purple-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Pending Review',
  REVIEWED_CORRECT: 'Correct',
  REVIEWED_INCORRECT: 'Incorrect',
  REVIEWED_MIXED: 'Mixed',
};

export default function JournalEntryCard({ entry, onClick }: JournalEntryCardProps) {
  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[entry.status] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {STATUS_LABELS[entry.status] ?? entry.status}
        </span>
      </div>

      <p className="mt-1 text-sm text-gray-500 line-clamp-2">{entry.context}</p>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span>Chose: {entry.chosenOption}</span>
        <span>
          Review: {new Date(entry.reviewDate).toLocaleDateString()}
        </span>
      </div>

      {entry.lessonsLearned && (
        <div className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-700">
          <span className="font-medium">Lesson:</span> {entry.lessonsLearned}
        </div>
      )}
    </div>
  );
}
