import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import { PostMeetingService } from '@/modules/calendar/post-meeting.service';
import { postMeetingSchema } from '@/modules/calendar/calendar.validation';
import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import { MeetingProcessor } from '@/lib/shadow/meeting/processor';
import type { AuthSession } from '@/lib/auth/types';

const postMeetingService = new PostMeetingService();

/**
 * Resource-scoped, exactly as in `../route.ts`. See the long note there.
 */
async function withEventScope(
  request: NextRequest,
  eventId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { entityId: true },
    });

    if (!owner) {
      return error('NOT_FOUND', 'Event not found', 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

/**
 * Fire the VAF MeetingProcessor pipeline as a side effect of a successful
 * post-meeting capture. We DO NOT await this — the route response must
 * not be blocked on a (potentially slow) recording transcription. Failures
 * are logged but never bubble up to the caller.
 *
 * Conditions:
 *   - The user has `autoProcessMeetings = true` in their VAF config.
 *   - The calendar event has a non-null `recordingUrl`.
 *
 * The unscoped `findUnique` below is safe here and nowhere else: the only
 * caller is inside `withEventScope`, so ownership of this event id has already
 * been proven before this function is reached.
 */
async function maybeAutoProcess(eventId: string, userId: string): Promise<void> {
  try {
    const [config, event] = await Promise.all([
      getVafConfig(userId),
      prisma.calendarEvent.findUnique({
        where: { id: eventId },
        select: { recordingUrl: true },
      }),
    ]);

    if (!config.autoProcessMeetings) return;
    if (!event?.recordingUrl) return;

    const processor = new MeetingProcessor();
    await processor.processEvent({ eventId });
  } catch (err) {
    console.warn(
      `[post-meeting] MeetingProcessor auto-run failed for event ${eventId}:`,
      (err as Error).message,
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEventScope(request, eventId, async (req, session, entityId) => {
      try {
        const body = await req.json();

        const parsed = postMeetingSchema.safeParse({ ...body, eventId });
        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid post-meeting data', 400, {
            issues: parsed.error.issues,
          });
        }

        // `entityId` spread LAST. Under the old code the body's own value decided
        // which entity the action-item tasks and the follow-up event were created
        // in, and `capturePostMeeting` overwrote the meeting notes of whatever
        // event id it was handed, with no tenant in the WHERE clause.
        const { entityId: _requested, ...draft } = parsed.data;

        const result = await postMeetingService.capturePostMeeting({ ...draft, entityId });

        // Fire-and-forget: don't await, don't fail the response on errors.
        void maybeAutoProcess(eventId, session.userId);

        return success(result, 201);
      } catch (_err) {
        return error('INTERNAL_ERROR', 'Failed to capture post-meeting data', 500);
      }
    })
  );
}
