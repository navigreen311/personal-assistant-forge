'use client';

import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConsentReceiptAction {
  id: string;
  description: string;
  actor: string;
  reason: string;
  ruleApplied?: string;
  dataSources?: string[];
  confidence?: number;
  blastRadius: string;
  reversible: string;
  cost?: number;
  tokenCount?: number;
  apiCalls?: number;
  timestamp: string;
  entityName?: string;
  status?: string;
}

interface ConsentReceiptPanelProps {
  action: ConsentReceiptAction;
  onRollback?: (id: string) => void;
  onViewRule?: (ruleId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

interface ColorMeta {
  text: string;
  bg: string;
}

const CONFIDENCE_THRESHOLDS: Array<{ min: number; meta: ColorMeta }> = [
  { min: 80, meta: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' } },
  { min: 60, meta: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' } },
  { min: 0, meta: { text: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' } },
];

const BLAST_RADIUS_COLORS: Record<string, ColorMeta> = {
  Low: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  Medium: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  High: { text: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
};

const REVERSIBLE_COLORS: Record<string, ColorMeta> = {
  Yes: { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  Partial: { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  No: { text: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConfidenceColor(confidence: number): ColorMeta {
  for (const threshold of CONFIDENCE_THRESHOLDS) {
    if (confidence >= threshold.min) return threshold.meta;
  }
  return CONFIDENCE_THRESHOLDS[CONFIDENCE_THRESHOLDS.length - 1].meta;
}

function getBlastRadiusColor(blastRadius: string): ColorMeta {
  // Match case-insensitively by normalising the first character
  const normalised = blastRadius.charAt(0).toUpperCase() + blastRadius.slice(1).toLowerCase();
  return BLAST_RADIUS_COLORS[normalised] ?? { text: 'text-gray-700 dark:text-gray-300', bg: '' };
}

function getReversibleColor(reversible: string): ColorMeta {
  // Extract the keyword before any parenthetical detail, e.g. "Yes (recall email within 30s)"
  const keyword = reversible.split(/\s*\(/)[0].trim();
  const normalised = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase();
  return REVERSIBLE_COLORS[normalised] ?? { text: 'text-gray-700 dark:text-gray-300', bg: '' };
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Build a plain-text audit string from the action object, suitable for
 * clipboard copying.
 */
function buildAuditText(action: ConsentReceiptAction): string {
  const lines: string[] = [
    `CONSENT RECEIPT — Action #${action.id}`,
    '',
    `Action: ${action.description}`,
    `Executed by: ${action.actor}`,
    `Reason: ${action.reason}`,
  ];

  if (action.ruleApplied) lines.push(`Rule applied: ${action.ruleApplied}`);
  if (action.dataSources && action.dataSources.length > 0) {
    lines.push(`Data sources: ${action.dataSources.join(', ')}`);
  }
  if (action.confidence !== undefined) {
    lines.push(`Confidence: ${action.confidence}%`);
  }

  lines.push(`Blast radius: ${action.blastRadius}`);
  lines.push(`Reversible: ${action.reversible}`);

  if (action.cost !== undefined) {
    const extras: string[] = [];
    if (action.tokenCount !== undefined) extras.push(`${action.tokenCount} tokens`);
    if (action.apiCalls !== undefined) extras.push(`${action.apiCalls} API calls`);
    const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
    lines.push(`Cost: ${formatCost(action.cost)}${suffix}`);
  }

  if (action.entityName) lines.push(`Entity: ${action.entityName}`);
  if (action.status) lines.push(`Status: ${action.status}`);
  lines.push(`Timestamp: ${formatTimestamp(action.timestamp)}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-2 py-1">
      <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}:</span>
      <span className="text-sm text-gray-900 dark:text-gray-100">{children}</span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: ColorMeta }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color.text} ${color.bg}`}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsentReceiptPanel({
  action,
  onRollback,
  onViewRule,
}: ConsentReceiptPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- Copy audit handler --------------------------------------------------

  const handleCopyAudit = useCallback(async () => {
    const text = buildAuditText(action);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing if clipboard is unavailable
    }
  }, [action]);

  // ---- Extract rule ID from ruleApplied ------------------------------------
  // Assumes format like 'Rule #12 "Auto follow-up..."' — extracts "12"

  const ruleId = action.ruleApplied?.match(/#(\S+)/)?.[1] ?? null;

  // ---- Confidence color ----------------------------------------------------

  const confidenceColor =
    action.confidence !== undefined ? getConfidenceColor(action.confidence) : null;

  // ---- Cost extras ---------------------------------------------------------

  const costExtras: string[] = [];
  if (action.tokenCount !== undefined) costExtras.push(`${action.tokenCount} tokens`);
  if (action.apiCalls !== undefined) costExtras.push(`${action.apiCalls} API calls`);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      {/* ---- Header row ---- */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Consent Receipt — Action #{action.id}
        </h4>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* ---- Collapsed summary ---- */}
      {!expanded && (
        <p className="mt-2 truncate text-sm text-gray-700 dark:text-gray-300">
          {action.description}
          {action.status && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              ({action.status})
            </span>
          )}
        </p>
      )}

      {/* ---- Expanded detail ---- */}
      {expanded && (
        <div className="mt-3 space-y-1">
          {/* Action */}
          <FieldRow label="Action">{action.description}</FieldRow>

          {/* Executed by */}
          <FieldRow label="Executed by">{action.actor}</FieldRow>

          {/* Reason */}
          <FieldRow label="Reason">{action.reason}</FieldRow>

          {/* Rule applied */}
          {action.ruleApplied && (
            <FieldRow label="Rule applied">{action.ruleApplied}</FieldRow>
          )}

          {/* Data sources */}
          {action.dataSources && action.dataSources.length > 0 && (
            <FieldRow label="Data sources">{action.dataSources.join(', ')}</FieldRow>
          )}

          {/* Confidence */}
          {action.confidence !== undefined && confidenceColor && (
            <FieldRow label="Confidence">
              <Badge text={`${action.confidence}%`} color={confidenceColor} />
            </FieldRow>
          )}

          {/* Blast radius */}
          <FieldRow label="Blast radius">
            <Badge text={action.blastRadius} color={getBlastRadiusColor(action.blastRadius)} />
          </FieldRow>

          {/* Reversible */}
          <FieldRow label="Reversible">
            <Badge text={action.reversible} color={getReversibleColor(action.reversible)} />
          </FieldRow>

          {/* Cost */}
          {action.cost !== undefined && (
            <FieldRow label="Cost">
              {formatCost(action.cost)}
              {costExtras.length > 0 && (
                <span className="ml-1 text-gray-500 dark:text-gray-400">
                  ({costExtras.join(', ')})
                </span>
              )}
            </FieldRow>
          )}

          {/* Entity */}
          {action.entityName && (
            <FieldRow label="Entity">{action.entityName}</FieldRow>
          )}

          {/* Status */}
          {action.status && (
            <FieldRow label="Status">{action.status}</FieldRow>
          )}

          {/* Timestamp */}
          <FieldRow label="Timestamp">{formatTimestamp(action.timestamp)}</FieldRow>

          {/* ---- Action buttons ---- */}
          <div className="flex flex-wrap gap-2 pt-3">
            {/* Rollback */}
            {onRollback && (
              <button
                type="button"
                onClick={() => onRollback(action.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Rollback
              </button>
            )}

            {/* Copy audit */}
            <button
              type="button"
              onClick={handleCopyAudit}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy audit'}
            </button>

            {/* View rule */}
            {onViewRule && ruleId && (
              <button
                type="button"
                onClick={() => onViewRule(ruleId)}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                View rule
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
