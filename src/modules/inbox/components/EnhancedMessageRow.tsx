'use client';

import React from 'react';
import type { InboxItem } from '@/modules/inbox/inbox.types';

interface EnhancedMessageRowProps {
  item: InboxItem;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (id: string) => void;
  onCheck: (id: string, checked: boolean) => void;
  onArchive: (id: string) => void;
  onDraftReply: (id: string) => void;
  onDelegate: (id: string) => void;
  onSnooze: (id: string) => void;
}

// --- Helpers ---

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getUrgencyBadgeClasses(score: number): string {
  if (score <= 3) return 'bg-green-100 text-green-700';
  if (score <= 6) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

// --- Channel Icons (16x16 SVGs) ---

function EmailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
      aria-hidden="true"
    >
      <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1.5 4L8 9.5L14.5 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
      aria-hidden="true"
    >
      <rect x="3" y="1" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="8" cy="12" r="0.75" fill="currentColor" />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
      aria-hidden="true"
    >
      <path
        d="M5.5 2a1.5 1.5 0 0 0 0 3H7V2H5.5ZM7 7H2v2h5V7ZM9 7v5.5a1.5 1.5 0 0 0 3 0V7H9ZM9 2v5h2V3.5A1.5 1.5 0 0 0 9 2ZM2 9v1.5a1.5 1.5 0 0 0 3 0V9H2ZM14 7h-1.5a1.5 1.5 0 0 0 0 3H14V7ZM9 14h5v-2H9v2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
      aria-hidden="true"
    >
      <path
        d="M3.5 2C3.5 2 2 3.5 2 6c0 4.5 4 8 8 8 2.5 0 4-1.5 4-1.5l-2-2.5S10.5 11 9.5 11c-2.5 0-4.5-2-4.5-4.5C5 5.5 6 4 6 4L3.5 2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DefaultChannelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-gray-400"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case 'EMAIL':
      return <EmailIcon />;
    case 'SMS':
      return <SmsIcon />;
    case 'SLACK':
      return <SlackIcon />;
    case 'VOICE':
      return <VoiceIcon />;
    default:
      return <DefaultChannelIcon />;
  }
}

// --- Component ---

export function EnhancedMessageRow({
  item,
  isSelected,
  isChecked,
  onSelect,
  onCheck,
  onArchive,
  onDraftReply,
  onDelegate,
  onSnooze,
}: EnhancedMessageRowProps) {
  const { message, senderName, entityName, isRead, senderContact } = item;
  const urgencyScore = message.triageScore;
  const attachmentCount = message.attachments?.length ?? 0;
  const tags = senderContact?.tags ?? [];
  const preview = message.body?.substring(0, 120) ?? '';
  const displayText = message.subject ?? preview;

  const containerBase =
    'group relative px-4 py-3 cursor-pointer transition-colors border-b border-gray-100';
  const selectedClasses = isSelected
    ? 'bg-blue-50 border-l-2 border-blue-500'
    : '';
  const readClasses = !isRead
    ? 'bg-white font-medium'
    : 'bg-gray-50/50';
  const hoverClasses = 'hover:bg-gray-50';

  function handleContainerClick() {
    onSelect(message.id);
  }

  function handleCheckboxChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    onCheck(message.id, e.target.checked);
  }

  function handleCheckboxClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    onArchive(message.id);
  }

  function handleDraftReply(e: React.MouseEvent) {
    e.stopPropagation();
    onDraftReply(message.id);
  }

  function handleDelegate(e: React.MouseEvent) {
    e.stopPropagation();
    onDelegate(message.id);
  }

  function handleSnooze(e: React.MouseEvent) {
    e.stopPropagation();
    onSnooze(message.id);
  }

  return (
    <div
      className={`${containerBase} ${selectedClasses} ${readClasses} ${hoverClasses}`}
      onClick={handleContainerClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(message.id);
        }
      }}
      data-selected={isSelected}
    >
      {/* Row: checkbox + channel icon + urgency badge */}
      <div className="flex items-center gap-2 mb-1">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleCheckboxChange}
          onClick={handleCheckboxClick}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
          aria-label={`Select message from ${senderName}`}
        />

        {/* Channel icon */}
        <span className="shrink-0">
          <ChannelIcon channel={message.channel} />
        </span>

        {/* Urgency badge */}
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadgeClasses(urgencyScore)}`}
          aria-label={`Urgency score: ${urgencyScore}`}
        >
          {urgencyScore}
        </span>
      </div>

      {/* Row: sender name + time + entity */}
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-sm font-medium text-gray-900 truncate min-w-0">
          {senderName}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-gray-400">
            {timeAgo(message.createdAt)}
          </span>
          {entityName && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {entityName}
            </span>
          )}
        </div>
      </div>

      {/* Row: subject / preview */}
      <div className="text-sm text-gray-600 truncate mb-1">
        {displayText}
      </div>

      {/* Row: attachments + tags */}
      {(attachmentCount > 0 || tags.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {attachmentCount > 0 && (
            <span className="text-xs text-gray-400">
              {'\uD83D\uDCCE'} {attachmentCount} attachment{attachmentCount !== 1 ? 's' : ''}
            </span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Quick actions (visible on hover) */}
      <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={handleArchive}
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-green-50 hover:border-green-300 hover:text-green-700 text-gray-600 transition-colors"
          aria-label="Archive message"
        >
          {'\u2713'} Archive
        </button>
        <button
          type="button"
          onClick={handleDraftReply}
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-gray-600 transition-colors"
          aria-label="Draft reply"
        >
          {'\u270F'} Draft
        </button>
        <button
          type="button"
          onClick={handleDelegate}
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 text-gray-600 transition-colors"
          aria-label="Delegate message"
        >
          {'\u2192'} Delegate
        </button>
        <button
          type="button"
          onClick={handleSnooze}
          className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-700 text-gray-600 transition-colors"
          aria-label="Snooze message"
        >
          {'\u23F0'} Snooze
        </button>
      </div>
    </div>
  );
}
