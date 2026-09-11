import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

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
  return withRole(request, ['owner', 'admin'], async (req, session) => {
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
        // P-17: the reason travels now. `deleteAllData` used to compute it and
        // discard it, so a half-completed erasure told the user nothing and
        // left nothing in the logs either.
        return error(
          'DELETE_FAILED',
          result.error
            ? `Data deletion partially failed: ${result.error}`
            : 'Data deletion partially failed',
          500,
          { deletedCounts: result.deletedCounts },
        );
      }

      // P-17. v3 Addition 9.3 requires the delete flow to SAY that consent
      // receipts survive it ("Consent receipts will be retained for regulatory
      // compliance"). Until this commit the flow neither said it nor did it:
      // `gdprService.deleteAllData` deleted them. It now retains and scrubs
      // them, and the response states so, so a user is not told their data is
      // gone when a seven-year record of what they authorised remains.
      return success({
        ...result,
        consentReceiptsRetained: true,
        notice:
          'Conversations, messages, transcripts and recordings were deleted. Consent ' +
          'receipts are retained for regulatory compliance (7 years); the conversation ' +
          'content inside them has been scrubbed.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete data';
      return error('DELETE_ALL_FAILED', message, 500);
    }
  });
}
