import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';

import { DraftService } from '@/modules/inbox';
import { draftRequestSchema } from '@/modules/inbox/inbox.validation';

const draftService = new DraftService();

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = draftRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid draft request', 400, {
          issues: parsed.error.issues,
        });
      }

      const { entityId: _requested, ...draftRequest } = parsed.data;

      const result = await draftService.generateDraft(draftRequest, entityId);
      return success(result, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
