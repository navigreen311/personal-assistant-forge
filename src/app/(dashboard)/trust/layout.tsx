'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const TABS = [
  { label: 'Overview', href: '/trust' },
  { label: 'Permissions', href: '/trust/permissions' },
  { label: 'Consent Log', href: '/trust/consent' },
  { label: 'Memory', href: '/trust/memory' },
];

export default function TrustLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Trust & Transparency
        </h1>

        <nav className="flex space-x-1 border-b border-gray-200 mb-6">
          {TABS.map((tab) => {
            const isActive =
              tab.href === '/trust'
                ? pathname === '/trust'
                : pathname?.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
