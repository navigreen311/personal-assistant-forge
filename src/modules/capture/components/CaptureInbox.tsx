'use client';

import { useState, useCallback } from 'react';
import type { CaptureItem, CaptureSource } from '@/modules/capture/types';

interface CaptureInboxProps {
  captures: CaptureItem[];
  onApproveRouting: (id: string) => void;
  onArchive: (ids: string[]) => void;
  onReroute: (id: string) => void;
}

type StatusFilter = 'ALL' | 'PENDING' | 'PROCESSING' | 'ROUTED' | 'FAILED' | 'ARCHIVED';

export default function CaptureInbox({
  captures,
  onApproveRouting,
  onArchive,
  onReroute,
}: CaptureInboxProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<CaptureSource | 'ALL'>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = captures.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (sourceFilter !== 'ALL' && c.source !== sourceFilter) return false;
    return true;
  });

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
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }, [filtered, selectedIds.size]);

  const handleBulkArchive = useCallback(() => {
    onArchive(Array.from(selectedIds));
    setSelectedIds(new Set());
  }, [selectedIds, onArchive]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
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
          onChange={(e) => setSourceFilter(e.target.value as CaptureSource | 'ALL')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="ALL">All Sources</option>
          <option value="VOICE">Voice</option>
          <option value="SCREENSHOT">Screenshot</option>
          <option value="CLIPBOARD">Clipboard</option>
          <option value="EMAIL_FORWARD">Email Forward</option>
          <option value="CAMERA_SCAN">Camera Scan</option>
          <option value="MANUAL">Manual</option>
        </select>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex gap-2">
            <span className="text-sm text-gray-500">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleBulkArchive}
              className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
            >
              Archive
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Content</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Routing</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((capture) => (
              <tr key={capture.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(capture.id)}
                    onChange={() => toggleSelect(capture.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <SourceBadge source={capture.source} />
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-800">
                  {capture.processedContent ?? capture.rawContent}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {capture.contentType}
                </td>
                <td className="px-4 py-3">
                  {capture.routingResult ? (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {capture.routingResult.targetType}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">--</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={capture.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {capture.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {capture.routingResult && capture.status === 'ROUTED' && (
                      <button
                        type="button"
                        onClick={() => onApproveRouting(capture.id)}
                        className="rounded px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onReroute(capture.id)}
                      className="rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Re-route
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No captures found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: CaptureSource }) {
  const colors: Record<string, string> = {
    VOICE: 'bg-purple-100 text-purple-700',
    SCREENSHOT: 'bg-cyan-100 text-cyan-700',
    CLIPBOARD: 'bg-gray-100 text-gray-700',
    EMAIL_FORWARD: 'bg-blue-100 text-blue-700',
    CAMERA_SCAN: 'bg-amber-100 text-amber-700',
    MANUAL: 'bg-gray-100 text-gray-600',
  };
  const colorClass = colors[source] ?? 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {source.replace('_', ' ')}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    PROCESSING: 'bg-blue-100 text-blue-700',
    ROUTED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-gray-100 text-gray-500',
  };
  const colorClass = colors[status] ?? 'bg-gray-100 text-gray-600';

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {status}
    </span>
  );
}
