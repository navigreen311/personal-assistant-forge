import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { updateCannedResponseSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { responseId } = await params;
      const response = await inboxService.getCannedResponse(responseId);

      if (!response) {
        return error('NOT_FOUND', `Canned response not found: ${responseId}`, 404);
      }

      return success(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { responseId } = await params;
      const body = await req.json();
      const parsed = updateCannedResponseSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid update', 400, {
          issues: parsed.error.issues,
        });
      }

      const updated = await inboxService.updateCannedResponse(
        responseId,
        parsed.data
      );
      return success(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ responseId: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { responseId } = await params;
      await inboxService.deleteCannedResponse(responseId);
      return success({ responseId, deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
