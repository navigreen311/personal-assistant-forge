import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { DraftService } from '@/modules/inbox';
import { refineDraftSchema } from '@/modules/inbox/inbox.validation';

const draftService = new DraftService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = refineDraftSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid refine request', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await draftService.refineDraft(
        parsed.data.draftBody,
        parsed.data.feedback,
        parsed.data.tone
      );

      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
