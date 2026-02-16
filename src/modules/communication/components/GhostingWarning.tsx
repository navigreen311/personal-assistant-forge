'use client';

interface GhostingWarningProps {
  isGhosting: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  daysSinceLastContact: number;
}

export default function GhostingWarning({ isGhosting, riskLevel, daysSinceLastContact }: GhostingWarningProps) {
  if (!isGhosting && riskLevel === 'LOW') return null;

  const colorMap = {
    LOW: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
    MEDIUM: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    HIGH: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  };

  const colors = colorMap[riskLevel];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      {isGhosting ? 'Ghosting' : 'At risk'} · {daysSinceLastContact}d silent
    </div>
  );
}
