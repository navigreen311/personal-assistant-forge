'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Overview', href: '/analytics' },
  { label: 'Goals', href: '/analytics/goals' },
  { label: 'Habits', href: '/analytics/habits' },
  { label: 'AI Costs', href: '/analytics/costs' },
  { label: 'Calls', href: '/analytics/calls' },
];

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mb-6 text-sm text-gray-500">
          Time audits, productivity scores, goals, habits, and cost tracking
        </p>

        <nav className="mb-6 flex gap-1 border-b border-gray-200">
          {tabs.map((tab) => {
            const isActive =
              tab.href === '/analytics'
                ? pathname === '/analytics'
                : pathname?.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
