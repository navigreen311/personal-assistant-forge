'use client';

import { useState, useCallback, useMemo } from 'react';
import type { CaptureItem, CaptureSource } from '@/modules/capture/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EnhancedCaptureTableProps {
  captures: CaptureItem[];
  entities?: { id: string; name: string }[];
  onApproveRouting: (id: string) => void;
  onArchive: (ids: string[]) => void;
  onReroute: (id: string) => void;
  onDelete?: (ids: string[]) => void;
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type StatusFilter = 'ALL' | 'PENDING' | 'PROCESSING' | 'ROUTED' | 'FAILED' | 'ARCHIVED';
type SourceFilter = CaptureSource | 'ALL';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a human-readable relative time string for a given date. */
function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Truncate a string to a maximum length, appending ellipsis if needed. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\u2026';
}

// ---------------------------------------------------------------------------
// Inline SVG Icons (16x16)
// ---------------------------------------------------------------------------

function MicrophoneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M8 1a2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 0 5 0v-3A2.5 2.5 0 0 0 8 1Z" />
      <path d="M4 6.5a.5.5 0 0 0-1 0v.025A4.505 4.505 0 0 0 7.5 11v2.5h-2a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-2V11a4.505 4.505 0 0 0 4.5-4.475V6.5a.5.5 0 0 0-1 0v.025A3.5 3.5 0 0 1 8.5 10h-1A3.5 3.5 0 0 1 4 6.525V6.5Z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793l6.674 3.717a.75.75 0 0 0 .652 0L15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z" />
      <path d="M15 6.954 8.978 10.31a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M6.5 2.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v.5h1A1.5 1.5 0 0 1 12 4.25v8.25a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12.5V4.25A1.5 1.5 0 0 1 5.5 2.75h1v-.5ZM7.75 3h.5v-.25a.25.25 0 0 0-.25-.25h-.5a.25.25 0 0 0 .25.25V3Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M6.5 2h3l.75 1.5H12.5A1.5 1.5 0 0 1 14 5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V5a1.5 1.5 0 0 1 1.5-1.5h2.25L6.5 2Z" />
      <path d="M8 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM5.657 3.07A5.5 5.5 0 0 0 2.55 7H4.1c.1-1.42.46-2.72 1.02-3.72l.537-.21ZM8 2.5c-.72 0-1.59 1.14-2.06 3H10.06c-.47-1.86-1.34-3-2.06-3ZM10.9 7c-.1-1.42-.46-2.72-1.02-3.72l.463-.21A5.5 5.5 0 0 1 13.45 7H10.9ZM2.5 8a5.5 5.5 0 0 0 3.157 4.93c-.56-1-. 92-2.3-1.02-3.72H2.55A5.48 5.48 0 0 0 2.5 8Zm3.44.5c.13 1.76.67 3.3 1.5 4.28.1.12.2.16.31.16h.5c.11 0 .21-.04.31-.16.83-.98 1.37-2.52 1.5-4.28H5.94Zm5.96.5h2.05A5.48 5.48 0 0 1 13.5 8a5.5 5.5 0 0 1-3.157 4.93c.56-1 .92-2.3 1.02-3.72Z" clipRule="evenodd" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M1 4.5A1.5 1.5 0 0 1 2.5 3h11A1.5 1.5 0 0 1 15 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 11.5v-7ZM4 6a.5.5 0 0 0 0 1h.5a.5.5 0 0 0 0-1H4Zm2.5 0a.5.5 0 0 0 0 1H7a.5.5 0 0 0 0-1h-.5ZM9 6a.5.5 0 0 0 0 1h.5a.5.5 0 0 0 0-1H9Zm2.5 0a.5.5 0 0 0 0 1H12a.5.5 0 0 0 0-1h-.5ZM4 8.5a.5.5 0 0 0 0 1h.5a.5.5 0 0 0 0-1H4Zm2.5 0a.5.5 0 0 0 0 1H7a.5.5 0 0 0 0-1h-.5ZM9 8.5a.5.5 0 0 0 0 1h.5a.5.5 0 0 0 0-1H9Zm2.5 0a.5.5 0 0 0 0 1H12a.5.5 0 0 0 0-1h-.5ZM5.5 10.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5Z" clipRule="evenodd" />
    </svg>
  );
}

function GenericCaptureIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4Zm1 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 3a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5Z" clipRule="evenodd" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.97 4.78a.75.75 0 0 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.47-2.47H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Source badge config
// ---------------------------------------------------------------------------

interface SourceConfig {
  icon: React.ReactNode;
  label: string;
  colors: string;
}

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  VOICE: { icon: <MicrophoneIcon />, label: 'Voice', colors: 'bg-purple-100 text-purple-700' },
  EMAIL_FORWARD: { icon: <EnvelopeIcon />, label: 'Email', colors: 'bg-blue-100 text-blue-700' },
  CLIPBOARD: { icon: <ClipboardIcon />, label: 'Clip', colors: 'bg-gray-100 text-gray-700' },
  SCREENSHOT: { icon: <CameraIcon />, label: 'Screen', colors: 'bg-cyan-100 text-cyan-700' },
  CAMERA_SCAN: { icon: <CameraIcon />, label: 'Screen', colors: 'bg-cyan-100 text-cyan-700' },
  BROWSER_EXTENSION: { icon: <GlobeIcon />, label: 'Web', colors: 'bg-green-100 text-green-700' },
  MANUAL: { icon: <KeyboardIcon />, label: 'Manual', colors: 'bg-gray-100 text-gray-600' },
};

function getSourceConfig(source: CaptureSource): SourceConfig {
  return SOURCE_CONFIG[source] ?? { icon: <GenericCaptureIcon />, label: source, colors: 'bg-gray-100 text-gray-600' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: CaptureSource }) {
  const cfg = getSourceConfig(source);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.colors}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: CaptureItem['status'] }) {
  switch (status) {
    case 'ROUTED':
      return (
        <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
          &#10003; Routed
        </span>
      );
    case 'PENDING':
      return (
        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
          &#9203; Review
        </span>
      );
    case 'PROCESSING':
      return (
        <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          &#128260; Processing
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
          &#10007; Failed
        </span>
      );
    case 'ARCHIVED':
      return (
        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
          Archived
        </span>
      );
    default:
      return (
        <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
          {status}
        </span>
      );
  }
}

