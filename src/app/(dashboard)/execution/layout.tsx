'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ExecutionLayoutProps {
  children: ReactNode;
}

const TABS = [
  { label: 'Flight Control', href: '/execution', exact: true },
  { label: 'Operator Console', href: '/execution/console', exact: false },
  { label: 'Runbooks', href: '/execution/runbooks', exact: false },
  { label: 'Gates', href: '/execution/gates', exact: false },
] as const;

export default function ExecutionLayout({ children }: ExecutionLayoutProps) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const res = await fetch('/api/execution/queue?status=QUEUED&pageSize=1');
        if (res.ok) {
          const json = await res.json();
          setPendingCount(json.meta?.total ?? 0);
        }
      } catch {
        // Silently ignore fetch errors for badge count
      }
    }

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  function isActive(tab: (typeof TABS)[number]): boolean {
    if (tab.exact) return pathname === tab.href;
    return pathname.startsWith(tab.href);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Execution Layer
            </h1>
          </div>
          <nav className="flex space-x-1 -mb-px">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                  isActive(tab)
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.label === 'Flight Control' && pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
