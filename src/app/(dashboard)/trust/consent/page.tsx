'use client';

import { useSession } from 'next-auth/react';
import { ConsentReceiptList } from '@/engines/trust-ui/components/ConsentReceiptList';

export default function ConsentPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? '';

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600 dark:border-zinc-600 dark:border-t-blue-400" />
        <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
          Loading...
        </span>
      </div>
    );
  }

  if (!session?.user?.id) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-900/50 dark:bg-yellow-900/20">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
          Please sign in to view consent receipts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        Consent Receipt Log
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Every action taken on your behalf generates a consent receipt. Review
        what was done, why, and roll back if needed.
      </p>
      <ConsentReceiptList userId={userId} />
    </div>
  );
}
