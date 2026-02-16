'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Journey', href: '/adoption' },
  { label: 'Playbooks', href: '/adoption/playbooks' },
  { label: 'Coaching', href: '/adoption/coaching' },
  { label: 'Impact', href: '/adoption/impact' },
];

export default function AdoptionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Adoption & Coaching</h1>
          <p className="text-gray-500 mt-1">Your journey to full AI delegation</p>
        </div>

        <nav className="flex gap-1 bg-white rounded-lg shadow-sm border border-gray-200 p-1 mb-6">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href || (tab.href !== '/adoption' && pathname?.startsWith(tab.href));
            const isExactHome = tab.href === '/adoption' && pathname === '/adoption';
            const active = isExactHome || isActive;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 text-center py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
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
