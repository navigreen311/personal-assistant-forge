'use client';

import Link from 'next/link';

interface FollowUp {
  id: string;
  recipientName: string;
  subject: string;
  daysWaiting: number;
  messageId: string;
}

interface FollowUpTrackerProps {
  followUps: FollowUp[];
}

function getDaysBadgeClasses(daysWaiting: number): string {
  if (daysWaiting < 3) {
    return 'bg-green-100 text-green-700';
  } else if (daysWaiting <= 7) {
    return 'bg-amber-100 text-amber-700';
  } else {
    return 'bg-red-100 text-red-700';
  }
}

function handleNudge(followUp: FollowUp): void {
  console.log('Nudge follow-up:', {
    id: followUp.id,
    messageId: followUp.messageId,
    recipientName: followUp.recipientName,
    subject: followUp.subject,
  });
  // TODO: POST to /api/inbox/draft to generate follow-up message
}

export default function FollowUpTracker({ followUps }: FollowUpTrackerProps) {
  const visibleFollowUps = followUps.slice(0, 5);
  const hasFollowUps = followUps.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Clock icon */}
          <svg
            className="w-5 h-5 text-gray-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <span className="font-semibold text-gray-900">Awaiting Responses</span>
          {hasFollowUps && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
              {followUps.length}
            </span>
          )}
        </div>
        <Link
          href="/inbox?tab=follow-up"
          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all follow-ups &rarr;
        </Link>
      </div>

      {/* Follow-up list or empty state */}
      {hasFollowUps ? (
        <ul className="divide-y divide-gray-100">
          {visibleFollowUps.map((followUp) => (
            <li
              key={followUp.id}
              className="flex items-center justify-between py-2.5"
            >
              {/* Left: recipient and subject */}
              <div className="min-w-0 flex-1 mr-3">
                <p className="text-sm font-medium text-gray-900">
                  {followUp.recipientName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {followUp.subject}
                </p>
              </div>

              {/* Right: badge + nudge button */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getDaysBadgeClasses(followUp.daysWaiting)}`}
                >
                  {followUp.daysWaiting}d
                </span>
                <button
                  type="button"
                  onClick={() => handleNudge(followUp)}
                  className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition text-gray-600"
                >
                  Nudge
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <svg
            className="w-8 h-8 text-gray-300"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <p className="text-sm text-gray-400">No pending follow-ups</p>
        </div>
      )}
    </div>
  );
}
