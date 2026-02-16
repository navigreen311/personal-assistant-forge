'use client';

import type { PostIncidentReview } from '../types';

export default function PostIncidentReport({ review }: { review: PostIncidentReview }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Post-Incident Review</h3>

      <div>
        <h4 className="font-medium mb-2">Timeline</h4>
        <div className="space-y-2">
          {review.timeline.map((entry, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="text-gray-400 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</span>
              <span className="text-gray-700">{entry.event}</span>
              <span className="text-xs text-gray-400">({entry.actor})</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-1">Root Cause</h4>
        <p className="text-sm text-gray-700 p-3 bg-gray-50 rounded">{review.rootCause}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium mb-2 text-green-700">What Worked</h4>
          <ul className="space-y-1">
            {review.whatWorked.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-1">
                <span className="text-green-500 mt-0.5">✓</span> {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-medium mb-2 text-red-700">What Failed</h4>
          <ul className="space-y-1">
            {review.whatFailed.map((item, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-1">
                <span className="text-red-500 mt-0.5">✗</span> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {review.actionItems.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Action Items</h4>
          <div className="space-y-2">
            {review.actionItems.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 border rounded">
                <div className="text-sm">{item.title}</div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{item.assignee}</span>
                  <span>{new Date(item.dueDate).toLocaleDateString()}</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded">{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {review.lessonsLearned.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Lessons Learned</h4>
          <ul className="space-y-1">
            {review.lessonsLearned.map((lesson, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-1">
                <span className="text-blue-500 mt-0.5">💡</span> {lesson}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
