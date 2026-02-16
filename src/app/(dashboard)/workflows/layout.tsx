'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ============================================================================
// Workflows Section Layout — Shared tabs for All Workflows, Approvals, Integrations
// ============================================================================

interface Tab {
  label: string;
  href: string;
  badge?: number;
}

export default function WorkflowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // In production, fetch approval count from API
  const [approvalCount] = useState(0);
  const pathname = usePathname();

  const tabs: Tab[] = [
    { label: 'All Workflows', href: '/workflows' },
    { label: 'Approvals', href: '/workflows?tab=approvals', badge: approvalCount },
    { label: 'Integrations', href: '/workflows?tab=integrations' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-semibold text-gray-900">Workflows</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 -mb-px">
            {tabs.map((tab) => {
              const isActive =
                pathname === tab.href ||
                (tab.href === '/workflows' && pathname === '/workflows');
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-orange-500 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </div>
    </div>
  );
}
