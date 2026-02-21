import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { TriageService } from '@/modules/inbox';
import { triageMessageSchema } from '@/modules/inbox/inbox.validation';

const triageService = new TriageService();

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = triageMessageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid triage request', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await triageService.triageMessage(
        parsed.data.messageId,
        parsed.data.entityId
      );

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
