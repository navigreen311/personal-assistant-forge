'use client';

import { PermissionsDashboard } from '@/engines/trust-ui/components/PermissionsDashboard';

const DEMO_USER_ID = 'demo-user';

export default function PermissionsPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Integration Permissions
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Control what each integration can do on your behalf. Toggle Read, Draft,
        and Execute permissions individually.
      </p>
      <PermissionsDashboard userId={DEMO_USER_ID} />
    </div>
  );
}
