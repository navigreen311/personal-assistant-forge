import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { PostMeetingService } from '@/modules/calendar/post-meeting.service';
import { postMeetingSchema } from '@/modules/calendar/calendar.validation';

const postMeetingService = new PostMeetingService();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
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
    return success(result, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to capture post-meeting data', 500);
  }
}
