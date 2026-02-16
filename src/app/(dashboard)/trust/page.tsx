'use client';

import { TrustScoreDashboard } from '@/engines/trust-ui/components/TrustScoreDashboard';
import { PermissionsDashboard } from '@/engines/trust-ui/components/PermissionsDashboard';
import { ConsentReceiptList } from '@/engines/trust-ui/components/ConsentReceiptList';

// ASSUMPTION: userId is hardcoded for now; in production, this would come from auth context
const DEMO_USER_ID = 'demo-user';

export default function TrustOverviewPage() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Trust Scores
        </h2>
        <TrustScoreDashboard userId={DEMO_USER_ID} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Permissions
        </h2>
        <PermissionsDashboard userId={DEMO_USER_ID} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Recent Consent Receipts
        </h2>
        <ConsentReceiptList userId={DEMO_USER_ID} />
      </section>
    </div>
  );
}
