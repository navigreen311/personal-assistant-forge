'use client';

import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  actor: 'AI' | 'HUMAN' | 'SYSTEM';
  description: string;
  timestamp: string;
  entityName: string;
  undoable: boolean;
}

interface ActivityFeedProps {
  activities: Activity[];
}

const ACTOR_STYLES: Record<Activity['actor'], { wrapper: string; label: string }> = {
  AI: {
    wrapper: 'bg-purple-100 text-purple-600',
    label: 'AI',
  },
  HUMAN: {
    wrapper: 'bg-blue-100 text-blue-600',
    label: 'Human',
  },
  SYSTEM: {
    wrapper: 'bg-gray-100 text-gray-600',
    label: 'System',
  },
};

function ActorIcon({ actor }: { actor: Activity['actor'] }) {
  if (actor === 'AI') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <path d="M10 2a1 1 0 00-1 1v.586l-1.707 1.707A1 1 0 007 6H4a1 1 0 00-1 1v6a1 1 0 001 1h3l3 3 3-3h3a1 1 0 001-1V7a1 1 0 00-1-1h-3a1 1 0 00-.293.293L11 7.586V3a1 1 0 00-1-1zM7.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" />
      </svg>
    );
  }

  if (actor === 'HUMAN') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
        aria-hidden="true"
      >
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
      </svg>
    );
  }

  // SYSTEM
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.251l-1.18 2.044a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L1.821 7.773a1 1 0 01-.205-1.251l1.18-2.044a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return timestamp;
  }
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
      {/* Header */}
      <h2 className="font-semibold text-gray-900 text-sm mb-3">Recent Activity</h2>

      {/* Feed */}
      {activities.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-400">No recent activity</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto -mr-1 pr-1">
          {/* Timeline track */}
          <div className="relative">
            {/* Vertical connector line */}
            <div
              className="absolute left-3.5 top-3 bottom-3 w-px bg-gray-100"
              aria-hidden="true"
            />

            <div className="divide-y divide-gray-50">
              {activities.map((activity) => {
                const styles = ACTOR_STYLES[activity.actor] ?? ACTOR_STYLES.SYSTEM;

                return (
                  <div key={activity.id} className="flex gap-3 py-2.5 relative">
                    {/* Actor icon */}
                    <div className="flex-shrink-0 z-10">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${styles.wrapper}`}
                        title={styles.label}
                        aria-label={`Actor: ${styles.label}`}
                      >
                        <ActorIcon actor={activity.actor} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      {/* Description */}
                      <p className="text-sm text-gray-700 leading-snug">
                        {activity.description}
                      </p>

                      {/* Bottom metadata row */}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {/* Timestamp */}
                        <span className="text-xs text-gray-400">
                          {formatTimestamp(activity.timestamp)}
                        </span>

                        {/* Entity tag */}
                        <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                          {activity.entityName}
                        </span>

                        {/* Undo link */}
                        {activity.undoable && (
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer transition-colors"
                            aria-label={`Undo: ${activity.description}`}
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
