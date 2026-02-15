'use client';

import { useMemo } from 'react';
import type { SensitiveDataPreview } from '../types';

interface RedactionPreviewProps {
  preview: SensitiveDataPreview;
}

const SENSITIVITY_STYLES: Record<
  SensitiveDataPreview['sensitivityLevel'],
  { bg: string; text: string; border: string; label: string }
> = {
  LOW: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    label: 'Low',
  },
  MEDIUM: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-800 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
    label: 'Medium',
  },
  HIGH: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-800 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
    label: 'High',
  },
  CRITICAL: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    label: 'Critical',
  },
};

/**
 * Build an array of text segments from the original text, marking which
 * regions are redacted so they can be highlighted in the UI.
 */
function buildHighlightedSegments(
  text: string,
  redactions: SensitiveDataPreview['redactions']
): { text: string; redacted: boolean; type?: string }[] {
  if (redactions.length === 0) {
    return [{ text, redacted: false }];
  }

  const sorted = [...redactions].sort((a, b) => a.start - b.start);
  const segments: { text: string; redacted: boolean; type?: string }[] = [];
  let cursor = 0;

  for (const r of sorted) {
    // Add plain text before this redaction
    if (r.start > cursor) {
      segments.push({ text: text.slice(cursor, r.start), redacted: false });
    }

    // Add the redacted region (show original text but mark as redacted)
    segments.push({
      text: text.slice(r.start, r.end),
      redacted: true,
      type: r.type,
    });

    cursor = r.end;
  }

  // Remaining text after last redaction
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), redacted: false });
  }

  return segments;
}

export default function RedactionPreview({ preview }: RedactionPreviewProps) {
  const sensitivity = SENSITIVITY_STYLES[preview.sensitivityLevel];

  const highlightedSegments = useMemo(
    () => buildHighlightedSegments(preview.originalText, preview.redactions),
    [preview.originalText, preview.redactions]
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Redaction Preview
        </h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${sensitivity.bg} ${sensitivity.text}`}
        >
          {sensitivity.label} Sensitivity
        </span>
      </div>

      {/* Redaction summary */}
      <div className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
        {preview.redactions.length} redaction{preview.redactions.length !== 1 ? 's' : ''} detected
      </div>

      {/* Side-by-side panels */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Original text with highlighted regions */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Original
          </h4>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
            {highlightedSegments.map((segment, idx) =>
              segment.redacted ? (
                <mark
                  key={idx}
                  className="rounded bg-red-200 px-0.5 text-red-900 dark:bg-red-800/50 dark:text-red-300"
                  title={`Type: ${segment.type}`}
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={idx}>{segment.text}</span>
              )
            )}
          </div>
        </div>

        {/* Redacted text */}
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Redacted
          </h4>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
            {preview.redactedText}
          </div>
        </div>
      </div>

      {/* Redaction details */}
      {preview.redactions.length > 0 && (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Redaction Details
          </h4>
          <div className="flex flex-wrap gap-2">
            {preview.redactions.map((r, idx) => (
              <span
                key={idx}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${sensitivity.border} ${sensitivity.bg} ${sensitivity.text}`}
              >
                <span className="font-medium">{r.type}</span>
                <span className="opacity-60">
                  [{r.start}:{r.end}]
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
