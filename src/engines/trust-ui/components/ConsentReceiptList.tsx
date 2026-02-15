'use client';

import { useEffect, useState, useMemo } from 'react';
import type { ConsentReceipt } from '@/shared/types';
import ConsentReceiptCard from './ConsentReceiptCard';

interface ConsentReceiptListProps {
  userId: string;
}

export { ConsentReceiptList };

export default function ConsentReceiptList({ userId }: ConsentReceiptListProps) {
  const [receipts, setReceipts] = useState<ConsentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchReceipts() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/memory?userId=${encodeURIComponent(userId)}&type=consent-receipts`
        );

        if (!res.ok) {
          throw new Error(`Failed to fetch receipts: ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          setReceipts(data.data ?? data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReceipts();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filteredReceipts = useMemo(() => {
    if (!searchQuery.trim()) return receipts;

    const query = searchQuery.toLowerCase();
    return receipts.filter(
      (r) =>
        r.description.toLowerCase().includes(query) ||
        r.reason.toLowerCase().includes(query) ||
        r.impacted.some((i) => i.toLowerCase().includes(query))
    );
  }, [receipts, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading receipts...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-800 dark:text-red-400">
          Error loading receipts
        </p>
        <p className="mt-1 text-xs text-red-600 dark:text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Consent Receipts
        </h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {filteredReceipts.length} of {receipts.length} receipts
        </span>
      </div>

      {/* Search filter */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Filter by description, reason, or impacted..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
        />
      </div>

      {/* Scrollable list */}
      <div className="max-h-[600px] overflow-y-auto pr-1">
        {filteredReceipts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {searchQuery
                ? 'No receipts match your search.'
                : 'No consent receipts found.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredReceipts.map((receipt) => (
              <ConsentReceiptCard key={receipt.id} receipt={receipt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
