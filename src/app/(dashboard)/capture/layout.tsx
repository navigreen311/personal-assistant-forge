'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import VoiceCaptureButton from '@/modules/voice/components/VoiceCaptureButton';

const TABS = [
  { label: 'Inbox', href: '/capture' },
  { label: 'Rules', href: '/capture/rules' },
];

export default function CaptureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Capture</h1>
          </div>

          {/* Tab navigation */}
          <nav className="-mb-px flex gap-6">
            {TABS.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Floating voice capture button */}
      <VoiceCaptureButton />
    </div>
  );
}
