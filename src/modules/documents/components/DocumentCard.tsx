'use client';

import { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentCardProps {
  document: {
    id: string;
    title: string;
    type: string;
    status: string;
    entityId: string;
    entityName?: string;
    templateId?: string;
    templateName?: string;
    version: number;
    content?: string;
    citations?: Array<{ id: string; source: string }>;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
  };
  onEdit?: (id: string) => void;
  onPreview?: (id: string) => void;
  onShare?: (id: string) => void;
  onSign?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    return `${diffMonths}mo ago`;
  } catch {
    return '';
  }
}

function typeBadgeClasses(type: string): string {
  switch (type.toUpperCase()) {
    case 'BRIEF':
      return 'bg-blue-100 text-blue-700';
    case 'MEMO':
      return 'bg-teal-100 text-teal-700';
    case 'SOP':
      return 'bg-purple-100 text-purple-700';
    case 'MINUTES':
      return 'bg-gray-100 text-gray-700';
    case 'INVOICE':
      return 'bg-green-100 text-green-700';
    case 'SOW':
      return 'bg-indigo-100 text-indigo-700';
    case 'PROPOSAL':
      return 'bg-amber-100 text-amber-700';
    case 'CONTRACT':
      return 'bg-rose-100 text-rose-700';
    case 'REPORT':
      return 'bg-cyan-100 text-cyan-700';
    case 'DECK':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function statusBadgeClasses(status: string): string {
  switch (status.toUpperCase()) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-600';
    case 'ACTIVE':
      return 'bg-blue-100 text-blue-700';
    case 'ARCHIVED':
      return 'bg-gray-100 text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentCard({
  document,
  onEdit,
  onPreview,
  onShare,
  onSign,
  onDuplicate,
  onArchive,
  onDelete,
}: DocumentCardProps) {
  const {
    id,
    title,
    type,
    status,
    entityName,
    templateName,
    version,
    citations,
    createdAt,
    updatedAt,
    createdBy,
  } = document;

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside
  useEffect(() => {
    if (!moreOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [moreOpen]);

  const createdDate = formatShortDate(createdAt);
  const relativeUpdated = formatRelativeTime(updatedAt);
  const citationCount = citations?.length ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition">
      {/* -- Header row ---------------------------------------------------- */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {/* Type badge */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase shrink-0 ${typeBadgeClasses(type)}`}
          >
            {type}
          </span>

          {/* Entity pill */}
          {entityName && (
            <span className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs font-medium shrink-0">
              {entityName}
            </span>
          )}

          {/* Status badge */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0 ${statusBadgeClasses(status)}`}
          >
            {status}
          </span>
        </div>

        {createdDate && (
          <span className="text-xs text-gray-400 shrink-0">{createdDate}</span>
        )}
      </div>

      {/* -- Title --------------------------------------------------------- */}
      <h3 className="mt-3 text-lg font-semibold text-gray-900 leading-snug">
        {title}
      </h3>

      {/* -- Template origin ----------------------------------------------- */}
      {templateName && (
        <p className="mt-1 text-sm text-gray-500">
          Created from: {templateName} template
        </p>
      )}

      {/* -- Meta row ------------------------------------------------------ */}
      <div className="mt-2 flex items-center gap-3 text-sm text-gray-500 flex-wrap">
        <span>Version: v{version}</span>
        <span className="text-gray-300">|</span>
        {relativeUpdated && (
          <>
            <span>Last edited: {relativeUpdated}</span>
            <span className="text-gray-300">|</span>
          </>
        )}
        {createdBy && <span>By: {createdBy}</span>}
      </div>

      {/* -- Citations ----------------------------------------------------- */}
      {citationCount > 0 && (
        <p className="mt-1 text-sm text-gray-500">
          Citations: {citationCount} source{citationCount !== 1 ? 's' : ''} linked
        </p>
      )}

      {/* -- Action buttons ------------------------------------------------ */}
      <div className="mt-4 flex items-center gap-3 relative">
        {onEdit && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(id);
            }}
          >
            &#9999;&#65039; Edit
          </button>
        )}

        {onPreview && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(id);
            }}
          >
            &#128065; Preview
          </button>
        )}

        {onShare && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onShare(id);
            }}
          >
            &#128228; Share
          </button>
        )}

        {onSign && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-blue-600"
            onClick={(e) => {
              e.stopPropagation();
              onSign(id);
            }}
          >
            &#9997; Sign
          </button>
        )}

        {/* More dropdown */}
        {(onDuplicate || onArchive || onDelete) && (
          <div ref={moreRef} className="relative">
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                setMoreOpen((prev) => !prev);
              }}
            >
              &#8943; More
            </button>

            {moreOpen && (
              <div className="absolute bottom-full mb-1 right-0 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                {onDuplicate && (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreOpen(false);
                      onDuplicate(id);
                    }}
                  >
                    Duplicate
                  </button>
                )}
                <button
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMoreOpen(false);
                    // Export action — placeholder, no callback prop required
                  }}
                >
                  Export
                </button>
                {onArchive && (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreOpen(false);
                      onArchive(id);
                    }}
                  >
                    Archive
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreOpen(false);
                      onDelete(id);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
