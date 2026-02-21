'use client';

interface EnhancedDecisionCardProps {
  decision: {
    id: string;
    title: string;
    description?: string;
    entityId: string;
    entityName?: string;
    type: string;
    status: string;
    urgency?: string;
    deadline?: string;
    options?: Array<{
      id: string;
      label: string;
      score?: number;
      description?: string;
    }>;
    stakeholders?: Array<{ userId?: string; role?: string }>;
    recommendation?: { label: string; confidence: number };
    createdAt: string;
    updatedAt: string;
  };
  onClick?: (id: string) => void;
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

function urgencyClasses(urgency: string): string {
  switch (urgency.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'high':
      return 'bg-orange-100 text-orange-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    case 'low':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function urgencyEmoji(urgency: string): string {
  switch (urgency.toLowerCase()) {
    case 'critical':
      return '\uD83D\uDD34';
    case 'high':
      return '\uD83D\uDFE0';
    case 'medium':
      return '\uD83D\uDFE1';
    case 'low':
      return '\uD83D\uDFE2';
    default:
      return '';
  }
}

function statusProgress(status: string): { percent: number; color: string; label: string } {
  switch (status.toLowerCase()) {
    case 'open':
      return { percent: 25, color: 'bg-blue-500', label: 'Open' };
    case 'in_review':
      return { percent: 50, color: 'bg-blue-500', label: 'In Review' };
    case 'analysis':
      return { percent: 50, color: 'bg-blue-500', label: 'Analysis phase' };
    case 'decided':
      return { percent: 100, color: 'bg-green-500', label: 'Decided' };
    default:
      return { percent: 25, color: 'bg-blue-500', label: status };
  }
}

function confidenceColor(confidence: number): string {
  if (confidence > 70) return 'text-green-600';
  if (confidence > 40) return 'text-amber-600';
  return 'text-red-600';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnhancedDecisionCard({
  decision,
  onClick,
}: EnhancedDecisionCardProps) {
  const {
    id,
    title,
    description,
    entityName,
    type,
    status,
    urgency,
    deadline,
    options,
    stakeholders,
    recommendation,
    createdAt,
  } = decision;

  const statusInfo = statusProgress(status);
  const createdDate = formatShortDate(createdAt);
  const deadlineDate = deadline ? formatShortDate(deadline) : null;
  const stakeholderCount = stakeholders?.length ?? 0;
  const optionCount = options?.length ?? 0;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition cursor-pointer"
      onClick={() => onClick?.(id)}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {entityName && (
            <span className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs font-medium shrink-0">
              {entityName}
            </span>
          )}

          {urgency && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${urgencyClasses(urgency)}`}
            >
              {urgencyEmoji(urgency)} {urgency}
            </span>
          )}

          {type && (
            <span className="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs font-medium shrink-0">
              {type}
            </span>
          )}
        </div>

        {createdDate && (
          <span className="text-xs text-gray-400 shrink-0">{createdDate}</span>
        )}
      </div>

      {/* ── Title & description ────────────────────────────────────────── */}
      <h3 className="mt-3 text-lg font-semibold text-gray-900 leading-snug">
        {title}
      </h3>

      {description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
      )}

      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-gray-500 shrink-0">Status:</span>
        <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full ${statusInfo.color}`}
            style={{ width: `${statusInfo.percent}%` }}
          />
        </div>
        <span className="text-xs text-gray-600 font-medium shrink-0">
          {statusInfo.label}
        </span>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
        {deadlineDate && (
          <>
            <span>Deadline: {deadlineDate}</span>
            <span className="text-gray-300">|</span>
          </>
        )}
        {stakeholderCount > 0 && (
          <>
            <span>Stakeholders: {stakeholderCount}</span>
            <span className="text-gray-300">|</span>
          </>
        )}
        {optionCount > 0 && <span>Options: {optionCount}</span>}
      </div>

      {/* ── Recommendation ─────────────────────────────────────────────── */}
      {recommendation && (
        <div className="mt-4 bg-blue-50 rounded-lg p-3">
          <p className="text-sm font-medium text-gray-800">
            ✨ Recommended: {recommendation.label}
          </p>
          <p className={`text-xs mt-1 ${confidenceColor(recommendation.confidence)}`}>
            Confidence: {recommendation.confidence}%
          </p>
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(id);
          }}
        >
          View Analysis
        </button>
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          Add Input
        </button>
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          Decide
        </button>
      </div>
    </div>
  );
}
