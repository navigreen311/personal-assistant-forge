import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

import { InboxService } from '@/modules/inbox';
import { createCannedResponseSchema } from '@/modules/inbox/inbox.validation';
import type { MessageChannel } from '@/shared/types';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const entityId = req.nextUrl.searchParams.get('entityId');
      if (!entityId) {
        return error('VALIDATION_ERROR', 'entityId is required', 400);
      }

      const channel = req.nextUrl.searchParams.get('channel') as
        | MessageChannel
        | null;

      const responses = await inboxService.listCannedResponses(
        entityId,
        channel ?? undefined
      );
      return success(responses);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = createCannedResponseSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid canned response', 400, {
          issues: parsed.error.issues,
        });
      }

      const response = await inboxService.createCannedResponse(parsed.data);
      return success(response, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
