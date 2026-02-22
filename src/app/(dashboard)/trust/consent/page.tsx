'use client';

import { useSession } from 'next-auth/react';
import { ConsentReceiptList } from '@/engines/trust-ui/components/ConsentReceiptList';

export default function ConsentPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" />
        <span className="ml-3 text-sm text-zinc-500">Loading session...</span>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">Please sign in to view consent logs.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        Consent Log
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Every AI action is logged with full audit trail.
      </p>
      <ConsentReceiptList userId={userId} />
    </div>
  );
}
