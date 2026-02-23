import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { gdprService } from '@/modules/shadow/compliance/gdpr-export';

const DeleteAllSchema = z.object({
  confirmationToken: z.string().min(1),
});

/** Expected confirmation token for delete-all operations */
const EXPECTED_TOKEN = 'DELETE-ALL-MY-DATA';

/**
 * POST /api/shadow/delete-all
 * Delete all Shadow data for the authenticated user.
 * GDPR Article 17 — Right to Erasure.
 * Requires a confirmation token in the body to prevent accidental deletion.
 */
export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = DeleteAllSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      if (parsed.data.confirmationToken !== EXPECTED_TOKEN) {
        return error(
          'INVALID_CONFIRMATION',
          `Invalid confirmation token. Send { confirmationToken: "${EXPECTED_TOKEN}" } to confirm deletion.`,
          400,
        );
      }

      const result = await gdprService.deleteAllData(session.userId);

      if (!result.success) {
        return error('DELETE_FAILED', 'Data deletion partially failed', 500);
      }

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete data';
      return error('DELETE_ALL_FAILED', message, 500);
    }
  });
}
