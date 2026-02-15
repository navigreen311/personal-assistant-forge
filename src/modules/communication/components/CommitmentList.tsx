'use client';

import type { Commitment } from '@/shared/types';

interface CommitmentListProps {
  commitments: Commitment[];
}

export default function CommitmentList({ commitments }: CommitmentListProps) {
  if (commitments.length === 0) {
    return <p className="text-sm text-gray-500">No commitments recorded.</p>;
  }

  return (
    <ul className="divide-y divide-gray-200">
      {commitments.map((c) => (
        <li key={c.id} className="py-2 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-900">{c.description}</p>
            <p className="text-xs text-gray-500">
              {c.direction === 'TO' ? 'Made to contact' : 'Made by contact'}
              {c.dueDate && ` · Due: ${new Date(c.dueDate).toLocaleDateString()}`}
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            c.status === 'FULFILLED'
              ? 'bg-green-100 text-green-700'
              : c.status === 'BROKEN'
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {c.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
