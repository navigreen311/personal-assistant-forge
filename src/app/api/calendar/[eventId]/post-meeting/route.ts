import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { PostMeetingService } from '@/modules/calendar/post-meeting.service';
import { postMeetingSchema } from '@/modules/calendar/calendar.validation';
import { prisma } from '@/lib/db';
import { getVafConfig } from '@/lib/shadow/vaf-config';
import { MeetingProcessor } from '@/lib/shadow/meeting/processor';

const postMeetingService = new PostMeetingService();

/**
 * Fire the VAF MeetingProcessor pipeline as a side effect of a successful
 * post-meeting capture. We DO NOT await this — the route response must
 * not be blocked on a (potentially slow) recording transcription. Failures
 * are logged but never bubble up to the caller.
 *
 * Conditions:
 *   - The user has `autoProcessMeetings = true` in their VAF config.
 *   - The calendar event has a non-null `recordingUrl`.
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
  return withAuth(request, async (req, session) => {
    try {
      const { eventId } = await params;
      const body = await req.json();

      const parsed = postMeetingSchema.safeParse({ ...body, eventId });
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid post-meeting data', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await postMeetingService.capturePostMeeting(parsed.data);

      // Fire-and-forget: don't await, don't fail the response on errors.
      void maybeAutoProcess(eventId, session.userId);

      return success(result, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to capture post-meeting data', 500);
    }
  });
}
