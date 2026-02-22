'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENGINE_TABS = [
  { label: 'Triage', href: '/engines/triage' },
  { label: 'Draft', href: '/engines/draft' },
  { label: 'Classification', href: '/engines/classification' },
  { label: 'Scheduling', href: '/engines/scheduling' },
  { label: 'Voice', href: '/engines/voice' },
];

export default function EnginesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Engines</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure and monitor your AI engine infrastructure.</p>
      </div>
      <nav className="flex gap-1 bg-white dark:bg-zinc-800 rounded-lg shadow-sm border border-gray-200 dark:border-zinc-700 p-1">
        {ENGINE_TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href}
              className={`flex-1 text-center py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-700'
              }`}
            >{tab.label}</Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
