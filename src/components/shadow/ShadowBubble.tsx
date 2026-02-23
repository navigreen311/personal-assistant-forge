'use client';

interface ShadowBubbleProps {
  onClick: () => void;
  isExpanded: boolean;
  pendingCount: number;
  isSidekick: boolean;
  isSessionActive: boolean;
  isOnSettingsPage?: boolean;
}

export function ShadowBubble({
  onClick,
  isExpanded,
  pendingCount,
  isSidekick,
  isSessionActive,
  isOnSettingsPage,
}: ShadowBubbleProps) {
  return (
    <button
      onClick={onClick}
      className={`group fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:focus:ring-indigo-600 ${
        isExpanded
          ? 'bg-gray-600 hover:bg-gray-700'
          : 'bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
      }`}
      aria-label={isExpanded ? 'Close Shadow assistant' : 'Open Shadow assistant'}
    >
      {/* Robot icon */}
      <svg
        width={28}
        height={28}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-transform duration-200"
        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >
        {isExpanded ? (
          // Close/X icon when expanded
          <>
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </>
        ) : (
          // Robot icon when collapsed
          <>
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <circle cx="8" cy="16" r="1" fill="white" />
            <circle cx="16" cy="16" r="1" fill="white" />
          </>
        )}
      </svg>

      {/* Notification badge */}
      {pendingCount > 0 && !isExpanded && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900">
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}

      {/* Sidekick mode indicator (green dot) */}
      {isSidekick && !isExpanded && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-400 rounded-full ring-2 ring-white dark:ring-gray-900" />
      )}

      {/* Session active pulse */}
      {isSessionActive && !isExpanded && !isSidekick && (
        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-gray-900">
          <span className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-75" />
          <span className="absolute inset-0 bg-green-400 rounded-full" />
        </span>
      )}

      {/* Settings page tooltip */}
      {isOnSettingsPage && !isExpanded && (
        <span className="absolute -top-8 right-0 whitespace-nowrap text-xs bg-gray-900 text-white px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
          Need help with settings?
        </span>
      )}

      {/* Settings page "?" badge */}
      {isOnSettingsPage && !isExpanded && (
        <span className="absolute -top-1 -left-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-indigo-500 rounded-full ring-2 ring-white dark:ring-gray-900">
          ?
        </span>
      )}
    </button>
  );
}
