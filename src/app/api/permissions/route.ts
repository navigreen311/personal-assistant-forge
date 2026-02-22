import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import {
  getPermissions,
  updatePermission,
} from '@/engines/trust-ui/permissions-service';

/**
 * GET /api/permissions?userId=...
 *
 * Returns PermissionSet[] for the authenticated user.
 * The userId query param is accepted for compatibility but the
 * authenticated session userId is always used for security.
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const permissions = await getPermissions(session.userId);
      return success(permissions);
    } catch (err) {
      console.error('Error fetching permissions:', err);
      return error(
        'PERMISSIONS_ERROR',
        'Failed to fetch permissions',
        500
      );
    }
  });
}

const patchSchema = z.object({
  userId: z.string().optional(),
  integrationId: z.string().min(1),
  read: z.boolean().optional(),
  draft: z.boolean().optional(),
  execute: z.boolean().optional(),
});

/**
 * PATCH /api/permissions
 *
 * Updates a single permission grant for the authenticated user.
 * Body: { userId?, integrationId, read?, draft?, execute? }
 */
export async function PATCH(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = patchSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { integrationId, read, draft, execute } = parsed.data;

      const updated = await updatePermission(session.userId, integrationId, {
        read,
        draft,
        execute,
      });

      return success(updated);
    } catch (err) {
      console.error('Error updating permission:', err);
      return error(
        'PERMISSIONS_UPDATE_ERROR',
        'Failed to update permission',
        500
      );
    }
  });
}
