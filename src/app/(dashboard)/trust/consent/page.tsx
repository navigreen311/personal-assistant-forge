'use client';

import { ConsentReceiptList } from '@/engines/trust-ui/components/ConsentReceiptList';

const DEMO_USER_ID = 'demo-user';

export default function ConsentPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Consent Receipt Log
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Every action taken on your behalf generates a consent receipt. Review
        what was done, why, and roll back if needed.
      </p>
      <ConsentReceiptList userId={DEMO_USER_ID} />
    </div>
  );
}