function RoutingInfo({ capture }: { capture: CaptureItem }) {
  const routing = capture.routingResult;
  if (!routing) {
    return <span className="text-xs text-gray-400">--</span>;
  }

  const targetLabels: Record<string, string> = {
    TASK: 'Tasks',
    CONTACT: 'Contacts',
    NOTE: 'Knowledge',
    EVENT: 'Calendar',
    MESSAGE: 'Inbox',
    EXPENSE: 'Expenses',
  };

  const label = targetLabels[routing.targetType] ?? routing.targetType;

  const priorityColors: Record<string, string> = {
    P0: 'text-red-600 font-semibold',
    P1: 'text-amber-600 font-medium',
    P2: 'text-gray-500',
  };

  const priorityText = routing.priority ? ` ${routing.priority}` : '';
  const prioClass = routing.priority ? priorityColors[routing.priority] ?? 'text-gray-500' : 'text-gray-700';

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${prioClass}`}>
      <ArrowRightIcon />
      {label}
      {priorityText}
    </span>
  );
}

function EntityPill({
  entityId,
  entities,
}: {
  entityId?: string;
  entities?: { id: string; name: string }[];
}) {
  if (!entityId) {
    return <span className="text-xs text-gray-400">--</span>;
  }

  const entity = entities?.find((e) => e.id === entityId);
  const name = entity?.name ?? entityId;

  return (
    <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Content preview modal
// ---------------------------------------------------------------------------

function ContentPreviewModal({
  content,
  onClose,
}: {
  content: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close preview"
        >
          <XIcon />
        </button>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Capture Content</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{content}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedCaptureTable({
  captures,
  entities,
  onApproveRouting,
  onArchive,
  onReroute,
  onDelete,
}: EnhancedCaptureTableProps) {
  // -- State -----------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  // -- Filtering -------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return captures.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (sourceFilter !== 'ALL' && c.source !== sourceFilter) return false;
      if (q) {
        const content = (c.processedContent ?? c.rawContent).toLowerCase();
        if (!content.includes(q)) return false;
      }
      return true;
    });
  }, [captures, statusFilter, sourceFilter, searchQuery]);

  // -- Selection helpers -----------------------------------------------------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }, [filtered, selectedIds.size]);

  // -- Bulk actions ----------------------------------------------------------
  const handleBulkRoute = useCallback(() => {
    selectedIds.forEach((id) => onApproveRouting(id));
    setSelectedIds(new Set());
  }, [selectedIds, onApproveRouting]);

  const handleBulkDelete = useCallback(() => {
    if (onDelete) {
      onDelete(Array.from(selectedIds));
    }
    setSelectedIds(new Set());
  }, [selectedIds, onDelete]);

  const handleBulkTag = useCallback(() => {
    alert('Coming soon');
  }, []);

  const handleBulkSetEntity = useCallback(() => {
    alert('Coming soon');
  }, []);

  // -- Determine header checkbox state ----------------------------------------
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  // -- Render ----------------------------------------------------------------
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* ---- Filter Row ---- */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        {/* Search */}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchIcon />
          </span>
          <input
            type="text"
            placeholder="Search captures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PROCESSING">Processing</option>
          <option value="ROUTED">Routed</option>
          <option value="FAILED">Failed</option>
          <option value="ARCHIVED">Archived</option>
        </select>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">All Sources</option>
          <option value="VOICE">Voice</option>
          <option value="EMAIL_FORWARD">Email</option>
          <option value="CLIPBOARD">Clipboard</option>
          <option value="SCREENSHOT">Screenshot</option>
          <option value="CAMERA_SCAN">Camera Scan</option>
          <option value="MANUAL">Manual</option>
          <option value="BROWSER_EXTENSION">Web</option>
        </select>

        {/* Result count */}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} capture{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ---- Bulk Actions Bar ---- */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5">
          <span className="mr-1 text-sm font-medium text-blue-700">
            {selectedIds.size} selected
          </span>

          <button
            type="button"
            onClick={handleBulkRoute}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            <ArrowRightIcon />
            Route All
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
            >
              <TrashIcon />
              Delete
            </button>
          )}

          <button
            type="button"
            onClick={handleBulkTag}
            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
          >
            Tag
          </button>

          <button
            type="button"
            onClick={handleBulkSetEntity}
            className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1"
          >
            Set Entity
          </button>
        </div>
      )}

      {/* ---- Table ---- */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Content</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Routing</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((capture) => {
              const displayContent = capture.processedContent ?? capture.rawContent;
              const typeLabel = capture.routingResult?.targetType ?? capture.contentType;

              return (
                <tr
                  key={capture.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    selectedIds.has(capture.id) ? 'bg-blue-50/40' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(capture.id)}
                      onChange={() => toggleSelect(capture.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3">
                    <SourceBadge source={capture.source} />
                  </td>

                  {/* Content (truncated, clickable) */}
                  <td className="max-w-xs px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setPreviewContent(displayContent)}
                      className="truncate block max-w-[15rem] text-left text-gray-800 hover:text-blue-600 hover:underline focus:outline-none"
                      title={displayContent}
                    >
                      {truncate(displayContent, 60)}
                    </button>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3 text-gray-600">
                    <span className="rounded bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {typeLabel}
                    </span>
                  </td>

                  {/* Entity */}
                  <td className="px-4 py-3">
                    <EntityPill entityId={capture.entityId} entities={entities} />
                  </td>

                  {/* Routing */}
                  <td className="px-4 py-3">
                    <RoutingInfo capture={capture} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={capture.status} />
                  </td>

                  {/* Time */}
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {timeAgo(capture.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onReroute(capture.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 focus:outline-none"
                        title="Edit / Re-route"
                        aria-label="Edit capture"
                      >
                        <PencilIcon />
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete([capture.id])}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none"
                          title="Delete"
                          aria-label="Delete capture"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Empty state */}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-400">
                    No captures found. Use the Quick Capture bar above to start capturing.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Content Preview Modal ---- */}
      {previewContent !== null && (
        <ContentPreviewModal
          content={previewContent}
          onClose={() => setPreviewContent(null)}
        />
      )}
    </div>
  );
}
