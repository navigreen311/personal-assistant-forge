import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { gdprService } from '@/modules/shadow/compliance/gdpr-export';

/**
 * POST /api/shadow/export
 * Export all session data for the authenticated user as JSON.
 * GDPR Article 15 — Right of Access.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const result = await gdprService.exportUserData(session.userId);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export data';
      return error('EXPORT_FAILED', message, 500);
    }
  });
}
