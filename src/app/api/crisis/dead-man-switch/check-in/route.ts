import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import * as dmsService from '@/modules/crisis/services/dead-man-switch-service';

export async function POST(request: NextRequest) {
  return withAuditedAuth(
    request,
    { resource: 'crisis.dead-man-switch', sensitivityLevel: 'RESTRICTED' },
    async (req, session) => {
      try {
        const status = await dmsService.checkIn(session.userId);
        return success(status);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
