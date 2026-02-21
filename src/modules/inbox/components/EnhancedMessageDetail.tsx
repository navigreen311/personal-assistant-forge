'use client';

import React, { useState } from 'react';
import type { InboxItem, TriageResult, DraftResponse } from '@/modules/inbox/inbox.types';

interface EnhancedMessageDetailProps {
  item: InboxItem;
  onArchive: (id: string) => void;
  onStar: (id: string) => void;
  onFollowUp: (id: string, date: Date) => void;
  onSendDraft: (id: string) => void;
  onGenerateDraft: (id: string) => void;
  onCreateTask: (id: string) => void;
  onScheduleMeeting: (id: string) => void;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getUrgencyColor(score: number): { bg: string; text: string; border: string } {
  if (score <= 3) return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' };
  if (score <= 6) return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' };
  if (score <= 8) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' };
  return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
}

function getFlagColors(severity: 'LOW' | 'MEDIUM' | 'HIGH'): string {
  if (severity === 'HIGH') return 'bg-red-50 text-red-600 border border-red-200';
  if (severity === 'MEDIUM') return 'bg-orange-50 text-orange-600 border border-orange-200';
  return 'bg-green-50 text-green-600 border border-green-200';
}

function isSensitivityRestricted(sensitivity: string): boolean {
  return sensitivity === 'REGULATED' || sensitivity === 'RESTRICTED';
}

function getDeadlineFlag(triageResult: TriageResult): string | null {
  const deadlineFlag = triageResult.flags.find((f) => f.type === 'DEADLINE_MENTIONED');
  return deadlineFlag ? deadlineFlag.description : null;
}

function getSentimentLabel(triageResult: TriageResult): string {
  const sentimentFlag = triageResult.flags.find((f) => f.type === 'SENTIMENT_NEGATIVE');
  if (sentimentFlag) return 'Negative';
  return 'Neutral / Positive';
}

function AIAnalysisCard({ triageResult }: { triageResult: TriageResult }) {
  const deadlineText = getDeadlineFlag(triageResult);
  const sentimentLabel = getSentimentLabel(triageResult);

  return (
    <div className="bg-gray-50 rounded-lg p-4 mx-4 mt-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
        <span>✨</span>
        AI Analysis
      </h3>
      <ul className="space-y-1.5">
        <li className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">Intent:</span>{' '}
          {triageResult.intent.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
        </li>
        {deadlineText && (
          <li className="text-sm text-gray-600">
            <span className="font-medium text-gray-700">Deadline detected:</span> {deadlineText}
          </li>
        )}
        <li className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">Sentiment:</span> {sentimentLabel}
        </li>
        <li className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">Suggested action:</span>{' '}
          {triageResult.suggestedAction.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
        </li>
        {triageResult.flags.length > 0 && (
          <li className="text-sm text-gray-600">
            <span className="font-medium text-gray-700">Flags:</span>
            <span className="flex flex-wrap gap-1.5 mt-1">
              {triageResult.flags.map((flag, i) => (
                <span
                  key={i}
                  title={flag.description}
                  className={`text-xs px-2 py-0.5 rounded-full ${getFlagColors(flag.severity)}`}
                >
                  {flag.type.replace(/_/g, ' ')}
                </span>
              ))}
            </span>
          </li>
        )}
        {triageResult.reasoning && (
          <li className="text-sm text-gray-500 italic mt-1">{triageResult.reasoning}</li>
        )}
      </ul>
    </div>
  );
}

function AIDraftCard({
  draft,
  messageId,
  onSendDraft,
  onGenerateDraft,
}: {
  draft: DraftResponse | undefined;
  messageId: string;
  onSendDraft: (id: string) => void;
  onGenerateDraft: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft?.draftBody ?? '');

  return (
    <div className="bg-blue-50 rounded-lg p-4 mx-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
          <span>✨</span>
          AI Draft Reply
        </h3>
        <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-medium">
          Auto
        </span>
      </div>

      {draft ? (
        <>
          {isEditing ? (
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              className="w-full bg-white rounded p-3 text-sm text-gray-800 border border-blue-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={6}
            />
          ) : (
            <div className="bg-white rounded p-3 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {draft.draftBody}
            </div>
          )}

          {draft.complianceNotes.length > 0 && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <span className="font-medium">Compliance notes:</span>{' '}
              {draft.complianceNotes.join('; ')}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => onSendDraft(messageId)}
              className="bg-green-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Approve &amp; Send
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
            <button
              onClick={() => onGenerateDraft(messageId)}
              className="border border-gray-300 bg-white px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Regenerate
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-blue-700 mb-3">No draft generated yet.</p>
          <button
            onClick={() => onGenerateDraft(messageId)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            ✨ Generate Draft
          </button>
        </div>
      )}
    </div>
  );
}

export function EnhancedMessageDetail({
  item,
  onArchive,
  onStar,
  onFollowUp,
  onSendDraft,
  onGenerateDraft,
  onCreateTask,
  onScheduleMeeting,
}: EnhancedMessageDetailProps) {
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');

  const { message, triageResult, draft } = item;
  const urgencyColors = triageResult ? getUrgencyColor(triageResult.urgencyScore) : null;
  const sensitivityRestricted = isSensitivityRestricted(message.sensitivity);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 leading-snug flex-1 min-w-0">
            {message.subject ?? '(No subject)'}
          </h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onStar(message.id)}
              title={item.isStarred ? 'Unstar' : 'Star'}
              className={`p-1.5 rounded-md text-lg transition-colors hover:bg-gray-100 ${
                item.isStarred ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'
              }`}
            >
              {item.isStarred ? '★' : '☆'}
            </button>
            <button
              onClick={() => onArchive(message.id)}
              title="Archive"
              className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-base"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{item.senderName}</span>
          <span>·</span>
          <span className="uppercase text-xs tracking-wide">{message.channel}</span>
          <span>·</span>
          <span>{formatDate(message.createdAt)}</span>
        </div>

        {/* Entity + urgency row */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-sm text-gray-500">
            <span className="font-medium text-gray-600">Entity:</span> {item.entityName}
          </span>
          {triageResult && urgencyColors && (
            <span className="text-sm text-gray-500">
              <span className="font-medium text-gray-600">Urgency:</span>{' '}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${urgencyColors.bg} ${urgencyColors.text} ${urgencyColors.border}`}
              >
                {triageResult.urgencyScore}/10
              </span>
            </span>
          )}
        </div>

        {/* Intent + sensitivity row */}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {triageResult && (
            <span className="text-sm text-gray-500">
              <span className="font-medium text-gray-600">Intent:</span>{' '}
              <span className="text-gray-700">
                {triageResult.intent.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
              </span>
            </span>
          )}
          <span className="text-sm text-gray-500">
            <span className="font-medium text-gray-600">Sensitivity:</span>{' '}
            <span className={sensitivityRestricted ? 'text-amber-700 font-medium' : 'text-gray-700'}>
              {message.sensitivity}
            </span>
          </span>
        </div>

        {/* Sensitivity warning */}
        {sensitivityRestricted && (
          <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-800">
            <span>⚠</span>
            <span>
              This message is marked <strong>{message.sensitivity}</strong> and may require special handling.
            </span>
          </div>
        )}

        {/* Follow-up reminder banner */}
        {item.followUp && (
          <div className="mt-2 flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2 text-sm text-yellow-800">
            <span>🔔</span>
            <span>
              <strong>Follow-up:</strong> {item.followUp.reason} —{' '}
              {new Date(item.followUp.reminderAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* Message body */}
      <div className="p-4 border-b border-gray-100">
        <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap leading-relaxed">
          {message.body}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              📎 Attachments ({message.attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                >
                  <span>📄</span>
                  <span className="max-w-[160px] truncate">{attachment.filename}</span>
                  <span className="text-xs text-gray-400">{formatFileSize(attachment.size)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Analysis */}
      {triageResult && <AIAnalysisCard triageResult={triageResult} />}

      {/* AI Draft Reply */}
      <AIDraftCard
        draft={draft}
        messageId={message.id}
        onSendDraft={onSendDraft}
        onGenerateDraft={onGenerateDraft}
      />

      {/* Follow-up date picker */}
      {showFollowUpPicker && (
        <div className="flex items-center gap-2 px-4 pt-4">
          <input
            type="datetime-local"
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={() => {
              if (followUpDate) {
                onFollowUp(message.id, new Date(followUpDate));
                setShowFollowUpPicker(false);
                setFollowUpDate('');
              }
            }}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Set
          </button>
          <button
            onClick={() => {
              setShowFollowUpPicker(false);
              setFollowUpDate('');
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Spacer to push footer down */}
      <div className="flex-1" />

      {/* Secondary actions footer */}
      <div className="flex flex-wrap gap-2 p-4 border-t border-gray-200 flex-shrink-0">
        <button
          onClick={() => onCreateTask(message.id)}
          className="bg-white border border-gray-300 px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          📋 Create Task
        </button>
        <button
          onClick={() => onScheduleMeeting(message.id)}
          className="bg-white border border-gray-300 px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          📅 Schedule Meeting
        </button>
        <button
          onClick={() => setShowFollowUpPicker(!showFollowUpPicker)}
          className="bg-white border border-gray-300 px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          🔔 Follow Up
        </button>
      </div>
    </div>
  );
}
