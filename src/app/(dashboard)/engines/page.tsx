'use client';

import Link from 'next/link';

const ENGINES = [
  {
    name: 'Triage Engine',
    href: '/engines/triage',
    description: 'Automatically classify and prioritize incoming communications using AI-powered analysis.',
    stat: '47 processed today',
    status: 'active' as const,
  },
  {
    name: 'Draft Engine',
    href: '/engines/draft',
    description: 'Generate context-aware response drafts with configurable tone and approval workflows.',
    stat: '23 drafts today',
    status: 'active' as const,
  },
  {
    name: 'Classification Engine',
    href: '/engines/classification',
    description: 'Deep entity classification, intent detection, and topic tagging for all incoming data.',
    stat: '156 classified today',
    status: 'active' as const,
  },
  {
    name: 'Scheduling Engine',
    href: '/engines/scheduling',
    description: 'Optimize calendar events, resolve conflicts, and protect focus time automatically.',
    stat: '12 events optimized',
    status: 'active' as const,
  },
  {
    name: 'Voice Engine',
    href: '/engines/voice',
    description: 'AI-powered voice calls with persona management, script routing, and quality monitoring.',
    stat: '8 calls today',
    status: 'active' as const,
  },
];

function StatusBadge({ status }: { status: 'active' | 'inactive' | 'error' }) {
  const colors = {
    active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    inactive: 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${colors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-400'}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function EnginesIndexPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {ENGINES.map((engine) => (
        <Link
          key={engine.href}
          href={engine.href}
          className="group block bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {engine.name}
            </h3>
            <StatusBadge status={engine.status} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{engine.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{engine.stat}</span>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
              Configure &rarr;
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
