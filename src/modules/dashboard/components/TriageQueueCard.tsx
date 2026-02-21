'use client';

import React from 'react';
import Link from 'next/link';

interface TriageQueueItem {
  id: string;
  channel: string;
  senderName: string;
  senderAvatar?: string;
  subject: string;
  preview: string;
  urgencyScore: number;
  timeAgo: string;
  entityName: string;
}

interface TriageQueueCardProps {
  items: TriageQueueItem[];
}

function InboxIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-gray-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"
      />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-blue-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-green-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15h3"
      />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-purple-400"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" />
    </svg>
  );
}

function CallIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-orange-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
      />
    </svg>
  );
}

function DefaultChannelIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel.toUpperCase()) {
    case 'EMAIL':
      return <EmailIcon />;
    case 'SMS':
      return <SmsIcon />;
    case 'SLACK':
      return <SlackIcon />;
    case 'CALL':
    case 'VOICE':
      return <CallIcon />;
    default:
      return <DefaultChannelIcon />;
  }
}

function UrgencyBadge({ score }: { score: number }) {
  let colorClasses = '';
  if (score >= 7) {
    colorClasses = 'bg-red-100 text-red-700';
  } else if (score >= 4) {
    colorClasses = 'bg-amber-100 text-amber-700';
  } else {
    colorClasses = 'bg-green-100 text-green-700';
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses}`}>
      {score}
    </span>
  );
}

export function TriageQueueCard({ items }: TriageQueueCardProps) {
  const displayItems = items.slice(0, 5);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <InboxIcon />
        <span className="font-semibold text-gray-900 flex-1">Needs Your Attention</span>
        <Link
          href="/inbox"
          className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          View inbox &rarr;
        </Link>
      </div>

      {/* Items list */}
      {displayItems.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          All caught up! No items need attention.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className="py-3 flex items-start gap-3 cursor-pointer hover:bg-gray-50 rounded group relative"
            >
              {/* Channel icon */}
              <div className="mt-0.5 flex-shrink-0">
                <ChannelIcon channel={item.channel} />
              </div>

              {/* Center content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <span className="font-medium text-sm text-gray-900 truncate">
                    {item.senderName}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto pl-2 flex-shrink-0">
                    {item.timeAgo}
                  </span>
                </div>
                <p className="text-sm text-gray-600 truncate">
                  {item.subject || item.preview}
                </p>
              </div>

              {/* Right side */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <UrgencyBadge score={item.urgencyScore} />
                <span className="text-xs text-gray-400">{item.entityName}</span>
              </div>

              {/* Hover quick actions */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-100 rounded shadow-sm px-1.5 py-1">
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="Archive"
                  className="text-gray-400 hover:text-green-600 transition-colors p-0.5 text-sm leading-none"
                >
                  ✓
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="Reply"
                  className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 text-sm leading-none"
                >
                  ↩
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="Delegate"
                  className="text-gray-400 hover:text-amber-600 transition-colors p-0.5 text-sm leading-none"
                >
                  →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-flex items-center justify-center bg-gray-100 text-gray-600 rounded-full w-5 h-5 text-xs font-medium">
            {items.length}
          </span>
          item{items.length !== 1 ? 's' : ''} waiting
        </span>
      </div>
    </div>
  );
}
