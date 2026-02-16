import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { InboxService, getCurrentUserId } from '@/modules/inbox';
import { createFollowUpSchema } from '@/modules/inbox/inbox.validation';

const inboxService = new InboxService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId();
    const entityId =
      request.nextUrl.searchParams.get('entityId') ?? undefined;

    const followUps = await inboxService.listFollowUps(userId, entityId);
    return success(followUps);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createFollowUpSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid follow-up request', 400, {
        issues: parsed.error.issues,
      });
    }

    const followUp = await inboxService.createFollowUp(parsed.data);
    return success(followUp, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
