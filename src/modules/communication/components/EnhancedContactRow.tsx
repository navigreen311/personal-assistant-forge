'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnhancedContactRowProps {
  contact: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    entityId: string;
    entityName?: string;
    relationshipScore: number;
    lastTouch?: string;
    tags: string[];
    preferences?: {
      preferredChannel?: string;
      preferredTone?: string;
      tier?: string;
    };
    cadenceRule?: string;
    cadenceStatus?: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'NO_CADENCE';
    commitments?: Array<{ status: string }>;
  };
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onContactClick: (id: string) => void;
  onEmail?: (id: string) => void;
  onCall?: (id: string) => void;
  onSchedule?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tier tag color mapping */
const TIER_COLORS: Record<string, string> = {
  VIP: 'bg-purple-100 text-purple-700',
  Client: 'bg-green-100 text-green-700',
  Vendor: 'bg-orange-100 text-orange-700',
  Team: 'bg-blue-100 text-blue-700',
  Partner: 'bg-indigo-100 text-indigo-700',
  Personal: 'bg-gray-100 text-gray-700',
};

function getTierClasses(tag: string): string {
  // Case-insensitive lookup
  const key = Object.keys(TIER_COLORS).find(
    (k) => k.toLowerCase() === tag.toLowerCase(),
  );
  return key ? TIER_COLORS[key] : 'bg-gray-100 text-gray-600';
}

/** Score bar fill color based on thresholds */
function getScoreColor(score: number): string {
  if (score > 80) return 'bg-green-500';
  if (score > 50) return 'bg-blue-500';
  if (score > 30) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Format an ISO date string into a human-friendly relative time string */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return 'Unknown';

  const diffMs = now - then;
  if (diffMs < 0) return 'Just now';

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

/** Extract up to 2-letter initials from a name */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreBar({ score }: { score: number }) {
  const fillColor = getScoreColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fillColor}`}
          style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 w-6 text-right">
        {score}
      </span>
    </div>
  );
}

function CadenceStatusBadge({
  status,
}: {
  status: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'NO_CADENCE';
}) {
  switch (status) {
    case 'ON_TRACK':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700">
          <span aria-hidden>&#x2705;</span> On track
        </span>
      );
    case 'DUE_SOON':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
          <span aria-hidden>&#x26A0;&#xFE0F;</span> Due soon
        </span>
      );
    case 'OVERDUE':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
          <span aria-hidden>&#x1F534;</span> Overdue
        </span>
      );
    case 'NO_CADENCE':
    default:
      return (
        <button className="text-xs text-gray-400 hover:text-blue-600 underline">
          Set cadence
        </button>
      );
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EnhancedContactRow({
  contact,
  isSelected,
  onSelect,
  onContactClick,
  onEmail,
  onCall,
  onSchedule,
}: EnhancedContactRowProps) {
  const {
    id,
    name,
    email,
    phone,
    entityName,
    relationshipScore,
    lastTouch,
    tags,
    preferences,
    cadenceRule,
    cadenceStatus,
    commitments,
  } = contact;

  const openCommitments = commitments?.filter((c) => c.status === 'OPEN') ?? [];
  const tier = preferences?.tier;

  return (
    <div className="p-4 border-b border-gray-100 hover:bg-gray-50 flex items-start gap-3 transition-colors">
      {/* Checkbox (only when onSelect provided) */}
      {onSelect && (
        <div className="pt-1">
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onSelect(id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center justify-center text-sm shrink-0">
        {getInitials(name)}
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + Score bar + Cadence rule + Last touch */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onContactClick(id)}
            className="font-medium text-gray-900 cursor-pointer hover:text-blue-600 truncate text-sm text-left"
          >
            {name}
          </button>

          <ScoreBar score={relationshipScore} />

          {cadenceRule && (
            <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
              <span aria-hidden>&#x23F0;</span> {cadenceRule}
            </span>
          )}

          {lastTouch && (
            <span className="text-xs text-gray-400 shrink-0">
              {formatRelativeTime(lastTouch)}
            </span>
          )}
        </div>

        {/* Row 2: Contact info + Cadence status */}
        <div className="flex items-center gap-3 mt-0.5">
          {(email || phone) && (
            <span className="text-sm text-gray-500 truncate">
              {phone || email}
            </span>
          )}

          {cadenceStatus && (
            <CadenceStatusBadge status={cadenceStatus} />
          )}
        </div>

        {/* Row 3: Tags + Entity + Open commitments + Action buttons */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Tier badge */}
          {tier && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTierClasses(tier)}`}
            >
              {tier}
            </span>
          )}

          {/* Tags */}
          {tags.map((tag) => (
            <span
              key={tag}
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTierClasses(tag)}`}
            >
              {tag}
            </span>
          ))}

          {/* Entity pill */}
          {entityName && (
            <span className="bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
              <span aria-hidden>&#x1F4C1;</span> {entityName}
            </span>
          )}

          {/* Open commitments count */}
          {openCommitments.length > 0 && (
            <span className="text-xs text-blue-600">
              {openCommitments.length} open commitment{openCommitments.length !== 1 ? 's' : ''}
            </span>
          )}

          {/* Spacer to push actions to the right */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {onEmail && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEmail(id);
                }}
                title="Send email"
                className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
              >
                <span aria-hidden>&#x1F4E7;</span>
              </button>
            )}
            {onCall && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCall(id);
                }}
                title="Call"
                className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
              >
                <span aria-hidden>&#x1F4DE;</span>
              </button>
            )}
            {onSchedule && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(id);
                }}
                title="Schedule meeting"
                className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors"
              >
                <span aria-hidden>&#x1F4C5;</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
