'use client';

import { useRouter } from 'next/navigation';

type RecordType = 'invoice' | 'task' | 'calendar' | 'contact' | 'document' | 'workflow' | 'project' | 'default';

interface ShadowNavigationCardProps {
  title: string;
  description: string;
  deepLink: string;
  recordType: RecordType;
  recordId?: string;
}

function RecordIcon({ type }: { type: RecordType }) {
  const iconProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'shrink-0 text-indigo-500',
  };

  switch (type) {
    case 'invoice':
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      );
    case 'task':
      return (
        <svg {...iconProps}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...iconProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path d="M16 2v4" />
          <path d="M8 2v4" />
          <path d="M3 10h18" />
        </svg>
      );
    case 'contact':
      return (
        <svg {...iconProps}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case 'document':
      return (
        <svg {...iconProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case 'workflow':
      return (
        <svg {...iconProps}>
          <path d="M6 3v12" />
          <path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      );
    case 'project':
      return (
        <svg {...iconProps}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      );
  }
}

export function ShadowNavigationCard({
  title,
  description,
  deepLink,
  recordType,
  recordId,
}: ShadowNavigationCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(deepLink);
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left shadow-sm group max-w-sm"
      data-record-id={recordId}
    >
      <RecordIcon type={recordType} />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {title}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {description}
        </p>
      </div>
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-gray-400 group-hover:text-indigo-500 transition-colors"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
