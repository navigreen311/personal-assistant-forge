'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Scorecard', href: '/ai-quality' },
  { label: 'Golden Tests', href: '/ai-quality/tests' },
  { label: 'Overrides', href: '/ai-quality/overrides' },
  { label: 'Bias', href: '/ai-quality/bias' },
  { label: 'Provenance', href: '/ai-quality/provenance' },
];

export default function AIQualityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">AI Quality</h1>
        <p className="mb-6 text-sm text-gray-500">
          Accuracy scorecards, golden tests, confidence, bias detection, and provenance
        </p>

        <nav className="mb-6 flex gap-1 border-b border-gray-200">
          {tabs.map((tab) => {
            const isActive =
              tab.href === '/ai-quality'
                ? pathname === '/ai-quality'
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
